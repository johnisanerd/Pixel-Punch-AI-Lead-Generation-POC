import { describe, it, expect, vi } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { listLeads } from "../../src/leads/leads.repo.js";
import { createConfiguredSources } from "../../src/sources/registry.js";
import { runIngest } from "../../src/ingest/run-ingest.js";

/**
 * Multi-source ingest: Product Hunt + Google return the same company/domain.
 * Aggregate validate must dedup to a single gated lead.
 */
describe("multi-source ingest integration", () => {
  it("dedups shared domain across Product Hunt and Google CSE", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("api.producthunt.com") && method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              posts: {
                edges: [
                  {
                    node: {
                      name: "Acme AI",
                      website: "https://acme.ai",
                      votesCount: 99,
                    },
                  },
                  {
                    node: {
                      name: "Only PH",
                      website: "https://only-ph.dev",
                      votesCount: 10,
                    },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("googleapis.com/customsearch") && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "Acme AI | Home",
                link: "https://www.acme.ai/",
                snippet: "Same company from Google",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const db = openDatabase(":memory:");
    const project = createProject(db, {
      name: "Multi-source",
      sourceConfig: JSON.stringify({
        producthunt: { enabled: true, first: 10 },
        google: { enabled: true, query: "Acme AI", num: 5 },
        enrich: false,
      }),
    });

    const { sources, enrich } = createConfiguredSources(project, {
      fetch: fetchMock as unknown as typeof fetch,
      env: {
        PRODUCTHUNT_TOKEN: "test-ph",
        GOOGLE_CSE_KEY: "test-key",
        GOOGLE_CSE_ID: "test-cx",
      },
    });

    expect(sources).toHaveLength(2);
    expect(enrich).toBe(false);

    const resolver = async () => [{ exchange: "mx", priority: 10 }];
    const summary = await runIngest(db, project.id, sources, {
      resolver,
      enrichWebsites: enrich,
      fetch: fetchMock as unknown as typeof fetch,
    });

    // 3 fetched (2 PH + 1 Google), Acme deduped → 2 kept
    expect(summary.fetched).toBe(3);
    expect(summary.kept).toBe(2);
    expect(summary.rejected).toBe(0);

    const leads = listLeads(db, project.id);
    expect(leads).toHaveLength(2);

    const acme = leads.find((l) => l.canonicalDomain === "acme.ai");
    expect(acme).toBeDefined();
    expect(acme!.sources.sort()).toEqual(["google", "producthunt"]);
    expect(acme!.votes).toBe(99);

    expect(fetchMock).toHaveBeenCalled();
    db.close();
  });
});
