import type { Lead, Project } from "../domain/types.js";

export interface ScoreResult {
  score: number; // 0–100
  reasons: string;
  draft?: string | null; // reserved
}

export interface Scorer {
  scoreLead(lead: Lead, project: Project): Promise<ScoreResult>;
}
