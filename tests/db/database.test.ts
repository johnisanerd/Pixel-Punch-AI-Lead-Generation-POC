import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";

describe("openDatabase", () => {
  it("creates all core tables in an in-memory db", () => {
    const db = openDatabase(":memory:");
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain("projects");
    expect(names).toContain("leads");
    expect(names).toContain("feedback");
    expect(names).toContain("users");
    db.close();
  });
});
