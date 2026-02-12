-- 012_add_membership_permissions.sql
-- Granular permissions for team members (JSON column on memberships)
-- ============================================================

-- Add permissions_json column to memberships table
-- NULL = all permissions (owner/legacy behavior)
-- JSON object = granular permissions for admin/agent roles
ALTER TABLE memberships ADD COLUMN permissions_json TEXT DEFAULT NULL;

-- Record this migration
INSERT OR IGNORE INTO migrations (name, applied_at)
VALUES ('012_add_membership_permissions', datetime('now'));
