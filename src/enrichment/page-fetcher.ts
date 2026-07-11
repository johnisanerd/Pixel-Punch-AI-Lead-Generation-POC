import type { DB } from "../db/database.js";
import type { FetchLike } from "../sources/source.js";
import {
  getCachedPage,
  putCachedPage,
} from "./enrichment.repo.js";
import { PAGE_CACHE_TTL_MS } from "./types.js";

export interface FetchedPage {
  url: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  body: string | null;
  fromCache: boolean;
  error?: string;
}

export interface FetchPageOptions {
  fetch: FetchLike;
  db?: DB;
  timeoutMs?: number;
  useCache?: boolean;
  userAgent?: string;
}

function isHtml(contentType: string | null): boolean {
  if (!contentType) return true;
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

function cacheFresh(fetchedAt: string): boolean {
  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < PAGE_CACHE_TTL_MS;
}

export async function fetchHtmlPage(
  url: string,
  options: FetchPageOptions
): Promise<FetchedPage> {
  if (options.useCache !== false && options.db) {
    const cached = getCachedPage(options.db, url);
    if (cached && cacheFresh(cached.fetchedAt) && cached.body != null) {
      return {
        url,
        finalUrl: cached.finalUrl ?? url,
        httpStatus: cached.httpStatus ?? 200,
        contentType: cached.contentType,
        body: cached.body,
        fromCache: true,
      };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 10_000
  );

  try {
    const res = await options.fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": options.userAgent ?? "LeadRadar/0.1 (+company-enrichment)",
      },
    });
    clearTimeout(timer);

    const contentType = res.headers.get("content-type");
    const finalUrl = res.url || url;

    if (!res.ok) {
      const result: FetchedPage = {
        url,
        finalUrl,
        httpStatus: res.status,
        contentType,
        body: null,
        fromCache: false,
        error: `HTTP ${res.status}`,
      };
      if (options.db) {
        putCachedPage(options.db, {
          url,
          finalUrl,
          httpStatus: res.status,
          contentType,
          body: null,
        });
      }
      return result;
    }

    if (!isHtml(contentType)) {
      return {
        url,
        finalUrl,
        httpStatus: res.status,
        contentType,
        body: null,
        fromCache: false,
        error: "non_html",
      };
    }

    const body = await res.text();
    if (options.db) {
      putCachedPage(options.db, {
        url,
        finalUrl,
        httpStatus: res.status,
        contentType,
        body: body.slice(0, 500_000),
      });
    }

    return {
      url,
      finalUrl,
      httpStatus: res.status,
      contentType,
      body,
      fromCache: false,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      url,
      finalUrl: url,
      httpStatus: 0,
      contentType: null,
      body: null,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
