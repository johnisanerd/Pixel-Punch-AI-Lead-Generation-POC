import { describe, it, expect, vi } from "vitest";
import {
  ProductHuntSource,
  mapProductHuntPosts,
} from "../../src/sources/producthunt-source.js";

describe("mapProductHuntPosts", () => {
  it("maps GraphQL nodes to canonical leads", () => {
    const leads = mapProductHuntPosts([
      {
        name: "Acme AI",
        website: "https://acme.ai",
        url: "https://www.producthunt.com/posts/acme-ai",
        votesCount: 120,
      },
      { name: "  ", website: "https://skip.me", votesCount: 1 },
      { name: "Beta", website: null, url: "https://beta.dev", votesCount: null },
    ]);
    expect(leads).toHaveLength(2);
    expect(leads[0]).toEqual({
      company: "Acme AI",
      website: "https://acme.ai",
      email: null,
      votes: 120,
      source: "producthunt",
    });
    expect(leads[1].website).toBe("https://beta.dev");
    expect(leads[1].votes).toBeNull();
  });
});

describe("ProductHuntSource", () => {
  it("throws when token is missing", () => {
    expect(() => new ProductHuntSource({ token: "" })).toThrow(
      /PRODUCTHUNT_TOKEN/
    );
  });

  it("POSTs GraphQL with Bearer auth and maps response", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toContain("api.producthunt.com/v2/api/graphql");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-token");
      const body = JSON.parse(String(init?.body));
      expect(body.variables.first).toBe(5);
      expect(body.query).toContain("posts");

      return new Response(
        JSON.stringify({
          data: {
            posts: {
              edges: [
                {
                  node: {
                    name: "Widget",
                    website: "https://widget.io",
                    votesCount: 42,
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const source = new ProductHuntSource({
      token: "test-token",
      first: 5,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const leads = await source.fetch();
    expect(source.name).toBe("producthunt");
    expect(leads).toHaveLength(1);
    expect(leads[0].company).toBe("Widget");
    expect(leads[0].votes).toBe(42);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws on GraphQL errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ message: "Unauthorized" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const source = new ProductHuntSource({
      token: "bad",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(source.fetch()).rejects.toThrow(/Unauthorized/);
  });
});
