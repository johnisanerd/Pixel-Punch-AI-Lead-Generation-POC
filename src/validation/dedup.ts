import type { CanonicalLead } from "../domain/types.js";
import { canonicalDomain } from "./canonicalize.js";

/** A deduped lead carries its computed domain and the set of contributing sources. */
export interface DedupedLead extends CanonicalLead {
  canonicalDomain: string | null;
  sources: string[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function keyFor(lead: CanonicalLead): string {
  const domain = canonicalDomain(lead.website);
  return domain ? `d:${domain}` : `n:${normalizeName(lead.company)}`;
}

function preferNonNull<T>(a: T | null, b: T | null): T | null {
  return a !== null && a !== undefined ? a : b;
}

export function dedup(leads: CanonicalLead[]): DedupedLead[] {
  const map = new Map<string, DedupedLead>();
  for (const lead of leads) {
    const key = keyFor(lead);
    const domain = canonicalDomain(lead.website);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...lead,
        canonicalDomain: domain,
        sources: [lead.source],
      });
    } else {
      existing.email = preferNonNull(existing.email, lead.email);
      existing.website = preferNonNull(existing.website, lead.website);
      existing.canonicalDomain = preferNonNull(existing.canonicalDomain, domain);
      existing.votes = preferNonNull(existing.votes, lead.votes);
      if (!existing.sources.includes(lead.source)) {
        existing.sources.push(lead.source);
      }
    }
  }
  return [...map.values()];
}
