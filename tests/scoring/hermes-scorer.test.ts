import { describe, it, expect, vi } from "vitest";
import { HermesScorer } from "../../src/scoring/hermes-scorer.js";
import type { Lead, Project } from "../../src/domain/types.js";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 1,
    projectId: 1,
    company: "Acme",
    website: "acme.com",
    canonicalDomain: "acme.com",
    email: "a@acme.com",
    votes: 10,
    source: "csv",
    sources: ["csv"],
    status: "gated",
    score: null,
    reasons: null,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: "P1",
    website: null,
    description: null,
    icp: "B2B SaaS",
    sourceConfig: null,
    status: "active",
    createdAt: "2026-01-01",
    ...overrides,
  };
}

describe("HermesScorer", () => {
  it("parses score and reasons from chat completions", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"score":75,"reasons":"Good ICP fit"}' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const scorer = new HermesScorer({ fetchFn, baseUrl: "http://test" });
    const result = await scorer.scoreLead(makeLead(), makeProject());
    expect(result.score).toBe(75);
    expect(result.reasons).toBe("Good ICP fit");
    expect(fetchFn).toHaveBeenCalledOnce();
    const call = fetchFn.mock.calls[0] as unknown as [string, RequestInit?];
    expect(call[0]).toBe("http://test/v1/chat/completions");
    expect(call[1]?.method).toBe("POST");
  });

  it("strips markdown fences from content", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"score":60,"reasons":"ok"}\n```',
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    const scorer = new HermesScorer({ fetchFn });
    const result = await scorer.scoreLead(makeLead(), makeProject());
    expect(result.score).toBe(60);
    expect(result.reasons).toBe("ok");
  });

  it("throws on bad JSON", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not json at all" } }],
        }),
        { status: 200 }
      )
    );
    const scorer = new HermesScorer({ fetchFn });
    await expect(scorer.scoreLead(makeLead(), makeProject())).rejects.toThrow(/json/i);
  });

  it("throws on out-of-range score", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"score":150,"reasons":"too high"}' } }],
        }),
        { status: 200 }
      )
    );
    const scorer = new HermesScorer({ fetchFn });
    await expect(scorer.scoreLead(makeLead(), makeProject())).rejects.toThrow(/0.?100|range/i);
  });
});
