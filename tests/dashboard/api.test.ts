import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, type DB } from "../../src/db/database.js";
import { createApp } from "../../src/dashboard/app.js";
import { MockScorer } from "../../src/scoring/mock-scorer.js";
import { insertLeads, listLeads } from "../../src/leads/leads.repo.js";
import { createProject } from "../../src/projects/projects.repo.js";
import { isAllowlisted } from "../../src/users/users.repo.js";
import { resetDefaultFeedbackRag } from "../../src/feedback/feedback.repo.js";

describe("dashboard API", () => {
  let db: DB;
  let prevBypass: string | undefined;
  let prevRagSync: string | undefined;
  let prevRagDir: string | undefined;
  let ragDir: string;

  beforeEach(() => {
    prevBypass = process.env.LEADRADAR_AUTH_BYPASS;
    prevRagSync = process.env.RAG_SYNC;
    prevRagDir = process.env.RAG_DIR;
    process.env.LEADRADAR_AUTH_BYPASS = "1";
    ragDir = mkdtempSync(join(tmpdir(), "leadradar-dash-rag-"));
    process.env.RAG_DIR = ragDir;
    process.env.RAG_SYNC = "1";
    resetDefaultFeedbackRag();
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
    if (prevBypass === undefined) delete process.env.LEADRADAR_AUTH_BYPASS;
    else process.env.LEADRADAR_AUTH_BYPASS = prevBypass;
    if (prevRagSync === undefined) delete process.env.RAG_SYNC;
    else process.env.RAG_SYNC = prevRagSync;
    if (prevRagDir === undefined) delete process.env.RAG_DIR;
    else process.env.RAG_DIR = prevRagDir;
    resetDefaultFeedbackRag();
    rmSync(ragDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({
      db,
      scorer: new MockScorer(),
      allowlist: ["dev@local"],
    });
  }

  it("health is public", async () => {
    const res = await request(app()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.bypass).toBe(true);
  });

  it("returns me under bypass", async () => {
    const res = await request(app()).get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("dev@local");
  });

  it("rejects unauthenticated API when bypass off", async () => {
    delete process.env.LEADRADAR_AUTH_BYPASS;
    const res = await request(
      createApp({ db, scorer: new MockScorer(), allowlist: [] })
    ).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("create project → import → list → score → approve → export", async () => {
    const agent = request(app());

    const created = await agent
      .post("/api/projects")
      .send({ name: "Pixel Punch", icp: "software" });
    expect(created.status).toBe(201);
    const projectId = created.body.id as number;

    const csv = [
      "Company,Website,Email,Votes",
      "Acme Soft,https://acme.com,hello@acme.com,20",
      "Beta Co,https://beta.com,team@beta.com,4",
    ].join("\n");

    const imported = await agent
      .post(`/api/projects/${projectId}/import.csv`)
      .send({ csv });
    expect(imported.status).toBe(201);
    expect(imported.body.kept).toBeGreaterThanOrEqual(1);

    const listed = await agent.get(`/api/projects/${projectId}/leads`);
    expect(listed.status).toBe(200);
    expect(listed.body.length).toBeGreaterThanOrEqual(1);

    const scored = await agent.post(`/api/projects/${projectId}/score`);
    expect(scored.status).toBe(200);
    expect(scored.body.scored).toBeGreaterThanOrEqual(1);

    const afterScore = await agent.get(
      `/api/projects/${projectId}/leads?status=scored`
    );
    expect(afterScore.body.length).toBeGreaterThanOrEqual(1);
    const leadId = afterScore.body[0].id as number;

    const approved = await agent
      .post(`/api/projects/${projectId}/leads/${leadId}/approve`)
      .send({ notes: "good fit" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    expect(existsSync(join(ragDir, `project_${projectId}`, `lead_${leadId}.md`))).toBe(
      true
    );

    const stats = await agent.get(`/api/projects/${projectId}/stats`);
    expect(stats.status).toBe(200);
    expect(stats.body.totalLeads).toBeGreaterThanOrEqual(1);
    expect(stats.body.approvalRate).toBeGreaterThan(0);
    expect(stats.body.replyRate).toBeNull();

    const exported = await agent.get(
      `/api/projects/${projectId}/export.csv?preset=emails_only`
    );
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toMatch(/text\/csv/);
    expect(exported.text).toContain("company,email,score");
    expect(exported.text).toMatch(/@/);
  });

  it("keeps approve/export isolated across projects", async () => {
    const p1 = createProject(db, { name: "P1" });
    const p2 = createProject(db, { name: "P2" });
    insertLeads(db, p1.id, [
      {
        company: "Only P1",
        website: "p1.com",
        canonicalDomain: "p1.com",
        email: "a@p1.com",
        votes: 1,
        source: "csv",
        sources: ["csv"],
      },
    ]);
    const [lead] = listLeads(db, p1.id);

    const agent = request(app());
    const bad = await agent
      .post(`/api/projects/${p2.id}/leads/${lead.id}/approve`)
      .send({});
    expect(bad.status).toBe(404);

    const exportP2 = await agent.get(
      `/api/projects/${p2.id}/export.csv?preset=all`
    );
    expect(exportP2.status).toBe(200);
    expect(exportP2.text).not.toContain("Only P1");
  });

  it("isAllowlisted rejects non-listed email", () => {
    expect(isAllowlisted("outsider@evil.com", ["dev@local", "team@x.com"])).toBe(
      false
    );
  });
});
