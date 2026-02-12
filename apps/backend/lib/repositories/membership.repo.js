/**
 * Membership Repository
 * 
 * Manages the many-to-many relationship between users and orgs.
 * Each membership has a role (owner/admin/agent) and status (pending/active/revoked).
 */

const db = require('../db');
const crypto = require('crypto');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get membership by ID
 * @param {string} id - Membership ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM memberships WHERE id = $id', { id });
  return row ? parseMembershipRow(row) : null;
}

/**
 * Get active memberships for a user (all orgs the user belongs to)
 * @param {string} userId - User ID
 * @returns {array} Active memberships
 */
function getActiveByUserId(userId) {
  const rows = db.all(`
    SELECT m.*, o.name AS org_name, o.status AS org_status, 
           o.vertical AS org_vertical, o.plan_json AS org_plan_json
    FROM memberships m
    JOIN orgs o ON m.org_id = o.id
    WHERE m.user_id = $userId AND m.status = 'active'
    ORDER BY m.created_at ASC
  `, { userId });
  return rows.map(row => ({
    ...parseMembershipRow(row),
    orgName: row.org_name,
    orgStatus: row.org_status,
    orgVertical: row.org_vertical,
    orgPlan: db.parseJson(row.org_plan_json),
  }));
}

/**
 * Get all memberships for a user (including pending/revoked)
 * @param {string} userId - User ID
 * @returns {array}
 */
function getAllByUserId(userId) {
  const rows = db.all(`
    SELECT m.*, o.name AS org_name, o.status AS org_status,
           o.vertical AS org_vertical, o.plan_json AS org_plan_json
    FROM memberships m
    JOIN orgs o ON m.org_id = o.id
    WHERE m.user_id = $userId
    ORDER BY m.created_at ASC
  `, { userId });
  return rows.map(row => ({
    ...parseMembershipRow(row),
    orgName: row.org_name,
    orgStatus: row.org_status,
    orgVertical: row.org_vertical,
    orgPlan: db.parseJson(row.org_plan_json),
  }));
}

/**
 * Get memberships for an org (team members)
 * @param {string} orgId - Organization ID
 * @param {object} options - { status: 'active'|'pending'|'revoked'|null (all) }
 * @returns {array} Memberships with user info
 */
function getByOrgId(orgId, options = {}) {
  let sql = `
    SELECT m.*, u.email AS user_email, u.name AS user_name, u.role AS user_role
    FROM memberships m
    JOIN users u ON m.user_id = u.id
    WHERE m.org_id = $orgId
  `;
  const params = { orgId };

  if (options.status) {
    sql += ' AND m.status = $status';
    params.status = options.status;
  }

  sql += ' ORDER BY m.created_at ASC';

  const rows = db.all(sql, params);
  return rows.map(row => ({
    ...parseMembershipRow(row),
    userEmail: row.user_email,
    userName: row.user_name,
  }));
}

/**
 * Get a specific membership for a user+org pair
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {object|null}
 */
function getByUserAndOrg(userId, orgId) {
  const row = db.get(`
    SELECT * FROM memberships 
    WHERE user_id = $userId AND org_id = $orgId
  `, { userId, orgId });
  return row ? parseMembershipRow(row) : null;
}

/**
 * Get membership by invite token
 * @param {string} inviteToken - Invite token
 * @returns {object|null}
 */
function getByInviteToken(inviteToken) {
  const row = db.get(`
    SELECT m.*, o.name AS org_name
    FROM memberships m
    JOIN orgs o ON m.org_id = o.id
    WHERE m.invite_token = $inviteToken
  `, { inviteToken });
  if (!row) return null;
  return {
    ...parseMembershipRow(row),
    orgName: row.org_name,
  };
}

/**
 * Count active members in an org
 * @param {string} orgId - Organization ID
 * @returns {number}
 */
function countByOrgId(orgId) {
  const result = db.get(
    'SELECT COUNT(*) as count FROM memberships WHERE org_id = $orgId AND status = $status',
    { orgId, status: 'active' }
  );
  return result?.count || 0;
}

/**
 * Check if a user has an active membership on an org
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {boolean}
 */
function hasActiveMembership(userId, orgId) {
  const row = db.get(`
    SELECT 1 FROM memberships 
    WHERE user_id = $userId AND org_id = $orgId AND status = 'active'
  `, { userId, orgId });
  return !!row;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new membership
 * @param {object} data - { userId, orgId, role, status?, invitedBy?, inviteToken?, permissions? }
 * @returns {object} Created membership
 */
function create(data) {
  const id = db.generateId();
  const now = db.nowISO();

  db.run(`
    INSERT INTO memberships (
      id, user_id, org_id, role, status,
      invited_by, invite_token, invited_at,
      accepted_at, permissions_json,
      created_at, updated_at
    ) VALUES (
      $id, $userId, $orgId, $role, $status,
      $invitedBy, $inviteToken, $invitedAt,
      $acceptedAt, $permissionsJson,
      $createdAt, $updatedAt
    )
  `, {
    id,
    userId: data.userId,
    orgId: data.orgId,
    role: data.role || 'agent',
    status: data.status || 'pending',
    invitedBy: data.invitedBy || null,
    inviteToken: data.inviteToken || null,
    invitedAt: data.invitedBy ? now : null,
    acceptedAt: data.status === 'active' ? now : null,
    permissionsJson: data.permissions ? db.toJson(data.permissions) : null,
    createdAt: now,
    updatedAt: now,
  });

  return getById(id);
}

/**
 * Update membership status
 * @param {string} id - Membership ID
 * @param {string} status - New status (pending/active/revoked)
 * @returns {object|null}
 */
function updateStatus(id, status) {
  const now = db.nowISO();
  const updates = { status, updatedAt: now };

  if (status === 'active') {
    updates.acceptedAt = now;
    updates.inviteToken = null; // Clear token once accepted
  } else if (status === 'revoked') {
    updates.revokedAt = now;
  }

  const fields = ['status = $status', 'updated_at = $updatedAt'];
  const params = { id, status, updatedAt: now };

  if (updates.acceptedAt) {
    fields.push('accepted_at = $acceptedAt');
    params.acceptedAt = updates.acceptedAt;
  }
  if (updates.inviteToken === null && status === 'active') {
    fields.push('invite_token = NULL');
  }
  if (updates.revokedAt) {
    fields.push('revoked_at = $revokedAt');
    params.revokedAt = updates.revokedAt;
  }

  db.run(`UPDATE memberships SET ${fields.join(', ')} WHERE id = $id`, params);
  return getById(id);
}

/**
 * Update membership role
 * @param {string} id - Membership ID
 * @param {string} role - New role (owner/admin/agent)
 * @returns {object|null}
 */
function updateRole(id, role) {
  const now = db.nowISO();
  db.run(`
    UPDATE memberships SET role = $role, updated_at = $updatedAt WHERE id = $id
  `, { id, role, updatedAt: now });
  return getById(id);
}

/**
 * Update membership permissions
 * @param {string} id - Membership ID
 * @param {object} permissions - Permissions object (e.g. { reviews: true, billing: false })
 * @returns {object|null}
 */
function updatePermissions(id, permissions) {
  const now = db.nowISO();
  db.run(`
    UPDATE memberships SET permissions_json = $permissionsJson, updated_at = $updatedAt WHERE id = $id
  `, { id, permissionsJson: db.toJson(permissions), updatedAt: now });
  return getById(id);
}

/**
 * Delete a membership (hard delete — use updateStatus('revoked') for soft delete)
 * @param {string} id - Membership ID
 * @returns {boolean}
 */
function deleteMembership(id) {
  const result = db.run('DELETE FROM memberships WHERE id = $id', { id });
  return result.changes > 0;
}

/**
 * Generate a unique invite token
 * @returns {string}
 */
function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// Login Pending Operations
// ============================================================

/**
 * Create a pending login token (for multi-org selection)
 * @param {string} userId - User ID
 * @param {number} ttlMinutes - Time to live in minutes (default 5)
 * @returns {object} { token, userId, expiresAt }
 */
function createLoginPending(userId, ttlMinutes = 5) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  db.run(`
    INSERT INTO login_pending (token, user_id, expires_at)
    VALUES ($token, $userId, $expiresAt)
  `, { token, userId, expiresAt });

  return { token, userId, expiresAt };
}

/**
 * Validate and consume a pending login token
 * @param {string} token - Pending login token
 * @returns {object|null} { userId } or null if invalid/expired
 */
function validateLoginPending(token) {
  const row = db.get(`
    SELECT * FROM login_pending 
    WHERE token = $token AND expires_at > $now
  `, { token, now: db.nowISO() });

  if (!row) return null;

  // Consume the token (one-time use)
  db.run('DELETE FROM login_pending WHERE token = $token', { token });

  return { userId: row.user_id };
}

/**
 * Clean up expired login pending tokens
 * @returns {number} Number of tokens deleted
 */
function cleanupLoginPending() {
  const result = db.run(
    'DELETE FROM login_pending WHERE expires_at <= $now',
    { now: db.nowISO() }
  );
  return result.changes;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Default permissions — owner gets everything, others get a granular set.
 * Permissions keys:
 *   reviews    — voir et répondre aux avis
 *   stats      — voir les statistiques
 *   campaigns  — gérer les campagnes SMS/email
 *   billing    — voir/modifier la facturation
 *   team       — gérer l'équipe
 *   settings   — modifier les paramètres de l'établissement
 *   ai         — utiliser l'assistant IA
 */
const ALL_PERMISSIONS = {
  reviews: true,
  stats: true,
  campaigns: true,
  billing: true,
  team: true,
  settings: true,
  ai: true,
};

const DEFAULT_ADMIN_PERMISSIONS = {
  reviews: true,
  stats: true,
  campaigns: true,
  billing: false,
  team: true,
  settings: true,
  ai: true,
};

const DEFAULT_AGENT_PERMISSIONS = {
  reviews: true,
  stats: true,
  campaigns: false,
  billing: false,
  team: false,
  settings: false,
  ai: true,
};

function getDefaultPermissions(role) {
  if (role === 'owner') return { ...ALL_PERMISSIONS };
  if (role === 'admin') return { ...DEFAULT_ADMIN_PERMISSIONS };
  return { ...DEFAULT_AGENT_PERMISSIONS };
}

function parseMembershipRow(row) {
  const permissions = row.permissions_json
    ? db.parseJson(row.permissions_json)
    : null; // null = use role defaults

  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    role: row.role,
    status: row.status,
    permissions: permissions,
    invitedBy: row.invited_by,
    inviteToken: row.invite_token,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get effective permissions for a membership (merge custom + defaults)
 * @param {object} membership - Parsed membership object
 * @returns {object} Effective permissions
 */
function getEffectivePermissions(membership) {
  if (membership.role === 'owner') return { ...ALL_PERMISSIONS };
  const defaults = getDefaultPermissions(membership.role);
  if (!membership.permissions) return defaults;
  // Custom permissions override defaults
  return { ...defaults, ...membership.permissions };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // CRUD memberships
  getById,
  getActiveByUserId,
  getAllByUserId,
  getByOrgId,
  getByUserAndOrg,
  getByInviteToken,
  countByOrgId,
  hasActiveMembership,
  create,
  updateStatus,
  updateRole,
  updatePermissions,
  delete: deleteMembership,
  generateInviteToken,
  // Permissions
  getEffectivePermissions,
  getDefaultPermissions,
  ALL_PERMISSIONS,
  // Login pending
  createLoginPending,
  validateLoginPending,
  cleanupLoginPending,
};
