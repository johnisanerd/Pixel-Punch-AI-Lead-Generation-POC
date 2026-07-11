import { describe, it, expect, vi } from "vitest";
import {
  JinaSearchSource,
  mapJinaSearchItems,
  companyFromJinaItem,
} from "../../src/sources/jina-search-source.js";

describe("companyFromJinaItem", () => {
  it("prefers title then falls back to hostname", () => {
    expect(
      companyFromJinaItem({
        title: "Acme AI | Home",
        url: "https://acme.ai",
      })
    ).toBe("Acme AI");
    expect(
      companyFromJinaItem({
        title: "",
        url: "https://www.beta.dev/about",
      })
    ).toBe("beta.dev");
  });
});

describe("mapJinaSearchItems", () => {
  it("maps Jina data items to canonical leads", () => {
    const leads = mapJinaSearchItems([
      {
        title: "Widget Co — SaaS",
        url: "https://widget.co",
        description: "Build widgets",
      },
      { title: "", url: "" },
      {
        title: "Gamma Docs",
        url: "https://www.gamma.io/pricing",
      },
    ]);
    expect(leads).toHaveLength(2);
    expect(leads[0]).toEqual({
      company: "Widget Co",
      website: "https://widget.co",
      email: null,
      votes: null,
      source: "jina",
    });
    expect(leads[1].company).toBe("Gamma Docs");
    expect(leads[1].website).toBe("https://www.gamma.io/pricing");
  });

  it("filters listicle and blocked-host noise", () => {
    const leads = mapJinaSearchItems([
      {
        title: "100 top SaaS AI companies and startups in July 2026",
        url: "https://www.f6s.com/companies",
      },
      {
        title: "",
        url: "https://www.reddit.com/r/startups/foo",
      },
      {
        title: "Acme AI — Official Site",
        url: "https://acme.ai",
      },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Acme AI");
  });

  it("filters design/career/pdf/funding-directory noise", () => {
    const leads = mapJinaSearchItems([
      {
        title: "AI Data Analytics SaaS Landing Page",
        url: "https://dribbble.com/shots/27483360-AI-Data",
      },
      {
        title: "Careers",
        url: "https://idccareers-idg.icims.com/jobs/6803/vp",
      },
      {
        title: "SJPAM-65-2025-1-8.pdf",
        url: "https://sarcouncil.com/download-article/SJPAM.pdf",
      },
      {
        title: "Birdie.ai: Funding, Team & Investors",
        url: "https://startupintros.com/orgs/birdie-ai",
      },
      {
        title: "Scoop Analytics",
        url: "https://www.scoopanalytics.com/",
      },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Scoop Analytics");
  });
});

describe("JinaSearchSource", () => {
  it("throws when api key or query missing", () => {
    expect(() => new JinaSearchSource({ apiKey: "", query: "q" })).toThrow(
      /JINA_API_KEY/
    );
    expect(() => new JinaSearchSource({ apiKey: "k", query: "  " })).toThrow(
      /query/
    );
  });

  it("POSTs s.jina.ai with bearer auth and maps data", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://s.jina.ai/");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer jina-key");
      const body = JSON.parse(String(init?.body));
      expect(body.q).toBe("AI startups");
      expect(body.num).toBe(5);

      return new Response(
        JSON.stringify({
          code: 200,
          status: 20000,
          data: [
            {
              title: "Widget Co — SaaS",
              url: "https://widget.co",
              description: "Build widgets",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const source = new JinaSearchSource({
      apiKey: "jina-key",
      query: "AI startups",
      num: 5,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const leads = await source.fetch();
    expect(source.name).toBe("jina");
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Widget Co");
    expect(leads[0].website).toBe("https://widget.co");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws on HTTP error", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("unauthorized", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        })
    );
    const source = new JinaSearchSource({
      apiKey: "k",
      query: "q",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(source.fetch()).rejects.toThrow(/Jina Search HTTP 401/);
  });
});
