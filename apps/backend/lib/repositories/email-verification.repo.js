/**
 * Email Verification Repository
 */

const db = require('../db');

// ============================================================
// Configuration
// ============================================================

const VERIFICATION_EXPIRY_MINUTES = 15;

// ============================================================
// Read Operations
// ============================================================

/**
 * Get verification by ID
 * @param {string} id - Verification ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM email_verifications WHERE id = $id', { id });
  return row ? parseVerificationRow(row) : null;
}

/**
 * Get active verification by email
 * @param {string} email - Email address
 * @returns {object|null} Active (non-expired) verification or null
 */
function getByEmail(email) {
  const row = db.get(`
    SELECT * FROM email_verifications 
    WHERE email = $email AND expires_at > $now
    ORDER BY created_at DESC
    LIMIT 1
  `, { 
    email: email.toLowerCase(),
    now: db.nowISO()
  });
  return row ? parseVerificationRow(row) : null;
}

/**
 * Verify code for email
 * @param {string} email - Email address
 * @param {string} code - Verification code
 * @returns {object|null} Verification if valid, null otherwise
 */
function verifyCode(email, code) {
  const row = db.get(`
    SELECT * FROM email_verifications 
    WHERE email = $email 
      AND code = $code 
      AND expires_at > $now
  `, { 
    email: email.toLowerCase(),
    code,
    now: db.nowISO()
  });
  return row ? parseVerificationRow(row) : null;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a verification
 * @param {object} data - { email, code, orgId }
 * @returns {object} Created verification
 */
function create(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000).toISOString();
  
  db.run(`
    INSERT INTO email_verifications (
      id, email, code, org_id, expires_at, created_at
    ) VALUES (
      $id, $email, $code, $orgId, $expiresAt, $createdAt
    )
  `, {
    id,
    email: data.email.toLowerCase(),
    code: data.code,
    orgId: data.orgId || null,
    expiresAt,
    createdAt: now
  });
  
  return getById(id);
}

/**
 * Create or update verification for email
 * Invalidates previous verifications
 * @param {string} email - Email address
 * @param {string} code - Verification code
 * @param {string} orgId - Organization ID (optional)
 * @returns {object} New verification
 */
function createOrUpdate(email, code, orgId = null) {
  // Delete existing verifications for this email
  db.run('DELETE FROM email_verifications WHERE email = $email', {
    email: email.toLowerCase()
  });
  
  return create({ email, code, orgId });
}

/**
 * Delete verification
 * @param {string} id - Verification ID
 * @returns {boolean}
 */
function deleteVerification(id) {
  const result = db.run('DELETE FROM email_verifications WHERE id = $id', { id });
  return result.changes > 0;
}

/**
 * Delete verifications by email
 * @param {string} email - Email address
 * @returns {number} Number deleted
 */
function deleteByEmail(email) {
  const result = db.run('DELETE FROM email_verifications WHERE email = $email', {
    email: email.toLowerCase()
  });
  return result.changes;
}

/**
 * Clean up expired verifications
 * @returns {number} Number deleted
 */
function cleanupExpired() {
  const result = db.run('DELETE FROM email_verifications WHERE expires_at <= $now', {
    now: db.nowISO()
  });
  return result.changes;
}

// ============================================================
// Helper Functions
// ============================================================

function parseVerificationRow(row) {
  return {
    id: row.id,
    email: row.email,
    code: row.code,
    orgId: row.org_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

/**
 * Generate a 6-digit verification code
 * @returns {string}
 */
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  getByEmail,
  verifyCode,
  create,
  createOrUpdate,
  delete: deleteVerification,
  deleteByEmail,
  cleanupExpired,
  generateCode
};
