import type { Lead, Project } from "../domain/types.js";
import type { ScoreResult, Scorer, ScoreContext } from "./scorer.js";

export interface HermesScorerOptions {
  baseUrl?: string;
  apiKey?: string | null;
  fetchFn?: typeof fetch;
  model?: string;
}

const SYSTEM_PROMPT =
  'You score B2B leads. Reply ONLY with JSON: {"score":0-100,"reasons":"..."}';

function stripMarkdownFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

function formatSimilarSection(context?: ScoreContext): string | null {
  const similar = context?.similar ?? [];
  if (similar.length === 0) return null;
  const lines = similar.map((d) => {
    const label = d.good ? "approved" : "rejected";
    const notes = d.notes ? ` notes=${d.notes}` : "";
    const score = d.score !== null ? ` score=${d.score}` : "";
    return `- ${d.company} (${d.website ?? "n/a"}) ${label}${score}${notes}`;
  });
  return ["Similar past leads:", ...lines].join("\n");
}

export class HermesScorer implements Scorer {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchFn: typeof fetch;
  private readonly model: string;

  constructor(options: HermesScorerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.HERMES_API_BASE ?? "http://127.0.0.1:8642").replace(
      /\/$/,
      ""
    );
    this.apiKey = options.apiKey ?? process.env.HERMES_API_KEY ?? null;
    this.fetchFn = options.fetchFn ?? fetch;
    this.model = options.model ?? "hermes";
  }

  async scoreLead(
    lead: Lead,
    project: Project,
    context?: ScoreContext
  ): Promise<ScoreResult> {
    const parts = [
      `ICP: ${project.icp ?? "(none)"}`,
      `Company: ${lead.company}`,
      `Website: ${lead.website ?? "(none)"}`,
      `Email: ${lead.email ?? "(none)"}`,
      `Votes: ${lead.votes ?? "(none)"}`,
      `Sources: ${lead.sources.join(", ")}`,
    ];
    const similarSection = formatSimilarSection(context);
    if (similarSection) parts.push(similarSection);
    const userPrompt = parts.join("\n");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await this.fetchFn(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      throw new Error(`Hermes API error: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Hermes response missing content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripMarkdownFences(content));
    } catch {
      throw new Error("Hermes response is not valid JSON");
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("score" in parsed) ||
      !("reasons" in parsed)
    ) {
      throw new Error("Hermes JSON missing score/reasons");
    }

    const score = Number((parsed as { score: unknown }).score);
    const reasons = String((parsed as { reasons: unknown }).reasons);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error("Hermes score out of range (must be 0–100)");
    }

    return { score: Math.round(score), reasons };
  }
}
