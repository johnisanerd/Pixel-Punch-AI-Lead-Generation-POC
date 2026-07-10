import { describe, it, expect, vi } from "vitest";
import {
  enrichLeadsFromWebsites,
  extractMailto,
  extractTitle,
  toAbsoluteUrl,
} from "../../src/sources/website-enricher.js";
import type { CanonicalLead } from "../../src/domain/types.js";

describe("extractMailto / extractTitle / toAbsoluteUrl", () => {
  it("parses mailto and title from HTML", () => {
    const html = `<html><head><title> Acme AI </title></head>
      <body><a href="mailto:hello@acme.ai?subject=Hi">Email us</a></body></html>`;
    expect(extractMailto(html)).toBe("hello@acme.ai");
    expect(extractTitle(html)).toBe("Acme AI");
  });

  it("normalizes website URLs", () => {
    expect(toAbsoluteUrl("acme.ai")).toBe("https://acme.ai/");
    expect(toAbsoluteUrl("https://acme.ai/path")).toBe("https://acme.ai/path");
    expect(toAbsoluteUrl(null)).toBeNull();
  });
});

describe("enrichLeadsFromWebsites", () => {
  it("fills missing emails from mailto links via injectable fetch", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("acme.ai");
      return new Response(
        `<html><head><title>Acme</title></head>
         <body><a href="mailto:founder@acme.ai">Contact</a></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    });

    const leads: CanonicalLead[] = [
      {
        company: "Acme AI",
        website: "https://acme.ai",
        email: null,
        votes: null,
        source: "google",
      },
      {
        company: "Has Email",
        website: "https://has.email",
        email: "keep@has.email",
        votes: null,
        source: "csv",
      },
    ];

    const enriched = await enrichLeadsFromWebsites(leads, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(enriched[0].email).toBe("founder@acme.ai");
    expect(enriched[1].email).toBe("keep@has.email");
    // Only fetched the lead missing email
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("leaves lead unchanged when fetch fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const leads: CanonicalLead[] = [
      {
        company: "Beta",
        website: "https://beta.dev",
        email: null,
        votes: 1,
        source: "producthunt",
      },
    ];
    const enriched = await enrichLeadsFromWebsites(leads, {
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(enriched[0].email).toBeNull();
    expect(enriched[0].company).toBe("Beta");
  });
});
