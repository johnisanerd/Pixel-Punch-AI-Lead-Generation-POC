import { describe, it, expect } from "vitest";
import { canonicalDomain } from "../../src/validation/canonicalize.js";

describe("canonicalDomain", () => {
  it("strips protocol, www, path, query, and lowercases", () => {
    expect(canonicalDomain("https://www.Acme.ai/about?utm=x")).toBe("acme.ai");
    expect(canonicalDomain("http://acme.ai/")).toBe("acme.ai");
    expect(canonicalDomain("acme.ai")).toBe("acme.ai");
    expect(canonicalDomain("WWW.BetaCorp.COM")).toBe("betacorp.com");
  });
  it("returns null for empty/invalid input", () => {
    expect(canonicalDomain(null)).toBeNull();
    expect(canonicalDomain("")).toBeNull();
    expect(canonicalDomain("   ")).toBeNull();
  });
});
