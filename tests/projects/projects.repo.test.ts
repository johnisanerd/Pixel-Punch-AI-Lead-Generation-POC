import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import {
  createProject,
  getProject,
  updateProject,
} from "../../src/projects/projects.repo.js";

describe("projects.repo", () => {
  it("creates a project and reads it back", () => {
    const db = openDatabase(":memory:");
    const created = createProject(db, {
      name: "Pixel Punch",
      website: "https://pixelpunch.example",
      description: "Consultancy",
      icp: "SMBs needing software consulting",
    });
    expect(created.id).toBeGreaterThan(0);

    const fetched = getProject(db, created.id);
    expect(fetched?.name).toBe("Pixel Punch");
    expect(fetched?.icp).toBe("SMBs needing software consulting");
    db.close();
  });

  it("returns undefined for a missing project", () => {
    const db = openDatabase(":memory:");
    expect(getProject(db, 999)).toBeUndefined();
    db.close();
  });

  it("persists and updates sourceConfig", () => {
    const db = openDatabase(":memory:");
    const cfg = JSON.stringify({
      producthunt: { enabled: true, first: 10 },
      enrich: true,
    });
    const created = createProject(db, {
      name: "With Sources",
      sourceConfig: cfg,
    });
    expect(created.sourceConfig).toBe(cfg);

    const updated = updateProject(db, created.id, {
      sourceConfig: JSON.stringify({
        jina: { enabled: true, query: "analytics", num: 5 },
      }),
      icp: "B2B analytics",
    });
    expect(updated?.icp).toBe("B2B analytics");
    expect(JSON.parse(updated!.sourceConfig!).jina.query).toBe("analytics");
    db.close();
  });
});
