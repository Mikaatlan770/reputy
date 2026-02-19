-- ============================================================
-- Migration 016: Fix competitor schema
-- ============================================================
--
-- Fixes from code review:
-- 1. Add `profile` column to competitor_snapshots (part of UNIQUE key)
-- 2. Remove `address` from competitor_snapshots (belongs to Place Details only)
-- 3. Add `updated_at` to competitor_place_details_cache
-- 4. Add `profile` to competitor_sync_log
--
-- Strategy: DROP + recreate since there's no prod data yet (dev only).
-- In production, use ALTER TABLE ADD COLUMN instead.
-- ============================================================

-- Record the old 015 migration as applied (it partially ran: ALTER TABLE orgs was applied)
INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('015_add_competitors', datetime('now'));

-- ── Drop old tables (no data loss in dev, tables were empty) ──
DROP TABLE IF EXISTS competitor_snapshots;
DROP TABLE IF EXISTS competitor_place_details_cache;
DROP TABLE IF EXISTS competitor_sync_log;

-- ── Recreate with correct schema ──

-- Weekly competitor snapshots (Nearby Search results)
-- NOTE: `address` intentionally omitted — it belongs to Place Details (drawer), not the list view.
-- `profile` is part of the UNIQUE key to prevent data mixing when specialty changes.
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  profile TEXT NOT NULL DEFAULT 'default',
  run_period_key TEXT NOT NULL,
  place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  rating REAL,
  user_ratings_total INTEGER DEFAULT 0,
  distance_m INTEGER DEFAULT 0,
  types_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, profile, run_period_key, place_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_snap_org ON competitor_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_comp_snap_org_profile_period ON competitor_snapshots(org_id, profile, run_period_key);
CREATE INDEX IF NOT EXISTS idx_comp_snap_place ON competitor_snapshots(org_id, place_id);

-- Cached Place Details (for drawer/detail view)
-- `updated_at` tracks the last cache refresh time
CREATE TABLE IF NOT EXISTS competitor_place_details_cache (
  place_id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  rating REAL,
  user_ratings_total INTEGER DEFAULT 0,
  opening_hours_json TEXT DEFAULT '{}',
  reviews_json TEXT DEFAULT '[]',
  types_json TEXT DEFAULT '[]',
  photos_json TEXT DEFAULT '[]',
  fetched_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Track competitor sync runs (one per org/profile/week)
CREATE TABLE IF NOT EXISTS competitor_sync_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  profile TEXT NOT NULL DEFAULT 'default',
  run_period_key TEXT NOT NULL,
  status TEXT NOT NULL,
  places_found INTEGER DEFAULT 0,
  places_stored INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comp_sync_org ON competitor_sync_log(org_id, profile, run_period_key);

-- Record this migration
INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('016_fix_competitor_schema', datetime('now'));
