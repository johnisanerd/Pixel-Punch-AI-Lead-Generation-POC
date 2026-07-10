import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import {
  createProject,
  listProjects,
  updateProject,
  getProject,
} from "../../src/projects/projects.repo.js";

describe("projects list/update", () => {
  it("lists all projects", () => {
    const db = openDatabase(":memory:");
    createProject(db, { name: "A" });
    createProject(db, { name: "B" });
    const list = listProjects(db);
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
    db.close();
  });

  it("updates project fields", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "Old", icp: "old icp" });
    const updated = updateProject(db, p.id, {
      name: "New",
      website: "https://new.example",
      description: "desc",
      icp: "new icp",
    });
    expect(updated?.name).toBe("New");
    expect(updated?.website).toBe("https://new.example");
    expect(updated?.description).toBe("desc");
    expect(updated?.icp).toBe("new icp");
    expect(getProject(db, p.id)?.name).toBe("New");
    db.close();
  });

  it("returns undefined when updating missing project", () => {
    const db = openDatabase(":memory:");
    expect(updateProject(db, 999, { name: "Nope" })).toBeUndefined();
    db.close();
  });
});
