CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  icp TEXT,
  source_config TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  website TEXT,
  canonical_domain TEXT,
  email TEXT,
  votes INTEGER,
  sources TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'raw',
  score INTEGER,
  reasons TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  good INTEGER NOT NULL,
  notes TEXT,
  reviewed_by TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project_id);
CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(project_id, canonical_domain);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  fetched_count INTEGER NOT NULL DEFAULT 0,
  kept_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  cost_estimate REAL,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS discovery_source_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  actor_id TEXT,
  task_id TEXT,
  apify_run_id TEXT,
  dataset_id TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  kept_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  cost_estimate REAL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY (run_id) REFERENCES discovery_runs(id)
);

CREATE TABLE IF NOT EXISTS discovered_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  source_job_id INTEGER,
  company TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  discovery_query TEXT,
  raw_payload TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  kept INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES discovery_runs(id),
  FOREIGN KEY (source_job_id) REFERENCES discovery_source_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_project ON discovery_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_run ON discovery_source_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_discovered_candidates_run ON discovered_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_discovered_candidates_domain ON discovered_candidates(run_id, domain);
