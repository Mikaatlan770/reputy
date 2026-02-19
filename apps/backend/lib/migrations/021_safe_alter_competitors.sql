-- ============================================================
-- Migration 021: Production-safe competitor schema (idempotent)
-- ============================================================
--
-- Purpose:
-- Ensure the competitor tables have the correct schema without
-- dropping any existing data. Uses only non-destructive operations:
-- - CREATE TABLE IF NOT EXISTS (for fresh DBs)
-- - ALTER TABLE ADD COLUMN (for DBs with older schema)
-- - CREATE INDEX IF NOT EXISTS
--
-- This migration is safe to run on:
-- 1. Fresh databases (tables don't exist yet)
-- 2. Databases with migration 015 applied (tables exist, correct schema)
-- 3. Databases with migration 016 applied (tables already correct)
--
-- The migration runner ignores "duplicate column name" errors,
-- so ALTER TABLE ADD COLUMN is safe even if the column already exists.
-- ============================================================

-- ── Ensure orgs has geolocation + specialty columns ──
ALTER TABLE orgs ADD COLUMN lat REAL DEFAULT NULL;
ALTER TABLE orgs ADD COLUMN lng REAL DEFAULT NULL;
ALTER TABLE orgs ADD COLUMN specialty TEXT DEFAULT NULL;

-- ── Ensure competitor_snapshots exists with correct schema ──
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

-- Add columns that might be missing from earlier schema versions
ALTER TABLE competitor_snapshots ADD COLUMN profile TEXT NOT NULL DEFAULT 'default';
ALTER TABLE competitor_snapshots ADD COLUMN distance_m INTEGER DEFAULT 0;
ALTER TABLE competitor_snapshots ADD COLUMN types_json TEXT DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_comp_snap_org ON competitor_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_comp_snap_org_profile_period ON competitor_snapshots(org_id, profile, run_period_key);
CREATE INDEX IF NOT EXISTS idx_comp_snap_place ON competitor_snapshots(org_id, place_id);

-- ── Ensure competitor_place_details_cache exists with correct schema ──
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

-- Add columns that might be missing from earlier schema versions
ALTER TABLE competitor_place_details_cache ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
ALTER TABLE competitor_place_details_cache ADD COLUMN photos_json TEXT DEFAULT '[]';
ALTER TABLE competitor_place_details_cache ADD COLUMN types_json TEXT DEFAULT '[]';

-- ── Ensure competitor_sync_log exists with correct schema ──
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

-- Add columns that might be missing from earlier schema versions
ALTER TABLE competitor_sync_log ADD COLUMN profile TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_comp_sync_org ON competitor_sync_log(org_id, profile, run_period_key);

-- Record this migration
INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('021_safe_alter_competitors', datetime('now'));
