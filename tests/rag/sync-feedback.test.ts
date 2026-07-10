import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../../src/db/database.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { insertLeads, listGatedLeads, saveScore } from "../../src/leads/leads.repo.js";
import { recordFeedback } from "../../src/feedback/feedback.repo.js";
import { FileFeedbackRag } from "../../src/rag/file-feedback-rag.js";
import { syncFeedbackToRag, rebuildProjectRag } from "../../src/rag/sync-feedback.js";

describe("sync-feedback", () => {
  let baseDir: string;
  let rag: FileFeedbackRag;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "leadradar-sync-"));
    rag = new FileFeedbackRag(baseDir);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("syncFeedbackToRag upserts lead + latest feedback", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      {
        company: "Acme SaaS",
        website: "acme.com",
        canonicalDomain: "acme.com",
        email: "a@acme.com",
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const [lead] = listGatedLeads(db, p.id);
    saveScore(db, p.id, lead!.id, 82, "strong fit");
    recordFeedback(
      db,
      {
        projectId: p.id,
        leadId: lead!.id,
        good: true,
        notes: "Perfect ICP",
        reviewedBy: "alice",
        source: "dashboard",
      },
      { rag: null }
    );

    syncFeedbackToRag(db, rag, p.id, lead!.id);
    const similar = rag.similar(p.id, "Acme SaaS Perfect ICP", 1);
    expect(similar).toHaveLength(1);
    expect(similar[0]!.company).toBe("Acme SaaS");
    expect(similar[0]!.good).toBe(true);
    expect(similar[0]!.score).toBe(82);
    expect(similar[0]!.notes).toBe("Perfect ICP");
    db.close();
  });

  it("rebuildProjectRag clears and re-upserts all feedback leads", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      {
        company: "Alpha",
        website: "alpha.com",
        canonicalDomain: "alpha.com",
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
      {
        company: "Beta",
        website: "beta.com",
        canonicalDomain: "beta.com",
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const leads = listGatedLeads(db, p.id);
    for (const lead of leads) {
      recordFeedback(
        db,
        {
          projectId: p.id,
          leadId: lead.id,
          good: lead.company === "Alpha",
          notes: null,
          reviewedBy: null,
          source: "dashboard",
        },
        { rag: null }
      );
    }

    // Stale file that should disappear on rebuild
    rag.upsert({
      projectId: p.id,
      leadId: 999,
      company: "Stale",
      website: null,
      email: null,
      score: null,
      good: false,
      notes: null,
      text: "Stale ghost lead",
    });

    rebuildProjectRag(db, rag, p.id);
    const all = rag.similar(p.id, "Alpha Beta Stale", 10);
    expect(all.some((d) => d.leadId === 999)).toBe(false);
    expect(all.map((d) => d.company).sort()).toEqual(["Alpha", "Beta"]);
    db.close();
  });

  it("recordFeedback hooks RAG sync when rag is provided", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      {
        company: "Hook Co",
        website: "hook.com",
        canonicalDomain: "hook.com",
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const [lead] = listGatedLeads(db, p.id);
    recordFeedback(
      db,
      {
        projectId: p.id,
        leadId: lead!.id,
        good: false,
        notes: "Wrong niche",
        reviewedBy: "bob",
        source: "dashboard",
      },
      { rag }
    );
    const similar = rag.similar(p.id, "Hook Co Wrong niche", 1);
    expect(similar).toHaveLength(1);
    expect(similar[0]!.good).toBe(false);
    db.close();
  });

  it("recordFeedback skips sync when rag is null", () => {
    const db = openDatabase(":memory:");
    const p = createProject(db, { name: "P1" });
    insertLeads(db, p.id, [
      {
        company: "NoSync",
        website: "nosync.com",
        canonicalDomain: "nosync.com",
        email: null,
        votes: null,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const [lead] = listGatedLeads(db, p.id);
    recordFeedback(
      db,
      {
        projectId: p.id,
        leadId: lead!.id,
        good: true,
        notes: null,
        reviewedBy: null,
        source: "dashboard",
      },
      { rag: null }
    );
    const dir = join(baseDir, `project_${p.id}`);
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    db.close();
  });
});
