-- Migration 008: Backfill lifecycle for historical data
-- =====================================================
-- One-time cleanup: assigns correct lifecycle statuses
-- to the 67 review_requests created before lifecycle code.
--
-- Order matters: feedback_received (step 1) overrides sent (step 2),
-- because feedback_received > sent in the lifecycle.
-- =====================================================

-- =============================================
-- 1) Requests with outbox entries marked 'sent' → sent
--    (must run BEFORE step 2 so feedback_received can override)
-- =============================================
UPDATE review_requests
SET status = 'sent',
    sent_at = COALESCE(
      (SELECT MIN(eo.sent_at) FROM email_outbox eo
       WHERE eo.request_db_id = review_requests.id AND eo.status = 'sent'),
      review_requests.created_at
    ),
    updated_at = datetime('now')
WHERE status = 'created'
  AND EXISTS (
    SELECT 1 FROM email_outbox eo
    WHERE eo.request_db_id = review_requests.id AND eo.status = 'sent'
  );

-- =============================================
-- 2) Requests with existing feedbacks → feedback_received
--    (overrides 'sent' because it's further in lifecycle)
-- =============================================
UPDATE review_requests
SET status = 'feedback_received',
    feedback_received_at = (
      SELECT MIN(f.created_at) FROM feedbacks f
      WHERE f.request_db_id = review_requests.id
    ),
    updated_at = datetime('now')
WHERE status IN ('created', 'sent')
  AND EXISTS (
    SELECT 1 FROM feedbacks f WHERE f.request_db_id = review_requests.id
  );

-- =============================================
-- 3) Override orgs.activated_at with MIN(sent_at) where available
--    (replaces the proxy MIN(created_at) from migration 007)
-- =============================================
UPDATE orgs
SET activated_at = (
  SELECT MIN(rr.sent_at) FROM review_requests rr
  WHERE rr.org_id = orgs.id AND rr.sent_at IS NOT NULL
)
WHERE EXISTS (
  SELECT 1 FROM review_requests rr
  WHERE rr.org_id = orgs.id AND rr.sent_at IS NOT NULL
);
