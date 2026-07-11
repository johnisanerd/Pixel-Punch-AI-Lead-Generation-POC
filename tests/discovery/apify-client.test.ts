import { describe, it, expect, vi } from "vitest";
import { ApifyClient, ApifyClientError } from "../../src/discovery/apify-client.js";
import type { FetchLike } from "../../src/sources/source.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApifyClient", () => {
  it("runs an actor, polls until succeeded, and fetches dataset items", async () => {
    const fetchMock = vi.fn<FetchLike>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "run-1",
            status: "RUNNING",
            defaultDatasetId: "ds-1",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { id: "run-1", status: "RUNNING", defaultDatasetId: "ds-1" },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "run-1",
            status: "SUCCEEDED",
            defaultDatasetId: "ds-1",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { title: "Acme", website: "https://acme.example" },
          { title: "Beta", website: "https://beta.example" },
        ])
      );

    const client = new ApifyClient({
      token: "tok",
      fetch: fetchMock,
      pollIntervalMs: 1,
    });

    const result = await client.runActorAndGetItems({
      actorId: "apify/google-maps-scraper",
      input: { searchStringsArray: ["restaurants"] },
    });

    expect(result.runId).toBe("run-1");
    expect(result.datasetId).toBe("ds-1");
    expect(result.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const startCall = fetchMock.mock.calls[0];
    expect(String(startCall[0])).toContain(
      "/v2/acts/apify~google-maps-scraper/runs"
    );
    expect(startCall[1]?.headers).toMatchObject({
      Authorization: "Bearer tok",
    });
  });

  it("runs a task by taskId", async () => {
    const fetchMock = vi.fn<FetchLike>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "run-t",
            status: "SUCCEEDED",
            defaultDatasetId: "ds-t",
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse([{ name: "Shop" }]));

    const client = new ApifyClient({
      token: "tok",
      fetch: fetchMock,
      pollIntervalMs: 1,
    });

    const result = await client.runActorAndGetItems({
      taskId: "user/my-task",
      input: { query: "x" },
    });
    expect(result.items[0]).toEqual({ name: "Shop" });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v2/actor-tasks/user~my-task/runs"
    );
  });

  it("throws ApifyClientError on failed actor run", async () => {
    const fetchMock = vi.fn<FetchLike>();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: "run-f",
          status: "FAILED",
          defaultDatasetId: "ds-f",
          statusMessage: "Actor crashed",
        },
      })
    );

    const client = new ApifyClient({
      token: "tok",
      fetch: fetchMock,
      pollIntervalMs: 1,
    });

    await expect(
      client.runActorAndGetItems({ actorId: "a/b", input: {} })
    ).rejects.toBeInstanceOf(ApifyClientError);
  });

  it("throws on timeout while polling", async () => {
    const fetchMock = vi.fn<FetchLike>();
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        data: { id: "run-s", status: "RUNNING", defaultDatasetId: "ds" },
      })
    );

    const client = new ApifyClient({
      token: "tok",
      fetch: fetchMock,
      pollIntervalMs: 1,
      timeoutMs: 5,
    });

    await expect(
      client.runActorAndGetItems({ actorId: "a/b", input: {} })
    ).rejects.toThrow(/timed out/i);
  });

  it("returns empty items for empty dataset", async () => {
    const fetchMock = vi.fn<FetchLike>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "run-e",
            status: "SUCCEEDED",
            defaultDatasetId: "ds-e",
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new ApifyClient({
      token: "tok",
      fetch: fetchMock,
      pollIntervalMs: 1,
    });

    const result = await client.runActorAndGetItems({
      actorId: "a/b",
      input: {},
    });
    expect(result.items).toEqual([]);
  });

  it("normalizes HTTP errors from Apify API", async () => {
    const fetchMock = vi.fn<FetchLike>();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { type: "token-not-provided", message: "Auth required" } },
        401
      )
    );

    const client = new ApifyClient({
      token: "bad",
      fetch: fetchMock,
      pollIntervalMs: 1,
    });

    await expect(
      client.runActorAndGetItems({ actorId: "a/b", input: {} })
    ).rejects.toThrow(/Auth required|401/);
  });
});
