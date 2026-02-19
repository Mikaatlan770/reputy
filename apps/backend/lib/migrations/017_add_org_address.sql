-- ============================================================
-- Migration 017: Add address column to orgs table
-- ============================================================
--
-- Purpose:
-- Store the formatted address of the organization for display
-- in the Settings page and competitor configuration.
-- The address is populated via Google Places Autocomplete when
-- the user configures their establishment location.
--
-- ============================================================

ALTER TABLE orgs ADD COLUMN address TEXT DEFAULT NULL;

-- Record this migration
INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('017_add_org_address', datetime('now'));
