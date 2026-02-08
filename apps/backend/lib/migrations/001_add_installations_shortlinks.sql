-- ============================================================
-- Migration 001: Add installations and shortlinks tables
-- Version: 1.1.0
-- Date: 2026-02-02
-- 
-- This migration is IDEMPOTENT - can be run multiple times safely
-- Uses CREATE TABLE IF NOT EXISTS
-- ============================================================

-- ============================================================
-- TABLE: installations (API tokens per device/installation)
-- ============================================================
CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT,                                 -- User-friendly name (ex: "Poste accueil", "Dr. Martin iPhone")
  token_hash TEXT NOT NULL,                   -- SHA256 hash of the token
  created_at TEXT NOT NULL,
  last_seen_at TEXT,                          -- Updated on each API call
  revoked_at TEXT,                            -- NULL = active, set = revoked
  metadata_json TEXT DEFAULT '{}'             -- Optional metadata (device info, etc.)
);

-- Index for fast lookup by org
CREATE INDEX IF NOT EXISTS idx_installations_org ON installations(org_id);

-- Index for active installations lookup
CREATE INDEX IF NOT EXISTS idx_installations_active ON installations(org_id, revoked_at);

-- ============================================================
-- TABLE: shortlinks (QR codes and NFC tags)
-- ============================================================
CREATE TABLE IF NOT EXISTS shortlinks (
  code TEXT PRIMARY KEY,                      -- Short code (6-10 chars base62)
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                         -- 'qr' | 'nfc'
  target_url TEXT NOT NULL,                   -- Where to redirect
  label TEXT,                                 -- User-friendly name
  clicks INTEGER DEFAULT 0,                   -- Click counter
  created_at TEXT NOT NULL,
  last_clicked_at TEXT
);

-- Index for fast lookup by org
CREATE INDEX IF NOT EXISTS idx_shortlinks_org ON shortlinks(org_id);

-- Index for click stats
CREATE INDEX IF NOT EXISTS idx_shortlinks_clicks ON shortlinks(org_id, clicks DESC);

-- ============================================================
-- MIGRATION TRACKING TABLE (for future migrations)
-- ============================================================
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL
);

-- Record this migration (if not already recorded)
INSERT OR IGNORE INTO migrations (name, applied_at) 
VALUES ('001_add_installations_shortlinks', datetime('now'));
