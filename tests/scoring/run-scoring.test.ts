import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, listLeads } from "../../src/leads/leads.repo.js";
import { MockScorer } from "../../src/scoring/mock-scorer.js";
import { runScoring } from "../../src/scoring/run-scoring.js";
import type { Scorer } from "../../src/scoring/scorer.js";
import type { Lead, Project } from "../../src/domain/types.js";

describe("runScoring", () => {
  it("scores all gated leads with MockScorer", async () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1", icp: "saas" });
    insertLeads(db, p.id, [
      { company: "A SaaS", website: "a.com", canonicalDomain: "a.com", email: "a@a.com", votes: 10, source: "csv", sources: ["csv"] },
      { company: "B Co", website: "b.com", canonicalDomain: "b.com", email: "b@b.com", votes: 4, source: "csv", sources: ["csv"] },
    ]);
    const summary = await runScoring(db, p.id, new MockScorer());
    expect(summary.scored).toBe(2);
    expect(summary.errors).toBe(0);
    const leads = listLeads(db, p.id);
    expect(leads.every((l) => l.status === "scored")).toBe(true);
    expect(leads.every((l) => typeof l.score === "number")).toBe(true);
    db.close();
  });

  it("counts errors when scorer throws for one lead", async () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: "a@a.com", votes: 1, source: "csv", sources: ["csv"] },
      { company: "B", website: "b.com", canonicalDomain: "b.com", email: "b@b.com", votes: 1, source: "csv", sources: ["csv"] },
    ]);
    let calls = 0;
    const flaky: Scorer = {
      async scoreLead(lead: Lead, _project: Project) {
        calls++;
        if (calls === 1) throw new Error("boom");
        return { score: 70, reasons: "ok" };
      },
    };
    const summary = await runScoring(db, p.id, flaky);
    expect(summary.scored).toBe(1);
    expect(summary.errors).toBe(1);
    db.close();
  });

  it("throws when project is missing", async () => {
    const db = openDatabase(":memory:");
    await expect(runScoring(db, 999, new MockScorer())).rejects.toThrow(/project.*not found/i);
    db.close();
  });
});
