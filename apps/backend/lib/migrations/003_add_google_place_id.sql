-- ============================================================
-- Migration 003: Add google_place_id for Bronze anti-abuse lock
-- ============================================================
-- 
-- Purpose:
-- Prevent multiple free Bronze accounts for the same Google Business.
-- One Google Place ID = One free Bronze account.
--
-- Business rules:
-- - Bronze (free) accounts require a unique google_place_id
-- - Paid plans (Argent/Or/Platinum) can be created freely
-- - The google_place_id is extracted from the Google Business URL
--
-- ============================================================

-- Add google_place_id column to orgs table
ALTER TABLE orgs ADD COLUMN google_place_id TEXT;

-- Add google_reviews_url for reference
ALTER TABLE orgs ADD COLUMN google_reviews_url TEXT;

-- Create unique index for anti-abuse (only applies to orgs with a google_place_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_google_place_id ON orgs(google_place_id)
  WHERE google_place_id IS NOT NULL;

-- Index for faster lookups by google_reviews_url
CREATE INDEX IF NOT EXISTS idx_orgs_google_reviews_url ON orgs(google_reviews_url)
  WHERE google_reviews_url IS NOT NULL;
