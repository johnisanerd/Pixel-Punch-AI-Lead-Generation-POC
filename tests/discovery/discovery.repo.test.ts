import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import {
  createDiscoveryRun,
  updateDiscoveryRun,
  getDiscoveryRun,
  createSourceJob,
  updateSourceJob,
  listSourceJobs,
  insertDiscoveredCandidates,
  listDiscoveredCandidates,
} from "../../src/discovery/discovery.repo.js";

describe("discovery.repo", () => {
  it("creates a discovery run and updates status/counts", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Acme" });

    const run = createDiscoveryRun(db, {
      projectId: project.id,
      status: "queued",
    });
    expect(run.id).toBeGreaterThan(0);
    expect(run.status).toBe("queued");
    expect(run.fetchedCount).toBe(0);

    const updated = updateDiscoveryRun(db, run.id, {
      status: "completed",
      fetchedCount: 10,
      keptCount: 7,
      duplicateCount: 2,
      rejectedCount: 1,
      costEstimate: 0.42,
      finishedAt: "2026-07-11T12:00:00.000Z",
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.keptCount).toBe(7);
    expect(updated?.costEstimate).toBe(0.42);

    expect(getDiscoveryRun(db, run.id)?.projectId).toBe(project.id);
    db.close();
  });

  it("records source jobs under a run and updates job outcomes", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Acme" });
    const run = createDiscoveryRun(db, {
      projectId: project.id,
      status: "running",
    });

    const job = createSourceJob(db, {
      runId: run.id,
      sourceId: "google-maps-nyc",
      sourceType: "apify",
      status: "running",
      actorId: "apify/google-maps-scraper",
    });
    expect(job.sourceId).toBe("google-maps-nyc");

    updateSourceJob(db, job.id, {
      status: "failed",
      error: "timeout",
      fetchedCount: 0,
      apifyRunId: "run-123",
    });

    const jobs = listSourceJobs(db, run.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
    expect(jobs[0].error).toBe("timeout");
    expect(jobs[0].apifyRunId).toBe("run-123");
    db.close();
  });

  it("persists discovered candidates with raw payload capped", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Acme" });
    const run = createDiscoveryRun(db, {
      projectId: project.id,
      status: "running",
    });
    const job = createSourceJob(db, {
      runId: run.id,
      sourceId: "maps",
      sourceType: "apify",
      status: "completed",
    });

    insertDiscoveredCandidates(db, [
      {
        runId: run.id,
        sourceJobId: job.id,
        company: "Pizza Place",
        website: "https://pizza.example",
        domain: "pizza.example",
        source: "maps",
        sourceType: "apify",
        sourceUrl: "https://maps.example/1",
        discoveryQuery: "restaurants nyc",
        rawPayload: { title: "Pizza Place", huge: "x".repeat(20_000) },
        confidence: 0.9,
        kept: true,
      },
      {
        runId: run.id,
        sourceJobId: job.id,
        company: "LinkedIn Noise",
        website: "https://linkedin.com/company/x",
        domain: "linkedin.com",
        source: "maps",
        sourceType: "apify",
        sourceUrl: null,
        discoveryQuery: null,
        rawPayload: { title: "LinkedIn Noise" },
        confidence: 0.1,
        kept: false,
        rejectionReason: "blocked_host",
      },
    ]);

    const kept = listDiscoveredCandidates(db, run.id, { kept: true });
    expect(kept).toHaveLength(1);
    expect(kept[0].company).toBe("Pizza Place");
    expect(kept[0].domain).toBe("pizza.example");
    expect(JSON.stringify(kept[0].rawPayload).length).toBeLessThan(12_000);

    const rejected = listDiscoveredCandidates(db, run.id, { kept: false });
    expect(rejected[0].rejectionReason).toBe("blocked_host");
    db.close();
  });
});
