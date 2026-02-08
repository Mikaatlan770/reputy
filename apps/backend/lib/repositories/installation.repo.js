/**
 * Installation Repository
 * 
 * Manages API installations (tokens per device)
 * 
 * SECURITY: Token is ONLY returned in cleartext at creation time.
 * All other operations return masked tokens.
 */

const db = require('../db');
const crypto = require('crypto');

// ============================================================
// Constants
// ============================================================

const TOKEN_PREFIX = 'rpt_';
const TOKEN_LENGTH = 32; // 32 bytes = 64 hex chars

// ============================================================
// Token Generation
// ============================================================

/**
 * Generate a secure installation token
 * @returns {string} Token with prefix (e.g., rpt_abc123...)
 */
function generateToken() {
  const randomPart = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
  return `${TOKEN_PREFIX}${randomPart}`;
}

/**
 * Mask a token for display (show first 8 and last 4 chars)
 * @param {string} token - Full token
 * @returns {string} Masked token (e.g., rpt_abcd...wxyz)
 */
function maskToken(token) {
  if (!token || token.length < 16) return '***';
  const prefix = token.substring(0, 8);
  const suffix = token.substring(token.length - 4);
  return `${prefix}...${suffix}`;
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Get installation by ID
 * @param {string} id - Installation ID
 * @returns {object|null} Installation (without token)
 */
function getById(id) {
  const row = db.get('SELECT * FROM installations WHERE id = $id', { id });
  return row ? parseRow(row) : null;
}

/**
 * Get installation by token hash
 * @param {string} tokenHash - SHA256 hash of the token
 * @returns {object|null} Installation (without token)
 */
function getByTokenHash(tokenHash) {
  const row = db.get(`
    SELECT * FROM installations 
    WHERE token_hash = $tokenHash 
      AND revoked_at IS NULL
  `, { tokenHash });
  return row ? parseRow(row) : null;
}

/**
 * Verify a token and get the installation
 * @param {string} token - Token in cleartext
 * @returns {object|null} Installation if valid, null if invalid/revoked
 */
function verifyToken(token) {
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  
  const tokenHash = db.hashToken(token);
  return getByTokenHash(tokenHash);
}

/**
 * Get all installations for an org
 * @param {string} orgId - Organization ID
 * @param {object} options - { includeRevoked: boolean }
 * @returns {array} List of installations (without tokens)
 */
function getByOrgId(orgId, options = {}) {
  let sql = 'SELECT * FROM installations WHERE org_id = $orgId';
  
  if (!options.includeRevoked) {
    sql += ' AND revoked_at IS NULL';
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const rows = db.all(sql, { orgId });
  return rows.map(parseRow);
}

/**
 * Count active installations for an org
 * @param {string} orgId - Organization ID
 * @returns {number} Count
 */
function countByOrgId(orgId) {
  const result = db.get(`
    SELECT COUNT(*) as count 
    FROM installations 
    WHERE org_id = $orgId AND revoked_at IS NULL
  `, { orgId });
  return result?.count || 0;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new installation
 * IMPORTANT: Returns token in cleartext ONLY HERE
 * 
 * @param {string} orgId - Organization ID
 * @param {string} label - User-friendly label
 * @param {object} metadata - Optional metadata
 * @returns {{ installation: object, token: string }} Installation + cleartext token
 */
function create(orgId, label, metadata = {}) {
  const id = db.generateId();
  const token = generateToken();
  const tokenHash = db.hashToken(token);
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO installations (id, org_id, label, token_hash, created_at, metadata_json)
    VALUES ($id, $orgId, $label, $tokenHash, $now, $metadata)
  `, {
    id,
    orgId,
    label: label || 'Installation',
    tokenHash,
    now,
    metadata: db.toJson(metadata)
  });
  
  const installation = getById(id);
  
  // Return installation WITH cleartext token (ONLY TIME)
  return {
    installation: {
      ...installation,
      tokenMasked: maskToken(token)
    },
    token // CLEARTEXT - only returned here!
  };
}

/**
 * Update installation label
 * @param {string} id - Installation ID
 * @param {string} label - New label
 * @returns {object|null} Updated installation
 */
function updateLabel(id, label) {
  db.run(`
    UPDATE installations 
    SET label = $label 
    WHERE id = $id
  `, { id, label });
  
  return getById(id);
}

/**
 * Update last_seen_at timestamp
 * @param {string} id - Installation ID
 * @returns {boolean} Success
 */
function updateLastSeen(id) {
  const result = db.run(`
    UPDATE installations 
    SET last_seen_at = $now 
    WHERE id = $id AND revoked_at IS NULL
  `, { id, now: db.nowISO() });
  
  return result.changes > 0;
}

/**
 * Update last_seen_at by token hash
 * @param {string} tokenHash - Token hash
 * @returns {boolean} Success
 */
function updateLastSeenByTokenHash(tokenHash) {
  const result = db.run(`
    UPDATE installations 
    SET last_seen_at = $now 
    WHERE token_hash = $tokenHash AND revoked_at IS NULL
  `, { tokenHash, now: db.nowISO() });
  
  return result.changes > 0;
}

/**
 * Revoke an installation (soft delete)
 * @param {string} id - Installation ID
 * @returns {boolean} Success
 */
function revoke(id) {
  const result = db.run(`
    UPDATE installations 
    SET revoked_at = $now 
    WHERE id = $id AND revoked_at IS NULL
  `, { id, now: db.nowISO() });
  
  return result.changes > 0;
}

/**
 * Rotate an installation token (revoke old, create new hash)
 * IMPORTANT: Returns new token in cleartext ONLY HERE
 * 
 * @param {string} id - Installation ID
 * @returns {{ installation: object, token: string }|null} Updated installation + new token
 */
function rotateToken(id) {
  const existing = getById(id);
  if (!existing || existing.revokedAt) {
    return null;
  }
  
  const newToken = generateToken();
  const newTokenHash = db.hashToken(newToken);
  const now = db.nowISO();
  
  db.run(`
    UPDATE installations 
    SET token_hash = $tokenHash, last_seen_at = $now
    WHERE id = $id
  `, { id, tokenHash: newTokenHash, now });
  
  const updated = getById(id);
  
  return {
    installation: {
      ...updated,
      tokenMasked: maskToken(newToken)
    },
    token: newToken // CLEARTEXT - only returned here!
  };
}

/**
 * Permanently delete an installation
 * @param {string} id - Installation ID
 * @returns {boolean} Success
 */
function remove(id) {
  const result = db.run('DELETE FROM installations WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Parse a database row into installation object
 * NEVER includes token hash in output
 * @param {object} row - Database row
 * @returns {object} Installation object
 */
function parseRow(row) {
  if (!row) return null;
  
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    // NO token or tokenHash exposed!
    tokenMasked: '***...***', // Placeholder - actual mask needs original token
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    metadata: db.parseJson(row.metadata_json, {}),
    status: row.revoked_at ? 'revoked' : 'active'
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Token utilities
  generateToken,
  maskToken,
  TOKEN_PREFIX,
  
  // Read
  getById,
  getByTokenHash,
  verifyToken,
  getByOrgId,
  countByOrgId,
  
  // Write
  create,
  updateLabel,
  updateLastSeen,
  updateLastSeenByTokenHash,
  revoke,
  rotateToken,
  remove
};
