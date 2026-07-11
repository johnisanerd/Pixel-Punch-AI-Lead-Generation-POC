import type { DiscoveredCompanyCandidate } from "./types.js";

const BLOCKED_HOST_SUFFIXES = [
  "linkedin.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "pinterest.com",
];

const DIRECTORY_HOST_SUFFIXES = [
  "producthunt.com",
  "crunchbase.com",
  "ycombinator.com",
  "angel.co",
  "wellfound.com",
  "g2.com",
  "capterra.com",
  "getapp.com",
  "alternativeto.net",
  "saasworthy.com",
  "f6s.com",
  "betalist.com",
  "yelp.com",
  "yellowpages.com",
  "tripadvisor.com",
];

const JOB_HOST_SUFFIXES = [
  "greenhouse.io",
  "lever.co",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "indeed.com",
  "glassdoor.com",
  "linkedin.com",
];

const LISTICLE_TITLE =
  /\b(top|best|list of|\d+\s+(best|top)|startups? to watch|companies? (and|&) startups?)\b/i;

const JOB_PATH = /\/(jobs?|careers?|job-openings?)\b/i;

function hostnameOf(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const withProto = /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`;
    return new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function matchesSuffix(host: string, suffixes: string[]): boolean {
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

export function isBlockedHost(hostOrUrl: string): boolean {
  const host = hostOrUrl.includes("/")
    ? hostnameOf(hostOrUrl)
    : hostOrUrl.replace(/^www\./, "").toLowerCase();
  if (!host) return false;
  return matchesSuffix(host, BLOCKED_HOST_SUFFIXES);
}

export interface NoiseDecision {
  reject: boolean;
  reason?: string;
}

export function evaluateCandidateNoise(
  candidate: DiscoveredCompanyCandidate,
  options?: { allowSocialHosts?: boolean; allowDirectories?: boolean }
): NoiseDecision {
  if (!candidate.company.trim()) {
    return { reject: true, reason: "empty_company" };
  }

  if (LISTICLE_TITLE.test(candidate.company)) {
    return { reject: true, reason: "listicle_title" };
  }

  const host = candidate.domain ?? hostnameOf(candidate.website);
  if (host) {
    if (!options?.allowSocialHosts && matchesSuffix(host, BLOCKED_HOST_SUFFIXES)) {
      return { reject: true, reason: "blocked_host" };
    }
    if (!options?.allowDirectories && matchesSuffix(host, DIRECTORY_HOST_SUFFIXES)) {
      return { reject: true, reason: "directory_host" };
    }
    if (matchesSuffix(host, JOB_HOST_SUFFIXES)) {
      return { reject: true, reason: "job_board_host" };
    }
  }

  const website = candidate.website ?? "";
  if (JOB_PATH.test(website)) {
    return { reject: true, reason: "job_page" };
  }

  return { reject: false };
}
