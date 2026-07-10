import { describe, it, expect, vi } from "vitest";
import {
  GoogleSearchSource,
  mapGoogleSearchItems,
  companyFromTitle,
} from "../../src/sources/google-search-source.js";

describe("companyFromTitle", () => {
  it("strips pipe/dash site suffixes", () => {
    expect(companyFromTitle("Acme AI | Official Site")).toBe("Acme AI");
    expect(companyFromTitle("Beta — Home")).toBe("Beta");
  });
});

describe("mapGoogleSearchItems", () => {
  it("maps CSE items to canonical leads", () => {
    const leads = mapGoogleSearchItems([
      {
        title: "Acme AI | Home",
        link: "https://acme.ai",
        snippet: "AI tools",
      },
      { title: "", link: "https://skip.me" },
      { title: "Beta Corp", link: "https://beta.dev" },
    ]);
    expect(leads).toHaveLength(2);
    expect(leads[0]).toEqual({
      company: "Acme AI",
      website: "https://acme.ai",
      email: null,
      votes: null,
      source: "google",
    });
    expect(leads[1].company).toBe("Beta Corp");
  });
});

describe("GoogleSearchSource", () => {
  it("throws when credentials or query missing", () => {
    expect(
      () => new GoogleSearchSource({ apiKey: "", cx: "cx", query: "q" })
    ).toThrow(/GOOGLE_CSE_KEY/);
    expect(
      () => new GoogleSearchSource({ apiKey: "k", cx: "", query: "q" })
    ).toThrow(/GOOGLE_CSE_ID/);
    expect(
      () => new GoogleSearchSource({ apiKey: "k", cx: "cx", query: "  " })
    ).toThrow(/query/);
  });

  it("GETs CSE with key/cx/q and maps items", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://www.googleapis.com/customsearch/v1"
      );
      expect(url.searchParams.get("key")).toBe("api-key");
      expect(url.searchParams.get("cx")).toBe("cse-id");
      expect(url.searchParams.get("q")).toBe("AI startups");
      expect(url.searchParams.get("num")).toBe("5");

      return new Response(
        JSON.stringify({
          items: [
            {
              title: "Widget Co — SaaS",
              link: "https://widget.co",
              snippet: "Build widgets",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const source = new GoogleSearchSource({
      apiKey: "api-key",
      cx: "cse-id",
      query: "AI startups",
      num: 5,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const leads = await source.fetch();
    expect(source.name).toBe("google");
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Widget Co");
    expect(leads[0].website).toBe("https://widget.co");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws on API error payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { message: "Daily Limit Exceeded", code: 403 } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const source = new GoogleSearchSource({
      apiKey: "k",
      cx: "cx",
      query: "q",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(source.fetch()).rejects.toThrow(/Daily Limit/);
  });
});
