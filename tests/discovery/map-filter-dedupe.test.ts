import { describe, it, expect } from "vitest";
import {
  getNestedField,
  mapApifyItemToCandidate,
  type ApifyResultMapping,
} from "../../src/discovery/map-candidate.js";
import {
  evaluateCandidateNoise,
  isBlockedHost,
} from "../../src/discovery/noise-filter.js";
import { dedupeCandidates } from "../../src/discovery/dedupe-candidates.js";
import type { DiscoveredCompanyCandidate } from "../../src/discovery/types.js";

const mapping: ApifyResultMapping = {
  companyField: "title",
  websiteField: "website",
  sourceUrlField: "url",
};

describe("getNestedField", () => {
  it("reads nested paths with dot notation", () => {
    expect(getNestedField({ a: { b: "x" } }, "a.b")).toBe("x");
    expect(getNestedField({ title: "Acme" }, "title")).toBe("Acme");
    expect(getNestedField({}, "missing")).toBeUndefined();
  });
});

describe("mapApifyItemToCandidate", () => {
  it("maps company/website/source URL correctly", () => {
    const candidate = mapApifyItemToCandidate(
      {
        title: "Acme Labs",
        website: "https://www.acme.example/about",
        url: "https://maps.example/place/1",
      },
      {
        sourceId: "maps",
        sourceType: "apify",
        mapping,
        discoveryQuery: "restaurants nyc",
      }
    );
    expect(candidate).toMatchObject({
      company: "Acme Labs",
      website: "https://www.acme.example/about",
      domain: "acme.example",
      source: "maps",
      sourceUrl: "https://maps.example/place/1",
      discoveryQuery: "restaurants nyc",
      confidence: expect.any(Number),
    });
  });

  it("rejects missing required fields", () => {
    expect(
      mapApifyItemToCandidate(
        { website: "https://x.example" },
        { sourceId: "maps", sourceType: "apify", mapping }
      )
    ).toBeNull();

    expect(
      mapApifyItemToCandidate(
        { title: "No Site" },
        {
          sourceId: "maps",
          sourceType: "apify",
          mapping,
          allowCompanyOnly: false,
        }
      )
    ).toBeNull();
  });

  it("allows company-only when configured", () => {
    const candidate = mapApifyItemToCandidate(
      { title: "No Site Co" },
      {
        sourceId: "maps",
        sourceType: "apify",
        mapping,
        allowCompanyOnly: true,
      }
    );
    expect(candidate?.company).toBe("No Site Co");
    expect(candidate?.website).toBeNull();
  });

  it("supports nested field paths", () => {
    const candidate = mapApifyItemToCandidate(
      {
        place: { name: "Nested Co", site: "https://nested.example" },
        meta: { link: "https://src.example/1" },
      },
      {
        sourceId: "nested",
        sourceType: "apify",
        mapping: {
          companyField: "place.name",
          websiteField: "place.site",
          sourceUrlField: "meta.link",
        },
      }
    );
    expect(candidate?.company).toBe("Nested Co");
    expect(candidate?.domain).toBe("nested.example");
  });
});

describe("noise-filter", () => {
  it("rejects blocked social hosts as primary websites", () => {
    expect(isBlockedHost("linkedin.com")).toBe(true);
    expect(isBlockedHost("www.facebook.com")).toBe(true);
    expect(isBlockedHost("acme.example")).toBe(false);
  });

  it("rejects directories and job pages as company websites", () => {
    const directory = evaluateCandidateNoise({
      company: "Tools Directory Entry",
      website: "https://www.producthunt.com/products/x",
      domain: "producthunt.com",
      source: "search",
      sourceType: "search",
      sourceUrl: null,
      discoveryQuery: null,
      rawPayload: {},
      confidence: 0.5,
    });
    expect(directory.reject).toBe(true);
    expect(directory.reason).toMatch(/directory|blocked/i);

    const job = evaluateCandidateNoise({
      company: "Acme",
      website: "https://boards.greenhouse.io/acme/jobs/1",
      domain: "boards.greenhouse.io",
      source: "jobs",
      sourceType: "apify",
      sourceUrl: null,
      discoveryQuery: null,
      rawPayload: {},
      confidence: 0.5,
    });
    expect(job.reject).toBe(true);
  });

  it("keeps valid company domains", () => {
    const result = evaluateCandidateNoise({
      company: "Acme Labs",
      website: "https://acme.example",
      domain: "acme.example",
      source: "maps",
      sourceType: "apify",
      sourceUrl: "https://maps.example/1",
      discoveryQuery: null,
      rawPayload: {},
      confidence: 0.9,
    });
    expect(result.reject).toBe(false);
  });

  it("rejects empty company names", () => {
    const result = evaluateCandidateNoise({
      company: "   ",
      website: "https://acme.example",
      domain: "acme.example",
      source: "maps",
      sourceType: "apify",
      sourceUrl: null,
      discoveryQuery: null,
      rawPayload: {},
      confidence: 0.5,
    });
    expect(result.reject).toBe(true);
    expect(result.reason).toBe("empty_company");
  });
});

describe("dedupeCandidates", () => {
  function cand(
    partial: Partial<DiscoveredCompanyCandidate> & { company: string }
  ): DiscoveredCompanyCandidate {
    return {
      website: null,
      domain: null,
      source: "a",
      sourceType: "apify",
      sourceUrl: null,
      discoveryQuery: null,
      rawPayload: {},
      confidence: 0.5,
      ...partial,
    };
  }

  it("dedupes by canonical domain and merges sources", () => {
    const { kept, duplicates } = dedupeCandidates([
      cand({
        company: "Acme",
        website: "https://acme.example",
        domain: "acme.example",
        source: "maps",
        sourceUrl: "https://maps.example/1",
        confidence: 0.8,
      }),
      cand({
        company: "Acme Inc",
        website: "https://www.acme.example/about",
        domain: "acme.example",
        source: "search",
        sourceUrl: "https://search.example/acme",
        confidence: 0.6,
      }),
    ]);
    expect(kept).toHaveLength(1);
    expect(duplicates).toBe(1);
    expect(kept[0].source).toContain("maps");
    expect(kept[0].source).toContain("search");
  });

  it("falls back to normalized company name when domain missing", () => {
    const { kept, duplicates } = dedupeCandidates([
      cand({ company: "Beta Co", source: "a" }),
      cand({ company: "beta co", source: "b" }),
      cand({ company: "Gamma", source: "c" }),
    ]);
    expect(kept).toHaveLength(2);
    expect(duplicates).toBe(1);
  });

  it("prefers higher-confidence / direct website when merging same domain", () => {
    const { kept } = dedupeCandidates([
      cand({
        company: "Acme",
        website: "https://acme.example/from-listing",
        domain: "acme.example",
        source: "directory",
        sourceUrl: "https://yelp.com/biz/acme",
        confidence: 0.4,
      }),
      cand({
        company: "Acme Labs",
        website: "https://acme.example",
        domain: "acme.example",
        source: "maps",
        sourceUrl: "https://maps.example/1",
        confidence: 0.9,
      }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].website).toBe("https://acme.example");
    expect(kept[0].confidence).toBe(0.9);
  });
});
