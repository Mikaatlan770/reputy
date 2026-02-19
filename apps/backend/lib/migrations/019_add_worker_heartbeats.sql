-- 019: Worker heartbeats for health monitoring
-- Each cron worker updates its heartbeat at the end of each run.
-- The /health endpoint checks these to detect stale/down workers.

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_name   TEXT PRIMARY KEY,
  last_run_at   TEXT,              -- ISO timestamp of last run (success or fail)
  last_ok_at    TEXT,              -- ISO timestamp of last successful run
  last_error    TEXT,              -- Last error message (NULL if last run was OK)
  items_processed INTEGER DEFAULT 0, -- Items processed in last run
  run_duration_ms INTEGER,         -- Duration of last run in ms
  updated_at    TEXT DEFAULT (datetime('now'))
);
