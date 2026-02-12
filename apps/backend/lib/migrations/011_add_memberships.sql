-- 011_add_memberships.sql
-- Multi-establishment: memberships table (user ↔ org, many-to-many)
-- + login_pending table for multi-org login flow
-- ============================================================

-- ============================================================
-- TABLE: memberships (links users to orgs with role and status)
-- ============================================================
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'agent'
    CHECK(role IN ('owner', 'admin', 'agent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'active', 'revoked')),
  invited_by TEXT REFERENCES users(id),
  invite_token TEXT,
  invited_at TEXT,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org_status ON memberships(org_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_invite_token ON memberships(invite_token)
  WHERE invite_token IS NOT NULL;

-- ============================================================
-- TABLE: login_pending (temporary tokens for multi-org login flow)
-- ============================================================
CREATE TABLE IF NOT EXISTS login_pending (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_pending_user ON login_pending(user_id);
CREATE INDEX IF NOT EXISTS idx_login_pending_expires ON login_pending(expires_at);

-- ============================================================
-- Column: users.must_change_password (for future use)
-- ============================================================
ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;

-- Record this migration
INSERT OR IGNORE INTO migrations (name, applied_at) 
VALUES ('011_add_memberships', datetime('now'));
