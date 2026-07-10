import type { DB } from "../db/database.js";
import type { Lead } from "../domain/types.js";
import { listGatedLeads, saveScore } from "../leads/leads.repo.js";
import {
  recordFeedback,
  getFeedbackStats,
  type FeedbackStats,
} from "../feedback/feedback.repo.js";

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

export function getPendingLeads(
  db: DB,
  input: { project_id: number }
): { leads: Lead[] } {
  const projectId = requireNumber(input.project_id, "project_id");
  return { leads: listGatedLeads(db, projectId) };
}

export function saveScoreAndDraft(
  db: DB,
  input: {
    project_id: number;
    lead_id: number;
    score: number;
    reasons: string;
    draft?: string | null;
  }
): { lead: Lead } {
  const projectId = requireNumber(input.project_id, "project_id");
  const leadId = requireNumber(input.lead_id, "lead_id");
  const score = requireNumber(input.score, "score");
  if (score < 0 || score > 100) {
    throw new Error("score must be 0–100");
  }
  if (typeof input.reasons !== "string") {
    throw new Error("reasons must be a string");
  }
  const lead = saveScore(db, projectId, leadId, score, input.reasons, input.draft);
  return { lead };
}

export function recordFeedbackTool(
  db: DB,
  input: {
    project_id: number;
    lead_id: number;
    good: boolean;
    notes?: string | null;
    reviewed_by?: string | null;
    source?: "dashboard" | "telegram";
  }
): { ok: true } {
  const projectId = requireNumber(input.project_id, "project_id");
  const leadId = requireNumber(input.lead_id, "lead_id");
  const good = requireBoolean(input.good, "good");
  const source = input.source ?? "dashboard";
  if (source !== "dashboard" && source !== "telegram") {
    throw new Error("source must be dashboard or telegram");
  }
  recordFeedback(db, {
    projectId,
    leadId,
    good,
    notes: input.notes ?? null,
    reviewedBy: input.reviewed_by ?? null,
    source,
  });
  return { ok: true };
}

export function getFeedbackStatsTool(
  db: DB,
  input: { project_id: number }
): FeedbackStats {
  const projectId = requireNumber(input.project_id, "project_id");
  return getFeedbackStats(db, projectId);
}
