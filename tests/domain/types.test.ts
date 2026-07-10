import { describe, it, expect } from "vitest";
import { LEAD_STATUSES, isLeadStatus } from "../../src/domain/types.js";

describe("LeadStatus", () => {
  it("recognizes valid statuses", () => {
    expect(isLeadStatus("raw")).toBe(true);
    expect(isLeadStatus("gated")).toBe(true);
    expect(isLeadStatus("scored")).toBe(true);
  });
  it("rejects invalid statuses", () => {
    expect(isLeadStatus("banana")).toBe(false);
  });
  it("exposes the full status list", () => {
    expect(LEAD_STATUSES).toContain("approved");
    expect(LEAD_STATUSES).toContain("rejected");
  });
});
