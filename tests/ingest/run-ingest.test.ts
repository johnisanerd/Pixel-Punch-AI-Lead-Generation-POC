import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { listLeads } from "../../src/leads/leads.repo.js";
import { runIngest } from "../../src/ingest/run-ingest.js";
import type { Source } from "../../src/sources/source.js";

describe("runIngest", () => {
  it("merges sources, validates aggregate, and persists gated leads", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "P1" });

    const csv: Source = {
      name: "csv",
      fetch: async () => [
        { company: "Acme", website: "https://acme.ai", email: null, votes: null, source: "csv" },
        { company: "Ghost", website: null, email: null, votes: null, source: "csv" },
      ],
    };
    const ph: Source = {
      name: "producthunt",
      fetch: async () => [
        { company: "Acme AI", website: "www.acme.ai", email: "a@acme.ai", votes: 99, source: "producthunt" },
      ],
    };

    const resolver = async () => [{ exchange: "mx", priority: 10 }];
    const summary = await runIngest(db, project.id, [csv, ph], resolver);

    expect(summary.kept).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.skippedExisting).toBe(0);

    const leads = listLeads(db, project.id);
    expect(leads).toHaveLength(1);
    expect(leads[0].canonicalDomain).toBe("acme.ai");
    expect(leads[0].email).toBe("a@acme.ai");
    db.close();
  });

  it("skips leads that already exist in the project DB", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "P1" });
    const resolver = async () => [{ exchange: "mx", priority: 10 }];
    const csv: Source = {
      name: "csv",
      fetch: async () => [
        {
          company: "GoodCo",
          website: "https://goodco.test",
          email: "a@goodco.test",
          votes: 1,
          source: "csv",
        },
      ],
    };
    const first = await runIngest(db, project.id, [csv], resolver);
    expect(first.kept).toBe(1);
    const second = await runIngest(db, project.id, [csv], resolver);
    expect(second.kept).toBe(0);
    expect(second.skippedExisting).toBe(1);
    expect(listLeads(db, project.id)).toHaveLength(1);
    db.close();
  });
});
