import { describe, it, expect } from "vitest";
import { qualityGate } from "../../src/validation/quality-gate.js";
import type { DedupedLead } from "../../src/validation/dedup.js";

const d = (p: Partial<DedupedLead>): DedupedLead => ({
  company: "X",
  website: null,
  email: null,
  votes: null,
  source: "csv",
  canonicalDomain: null,
  sources: ["csv"],
  ...p,
});

describe("qualityGate", () => {
  it("keeps a lead that has a website", () => {
    const { kept, rejected } = qualityGate([d({ website: "acme.ai", canonicalDomain: "acme.ai" })]);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });
  it("keeps Product Hunt redirect website even when canonicalDomain is null", () => {
    const { kept, rejected } = qualityGate([
      d({
        company: "PlugThis",
        website: "https://www.producthunt.com/r/ABC",
        canonicalDomain: null,
        source: "producthunt",
        sources: ["producthunt"],
      }),
    ]);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });
  it("keeps a lead that has an email", () => {
    const { kept } = qualityGate([d({ email: "a@b.com" })]);
    expect(kept).toHaveLength(1);
  });
  it("rejects a lead with no website and no email", () => {
    const { kept, rejected } = qualityGate([d({ company: "Ghost" })]);
    expect(kept).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("no-contactable-signal");
  });
});
