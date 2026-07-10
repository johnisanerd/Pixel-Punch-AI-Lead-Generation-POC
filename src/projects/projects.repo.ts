import type { DB } from "../db/database.js";
import type { Project } from "../domain/types.js";

export interface NewProject {
  name: string;
  website?: string | null;
  description?: string | null;
  icp?: string | null;
  sourceConfig?: string | null;
}

interface ProjectRow {
  id: number;
  name: string;
  website: string | null;
  description: string | null;
  icp: string | null;
  source_config: string | null;
  status: string;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    description: row.description,
    icp: row.icp,
    sourceConfig: row.source_config,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createProject(db: DB, input: NewProject): Project {
  const result = db
    .prepare(
      `INSERT INTO projects (name, website, description, icp, source_config)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.website ?? null,
      input.description ?? null,
      input.icp ?? null,
      input.sourceConfig ?? null
    );
  return getProject(db, Number(result.lastInsertRowid))!;
}

export function getProject(db: DB, id: number): Project | undefined {
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}
