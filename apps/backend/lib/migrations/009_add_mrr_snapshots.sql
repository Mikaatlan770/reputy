-- 009_add_mrr_snapshots.sql
-- P2: Daily MRR snapshots for revenue trend analysis.
-- snapshot_date is the PRIMARY KEY (one row per UTC day, idempotent upsert).
-- ============================================================

CREATE TABLE IF NOT EXISTS mrr_snapshots (
  snapshot_date TEXT PRIMARY KEY,          -- UTC YYYY-MM-DD
  mrr_total_cents INTEGER NOT NULL,
  orgs_paid INTEGER NOT NULL,
  orgs_free INTEGER NOT NULL,
  arpu_cents INTEGER NOT NULL DEFAULT 0,
  mrr_by_tier_json TEXT DEFAULT '{}',      -- JSON: { bronze: N, argent: N, ... }
  negotiated_orgs INTEGER NOT NULL DEFAULT 0,
  negotiated_percent REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
