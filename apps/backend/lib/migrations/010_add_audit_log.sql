-- 010_add_audit_log.sql
-- Audit log: chronological record of important system actions.
-- id is TEXT PRIMARY KEY (generated via db.generateId()).
-- ts is filled at INSERT time via db.nowISO(), NOT via DEFAULT.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  org_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta_json TEXT,
  ip TEXT,
  user_agent TEXT
);

-- Index on ts (for recent-first queries)
CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);

-- Index on (org_id, ts) for per-org audit trail
CREATE INDEX IF NOT EXISTS idx_audit_log_org_ts ON audit_log(org_id, ts);

-- Index on (actor_user_id, ts) for per-user audit trail
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_ts ON audit_log(actor_user_id, ts);
