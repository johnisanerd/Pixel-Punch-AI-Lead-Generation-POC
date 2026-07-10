import type { Lead, Project } from "../domain/types.js";
import type { ScoreResult, Scorer } from "./scorer.js";

export class MockScorer implements Scorer {
  async scoreLead(lead: Lead, project: Project): Promise<ScoreResult> {
    const base = 50 + Math.min(50, Math.floor((lead.votes ?? 0) / 2));
    const icp = (project.icp ?? "").toLowerCase();
    const hay = `${lead.company} ${lead.website ?? ""}`.toLowerCase();
    const fit = icp && hay.includes(icp.split(/\s+/)[0] ?? "") ? "ICP keyword match" : "generic fit";
    return { score: base, reasons: `${fit}; votes=${lead.votes ?? 0}` };
  }
}
