import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, listLeads } from "../../src/leads/leads.repo.js";

describe("leads.repo", () => {
  it("inserts deduped leads scoped to a project and lists them", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "P1" });
    insertLeads(db, project.id, [
      {
        company: "Acme",
        website: "acme.ai",
        canonicalDomain: "acme.ai",
        email: "a@acme.ai",
        votes: 10,
        source: "csv",
        sources: ["csv", "producthunt"],
      },
    ]);
    const leads = listLeads(db, project.id);
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Acme");
    expect(leads[0].sources).toEqual(["csv", "producthunt"]);
    expect(leads[0].status).toBe("gated");
    db.close();
  });
});
