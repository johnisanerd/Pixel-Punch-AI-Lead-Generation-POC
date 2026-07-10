import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

const here = dirname(fileURLToPath(import.meta.url));

export type DB = InstanceType<typeof DatabaseSync>;

export function openDatabase(path = "leadradar.db"): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  const schema = readFileSync(join(here, "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}
