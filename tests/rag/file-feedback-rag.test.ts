import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileFeedbackRag } from "../../src/rag/file-feedback-rag.js";
import type { FeedbackDoc } from "../../src/rag/types.js";

function makeDoc(overrides: Partial<FeedbackDoc> = {}): FeedbackDoc {
  return {
    projectId: 1,
    leadId: 1,
    company: "Acme SaaS",
    website: "acme.com",
    email: "a@acme.com",
    score: 80,
    good: true,
    notes: "Great B2B fit",
    text: "Acme SaaS acme.com Great B2B fit",
    ...overrides,
  };
}

describe("FileFeedbackRag", () => {
  let baseDir: string;
  let rag: FileFeedbackRag;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "leadradar-rag-"));
    rag = new FileFeedbackRag(baseDir);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("upserts docs and retrieves similar within the same project", () => {
    rag.upsert(
      makeDoc({
        leadId: 1,
        company: "Acme SaaS Tools",
        website: "acme-saas.com",
        text: "Acme SaaS Tools acme-saas.com B2B software platform",
      })
    );
    rag.upsert(
      makeDoc({
        leadId: 2,
        company: "Pizza Delivery Co",
        website: "pizzadelivery.com",
        good: false,
        text: "Pizza Delivery Co pizzadelivery.com food restaurant",
      })
    );

    const similar = rag.similar(1, "Acme SaaS B2B software tools", 2);
    expect(similar.length).toBeGreaterThanOrEqual(1);
    expect(similar[0]!.company).toMatch(/Acme/i);
    expect(similar[0]!.leadId).toBe(1);
  });

  it("isolates projects — project 2 docs do not bleed into project 1", () => {
    rag.upsert(
      makeDoc({
        projectId: 1,
        leadId: 10,
        company: "Alpha Corp",
        text: "Alpha Corp unique-alpha-token enterprise",
      })
    );
    rag.upsert(
      makeDoc({
        projectId: 2,
        leadId: 20,
        company: "Beta Corp",
        text: "Beta Corp unique-beta-token enterprise",
      })
    );

    const fromP1 = rag.similar(1, "unique-beta-token enterprise", 5);
    expect(fromP1.every((d) => d.projectId === 1)).toBe(true);
    expect(fromP1.some((d) => d.leadId === 20)).toBe(false);

    const fromP2 = rag.similar(2, "unique-alpha-token enterprise", 5);
    expect(fromP2.every((d) => d.projectId === 2)).toBe(true);
    expect(fromP2.some((d) => d.leadId === 10)).toBe(false);
  });

  it("overwrites an existing lead doc on upsert", () => {
    rag.upsert(makeDoc({ leadId: 5, company: "Old Name", text: "Old Name first" }));
    rag.upsert(makeDoc({ leadId: 5, company: "New Name", text: "New Name second" }));
    const similar = rag.similar(1, "New Name second", 1);
    expect(similar).toHaveLength(1);
    expect(similar[0]!.company).toBe("New Name");
  });
});
