import type { DB } from "../db/database.js";
import { getProject } from "../projects/projects.repo.js";
import { listGatedLeads, saveScore } from "../leads/leads.repo.js";
import type { Scorer } from "./scorer.js";

export interface ScoringSummary {
  scored: number;
  skipped: number;
  errors: number;
}

export async function runScoring(
  db: DB,
  projectId: number,
  scorer: Scorer
): Promise<ScoringSummary> {
  const project = getProject(db, projectId);
  if (!project) throw new Error(`project ${projectId} not found`);
  const gated = listGatedLeads(db, projectId);
  let scored = 0,
    errors = 0;
  for (const lead of gated) {
    try {
      const result = await scorer.scoreLead(lead, project);
      saveScore(db, projectId, lead.id, result.score, result.reasons, result.draft);
      scored++;
    } catch {
      errors++;
    }
  }
  return { scored, skipped: 0, errors };
}
