import { describe, it, expect } from "vitest";
import { isValidSyntax, checkEmail } from "../../src/validation/email-check.js";

describe("isValidSyntax", () => {
  it("accepts well-formed emails", () => {
    expect(isValidSyntax("a@b.com")).toBe(true);
  });
  it("rejects malformed emails", () => {
    expect(isValidSyntax("nope")).toBe(false);
    expect(isValidSyntax("a@b")).toBe(false);
    expect(isValidSyntax("")).toBe(false);
  });
});

describe("checkEmail", () => {
  it("is invalid when syntax fails (no DNS call)", async () => {
    const resolver = async () => {
      throw new Error("should not be called");
    };
    const result = await checkEmail("bad", resolver);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("syntax");
  });

  it("is valid when syntax and MX both pass", async () => {
    const resolver = async () => [{ exchange: "mx.b.com", priority: 10 }];
    const result = await checkEmail("a@b.com", resolver);
    expect(result.valid).toBe(true);
  });

  it("is invalid when MX has no records", async () => {
    const resolver = async () => [];
    const result = await checkEmail("a@b.com", resolver);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("mx");
  });

  it("is invalid when MX lookup throws", async () => {
    const resolver = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await checkEmail("a@nodomain.zzz", resolver);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("mx");
  });
});
