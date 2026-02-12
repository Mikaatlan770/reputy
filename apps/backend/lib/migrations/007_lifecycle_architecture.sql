-- Migration 007: Lifecycle Architecture
-- ========================================
-- Adds lifecycle timestamps to review_requests,
-- activation milestone to orgs,
-- org_id denormalization to feedbacks,
-- and links email_outbox to review_requests.
--
-- NOTE: ALTER TABLE ADD COLUMN is not idempotent in SQLite.
-- The migration runner handles "duplicate column name" errors
-- gracefully when ALTER TABLE statements are present.
-- ========================================

-- =============================================
-- 1) review_requests: lifecycle timestamps
-- =============================================
ALTER TABLE review_requests ADD COLUMN queued_at TEXT;
ALTER TABLE review_requests ADD COLUMN sent_at TEXT;
ALTER TABLE review_requests ADD COLUMN failed_at TEXT;
ALTER TABLE review_requests ADD COLUMN feedback_received_at TEXT;
ALTER TABLE review_requests ADD COLUMN public_redirected_at TEXT;

-- =============================================
-- 2) orgs: activation milestone
-- =============================================
ALTER TABLE orgs ADD COLUMN activated_at TEXT;

-- =============================================
-- 3) feedbacks: org_id denormalization
-- =============================================
ALTER TABLE feedbacks ADD COLUMN org_id TEXT REFERENCES orgs(id);

CREATE INDEX IF NOT EXISTS idx_feedbacks_org ON feedbacks(org_id);

-- =============================================
-- 4) email_outbox: link to review_requests
-- =============================================
ALTER TABLE email_outbox ADD COLUMN request_db_id TEXT REFERENCES review_requests(id);

CREATE INDEX IF NOT EXISTS idx_outbox_request_db_id ON email_outbox(request_db_id);

-- =============================================
-- 5) Lifecycle indexes for metrics queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_rr_sent_at ON review_requests(sent_at);
CREATE INDEX IF NOT EXISTS idx_rr_feedback_received_at ON review_requests(feedback_received_at);
CREATE INDEX IF NOT EXISTS idx_rr_public_redirected_at ON review_requests(public_redirected_at);
CREATE INDEX IF NOT EXISTS idx_orgs_activated_at ON orgs(activated_at);

-- =============================================
-- 6) Backfill: feedbacks.org_id from review_requests
-- =============================================
UPDATE feedbacks
SET org_id = (
  SELECT rr.org_id FROM review_requests rr
  WHERE rr.id = feedbacks.request_db_id
)
WHERE org_id IS NULL;

-- =============================================
-- 7) Backfill: orgs.activated_at from first sent review_request
-- =============================================
UPDATE orgs
SET activated_at = (
  SELECT MIN(rr.created_at) FROM review_requests rr
  WHERE rr.org_id = orgs.id
)
WHERE activated_at IS NULL
  AND EXISTS (SELECT 1 FROM review_requests rr WHERE rr.org_id = orgs.id);
