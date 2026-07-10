import type { DB } from "../db/database.js";
import type { Source, FetchLike } from "../sources/source.js";
import type { CanonicalLead } from "../domain/types.js";
import type { MxResolver } from "../validation/email-check.js";
import { validateAggregate } from "../validation/validate.js";
import { insertLeads } from "../leads/leads.repo.js";
import { enrichLeadsFromWebsites } from "../sources/website-enricher.js";

export interface IngestSummary {
  fetched: number;
  kept: number;
  rejected: number;
}

export interface RunIngestOptions {
  resolver?: MxResolver;
  /** When true, fetch lead websites and fill mailto emails before validate. */
  enrichWebsites?: boolean;
  /** Injectable fetch used by the website enricher. */
  fetch?: FetchLike;
}

function resolveOptions(
  resolverOrOptions?: MxResolver | RunIngestOptions
): RunIngestOptions {
  if (!resolverOrOptions) return {};
  if (typeof resolverOrOptions === "function") {
    return { resolver: resolverOrOptions };
  }
  return resolverOrOptions;
}

export async function runIngest(
  db: DB,
  projectId: number,
  sources: Source[],
  resolverOrOptions?: MxResolver | RunIngestOptions
): Promise<IngestSummary> {
  const options = resolveOptions(resolverOrOptions);

  // 1. INGEST: fetch each source, map already done inside adapters
  const pools = await Promise.all(sources.map((s) => s.fetch()));
  let merged: CanonicalLead[] = pools.flat();

  // 1b. Optional website enrichment (emails from mailto:)
  if (options.enrichWebsites) {
    merged = await enrichLeadsFromWebsites(merged, { fetch: options.fetch });
  }

  // 2. VALIDATE ONCE on the aggregate
  const { kept, rejected } = await validateAggregate(merged, options.resolver);

  // 3. PERSIST gated leads
  insertLeads(db, projectId, kept);

  return { fetched: merged.length, kept: kept.length, rejected: rejected.length };
}
