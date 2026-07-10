import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, getLead } from "../../src/leads/leads.repo.js";
import {
  getPendingLeads,
  saveScoreAndDraft,
  recordFeedbackTool,
  getFeedbackStatsTool,
  getTopPicksTool,
} from "../../src/mcp/tools.js";

describe("MCP tool handlers", () => {
  it("getPendingLeads returns gated leads for project", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: null, votes: null, source: "csv", sources: ["csv"] },
    ]);
    const result = getPendingLeads(db, { project_id: p.id });
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].company).toBe("A");
    db.close();
  });

  it("saveScoreAndDraft persists score and status", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: "a@a.com", votes: 1, source: "csv", sources: ["csv"] },
    ]);
    const pending = getPendingLeads(db, { project_id: p.id });
    const leadId = pending.leads[0].id;
    const result = saveScoreAndDraft(db, {
      project_id: p.id,
      lead_id: leadId,
      score: 88,
      reasons: "Strong fit",
    });
    expect(result.lead.status).toBe("scored");
    expect(result.lead.score).toBe(88);
    db.close();
  });

  it("saveScoreAndDraft rejects cross-project lead", () => {
    const db = openDatabase(":memory:");
    const p1 = createProject(db, { name: "P1" });
    const p2 = createProject(db, { name: "P2" });
    insertLeads(db, p1.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: null, votes: null, source: "csv", sources: ["csv"] },
    ]);
    const pending = getPendingLeads(db, { project_id: p1.id });
    expect(() =>
      saveScoreAndDraft(db, {
        project_id: p2.id,
        lead_id: pending.leads[0].id,
        score: 50,
        reasons: "x",
      })
    ).toThrow(/not found|project/i);
    db.close();
  });

  it("recordFeedbackTool and getFeedbackStatsTool work together", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: "a@a.com", votes: null, source: "csv", sources: ["csv"] },
    ]);
    const pending = getPendingLeads(db, { project_id: p.id });
    recordFeedbackTool(db, {
      project_id: p.id,
      lead_id: pending.leads[0].id,
      good: true,
      notes: "yes",
      reviewed_by: "alice",
      source: "dashboard",
    });
    const lead = getLead(db, p.id, pending.leads[0].id)!;
    expect(lead.status).toBe("approved");
    const stats = getFeedbackStatsTool(db, { project_id: p.id });
    expect(stats.total).toBe(1);
    expect(stats.good).toBe(1);
    expect(stats.approvalRate).toBe(1);
    db.close();
  });

  it("validates required inputs", () => {
    const db = openDatabase(":memory:");
    expect(() => getPendingLeads(db, { project_id: "x" as unknown as number })).toThrow(/project_id/i);
    expect(() =>
      saveScoreAndDraft(db, {
        project_id: 1,
        lead_id: 1,
        score: 200,
        reasons: "bad",
      })
    ).toThrow(/score/i);
    expect(() =>
      recordFeedbackTool(db, {
        project_id: 1,
        lead_id: 1,
        good: "yes" as unknown as boolean,
      })
    ).toThrow(/good/i);
    db.close();
  });

  it("getTopPicksTool returns clarify messages for top scored leads", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1", website: "p1.com" });
    insertLeads(db, p.id, [
      {
        company: "A",
        website: "a.com",
        canonicalDomain: "a.com",
        email: "a@a.com",
        votes: 1,
        source: "csv",
        sources: ["csv"],
      },
      {
        company: "B",
        website: "b.com",
        canonicalDomain: "b.com",
        email: "b@b.com",
        votes: 2,
        source: "csv",
        sources: ["csv"],
      },
      {
        company: "C",
        website: "c.com",
        canonicalDomain: "c.com",
        email: "c@c.com",
        votes: 3,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const pending = getPendingLeads(db, { project_id: p.id });
    saveScoreAndDraft(db, {
      project_id: p.id,
      lead_id: pending.leads[0].id,
      score: 60,
      reasons: "ok",
    });
    saveScoreAndDraft(db, {
      project_id: p.id,
      lead_id: pending.leads[1].id,
      score: 90,
      reasons: "great",
    });
    saveScoreAndDraft(db, {
      project_id: p.id,
      lead_id: pending.leads[2].id,
      score: 75,
      reasons: "good",
    });

    const result = getTopPicksTool(db, { project_id: p.id, limit: 2 });
    expect(result.picks).toHaveLength(2);
    expect(result.picks[0].lead.company).toBe("B");
    expect(result.picks[0].clarify.choices).toEqual(["Good", "Bad"]);
    expect(result.picks[0].clarify.text).toContain("B");
    expect(result.picks[0].clarify.text).toContain("90");
    expect(result.picks[1].lead.company).toBe("C");
    db.close();
  });

  it("getTopPicksTool defaults limit and validates project_id", () => {
    const db = openDatabase(":memory:");
    expect(() =>
      getTopPicksTool(db, { project_id: "x" as unknown as number })
    ).toThrow(/project_id/i);

    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      {
        company: "Solo",
        website: "solo.com",
        canonicalDomain: "solo.com",
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const pending = getPendingLeads(db, { project_id: p.id });
    saveScoreAndDraft(db, {
      project_id: p.id,
      lead_id: pending.leads[0].id,
      score: 80,
      reasons: "fit",
    });
    const result = getTopPicksTool(db, { project_id: p.id });
    expect(result.picks).toHaveLength(1);
    expect(result.picks[0].clarify.leadId).toBe(pending.leads[0].id);
    db.close();
  });

  it("getTopPicksTool errors when project is missing", () => {
    const db = openDatabase(":memory:");
    expect(() => getTopPicksTool(db, { project_id: 999 })).toThrow(/not found/i);
    db.close();
  });
});
