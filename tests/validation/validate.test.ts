import { describe, it, expect } from "vitest";
import { validateAggregate } from "../../src/validation/validate.js";
import type { CanonicalLead } from "../../src/domain/types.js";

const lead = (p: Partial<CanonicalLead>): CanonicalLead => ({
  company: "X",
  website: null,
  email: null,
  votes: null,
  source: "csv",
  ...p,
});

describe("validateAggregate", () => {
  it("dedups across sources, drops bad emails, and gates junk", async () => {
    const input = [
      lead({ company: "Acme", website: "https://acme.ai", source: "csv" }),
      lead({ company: "Acme AI", website: "www.acme.ai", email: "a@acme.ai", source: "producthunt" }),
      lead({ company: "Ghost", source: "csv" }), // no signal -> rejected
      lead({ company: "Beta", email: "bad-syntax", source: "google" }), // email nulled, no site -> rejected
    ];
    // MX passes for acme.ai only
    const resolver = async (host: string) =>
      host === "acme.ai" ? [{ exchange: "mx", priority: 10 }] : [];

    const { kept, rejected } = await validateAggregate(input, resolver);

    expect(kept).toHaveLength(1);
    expect(kept[0].canonicalDomain).toBe("acme.ai");
    expect(kept[0].email).toBe("a@acme.ai");
    expect(kept[0].sources.sort()).toEqual(["csv", "producthunt"]);
    expect(rejected.map((r) => r.lead.company).sort()).toEqual(["Beta", "Ghost"]);
  });
});
