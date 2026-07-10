import { describe, it, expect } from "vitest";
import { parseCsvSource } from "../../src/sources/csv-source.js";

const CSV = `Company,Site,Email,Upvotes
Acme AI,https://acme.ai,founder@acme.ai,120
BetaCorp,betacorp.com,,45`;

describe("parseCsvSource", () => {
  it("maps columns to canonical leads", () => {
    const leads = parseCsvSource(CSV, {
      company: "Company",
      website: "Site",
      email: "Email",
      votes: "Upvotes",
    });
    expect(leads).toHaveLength(2);
    expect(leads[0]).toEqual({
      company: "Acme AI",
      website: "https://acme.ai",
      email: "founder@acme.ai",
      votes: 120,
      source: "csv",
    });
    expect(leads[1].email).toBeNull();
    expect(leads[1].votes).toBe(45);
  });

  it("skips rows with no company", () => {
    const csv = `Company,Email\n,x@y.com\nReal,r@x.com`;
    const leads = parseCsvSource(csv, { company: "Company", email: "Email" });
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Real");
  });
});
