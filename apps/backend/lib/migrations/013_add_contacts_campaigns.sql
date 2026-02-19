-- Migration 013: Add contacts, campaigns, campaign_recipients tables
-- =================================================================
-- Supports: campaigns (avis + marketing), contact management, CSV import,
-- anti-spam protection (solicitation tracking)

-- ============================================================
-- TABLE: contacts — Base de données clients par organisation
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT DEFAULT 'manual',                -- manual / import_csv / import_excel / review_request / sync
  tags TEXT DEFAULT '[]',                       -- JSON array
  -- Anti-spam: compteur de sollicitations avis sans réponse
  review_solicitations_no_reply INTEGER DEFAULT 0,
  -- Tracking
  has_left_review INTEGER DEFAULT 0,           -- 1 si le contact a laissé un avis
  last_solicited_at TEXT,                       -- Dernière sollicitation avis
  last_review_at TEXT,                          -- Dernier avis laissé
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Unicité par email au sein d'une org (ignore NULL emails)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_email
  ON contacts(org_id, email)
  WHERE email IS NOT NULL AND email != '';

-- Unicité par téléphone au sein d'une org (ignore NULL phones)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_phone
  ON contacts(org_id, phone)
  WHERE phone IS NOT NULL AND phone != '';

CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(org_id, source);

-- ============================================================
-- TABLE: campaigns — Campagnes d'envoi (avis ou marketing)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'review',          -- review / marketing
  channel TEXT NOT NULL,                         -- sms / email
  status TEXT DEFAULT 'draft',                   -- draft / scheduled / active / sending / completed / paused
  template TEXT,                                 -- Message template avec {prenom}, {nom}, {lien_avis}
  subject TEXT,                                  -- Sujet email (NULL pour SMS)
  scheduled_at TEXT,                             -- Date programmée (NULL = immédiat)
  started_at TEXT,                               -- Date de début d'envoi effectif
  completed_at TEXT,                             -- Date de fin d'envoi
  -- Seuil anti-spam (campagne avis uniquement)
  spam_threshold INTEGER DEFAULT 3,              -- Max sollicitations sans réponse
  -- Stats agrégées (dénormalisées pour perf)
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns(org_id, status);

-- ============================================================
-- TABLE: campaign_recipients — Liaison campagne ↔ contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',                 -- pending / sent / failed / clicked / reviewed
  excluded_reason TEXT,                          -- spam_threshold / already_reviewed / no_channel (NULL = not excluded)
  sent_at TEXT,
  clicked_at TEXT,
  reviewed_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cr_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cr_contact ON campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_cr_campaign_status ON campaign_recipients(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_unique ON campaign_recipients(campaign_id, contact_id);
