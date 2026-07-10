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
