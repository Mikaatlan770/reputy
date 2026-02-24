/**
 * Shortlink Repository
 * 
 * Manages QR codes and NFC tags shortlinks
 */

const db = require('../db');
const crypto = require('node:crypto');

// ============================================================
// Constants
// ============================================================

const CODE_LENGTH = 8; // 8 chars = good balance of short + unique
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Types
const TYPES = {
  QR: 'qr',
  NFC: 'nfc'
};

// ============================================================
// Code Generation
// ============================================================

/**
 * Generate a unique short code
 * @returns {string} Short code (e.g., "Ab3xY9kL")
 */
function generateCode() {
  let code = '';
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (const byte of bytes) {
    code += CODE_CHARS[byte % CODE_CHARS.length];
  }
  return code;
}

/**
 * Generate a unique code that doesn't exist in DB
 * @returns {string} Unique short code
 */
function generateUniqueCode() {
  let code;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    code = generateCode();
    const existing = getByCode(code);
    if (!existing) break;
    attempts++;
  } while (attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    // Fallback: add timestamp suffix
    code = generateCode() + Date.now().toString(36).slice(-2);
  }
  
  return code;
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Get shortlink by code
 * @param {string} code - Short code
 * @returns {object|null} Shortlink
 */
function getByCode(code) {
  const row = db.get('SELECT * FROM shortlinks WHERE code = $code', { code });
  return row ? parseRow(row) : null;
}

/**
 * Get all shortlinks for an org
 * @param {string} orgId - Organization ID
 * @param {object} options - { type, limit, offset }
 * @returns {array} List of shortlinks
 */
function getByOrgId(orgId, options = {}) {
  let sql = 'SELECT * FROM shortlinks WHERE org_id = $orgId';
  const params = { orgId };
  
  if (options.type) {
    sql += ' AND type = $type';
    params.type = options.type;
  }
  
  sql += ' ORDER BY created_at DESC';
  
  if (options.limit) {
    sql += ' LIMIT $limit';
    params.limit = options.limit;
  }
  if (options.offset) {
    sql += ' OFFSET $offset';
    params.offset = options.offset;
  }
  
  const rows = db.all(sql, params);
  return rows.map(parseRow);
}

/**
 * Count shortlinks for an org
 * @param {string} orgId - Organization ID
 * @param {string} type - Optional type filter
 * @returns {number} Count
 */
function countByOrgId(orgId, type = null) {
  let sql = 'SELECT COUNT(*) as count FROM shortlinks WHERE org_id = $orgId';
  const params = { orgId };
  
  if (type) {
    sql += ' AND type = $type';
    params.type = type;
  }
  
  const result = db.get(sql, params);
  return result?.count || 0;
}

/**
 * Get stats for an org's shortlinks
 * @param {string} orgId - Organization ID
 * @returns {object} Stats { totalQr, totalNfc, totalClicks }
 */
function getStatsByOrgId(orgId) {
  const stats = db.get(`
    SELECT 
      COUNT(CASE WHEN type = 'qr' THEN 1 END) as totalQr,
      COUNT(CASE WHEN type = 'nfc' THEN 1 END) as totalNfc,
      SUM(clicks) as totalClicks
    FROM shortlinks 
    WHERE org_id = $orgId
  `, { orgId });
  
  return {
    totalQr: stats?.totalQr || 0,
    totalNfc: stats?.totalNfc || 0,
    totalClicks: stats?.totalClicks || 0
  };
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new shortlink
 * @param {string} orgId - Organization ID
 * @param {string} type - 'qr' or 'nfc'
 * @param {string} targetUrl - Destination URL
 * @param {string} label - User-friendly label
 * @returns {object} Created shortlink
 */
function create(orgId, type, targetUrl, label = '') {
  const code = generateUniqueCode();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO shortlinks (code, org_id, type, target_url, label, created_at)
    VALUES ($code, $orgId, $type, $targetUrl, $label, $now)
  `, {
    code,
    orgId,
    type,
    targetUrl,
    label: label || `${type.toUpperCase()} ${new Date().toLocaleDateString('fr-FR')}`,
    now
  });
  
  return getByCode(code);
}

/**
 * Update shortlink label
 * @param {string} code - Short code
 * @param {string} label - New label
 * @returns {object|null} Updated shortlink
 */
function updateLabel(code, label) {
  db.run(`
    UPDATE shortlinks 
    SET label = $label 
    WHERE code = $code
  `, { code, label });
  
  return getByCode(code);
}

/**
 * Update target URL
 * @param {string} code - Short code
 * @param {string} targetUrl - New target URL
 * @returns {object|null} Updated shortlink
 */
function updateTargetUrl(code, targetUrl) {
  db.run(`
    UPDATE shortlinks 
    SET target_url = $targetUrl 
    WHERE code = $code
  `, { code, targetUrl });
  
  return getByCode(code);
}

/**
 * Increment click counter
 * @param {string} code - Short code
 * @returns {object|null} Updated shortlink
 */
function incrementClicks(code) {
  const now = db.nowISO();
  
  db.run(`
    UPDATE shortlinks 
    SET clicks = clicks + 1, last_clicked_at = $now 
    WHERE code = $code
  `, { code, now });
  
  return getByCode(code);
}

/**
 * Delete a shortlink
 * @param {string} code - Short code
 * @returns {boolean} Success
 */
function remove(code) {
  const result = db.run('DELETE FROM shortlinks WHERE code = $code', { code });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Parse a database row into shortlink object
 * @param {object} row - Database row
 * @returns {object} Shortlink object
 */
function parseRow(row) {
  if (!row) return null;
  
  return {
    code: row.code,
    orgId: row.org_id,
    type: row.type,
    targetUrl: row.target_url,
    label: row.label,
    clicks: row.clicks || 0,
    createdAt: row.created_at,
    lastClickedAt: row.last_clicked_at
  };
}

/**
 * Build full short URL from code
 * @param {string} code - Short code
 * @param {string} baseUrl - Base URL (e.g., "https://reputyapp.com")
 * @returns {string} Full URL (e.g., "https://reputyapp.com/r/Ab3xY9kL")
 */
function buildShortUrl(code, baseUrl) {
  // Remove trailing slash from base URL
  const cleanBase = baseUrl.replace(/\/$/, '');
  return `${cleanBase}/r/${code}`;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Constants
  TYPES,
  CODE_LENGTH,
  
  // Code generation
  generateCode,
  generateUniqueCode,
  
  // Read
  getByCode,
  getByOrgId,
  countByOrgId,
  getStatsByOrgId,
  
  // Write
  create,
  updateLabel,
  updateTargetUrl,
  incrementClicks,
  remove,
  
  // Helpers
  buildShortUrl
};
