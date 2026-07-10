import type { DB } from "../db/database.js";
import { getLead } from "../leads/leads.repo.js";

export interface NewFeedback {
  projectId: number;
  leadId: number;
  good: boolean;
  notes: string | null;
  reviewedBy: string | null;
  source: "dashboard" | "telegram";
}

export interface FeedbackStats {
  total: number;
  good: number;
  bad: number;
  approvalRate: number; // 0–1, 0 if total=0
}

export function recordFeedback(db: DB, input: NewFeedback): void {
  if (!getLead(db, input.projectId, input.leadId)) {
    throw new Error(`lead ${input.leadId} not found in project ${input.projectId}`);
  }
  db.prepare(
    `INSERT INTO feedback (project_id, lead_id, good, notes, reviewed_by, source)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    input.projectId,
    input.leadId,
    input.good ? 1 : 0,
    input.notes,
    input.reviewedBy,
    input.source
  );
  // Also flip lead status for convenience
  db.prepare(
    `UPDATE leads SET status = ? WHERE project_id = ? AND id = ?`
  ).run(input.good ? "approved" : "rejected", input.projectId, input.leadId);
}

export function getFeedbackStats(db: DB, projectId: number): FeedbackStats {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN good = 1 THEN 1 ELSE 0 END) AS good,
         SUM(CASE WHEN good = 0 THEN 1 ELSE 0 END) AS bad
       FROM feedback WHERE project_id = ?`
    )
    .get(projectId) as { total: number; good: number | null; bad: number | null };
  const total = Number(row.total) || 0;
  const good = Number(row.good) || 0;
  const bad = Number(row.bad) || 0;
  return { total, good, bad, approvalRate: total === 0 ? 0 : good / total };
}
