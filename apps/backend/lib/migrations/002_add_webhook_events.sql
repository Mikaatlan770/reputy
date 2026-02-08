-- ============================================================
-- Migration 002: Billing Webhook Events
-- Idempotence table for Stripe/GoCardless webhooks
-- ============================================================

-- Webhook events table (idempotence + replay)
-- id = provider event ID (unique natural key)
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,                              -- = event.id from Stripe/GoCardless
  provider TEXT NOT NULL,                           -- 'stripe' | 'gocardless'
  event_type TEXT NOT NULL,                         -- ex: 'invoice.paid', 'checkout.session.completed'
  org_id TEXT,                                      -- linked org (can be NULL for global events)
  payload_json TEXT,                                -- raw JSON for debug/replay
  created_at TEXT DEFAULT (datetime('now')),        -- when received
  processed_at TEXT                                 -- NULL = not processed yet, date = processed OK
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_org ON webhook_events(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
