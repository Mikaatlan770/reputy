-- ============================================================
-- Migration 015: Add competitors tracking (Google Places API)
-- ============================================================
--
-- Purpose:
-- Track competitor establishments around each org for benchmarking.
-- Weekly snapshots enable "Avis 30j" estimation (delta between S and S-4).
-- Uses Google Places API (New) with API Key authentication.
--
-- Architecture:
-- - orgs: lat/lng/specialty for geolocation-based search
-- - competitor_snapshots: weekly snapshots of nearby places (no address — kept for Place Details only)
-- - competitor_place_details_cache: cached Place Details (TTL 30 days)
-- - competitor_sync_log: one log entry per org/profile/week for diagnostics
--
-- ============================================================

-- Add geolocation + specialty columns to orgs
ALTER TABLE orgs ADD COLUMN lat REAL DEFAULT NULL;
ALTER TABLE orgs ADD COLUMN lng REAL DEFAULT NULL;
ALTER TABLE orgs ADD COLUMN specialty TEXT DEFAULT NULL;

-- Weekly competitor snapshots (Nearby Search results)
-- NOTE: address is intentionally omitted — it belongs to Place Details (drawer), not the list view.
--       This keeps the table lightweight and avoids requesting formattedAddress in the FieldMask list.
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  profile TEXT NOT NULL DEFAULT 'default',  -- search profile key, e.g. "health_dentiste", "commerce"
  run_period_key TEXT NOT NULL,             -- ISO week: "2026-W07"
  place_id TEXT NOT NULL,                   -- Google Place ID
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  rating REAL,
  user_ratings_total INTEGER DEFAULT 0,
  distance_m INTEGER DEFAULT 0,            -- distance in meters from org
  types_json TEXT DEFAULT '[]',            -- Google Place types array
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, profile, run_period_key, place_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_snap_org ON competitor_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_comp_snap_org_profile_period ON competitor_snapshots(org_id, profile, run_period_key);
CREATE INDEX IF NOT EXISTS idx_comp_snap_place ON competitor_snapshots(org_id, place_id);

-- Cached Place Details (for drawer/detail view)
CREATE TABLE IF NOT EXISTS competitor_place_details_cache (
  place_id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  rating REAL,
  user_ratings_total INTEGER DEFAULT 0,
  opening_hours_json TEXT DEFAULT '{}',
  reviews_json TEXT DEFAULT '[]',           -- last 5 Google reviews
  types_json TEXT DEFAULT '[]',
  photos_json TEXT DEFAULT '[]',            -- photo references
  fetched_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))  -- last cache refresh timestamp
);

-- Track competitor sync runs (one per org/profile/week)
CREATE TABLE IF NOT EXISTS competitor_sync_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  profile TEXT NOT NULL DEFAULT 'default',  -- search profile used
  run_period_key TEXT NOT NULL,
  status TEXT NOT NULL,                     -- 'success' | 'error' | 'skipped'
  places_found INTEGER DEFAULT 0,
  places_stored INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comp_sync_org ON competitor_sync_log(org_id, profile, run_period_key);

-- Record this migration
INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('015_add_competitors', datetime('now'));
