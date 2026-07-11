import type { ApifyClient } from "./apify-client.js";
import {
  mapApifyItemToCandidate,
  type ApifyResultMapping,
} from "./map-candidate.js";
import { evaluateCandidateNoise } from "./noise-filter.js";
import type { DiscoveredCompanyCandidate } from "./types.js";

export interface ApifyActorSourceOptions {
  client: ApifyClient;
  sourceId: string;
  actorId?: string;
  taskId?: string;
  input?: Record<string, unknown>;
  mapping: ApifyResultMapping;
  discoveryQuery?: string | null;
  allowCompanyOnly?: boolean;
  timeoutMs?: number;
}

export interface ApifyActorSourceResult {
  apifyRunId: string;
  datasetId: string | null;
  costEstimate: number | null;
  candidates: DiscoveredCompanyCandidate[];
  rejected: DiscoveredCompanyCandidate[];
  fetched: number;
}

export class ApifyActorSource {
  readonly name: string;
  private readonly options: ApifyActorSourceOptions;

  constructor(options: ApifyActorSourceOptions) {
    if (!options.actorId?.trim() && !options.taskId?.trim()) {
      throw new Error("ApifyActorSource requires actorId or taskId");
    }
    this.name = options.sourceId;
    this.options = options;
  }

  async fetchCandidates(): Promise<ApifyActorSourceResult> {
    const run = await this.options.client.runActorAndGetItems({
      actorId: this.options.actorId,
      taskId: this.options.taskId,
      input: this.options.input,
      timeoutMs: this.options.timeoutMs,
    });

    const candidates: DiscoveredCompanyCandidate[] = [];
    const rejected: DiscoveredCompanyCandidate[] = [];

    for (const item of run.items) {
      const mapped = mapApifyItemToCandidate(item, {
        sourceId: this.options.sourceId,
        sourceType: "apify",
        mapping: this.options.mapping,
        discoveryQuery: this.options.discoveryQuery,
        allowCompanyOnly: this.options.allowCompanyOnly,
      });
      if (!mapped) {
        rejected.push({
          company: "(unmapped)",
          website: null,
          domain: null,
          source: this.options.sourceId,
          sourceType: "apify",
          sourceUrl: null,
          discoveryQuery: this.options.discoveryQuery ?? null,
          rawPayload: item,
          confidence: 0,
          rejectionReason: "mapping_failed",
        });
        continue;
      }

      const noise = evaluateCandidateNoise(mapped);
      if (noise.reject) {
        rejected.push({
          ...mapped,
          rejectionReason: noise.reason ?? "noise",
        });
        continue;
      }
      candidates.push(mapped);
    }

    return {
      apifyRunId: run.runId,
      datasetId: run.datasetId,
      costEstimate: run.usageTotalUsd ?? null,
      candidates,
      rejected,
      fetched: run.items.length,
    };
  }
}
