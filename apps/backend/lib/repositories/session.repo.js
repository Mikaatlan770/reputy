/**
 * Session Repository
 */

const db = require('../db');
const crypto = require('node:crypto');

// ============================================================
// Configuration
// ============================================================

const SESSION_DURATION_DAYS = 7;

// ============================================================
// Read Operations
// ============================================================

/**
 * Get session by token
 * @param {string} token - Session token
 * @returns {object|null} Session if valid and not expired
 */
function getSession(token) {
  const row = db.get(`
    SELECT * FROM sessions 
    WHERE token = $token AND expires_at > $now
  `, { 
    token, 
    now: db.nowISO() 
  });
  
  return row ? parseSessionRow(row) : null;
}

/**
 * Get all sessions for a user
 * @param {string} userId - User ID
 * @returns {array}
 */
function getByUserId(userId) {
  const rows = db.all(`
    SELECT * FROM sessions 
    WHERE user_id = $userId AND expires_at > $now
    ORDER BY expires_at DESC
  `, { 
    userId, 
    now: db.nowISO() 
  });
  
  return rows.map(parseSessionRow);
}

/**
 * Validate a session token and return user/org info
 * @param {string} token - Session token
 * @returns {object|null} { userId, orgId, expiresAt } or null
 */
function validateSession(token) {
  const session = getSession(token);
  if (!session) return null;
  
  return {
    userId: session.userId,
    orgId: session.orgId,
    expiresAt: session.expiresAt
  };
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new session
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @param {number} durationDays - Session duration in days (default 7)
 * @returns {object} Created session with token
 */
function createSession(userId, orgId, durationDays = SESSION_DURATION_DAYS) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  
  db.run(`
    INSERT INTO sessions (token, user_id, org_id, expires_at)
    VALUES ($token, $userId, $orgId, $expiresAt)
  `, {
    token,
    userId,
    orgId,
    expiresAt
  });
  
  return { token, userId, orgId, expiresAt };
}

/**
 * Delete a specific session
 * @param {string} token - Session token
 * @returns {boolean}
 */
function deleteSession(token) {
  const result = db.run('DELETE FROM sessions WHERE token = $token', { token });
  return result.changes > 0;
}

/**
 * Delete all sessions for a user
 * @param {string} userId - User ID
 * @returns {number} Number of sessions deleted
 */
function deleteUserSessions(userId) {
  const result = db.run('DELETE FROM sessions WHERE user_id = $userId', { userId });
  return result.changes;
}

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions deleted
 */
function cleanupExpired() {
  const result = db.run('DELETE FROM sessions WHERE expires_at <= $now', { 
    now: db.nowISO() 
  });
  return result.changes;
}

/**
 * Extend session expiration
 * @param {string} token - Session token
 * @param {number} durationDays - New duration in days
 * @returns {object|null} Updated session
 */
function extendSession(token, durationDays = SESSION_DURATION_DAYS) {
  const session = getSession(token);
  if (!session) return null;
  
  const newExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  
  db.run('UPDATE sessions SET expires_at = $expiresAt WHERE token = $token', {
    token,
    expiresAt: newExpiresAt
  });
  
  return getSession(token);
}

// ============================================================
// Helper Functions
// ============================================================

function parseSessionRow(row) {
  return {
    token: row.token,
    userId: row.user_id,
    orgId: row.org_id,
    expiresAt: row.expires_at
  };
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getSession,
  getByUserId,
  validateSession,
  createSession,
  deleteSession,
  deleteUserSessions,
  cleanupExpired,
  extendSession
};
