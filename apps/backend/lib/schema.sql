-- ============================================================
-- Reputy SQLite Schema
-- Version: 1.1.0
-- Migration from data.json to SQLite with WAL mode
-- Added: installations, shortlinks, migrations tables
-- ============================================================

-- Pragmas are set in db.js, not here

-- ============================================================
-- TABLE: orgs (Organizations)
-- ============================================================
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  public_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  vertical TEXT DEFAULT 'health',
  status TEXT DEFAULT 'active',
  
  -- Google Business (for Bronze anti-abuse lock)
  google_place_id TEXT,                     -- Unique Google Place ID for anti-abuse
  google_reviews_url TEXT,                  -- Google Reviews URL
  
  -- API Token (hashed for security)
  api_token_hash TEXT NOT NULL,
  api_token_created_at TEXT,
  api_token_last_rotated_at TEXT,
  api_token_previous_hash TEXT,
  api_token_previous_expires_at TEXT,
  
  -- JSON fields for complex nested objects
  billing_json TEXT DEFAULT '{}',
  plan_json TEXT DEFAULT '{}',
  negotiated_json TEXT DEFAULT '{}',
  options_json TEXT DEFAULT '{}',           -- Settings PER ORG (googleReviewUrl, routingThreshold, templates...)
  quotas_json TEXT DEFAULT '{}',            -- Base plan quotas
  balances_json TEXT DEFAULT '{}',          -- Pack wallet (purchased extras)
  subscription_credits_json TEXT DEFAULT '{}', -- Current cycle state (used, prorata, dates)
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  name TEXT,
  email_verified INTEGER DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- ============================================================
-- TABLE: review_requests (formerly "requests")
-- ============================================================
CREATE TABLE IF NOT EXISTS review_requests (
  id TEXT PRIMARY KEY,                              -- Internal DB id (generated)
  idempotency_key TEXT UNIQUE NOT NULL,             -- Extension's requestId (UUID) for dedup
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL,                            -- sms/email
  status TEXT DEFAULT 'created',                    -- created/queued/sent/failed/feedback/public_redirected
  patient_json TEXT DEFAULT '{}',                   -- {name, email, phone}
  feedback_url TEXT,
  meta_json TEXT DEFAULT '{}',                      -- {source, pageUrl, ...}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: feedbacks
-- ============================================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY,
  request_db_id TEXT NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
  rating INTEGER,
  comment TEXT,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: messages (SMS/Email delivery tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  request_db_id TEXT NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,                            -- sms/email
  recipient TEXT NOT NULL,                          -- phone or email address
  status TEXT DEFAULT 'queued',                     -- queued/sent/failed
  provider_message_id TEXT,                         -- ID from SMS/Email provider
  error_code TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

-- ============================================================
-- TABLE: usage_ledger (Credit usage tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                               -- sms/email/ai/...
  qty INTEGER NOT NULL,
  details_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: telemetry_events
-- ============================================================
CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
  source TEXT,                                      -- extension/web/api
  level TEXT,                                       -- info/warn/error
  data_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: email_verifications
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  org_id TEXT,                                      -- May be null during signup
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orgs_public_key ON orgs(public_key);
CREATE INDEX IF NOT EXISTS idx_orgs_status ON orgs(status);

-- Anti-abuse: unique google_place_id (only for orgs with a google_place_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_google_place_id ON orgs(google_place_id)
  WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_google_reviews_url ON orgs(google_reviews_url)
  WHERE google_reviews_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_rr_org_created ON review_requests(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rr_idempotency ON review_requests(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rr_status ON review_requests(status);

CREATE INDEX IF NOT EXISTS idx_feedbacks_request ON feedbacks(request_db_id);

CREATE INDEX IF NOT EXISTS idx_msg_request ON messages(request_db_id);
CREATE INDEX IF NOT EXISTS idx_msg_status ON messages(status);

CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_ledger(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_org_type ON usage_ledger(org_id, type);

CREATE INDEX IF NOT EXISTS idx_telemetry_org ON telemetry_events(org_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at);

CREATE INDEX IF NOT EXISTS idx_emailverif_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_emailverif_expires ON email_verifications(expires_at);

-- ============================================================
-- TABLE: installations (API tokens per device/installation)
-- ============================================================
CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT,                                 -- User-friendly name
  token_hash TEXT NOT NULL,                   -- SHA256 hash of the token
  created_at TEXT NOT NULL,
  last_seen_at TEXT,                          -- Updated on each API call
  revoked_at TEXT,                            -- NULL = active, set = revoked
  metadata_json TEXT DEFAULT '{}'             -- Optional metadata
);

CREATE INDEX IF NOT EXISTS idx_installations_org ON installations(org_id);
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

CREATE INDEX IF NOT EXISTS idx_shortlinks_org ON shortlinks(org_id);
CREATE INDEX IF NOT EXISTS idx_shortlinks_clicks ON shortlinks(org_id, clicks DESC);

-- ============================================================
-- TABLE: migrations (tracking applied migrations)
-- ============================================================
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL
);
