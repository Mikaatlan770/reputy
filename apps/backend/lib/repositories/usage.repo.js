/**
 * Usage Ledger Repository
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get ledger entry by ID
 * @param {string} id - Entry ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM usage_ledger WHERE id = $id', { id });
  return row ? parseUsageRow(row) : null;
}

/**
 * List usage for an organization
 * @param {string} orgId - Organization ID
 * @param {object} options - { type, since, until, limit, offset }
 * @returns {array}
 */
function listByOrg(orgId, options = {}) {
  let sql = 'SELECT * FROM usage_ledger WHERE org_id = $orgId';
  const params = { orgId };
  
  if (options.type) {
    sql += ' AND type = $type';
    params.type = options.type;
  }
  if (options.since) {
    sql += ' AND created_at >= $since';
    params.since = options.since;
  }
  if (options.until) {
    sql += ' AND created_at < $until';
    params.until = options.until;
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
  return rows.map(parseUsageRow);
}

/**
 * Get usage summary for an organization
 * @param {string} orgId - Organization ID
 * @param {string} since - ISO date (start of period)
 * @param {string} until - ISO date (end of period, optional)
 * @returns {object} { sms: number, email: number, ai: number, total: number }
 */
function getSummary(orgId, since, until) {
  let sql = `
    SELECT type, SUM(qty) as total
    FROM usage_ledger
    WHERE org_id = $orgId AND created_at >= $since
  `;
  const params = { orgId, since };
  
  if (until) {
    sql += ' AND created_at < $until';
    params.until = until;
  }
  
  sql += ' GROUP BY type';
  
  const rows = db.all(sql, params);
  
  const summary = { sms: 0, email: 0, ai: 0, total: 0 };
  for (const row of rows) {
    summary[row.type] = row.total || 0;
    summary.total += row.total || 0;
  }
  
  return summary;
}

/**
 * Get daily usage breakdown
 * @param {string} orgId - Organization ID
 * @param {string} since - ISO date
 * @param {string} until - ISO date (optional)
 * @returns {array} [{ date, type, qty }]
 */
function getDailyBreakdown(orgId, since, until) {
  let sql = `
    SELECT 
      date(created_at) as date,
      type,
      SUM(qty) as qty
    FROM usage_ledger
    WHERE org_id = $orgId AND created_at >= $since
  `;
  const params = { orgId, since };
  
  if (until) {
    sql += ' AND created_at < $until';
    params.until = until;
  }
  
  sql += ' GROUP BY date(created_at), type ORDER BY date';
  
  return db.all(sql, params);
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Add a ledger entry
 * @param {object} data - { orgId, type, qty, details }
 * @returns {object} Created entry
 */
function addEntry(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO usage_ledger (
      id, org_id, type, qty, details_json, created_at
    ) VALUES (
      $id, $orgId, $type, $qty, $detailsJson, $createdAt
    )
  `, {
    id,
    orgId: data.orgId,
    type: data.type,
    qty: data.qty || 1,
    detailsJson: db.toJson(data.details || {}),
    createdAt: data.createdAt || now
  });
  
  return getById(id);
}

/**
 * Record SMS usage
 * @param {string} orgId - Organization ID
 * @param {number} qty - Quantity (default 1)
 * @param {object} details - Optional details
 * @returns {object}
 */
function recordSms(orgId, qty = 1, details = {}) {
  return addEntry({ orgId, type: 'sms', qty, details });
}

/**
 * Record email usage
 * @param {string} orgId - Organization ID
 * @param {number} qty - Quantity (default 1)
 * @param {object} details - Optional details
 * @returns {object}
 */
function recordEmail(orgId, qty = 1, details = {}) {
  return addEntry({ orgId, type: 'email', qty, details });
}

/**
 * Record AI usage
 * @param {string} orgId - Organization ID
 * @param {number} qty - Quantity (default 1)
 * @param {object} details - Optional details
 * @returns {object}
 */
function recordAi(orgId, qty = 1, details = {}) {
  return addEntry({ orgId, type: 'ai', qty, details });
}

/**
 * Delete entry
 * @param {string} id - Entry ID
 * @returns {boolean}
 */
function deleteEntry(id) {
  const result = db.run('DELETE FROM usage_ledger WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

function parseUsageRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type,
    qty: row.qty,
    details: db.parseJson(row.details_json),
    createdAt: row.created_at
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  listByOrg,
  getSummary,
  getDailyBreakdown,
  addEntry,
  recordSms,
  recordEmail,
  recordAi,
  delete: deleteEntry
};
