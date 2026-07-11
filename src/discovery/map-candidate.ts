import { canonicalDomain } from "../validation/canonicalize.js";
import type {
  DiscoveredCompanyCandidate,
  DiscoverySourceType,
} from "./types.js";

export interface ApifyResultMapping {
  companyField: string;
  websiteField: string;
  sourceUrlField?: string;
  locationField?: string;
  categoryField?: string;
}

export interface MapApifyItemOptions {
  sourceId: string;
  sourceType: DiscoverySourceType;
  mapping: ApifyResultMapping;
  discoveryQuery?: string | null;
  allowCompanyOnly?: boolean;
}

export function getNestedField(obj: unknown, path: string): unknown {
  if (!path.trim() || obj == null || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function mapApifyItemToCandidate(
  item: unknown,
  options: MapApifyItemOptions
): DiscoveredCompanyCandidate | null {
  if (!item || typeof item !== "object") return null;

  const company = asNonEmptyString(
    getNestedField(item, options.mapping.companyField)
  );
  const website = normalizeWebsite(
    asNonEmptyString(getNestedField(item, options.mapping.websiteField))
  );
  const sourceUrl = options.mapping.sourceUrlField
    ? asNonEmptyString(getNestedField(item, options.mapping.sourceUrlField))
    : null;

  if (!company) return null;
  if (!website && !options.allowCompanyOnly) return null;

  const domain = canonicalDomain(website);

  return {
    company,
    website,
    domain,
    source: options.sourceId,
    sourceType: options.sourceType,
    sourceUrl,
    discoveryQuery: options.discoveryQuery ?? null,
    rawPayload: item,
    confidence: website && domain ? 0.8 : 0.4,
  };
}
