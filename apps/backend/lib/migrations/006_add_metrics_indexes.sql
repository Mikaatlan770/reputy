-- P1.2: Add indexes for metrics endpoint (created_at queries)
-- These indexes support WHERE created_at >= ? without full table scans.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(created_at);
CREATE INDEX IF NOT EXISTS idx_rr_created ON review_requests(created_at);
