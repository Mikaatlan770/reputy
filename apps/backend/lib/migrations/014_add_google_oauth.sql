-- ============================================================
-- Migration 014: Add Google Business Profile OAuth support
-- ============================================================
--
-- Purpose:
-- Store OAuth tokens for Google Business Profile API integration.
-- Enables automatic syncing of Google reviews and posting replies.
--
-- Architecture:
-- Tokens are stored per-org (one Google account per establishment).
-- The access_token is encrypted at rest (AES-256-GCM via application layer).
-- Refresh tokens allow automatic renewal when access tokens expire.
--
-- ============================================================

-- Google OAuth columns on orgs table
ALTER TABLE orgs ADD COLUMN google_oauth_json TEXT DEFAULT NULL;
-- JSON structure:
-- {
--   "accessToken": "encrypted...",
--   "refreshToken": "encrypted...",
--   "tokenExpiry": "2026-02-15T12:00:00Z",
--   "accountId": "accounts/123456789",
--   "locationId": "locations/987654321",
--   "locationName": "Cabinet Dr. Atlan",
--   "connectedAt": "2026-02-15T10:00:00Z",
--   "lastSyncAt": null,
--   "syncStatus": "idle"
-- }

-- Track sync history for diagnostics
CREATE TABLE IF NOT EXISTS google_sync_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,              -- 'sync_reviews' | 'post_reply' | 'token_refresh' | 'disconnect'
  status TEXT NOT NULL,              -- 'success' | 'error'
  details_json TEXT DEFAULT '{}',    -- { reviewsImported, reviewsSkipped, error, ... }
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_google_sync_org ON google_sync_log(org_id);
CREATE INDEX IF NOT EXISTS idx_google_sync_created ON google_sync_log(org_id, created_at DESC);
