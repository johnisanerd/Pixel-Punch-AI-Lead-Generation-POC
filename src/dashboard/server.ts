import { openDatabase } from "../db/database.js";
import { createApp, parseAllowlist, resolveScorer } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.LEADRADAR_DB ?? "leadradar.db";

const db = openDatabase(dbPath);
const app = createApp({
  db,
  scorer: resolveScorer(),
  allowlist: parseAllowlist(),
});

app.listen(port, () => {
  console.log(`LeadRadar dashboard on http://localhost:${port}`);
  if (process.env.LEADRADAR_AUTH_BYPASS === "1") {
    console.log("AUTH BYPASS enabled (dev@local)");
  }
  if (process.env.SCORE_MOCK === "1") {
    console.log("Using MockScorer (SCORE_MOCK=1)");
  }
});
