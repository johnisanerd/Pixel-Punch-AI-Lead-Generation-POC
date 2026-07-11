import { describe, it, expect, vi } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, listLeads } from "../../src/leads/leads.repo.js";
import { runCompanyEnrichment } from "../../src/enrichment/run-company-enrichment.js";
import {
  getCompanyProfile,
  listCompanyEvidence,
  listCompanyPages,
  upsertCompanyProfile,
} from "../../src/enrichment/enrichment.repo.js";
import type { FetchLike } from "../../src/sources/source.js";

function htmlResponse(html: string, status = 200, url?: string): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    ...(url ? { url } as object : {}),
  });
}

describe("runCompanyEnrichment", () => {
  it("enriches multiple leads with mocked fetch and updates missing emails", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, {
      name: "Demo",
      sourceConfig: JSON.stringify({
        companyEnrichment: { enabled: true, maxPagesPerCompany: 3 },
      }),
    });
    insertLeads(db, project.id, [
      {
        company: "Acme",
        website: "https://acme.example",
        canonicalDomain: "acme.example",
        email: null,
        votes: null,
        source: "maps",
        sources: ["maps"],
      },
      {
        company: "Beta",
        website: "https://beta.example",
        canonicalDomain: "beta.example",
        email: "keep@beta.example",
        votes: null,
        source: "maps",
        sources: ["maps"],
      },
    ]);

    const fetchMock = vi.fn<FetchLike>(async (input) => {
      const url = String(input);
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      if (url.startsWith("https://acme.example/") && !url.includes("/about") && !url.includes("/contact")) {
        return htmlResponse(`
          <html><head><title>Acme</title>
          <meta name="description" content="Acme builds tools" />
          </head><body>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
            <a href="mailto:hello@acme.example">Email</a>
          </body></html>
        `);
      }
      if (url.includes("acme.example/about")) {
        return htmlResponse(`
          <html><head><title>About Acme</title></head>
          <body><p>About Acme SaaS platform in Austin.</p></body></html>
        `);
      }
      if (url.includes("acme.example/contact")) {
        return htmlResponse(`
          <html><head><title>Contact</title></head>
          <body><a href="mailto:hello@acme.example">hi</a></body></html>
        `);
      }
      if (url.startsWith("https://beta.example")) {
        return htmlResponse(`
          <html><head><title>Beta</title>
          <meta name="description" content="Beta desc" /></head>
          <body><a href="/pricing">Pricing</a></body></html>
        `);
      }
      if (url.includes("beta.example/pricing")) {
        return htmlResponse(`<html><head><title>Pricing</title></head><body>Plans</body></html>`);
      }
      return new Response("missing", { status: 404 });
    });

    const summary = await runCompanyEnrichment(db, project.id, {
      fetch: fetchMock,
    });

    expect(summary.companiesQueued).toBe(2);
    expect(summary.companiesEnriched).toBe(2);
    expect(summary.pagesFetched).toBeGreaterThanOrEqual(3);
    expect(summary.emailsFound).toBeGreaterThanOrEqual(1);
    expect(summary.failed).toBe(0);

    const acmeLead = listLeads(db, project.id).find((l) => l.company === "Acme")!;
    expect(acmeLead.email).toBe("hello@acme.example");
    const betaLead = listLeads(db, project.id).find((l) => l.company === "Beta")!;
    expect(betaLead.email).toBe("keep@beta.example");

    const profile = getCompanyProfile(db, project.id, "acme.example")!;
    expect(profile.description).toMatch(/Acme/i);
    expect(profile.emailCandidates).toContain("hello@acme.example");
    expect(listCompanyEvidence(db, project.id, "acme.example").length).toBeGreaterThan(0);
    expect(listCompanyPages(db, summary.runId).length).toBeGreaterThan(0);
    db.close();
  });

  it("skips already enriched domains unless force=true", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Skip" });
    insertLeads(db, project.id, [
      {
        company: "Acme",
        website: "https://acme.example",
        canonicalDomain: "acme.example",
        email: null,
        votes: null,
        source: "maps",
        sources: ["x"],
      },
    ]);
    upsertCompanyProfile(db, {
      projectId: project.id,
      domain: "acme.example",
      description: "existing",
      confidence: 0.5,
    });

    const fetchMock = vi.fn<FetchLike>();
    const summary = await runCompanyEnrichment(db, project.id, {
      fetch: fetchMock,
    });
    expect(summary.companiesQueued).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    const forced = await runCompanyEnrichment(db, project.id, {
      fetch: fetchMock.mockImplementation(async (input) => {
        if (String(input).includes("robots.txt")) {
          return new Response("User-agent: *\nAllow: /\n", { status: 200 });
        }
        return htmlResponse(`<html><head><title>Acme</title></head><body>Hi</body></html>`);
      }),
      force: true,
    });
    expect(forced.companiesQueued).toBe(1);
    db.close();
  });

  it("handles one failed website without failing the run", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Partial" });
    insertLeads(db, project.id, [
      {
        company: "Good",
        website: "https://good.example",
        canonicalDomain: "good.example",
        email: null,
        votes: null,
        source: "maps",
        sources: ["x"],
      },
      {
        company: "Bad",
        website: "https://bad.example",
        canonicalDomain: "bad.example",
        email: null,
        votes: null,
        source: "maps",
        sources: ["x"],
      },
    ]);

    const fetchMock = vi.fn<FetchLike>(async (input) => {
      const url = String(input);
      if (url.includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      if (url.includes("bad.example")) throw new Error("network down");
      return htmlResponse(`<html><head><title>Good</title><meta name="description" content="ok" /></head><body>Hi</body></html>`);
    });

    const summary = await runCompanyEnrichment(db, project.id, {
      fetch: fetchMock,
    });
    expect(summary.status).toBe("completed");
    expect(summary.companiesEnriched).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.errors.some((e) => /bad\.example/i.test(e))).toBe(true);
    db.close();
  });

  it("respects maxCompanies", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, {
      name: "Cap",
      sourceConfig: JSON.stringify({
        companyEnrichment: { maxCompanies: 1 },
      }),
    });
    insertLeads(db, project.id, [
      {
        company: "One",
        website: "https://one.example",
        canonicalDomain: "one.example",
        email: null,
        votes: null,
        source: "maps",
        sources: ["x"],
      },
      {
        company: "Two",
        website: "https://two.example",
        canonicalDomain: "two.example",
        email: null,
        votes: null,
        source: "maps",
        sources: ["x"],
      },
    ]);

    const fetchMock = vi.fn<FetchLike>(async (input) => {
      if (String(input).includes("robots.txt")) {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      return htmlResponse(`<html><head><title>X</title></head><body>Y</body></html>`);
    });

    const summary = await runCompanyEnrichment(db, project.id, {
      fetch: fetchMock,
    });
    expect(summary.companiesQueued).toBe(1);
    expect(summary.companiesEnriched).toBe(1);
    db.close();
  });

  it("returns clear error when no eligible websites", async () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Empty" });
    insertLeads(db, project.id, [
      {
        company: "NoSite",
        website: null,
        canonicalDomain: null,
        email: null,
        votes: null,
        source: "maps",
        sources: ["x"],
      },
    ]);
    await expect(runCompanyEnrichment(db, project.id)).rejects.toThrow(
      /no eligible/i
    );
    db.close();
  });
});
