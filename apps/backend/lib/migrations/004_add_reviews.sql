-- Migration 004: Add reviews table
-- =================================
-- Phase 1A: Reviews DB pour ReputyBoard
-- Note: updated_at est géré par le repository, pas par trigger

-- Table reviews
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  provider TEXT DEFAULT 'google',
  provider_location_id TEXT,          -- place_id Google
  provider_review_id TEXT,            -- id unique côté Google (pour dédup)
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  reviewed_at TEXT NOT NULL,          -- ISO 8601: YYYY-MM-DDTHH:mm:ssZ
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'replied', 'ignored')),
  reply_text TEXT,
  reply_status TEXT DEFAULT 'none' CHECK(reply_status IN ('none', 'draft', 'queued', 'sent', 'failed')),
  reply_sent_at TEXT,
  reply_error TEXT,                   -- Message d'erreur si failed
  tags TEXT DEFAULT '[]',             -- JSON array, jamais NULL
  sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative') OR sentiment IS NULL),
  raw_json TEXT,                      -- Données brutes pour debug
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- Index pour queries fréquentes
CREATE INDEX IF NOT EXISTS idx_reviews_org_id ON reviews(org_id);
CREATE INDEX IF NOT EXISTS idx_reviews_org_status ON reviews(org_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_org_rating ON reviews(org_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_org_date ON reviews(org_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON reviews(provider_review_id);

-- Unicité provider (gestion NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_provider_unique 
  ON reviews(org_id, provider, provider_review_id) 
  WHERE provider_review_id IS NOT NULL;
