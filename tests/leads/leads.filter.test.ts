import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import {
  insertLeads,
  listLeadsFiltered,
  saveScore,
  listGatedLeads,
} from "../../src/leads/leads.repo.js";
import { recordFeedback } from "../../src/feedback/feedback.repo.js";

describe("listLeadsFiltered", () => {
  function seed() {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      {
        company: "Acme Corp",
        website: "acme.com",
        canonicalDomain: "acme.com",
        email: "a@acme.com",
        votes: 10,
        source: "csv",
        sources: ["csv"],
      },
      {
        company: "Beta Inc",
        website: "beta.com",
        canonicalDomain: "beta.com",
        email: "b@beta.com",
        votes: 5,
        source: "producthunt",
        sources: ["producthunt"],
      },
      {
        company: "Acme Tools",
        website: "acmetools.com",
        canonicalDomain: "acmetools.com",
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv", "producthunt"],
      },
    ]);
    const leads = listGatedLeads(db, p.id);
    saveScore(db, p.id, leads[0].id, 80, "good");
    saveScore(db, p.id, leads[1].id, 40, "ok");
    // leave third gated
    return { db, p, leads };
  }

  it("filters by status", () => {
    const { db, p } = seed();
    const scored = listLeadsFiltered(db, p.id, { status: "scored" });
    expect(scored).toHaveLength(2);
    const gated = listLeadsFiltered(db, p.id, { status: "gated" });
    expect(gated).toHaveLength(1);
    db.close();
  });

  it("filters by minScore", () => {
    const { db, p } = seed();
    const high = listLeadsFiltered(db, p.id, { minScore: 50 });
    expect(high).toHaveLength(1);
    expect(high[0].company).toBe("Acme Corp");
    db.close();
  });

  it("filters by source contained in JSON", () => {
    const { db, p } = seed();
    const ph = listLeadsFiltered(db, p.id, { source: "producthunt" });
    expect(ph).toHaveLength(2);
    db.close();
  });

  it("filters by company q LIKE", () => {
    const { db, p } = seed();
    const acme = listLeadsFiltered(db, p.id, { q: "Acme" });
    expect(acme).toHaveLength(2);
    db.close();
  });

  it("approve/reject via recordFeedback updates status", () => {
    const { db, p, leads } = seed();
    recordFeedback(db, {
      projectId: p.id,
      leadId: leads[0].id,
      good: true,
      notes: "yes",
      reviewedBy: "dev@local",
      source: "dashboard",
    });
    const approved = listLeadsFiltered(db, p.id, { status: "approved" });
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe(leads[0].id);

    recordFeedback(db, {
      projectId: p.id,
      leadId: leads[1].id,
      good: false,
      notes: "no",
      reviewedBy: "dev@local",
      source: "dashboard",
    });
    const rejected = listLeadsFiltered(db, p.id, { status: "rejected" });
    expect(rejected).toHaveLength(1);
    db.close();
  });
});
