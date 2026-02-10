-- Migration 005: Email outbox, events & unsubscribes
-- =================================
-- P0.4: Pipeline email "demande d'avis"

-- ============================================================
-- TABLE: email_outbox (queue d'envoi)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  template_key TEXT NOT NULL,          -- 'review_request', 'test', etc.
  payload_json TEXT DEFAULT '{}',      -- Données pour le template
  status TEXT DEFAULT 'pending'        -- pending | sending | sent | failed | cancelled
    CHECK(status IN ('pending','sending','sent','failed','cancelled')),
  provider TEXT,                        -- 'ses_smtp' | 'dry_run' | null
  provider_message_id TEXT,            -- Message-ID retourné par le provider
  error TEXT,                           -- Message d'erreur si failed
  attempts INTEGER DEFAULT 0,          -- Nombre de tentatives
  idempotency_key TEXT UNIQUE,         -- Clé d'idempotence (org_id:to:template:ref)
  scheduled_at TEXT,                    -- Date d'envoi prévue (null = ASAP)
  sent_at TEXT,                         -- Date d'envoi effective
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_org ON email_outbox(org_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON email_outbox(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_outbox_org_status ON email_outbox(org_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_to ON email_outbox(to_email);
CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON email_outbox(idempotency_key);

-- ============================================================
-- TABLE: email_events (suivi delivery/bounce/complaint)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL REFERENCES email_outbox(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL              -- sent | delivered | bounce | complaint | open | click
    CHECK(event_type IN ('sent','delivered','bounce','complaint','open','click')),
  event_json TEXT DEFAULT '{}',         -- Détails bruts de l'événement
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_events_outbox ON email_events(outbox_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);

-- ============================================================
-- TABLE: email_unsubscribes (opt-out par org + email)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT DEFAULT 'user_request',   -- user_request | bounce | complaint
  token_hash TEXT,                       -- Hash du token utilisé pour unsub
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unsub_org_email ON email_unsubscribes(org_id, email);
CREATE INDEX IF NOT EXISTS idx_unsub_email ON email_unsubscribes(email);
