import type { FeedbackDoc } from "./types.js";

export interface FeedbackRag {
  upsert(doc: FeedbackDoc): Promise<void>;
  similar(projectId: number, queryText: string, k: number): Promise<FeedbackDoc[]>;
  /** Clear and rebuild corpus for a project from an external source (caller supplies docs). */
  clearProject(projectId: number): Promise<void>;
}
