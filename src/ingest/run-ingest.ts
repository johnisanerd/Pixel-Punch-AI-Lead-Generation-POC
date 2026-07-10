import type { DB } from "../db/database.js";
import type { Source } from "../sources/source.js";
import type { CanonicalLead } from "../domain/types.js";
import type { MxResolver } from "../validation/email-check.js";
import { validateAggregate } from "../validation/validate.js";
import { insertLeads } from "../leads/leads.repo.js";

export interface IngestSummary {
  fetched: number;
  kept: number;
  rejected: number;
}

export async function runIngest(
  db: DB,
  projectId: number,
  sources: Source[],
  resolver?: MxResolver
): Promise<IngestSummary> {
  // 1. INGEST: fetch each source, map already done inside adapters
  const pools = await Promise.all(sources.map((s) => s.fetch()));
  const merged: CanonicalLead[] = pools.flat();

  // 2. VALIDATE ONCE on the aggregate
  const { kept, rejected } = await validateAggregate(merged, resolver);

  // 3. PERSIST gated leads
  insertLeads(db, projectId, kept);

  return { fetched: merged.length, kept: kept.length, rejected: rejected.length };
}
