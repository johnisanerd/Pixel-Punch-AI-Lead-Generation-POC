import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import type { DB } from "../db/database.js";
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
} from "../projects/projects.repo.js";
import {
  getLead,
  listLeadsFiltered,
  type LeadFilter,
} from "../leads/leads.repo.js";
import { recordFeedback, getFeedbackStats } from "../feedback/feedback.repo.js";
import { exportLeadsCsv, type ExportPreset } from "../export/csv-export.js";
import { parseCsvSource, type ColumnMapping } from "../sources/csv-source.js";
import { runIngest } from "../ingest/run-ingest.js";
import { runScoring } from "../scoring/run-scoring.js";
import type { Scorer } from "../scoring/scorer.js";
import type { Source, FetchLike } from "../sources/source.js";
import {
  createConfiguredSources,
  parseSourceConfig,
  type CreateConfiguredSourcesOptions,
} from "../sources/registry.js";
import type { MxResolver } from "../validation/email-check.js";
import type { AuthUser } from "./auth.js";
import type { ApifyClient } from "../discovery/apify-client.js";
import { parseLeadFindingConfigFromProjectJson } from "../discovery/lead-finding-config.js";
import { runLeadFinding } from "../discovery/run-lead-finding.js";
import { runCompanyEnrichment } from "../enrichment/run-company-enrichment.js";

export interface ApiOptions {
  db: DB;
  scorer: Scorer;
  /** Optional MX resolver (tests inject a stub to avoid live DNS). */
  mxResolver?: MxResolver;
  /** Injectable fetch for live-source ingest (tests). */
  ingestFetch?: FetchLike;
  /** Injectable fetch for company enrichment crawler (tests). */
  enrichFetch?: FetchLike;
  /** Env override for source credentials (tests). */
  ingestEnv?: NodeJS.ProcessEnv;
  /** Override source builder (tests). */
  createConfiguredSourcesFn?: typeof createConfiguredSources;
  /** Injectable Apify client for lead finding (tests). */
  apifyClient?: ApifyClient;
}

const upload = multer({ storage: multer.memoryStorage() });

function parseFilter(query: Request["query"]): LeadFilter {
  const filter: LeadFilter = {};
  if (typeof query.status === "string" && query.status) {
    filter.status = query.status;
  }
  if (typeof query.minScore === "string" && query.minScore !== "") {
    const n = Number(query.minScore);
    if (Number.isFinite(n)) filter.minScore = n;
  }
  if (typeof query.source === "string" && query.source) {
    filter.source = query.source;
  }
  if (typeof query.q === "string" && query.q) {
    filter.q = query.q;
  }
  return filter;
}

function projectIdParam(req: Request): number {
  return Number(req.params.id);
}

function leadIdParam(req: Request): number {
  return Number(req.params.leadId);
}

function currentUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

/** Accept object or JSON string; return DB string or null. */
export function serializeSourceConfig(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    parseSourceConfig(trimmed);
    return trimmed;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const json = JSON.stringify(value);
    parseSourceConfig(json);
    return json;
  }
  throw new Error("sourceConfig must be an object or JSON string");
}

export function createApiRouter(options: ApiOptions): Router {
  const {
    db,
    scorer,
    mxResolver,
    ingestFetch,
    enrichFetch,
    ingestEnv,
    createConfiguredSourcesFn = createConfiguredSources,
    apifyClient,
  } = options;
  const router = Router();

  router.get("/me", (req, res) => {
    const user = currentUser(req);
    res.json({ email: user.email, name: user.name });
  });

  router.get("/projects", (_req, res) => {
    res.json(listProjects(db));
  });

  router.post("/projects", (req, res) => {
    try {
      const { name, website, description, icp, sourceConfig } = req.body ?? {};
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const project = createProject(db, {
        name,
        website: website ?? null,
        description: description ?? null,
        icp: icp ?? null,
        sourceConfig: serializeSourceConfig(sourceConfig),
      });
      res.status(201).json(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid request";
      res.status(400).json({ error: message });
    }
  });

  router.patch("/projects/:id", (req, res) => {
    try {
      const id = projectIdParam(req);
      if (!getProject(db, id)) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      const body = req.body ?? {};
      const input: Parameters<typeof updateProject>[2] = {};
      if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) {
          res.status(400).json({ error: "name must be a non-empty string" });
          return;
        }
        input.name = body.name.trim();
      }
      if (body.website !== undefined) input.website = body.website ?? null;
      if (body.description !== undefined)
        input.description = body.description ?? null;
      if (body.icp !== undefined) input.icp = body.icp ?? null;
      if (body.sourceConfig !== undefined) {
        input.sourceConfig = serializeSourceConfig(body.sourceConfig);
      }
      const project = updateProject(db, id, input);
      res.json(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid request";
      res.status(400).json({ error: message });
    }
  });

  router.get("/projects/:id", (req, res) => {
    const project = getProject(db, projectIdParam(req));
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    res.json(project);
  });

  router.get("/projects/:id/stats", (req, res) => {
    const id = projectIdParam(req);
    const project = getProject(db, id);
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const all = listLeadsFiltered(db, id);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekIso = weekAgo.toISOString().slice(0, 19).replace("T", " ");
    const newThisWeek = all.filter((l) => l.createdAt >= weekIso).length;
    const feedback = getFeedbackStats(db, id);
    res.json({
      totalLeads: all.length,
      newThisWeek,
      approvalRate: feedback.approvalRate,
      replyRate: null,
    });
  });

  router.get("/projects/:id/leads", (req, res) => {
    const id = projectIdParam(req);
    if (!getProject(db, id)) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    res.json(listLeadsFiltered(db, id, parseFilter(req.query)));
  });

  router.get("/projects/:id/leads/:leadId", (req, res) => {
    const lead = getLead(db, projectIdParam(req), leadIdParam(req));
    if (!lead) {
      res.status(404).json({ error: "lead not found" });
      return;
    }
    res.json(lead);
  });

  router.post("/projects/:id/leads/:leadId/approve", (req, res) => {
    const projectId = projectIdParam(req);
    const leadId = leadIdParam(req);
    if (!getLead(db, projectId, leadId)) {
      res.status(404).json({ error: "lead not found" });
      return;
    }
    const notes =
      typeof req.body?.notes === "string" ? req.body.notes : null;
    recordFeedback(db, {
      projectId,
      leadId,
      good: true,
      notes,
      reviewedBy: currentUser(req).email,
      source: "dashboard",
    });
    res.json(getLead(db, projectId, leadId));
  });

  router.post("/projects/:id/leads/:leadId/reject", (req, res) => {
    const projectId = projectIdParam(req);
    const leadId = leadIdParam(req);
    if (!getLead(db, projectId, leadId)) {
      res.status(404).json({ error: "lead not found" });
      return;
    }
    const notes =
      typeof req.body?.notes === "string" ? req.body.notes : null;
    recordFeedback(db, {
      projectId,
      leadId,
      good: false,
      notes,
      reviewedBy: currentUser(req).email,
      source: "dashboard",
    });
    res.json(getLead(db, projectId, leadId));
  });

  router.post("/projects/:id/score", async (req, res, next) => {
    try {
      const id = projectIdParam(req);
      if (!getProject(db, id)) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      const summary = await runScoring(db, id, scorer);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/ingest", async (req, res, next) => {
    try {
      const id = projectIdParam(req);
      const project = getProject(db, id);
      if (!project) {
        res.status(404).json({ error: "project not found" });
        return;
      }

      const leadFinding = parseLeadFindingConfigFromProjectJson(
        project.sourceConfig
      );
      const useLeadFinding =
        leadFinding.sources.length > 0 || Boolean(leadFinding.pack);

      if (useLeadFinding) {
        try {
          const summary = await runLeadFinding(db, id, {
            apifyClient,
            env: ingestEnv,
            concurrency: leadFinding.concurrency,
          });
          res.status(201).json(summary);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "lead finding failed";
          res.status(400).json({ error: message });
        }
        return;
      }

      const configureOpts: CreateConfiguredSourcesOptions = {};
      if (ingestFetch) configureOpts.fetch = ingestFetch;
      if (ingestEnv) configureOpts.env = ingestEnv;

      let configured;
      try {
        configured = createConfiguredSourcesFn(project, configureOpts);
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid sources";
        res.status(400).json({ error: message });
        return;
      }
      if (configured.sources.length === 0) {
        res.status(400).json({
          error:
            "No sources configured. Add leadFinding.sources (Apify) or enable Product Hunt / Jina in Project settings.",
        });
        return;
      }

      const summary = await runIngest(db, id, configured.sources, {
        resolver: mxResolver,
        enrichWebsites: configured.enrich,
        fetch: ingestFetch,
      });
      res.status(201).json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.post("/projects/:id/enrich-companies", async (req, res, next) => {
    try {
      const id = projectIdParam(req);
      if (!getProject(db, id)) {
        res.status(404).json({ error: "project not found" });
        return;
      }
      const force = req.body?.force === true;
      try {
        const summary = await runCompanyEnrichment(db, id, {
          fetch: enrichFetch,
          force,
        });
        res.status(201).json(summary);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "company enrichment failed";
        res.status(400).json({ error: message });
      }
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:id/export.csv", (req, res) => {
    const id = projectIdParam(req);
    if (!getProject(db, id)) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    const presetRaw =
      typeof req.query.preset === "string" ? req.query.preset : "all";
    const normalized =
      presetRaw === "emails" ? "emails_only" : presetRaw;
    const preset: ExportPreset =
      normalized === "emails_only" || normalized === "current"
        ? normalized
        : "all";
    const leads = listLeadsFiltered(db, id, parseFilter(req.query));
    const csv = exportLeadsCsv(leads, preset);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads-${id}-${preset}.csv"`
    );
    res.send(csv);
  });

  router.post(
    "/projects/:id/import.csv",
    upload.single("file"),
    async (req, res, next) => {
      try {
        const id = projectIdParam(req);
        if (!getProject(db, id)) {
          res.status(404).json({ error: "project not found" });
          return;
        }

        let csvText: string | undefined;
        if (req.file) {
          csvText = req.file.buffer.toString("utf-8");
        } else if (typeof req.body?.csv === "string") {
          csvText = req.body.csv;
        } else if (typeof req.body === "string") {
          csvText = req.body;
        }

        if (!csvText) {
          res.status(400).json({ error: "csv body or file required" });
          return;
        }

        let mapping: ColumnMapping = {
          company: "Company",
          website: "Website",
          email: "Email",
          votes: "Votes",
        };
        if (typeof req.body?.mapping === "string") {
          mapping = { ...mapping, ...JSON.parse(req.body.mapping) };
        } else if (req.body?.mapping && typeof req.body.mapping === "object") {
          mapping = { ...mapping, ...req.body.mapping };
        }

        const csvSource: Source = {
          name: "csv",
          fetch: async () => parseCsvSource(csvText!, mapping),
        };
        const summary = await runIngest(db, id, [csvSource], {
          resolver: mxResolver,
        });
        res.status(201).json(summary);
      } catch (err) {
        next(err);
      }
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "internal error";
    res.status(500).json({ error: message });
  });

  return router;
}
