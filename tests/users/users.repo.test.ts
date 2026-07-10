import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import {
  upsertUser,
  findUserByEmail,
  isAllowlisted,
} from "../../src/users/users.repo.js";

describe("users.repo", () => {
  it("upserts a user and finds by email", () => {
    const db = openDatabase(":memory:");
    const created = upsertUser(db, { email: "alice@example.com", name: "Alice" });
    expect(created.id).toBeGreaterThan(0);
    expect(created.email).toBe("alice@example.com");
    expect(created.name).toBe("Alice");

    const found = findUserByEmail(db, "alice@example.com");
    expect(found?.name).toBe("Alice");
    db.close();
  });

  it("updates name on conflict", () => {
    const db = openDatabase(":memory:");
    upsertUser(db, { email: "bob@example.com", name: "Bob" });
    const updated = upsertUser(db, { email: "bob@example.com", name: "Robert" });
    expect(updated.name).toBe("Robert");
    expect(findUserByEmail(db, "bob@example.com")?.name).toBe("Robert");
    db.close();
  });

  it("returns undefined for missing email", () => {
    const db = openDatabase(":memory:");
    expect(findUserByEmail(db, "nobody@example.com")).toBeUndefined();
    db.close();
  });
});

describe("isAllowlisted", () => {
  it("matches case-insensitively", () => {
    expect(isAllowlisted("Alice@Example.COM", ["alice@example.com"])).toBe(true);
    expect(isAllowlisted("alice@example.com", ["ALICE@EXAMPLE.COM"])).toBe(true);
  });

  it("rejects non-listed emails", () => {
    expect(isAllowlisted("eve@evil.com", ["alice@example.com", "bob@example.com"])).toBe(
      false
    );
  });

  it("trims whitespace on both sides", () => {
    expect(isAllowlisted("  alice@example.com  ", ["alice@example.com"])).toBe(true);
    expect(isAllowlisted("alice@example.com", ["  alice@example.com  "])).toBe(true);
  });
});
