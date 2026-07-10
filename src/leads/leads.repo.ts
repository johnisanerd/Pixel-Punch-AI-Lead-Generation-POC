import type { DB } from "../db/database.js";
import type { Lead } from "../domain/types.js";
import type { DedupedLead } from "../validation/dedup.js";

interface LeadRow {
  id: number;
  project_id: number;
  company: string;
  website: string | null;
  canonical_domain: string | null;
  email: string | null;
  votes: number | null;
  sources: string;
  status: string;
  score: number | null;
  reasons: string | null;
  created_at: string;
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    projectId: row.project_id,
    company: row.company,
    website: row.website,
    canonicalDomain: row.canonical_domain,
    email: row.email,
    votes: row.votes,
    source: JSON.parse(row.sources)[0] ?? "unknown",
    sources: JSON.parse(row.sources),
    status: row.status as Lead["status"],
    score: row.score,
    reasons: row.reasons,
    createdAt: row.created_at,
  };
}

/** Inserts gated leads for a project. */
export function insertLeads(db: DB, projectId: number, leads: DedupedLead[]): void {
  const stmt = db.prepare(
    `INSERT INTO leads
       (project_id, company, website, canonical_domain, email, votes, sources, status)
     VALUES
       (?, ?, ?, ?, ?, ?, ?, 'gated')`
  );
  db.exec("BEGIN");
  try {
    for (const lead of leads) {
      stmt.run(
        projectId,
        lead.company,
        lead.website,
        lead.canonicalDomain,
        lead.email,
        lead.votes,
        JSON.stringify(lead.sources)
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listLeads(db: DB, projectId: number): Lead[] {
  const rows = db
    .prepare("SELECT * FROM leads WHERE project_id = ? ORDER BY id")
    .all(projectId) as unknown as LeadRow[];
  return rows.map(toLead);
}

export function listGatedLeads(db: DB, projectId: number): Lead[] {
  const rows = db
    .prepare("SELECT * FROM leads WHERE project_id = ? AND status = 'gated' ORDER BY id")
    .all(projectId) as unknown as LeadRow[];
  return rows.map(toLead);
}

export function getLead(db: DB, projectId: number, leadId: number): Lead | undefined {
  const row = db
    .prepare("SELECT * FROM leads WHERE project_id = ? AND id = ?")
    .get(projectId, leadId) as unknown as LeadRow | undefined;
  return row ? toLead(row) : undefined;
}

export function saveScore(
  db: DB,
  projectId: number,
  leadId: number,
  score: number,
  reasons: string,
  draft?: string | null
): Lead {
  if (score < 0 || score > 100 || !Number.isFinite(score)) {
    throw new Error("score must be 0–100");
  }
  const existing = getLead(db, projectId, leadId);
  if (!existing) throw new Error(`lead ${leadId} not found in project ${projectId}`);
  // draft reserved — ignore for now (column not in schema yet)
  void draft;
  db.prepare(
    `UPDATE leads SET score = ?, reasons = ?, status = 'scored' WHERE project_id = ? AND id = ?`
  ).run(Math.round(score), reasons, projectId, leadId);
  return getLead(db, projectId, leadId)!;
}

export interface LeadFilter {
  status?: string;
  minScore?: number;
  source?: string;
  q?: string;
}

export function listLeadsFiltered(
  db: DB,
  projectId: number,
  filter: LeadFilter = {}
): Lead[] {
  const clauses = ["project_id = ?"];
  const params: (string | number)[] = [projectId];

  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.minScore !== undefined) {
    clauses.push("score >= ?");
    params.push(filter.minScore);
  }
  if (filter.q) {
    clauses.push("company LIKE ?");
    params.push(`%${filter.q}%`);
  }
  if (filter.source) {
    // sources is a JSON array string; match containment
    clauses.push("sources LIKE ?");
    params.push(`%"${filter.source}"%`);
  }

  const sql = `SELECT * FROM leads WHERE ${clauses.join(" AND ")} ORDER BY score DESC NULLS LAST, id`;
  const rows = db.prepare(sql).all(...params) as unknown as LeadRow[];
  return rows.map(toLead);
}
