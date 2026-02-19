-- Migration 018: SMS scheduled queue + AI auto-reply tracking
-- ===========================================================
-- Created: 2026-02-16
-- Purpose: 
--   1) scheduled_sends: delayed SMS queue (60 min delay, cron-processed)
--   2) ai_auto_replies: tracking table for OpenAI auto-reply (4-5★ reviews)

-- ============================================================
-- TABLE: scheduled_sends (SMS ONLY — delayed queue)
-- Email continues using email_outbox exclusively.
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_sends (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'sms' CHECK(channel = 'sms'),
  recipient TEXT NOT NULL,               -- phone number
  payload_json TEXT DEFAULT '{}',        -- JSON: { patientName, requestId, ... }
  request_db_id TEXT REFERENCES review_requests(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_for TEXT NOT NULL,           -- ISO datetime: created_at + 60 min
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index: worker picks pending sends by time
CREATE INDEX IF NOT EXISTS idx_sched_status_time
  ON scheduled_sends(status, scheduled_for);

-- Index: per-org listing
CREATE INDEX IF NOT EXISTS idx_sched_org
  ON scheduled_sends(org_id);

-- Index: anti-spam lookup (recent sends to same recipient within org)
CREATE INDEX IF NOT EXISTS idx_sched_recipient_org
  ON scheduled_sends(org_id, recipient, created_at);

-- ============================================================
-- TABLE: ai_auto_replies (OpenAI auto-reply tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_auto_replies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  model TEXT NOT NULL,                   -- 'gpt-4.1-mini', 'template', etc.
  input_tokens_est INTEGER DEFAULT 0,
  output_tokens_est INTEGER DEFAULT 0,
  temperature REAL DEFAULT 0.4,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending', 'success', 'failed', 'skipped')),
  response_text TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index: lookup by review (for dedup / retry check)
CREATE INDEX IF NOT EXISTS idx_ai_reply_review
  ON ai_auto_replies(review_id);

-- Index: per-org listing / stats
CREATE INDEX IF NOT EXISTS idx_ai_reply_org_status
  ON ai_auto_replies(org_id, status);

-- ============================================================
-- Record migration
-- ============================================================
INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('018_add_scheduled_sends_and_auto_reply', datetime('now'));
