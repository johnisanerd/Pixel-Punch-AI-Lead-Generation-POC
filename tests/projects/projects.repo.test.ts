import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject, getProject } from "../../src/projects/projects.repo.js";

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
});
