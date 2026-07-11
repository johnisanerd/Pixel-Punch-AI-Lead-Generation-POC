import { describe, it, expect } from "vitest";
import {
  normalizeHomepageUrl,
  isSameDomain,
  filterSameDomainLinks,
} from "../../src/enrichment/url-utils.js";
import {
  classifyPageType,
  rankPageLinks,
} from "../../src/enrichment/link-ranker.js";
import {
  extractPageContent,
  extractEmails,
  extractSocialLinks,
} from "../../src/enrichment/html-extract.js";
import { scoreEnrichmentConfidence } from "../../src/enrichment/confidence.js";

describe("url-utils", () => {
  it("normalizes homepage URLs", () => {
    expect(normalizeHomepageUrl("acme.example/about")).toBe(
      "https://acme.example/"
    );
    expect(normalizeHomepageUrl("https://www.acme.example/path")).toBe(
      "https://www.acme.example/"
    );
    expect(normalizeHomepageUrl("")).toBeNull();
  });

  it("filters to same-domain links only", () => {
    const base = "https://acme.example/";
    const links = filterSameDomainLinks(base, [
      "https://acme.example/about",
      "https://other.example/about",
      "/contact",
      "https://blog.acme.example/post",
    ]);
    expect(links).toEqual([
      "https://acme.example/about",
      "https://acme.example/contact",
    ]);
    expect(isSameDomain("https://acme.example", "https://www.acme.example")).toBe(
      true
    );
  });
});

describe("link-ranker", () => {
  it("classifies and ranks useful page paths", () => {
    expect(classifyPageType("https://acme.example/about-us")).toBe("about");
    expect(classifyPageType("https://acme.example/pricing")).toBe("pricing");
    expect(classifyPageType("https://acme.example/random")).toBe("other");

    const ranked = rankPageLinks([
      "https://acme.example/blog",
      "https://acme.example/about",
      "https://acme.example/contact",
      "https://acme.example/foo",
    ]);
    expect(ranked[0]).toContain("/about");
    expect(ranked[1]).toContain("/contact");
    expect(ranked).not.toContain("https://acme.example/foo");
  });
});

describe("html-extract", () => {
  const html = `
    <html><head>
      <title>Acme Widgets</title>
      <meta name="description" content="We sell widgets" />
      <meta property="og:title" content="Acme OG" />
      <meta property="og:description" content="OG desc" />
      <script type="application/ld+json">
        {"@type":"Organization","name":"Acme","address":{"addressLocality":"Austin","addressRegion":"TX"}}
      </script>
    </head><body>
      <a href="mailto:hello@acme.example">Email</a>
      Contact sales@acme.example today.
      <a href="https://linkedin.com/company/acme">LinkedIn</a>
      <a href="https://github.com/acme">GitHub</a>
      <p>Welcome to Acme. We build B2B SaaS tools for operators.</p>
    </body></html>
  `;

  it("extracts title, meta, JSON-LD, emails, socials", () => {
    const content = extractPageContent(html);
    expect(content.title).toBe("Acme Widgets");
    expect(content.metaDescription).toBe("We sell widgets");
    expect(content.ogTitle).toBe("Acme OG");
    expect(content.organizationName).toBe("Acme");
    expect(content.locationHints).toEqual(
      expect.arrayContaining(["Austin, TX"])
    );
    expect(extractEmails(html)).toEqual(
      expect.arrayContaining(["hello@acme.example", "sales@acme.example"])
    );
    expect(extractSocialLinks(html)).toMatchObject({
      linkedin: "https://linkedin.com/company/acme",
      github: "https://github.com/acme",
    });
    expect(content.textSnippet.toLowerCase()).toContain("welcome to acme");
  });
});

describe("confidence", () => {
  it("scores higher with richer evidence", () => {
    const low = scoreEnrichmentConfidence({
      hasHomepage: true,
      hasDescription: false,
      pageTypes: ["homepage"],
      emailCount: 0,
      socialCount: 0,
      hasLocation: false,
    });
    const high = scoreEnrichmentConfidence({
      hasHomepage: true,
      hasDescription: true,
      pageTypes: ["homepage", "about", "contact", "pricing"],
      emailCount: 2,
      socialCount: 2,
      hasLocation: true,
    });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeGreaterThan(0);
  });
});
