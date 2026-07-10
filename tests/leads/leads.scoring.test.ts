import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, listGatedLeads, saveScore, getLead } from "../../src/leads/leads.repo.js";

describe("leads scoring helpers", () => {
  it("lists only gated leads for a project", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: null, votes: null, source: "csv", sources: ["csv"] },
    ]);
    const gated = listGatedLeads(db, p.id);
    expect(gated).toHaveLength(1);
    expect(gated[0].status).toBe("gated");
    db.close();
  });

  it("saveScore sets score, reasons, and status=scored", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: "a@a.com", votes: 1, source: "csv", sources: ["csv"] },
    ]);
    const [lead] = listGatedLeads(db, p.id);
    saveScore(db, p.id, lead.id, 82, "Strong ICP fit");
    const updated = getLead(db, p.id, lead.id)!;
    expect(updated.score).toBe(82);
    expect(updated.reasons).toBe("Strong ICP fit");
    expect(updated.status).toBe("scored");
    db.close();
  });

  it("saveScore rejects cross-project lead ids", () => {
    const db = openDatabase(":memory:");
    const p1 = createProject(db, { name: "P1" });
    const p2 = createProject(db, { name: "P2" });
    insertLeads(db, p1.id, [
      { company: "A", website: "a.com", canonicalDomain: "a.com", email: null, votes: null, source: "csv", sources: ["csv"] },
    ]);
    const [lead] = listGatedLeads(db, p1.id);
    expect(() => saveScore(db, p2.id, lead.id, 50, "x")).toThrow(/not found|project/i);
    db.close();
  });
});
