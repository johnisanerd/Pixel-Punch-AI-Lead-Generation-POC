import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, saveScore, listGatedLeads } from "../../src/leads/leads.repo.js";
import { recordFeedback } from "../../src/feedback/feedback.repo.js";
import {
  selectTopPicks,
  formatClarifyMessage,
} from "../../src/telegram/top-picks.js";

function seedScoredLeads() {
  const db = openDatabase(":memory:");
  const project = createProject(db, { name: "Pixel Punch", website: "pixelpunch.ai" });
  insertLeads(db, project.id, [
    {
      company: "LowCo",
      website: "low.co",
      canonicalDomain: "low.co",
      email: "a@low.co",
      votes: 1,
      source: "csv",
      sources: ["csv"],
    },
    {
      company: "HighCo",
      website: "high.co",
      canonicalDomain: "high.co",
      email: "a@high.co",
      votes: 2,
      source: "csv",
      sources: ["csv"],
    },
    {
      company: "MidCo",
      website: "mid.co",
      canonicalDomain: "mid.co",
      email: "a@mid.co",
      votes: 3,
      source: "csv",
      sources: ["csv"],
    },
    {
      company: "GatedOnly",
      website: "gated.co",
      canonicalDomain: "gated.co",
      email: null,
      votes: null,
      source: "csv",
      sources: ["csv"],
    },
  ]);
  const gated = listGatedLeads(db, project.id);
  const byCompany = Object.fromEntries(gated.map((l) => [l.company, l]));
  saveScore(db, project.id, byCompany.LowCo.id, 40, "Weak fit");
  saveScore(db, project.id, byCompany.HighCo.id, 95, "Strong ICP match");
  saveScore(db, project.id, byCompany.MidCo.id, 70, "Decent fit");
  return { db, project, byCompany };
}

describe("selectTopPicks", () => {
  it("returns scored leads ordered by score DESC with default limit 5", () => {
    const { db, project } = seedScoredLeads();
    const picks = selectTopPicks(db, project.id);
    expect(picks.map((p) => p.company)).toEqual(["HighCo", "MidCo", "LowCo"]);
    expect(picks.every((p) => p.status === "scored")).toBe(true);
    db.close();
  });

  it("respects custom limit", () => {
    const { db, project } = seedScoredLeads();
    const picks = selectTopPicks(db, project.id, 2);
    expect(picks).toHaveLength(2);
    expect(picks[0].company).toBe("HighCo");
    expect(picks[1].company).toBe("MidCo");
    db.close();
  });

  it("excludes approved and rejected leads", () => {
    const { db, project, byCompany } = seedScoredLeads();
    recordFeedback(
      db,
      {
        projectId: project.id,
        leadId: byCompany.HighCo.id,
        good: true,
        notes: null,
        reviewedBy: null,
        source: "telegram",
      },
      { rag: null }
    );
    recordFeedback(
      db,
      {
        projectId: project.id,
        leadId: byCompany.LowCo.id,
        good: false,
        notes: null,
        reviewedBy: null,
        source: "telegram",
      },
      { rag: null }
    );
    const picks = selectTopPicks(db, project.id);
    expect(picks.map((p) => p.company)).toEqual(["MidCo"]);
    db.close();
  });

  it("scopes to the given project", () => {
    const { db, project } = seedScoredLeads();
    const other = createProject(db, { name: "Other" });
    insertLeads(db, other.id, [
      {
        company: "OtherHigh",
        website: "other.co",
        canonicalDomain: "other.co",
        email: "a@other.co",
        votes: 1,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const [otherLead] = listGatedLeads(db, other.id);
    saveScore(db, other.id, otherLead.id, 99, "Top of other project");
    const picks = selectTopPicks(db, project.id);
    expect(picks.every((p) => p.projectId === project.id)).toBe(true);
    expect(picks.map((p) => p.company)).not.toContain("OtherHigh");
    db.close();
  });
});

describe("formatClarifyMessage", () => {
  it("includes company, score, reasons, website and Good/Bad choices", () => {
    const { db, project, byCompany } = seedScoredLeads();
    const scored = selectTopPicks(db, project.id, 1)[0];
    expect(scored.company).toBe("HighCo");
    const msg = formatClarifyMessage(scored, project);
    expect(msg.choices).toEqual(["Good", "Bad"]);
    expect(msg.text).toContain("HighCo");
    expect(msg.text).toContain("95");
    expect(msg.text).toContain("Strong ICP match");
    expect(msg.text).toContain("high.co");
    expect(msg.leadId).toBe(byCompany.HighCo.id);
    expect(msg.projectId).toBe(project.id);
    db.close();
  });

  it("handles missing website and reasons gracefully", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "P" });
    insertLeads(db, project.id, [
      {
        company: "NoSite",
        website: null,
        canonicalDomain: null,
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const [lead] = listGatedLeads(db, project.id);
    saveScore(db, project.id, lead.id, 50, "");
    const updated = selectTopPicks(db, project.id)[0];
    // clear reasons to null-like empty for formatter edge
    const msg = formatClarifyMessage(
      { ...updated, website: null, reasons: null },
      project
    );
    expect(msg.choices).toEqual(["Good", "Bad"]);
    expect(msg.text).toContain("NoSite");
    expect(msg.text).toContain("50");
    db.close();
  });
});
