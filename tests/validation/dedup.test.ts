import { describe, it, expect } from "vitest";
import { dedup } from "../../src/validation/dedup.js";
import type { CanonicalLead } from "../../src/domain/types.js";

const lead = (p: Partial<CanonicalLead>): CanonicalLead => ({
  company: "X",
  website: null,
  email: null,
  votes: null,
  source: "csv",
  ...p,
});

describe("dedup", () => {
  it("merges leads with the same canonical domain across sources", () => {
    const input = [
      lead({ company: "Acme", website: "https://acme.ai", source: "csv" }),
      lead({ company: "Acme AI", website: "http://www.acme.ai/", email: "a@acme.ai", source: "producthunt" }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].canonicalDomain).toBe("acme.ai");
    expect(result[0].sources.sort()).toEqual(["csv", "producthunt"]);
    expect(result[0].email).toBe("a@acme.ai"); // prefers non-null
  });

  it("merges domainless leads by normalized company name", () => {
    const input = [
      lead({ company: "Beta Corp", source: "csv" }),
      lead({ company: "beta corp", source: "google", votes: 10 }),
    ];
    const result = dedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].votes).toBe(10);
  });

  it("keeps distinct companies separate", () => {
    const input = [
      lead({ company: "Acme", website: "acme.ai" }),
      lead({ company: "Beta", website: "beta.com" }),
    ];
    expect(dedup(input)).toHaveLength(2);
  });
});
