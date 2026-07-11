import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import {
  createEnrichmentRun,
  updateEnrichmentRun,
  getEnrichmentRun,
  createEnrichmentJob,
  updateEnrichmentJob,
  listEnrichmentJobs,
  insertCompanyPages,
  listCompanyPages,
  upsertCompanyProfile,
  getCompanyProfile,
  insertCompanyEvidence,
  listCompanyEvidence,
} from "../../src/enrichment/enrichment.repo.js";

describe("enrichment.repo", () => {
  it("creates and updates an enrichment run", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Acme" });
    const run = createEnrichmentRun(db, {
      projectId: project.id,
      status: "queued",
    });
    expect(run.id).toBeGreaterThan(0);

    const updated = updateEnrichmentRun(db, run.id, {
      status: "completed",
      companiesQueued: 3,
      companiesEnriched: 2,
      pagesFetched: 10,
      evidenceSaved: 8,
      emailsFound: 1,
      failedCount: 1,
      finishedAt: "2026-07-11T12:00:00.000Z",
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.pagesFetched).toBe(10);
    expect(getEnrichmentRun(db, run.id)?.companiesEnriched).toBe(2);
    db.close();
  });

  it("tracks per-company jobs and pages", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Acme" });
    const run = createEnrichmentRun(db, {
      projectId: project.id,
      status: "running",
    });
    const job = createEnrichmentJob(db, {
      runId: run.id,
      projectId: project.id,
      leadId: 1,
      domain: "acme.example",
      website: "https://acme.example",
      status: "running",
    });

    updateEnrichmentJob(db, job.id, {
      status: "completed",
      finalHomepageUrl: "https://www.acme.example/",
      pagesFetched: 3,
      finishedAt: "2026-07-11T12:00:00.000Z",
    });

    insertCompanyPages(db, [
      {
        runId: run.id,
        jobId: job.id,
        projectId: project.id,
        domain: "acme.example",
        url: "https://acme.example/",
        finalUrl: "https://www.acme.example/",
        pageType: "homepage",
        httpStatus: 200,
        title: "Acme",
        metaDescription: "We build things",
        textSnippet: "Welcome to Acme",
      },
      {
        runId: run.id,
        jobId: job.id,
        projectId: project.id,
        domain: "acme.example",
        url: "https://acme.example/about",
        finalUrl: "https://acme.example/about",
        pageType: "about",
        httpStatus: 200,
        title: "About",
        metaDescription: null,
        textSnippet: "About Acme",
      },
    ]);

    expect(listEnrichmentJobs(db, run.id)).toHaveLength(1);
    expect(listCompanyPages(db, run.id)).toHaveLength(2);
    db.close();
  });

  it("upserts company profile and caps evidence text", () => {
    const db = openDatabase(":memory:");
    const project = createProject(db, { name: "Acme" });

    const profile = upsertCompanyProfile(db, {
      projectId: project.id,
      leadId: 7,
      domain: "acme.example",
      homepageUrl: "https://acme.example",
      title: "Acme Inc",
      description: "B2B widgets",
      categoryHints: ["saas"],
      locationHints: ["Austin, TX"],
      socialLinks: { linkedin: "https://linkedin.com/company/acme" },
      emailCandidates: ["hello@acme.example"],
      confidence: 0.82,
    });
    expect(profile.domain).toBe("acme.example");

    const again = upsertCompanyProfile(db, {
      projectId: project.id,
      leadId: 7,
      domain: "acme.example",
      homepageUrl: "https://acme.example",
      title: "Acme Inc",
      description: "Updated description",
      categoryHints: ["saas", "b2b"],
      locationHints: ["Austin, TX"],
      socialLinks: { linkedin: "https://linkedin.com/company/acme" },
      emailCandidates: ["hello@acme.example", "sales@acme.example"],
      confidence: 0.9,
    });
    expect(again.id).toBe(profile.id);
    expect(again.description).toBe("Updated description");
    expect(getCompanyProfile(db, project.id, "acme.example")?.confidence).toBe(
      0.9
    );

    insertCompanyEvidence(db, [
      {
        projectId: project.id,
        leadId: 7,
        domain: "acme.example",
        evidenceType: "about_snippet",
        url: "https://acme.example/about",
        title: "About",
        textExcerpt: "x".repeat(20_000),
        confidence: 0.7,
      },
    ]);
    const evidence = listCompanyEvidence(db, project.id, "acme.example");
    expect(evidence).toHaveLength(1);
    expect(evidence[0].textExcerpt.length).toBeLessThan(5_000);
    db.close();
  });
});
