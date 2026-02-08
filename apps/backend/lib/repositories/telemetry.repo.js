/**
 * Telemetry Events Repository
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get event by ID
 * @param {string} id - Event ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM telemetry_events WHERE id = $id', { id });
  return row ? parseEventRow(row) : null;
}

/**
 * List recent events
 * @param {object} options - { orgId, source, level, limit, offset, since }
 * @returns {array}
 */
function listRecent(options = {}) {
  let sql = 'SELECT * FROM telemetry_events WHERE 1=1';
  const params = {};
  
  if (options.orgId) {
    sql += ' AND org_id = $orgId';
    params.orgId = options.orgId;
  }
  if (options.source) {
    sql += ' AND source = $source';
    params.source = options.source;
  }
  if (options.level) {
    sql += ' AND level = $level';
    params.level = options.level;
  }
  if (options.since) {
    sql += ' AND created_at >= $since';
    params.since = options.since;
  }
  
  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT ${options.limit || 100}`;
  
  if (options.offset) {
    sql += ` OFFSET ${options.offset}`;
  }
  
  const rows = db.all(sql, params);
  return rows.map(parseEventRow);
}

/**
 * Count events
 * @param {object} options - { orgId, source, level, since }
 * @returns {number}
 */
function count(options = {}) {
  let sql = 'SELECT COUNT(*) as count FROM telemetry_events WHERE 1=1';
  const params = {};
  
  if (options.orgId) {
    sql += ' AND org_id = $orgId';
    params.orgId = options.orgId;
  }
  if (options.source) {
    sql += ' AND source = $source';
    params.source = options.source;
  }
  if (options.level) {
    sql += ' AND level = $level';
    params.level = options.level;
  }
  if (options.since) {
    sql += ' AND created_at >= $since';
    params.since = options.since;
  }
  
  const result = db.get(sql, params);
  return result?.count || 0;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Add an event
 * @param {object} data - { orgId, source, level, data }
 * @returns {object} Created event
 */
function addEvent(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO telemetry_events (
      id, org_id, source, level, data_json, created_at
    ) VALUES (
      $id, $orgId, $source, $level, $dataJson, $createdAt
    )
  `, {
    id,
    orgId: data.orgId || null,
    source: data.source || 'unknown',
    level: data.level || 'info',
    dataJson: db.toJson(data.data || {}),
    createdAt: now
  });
  
  return getById(id);
}

/**
 * Log info event
 * @param {string} orgId - Organization ID (optional)
 * @param {string} source - Event source
 * @param {object} data - Event data
 * @returns {object}
 */
function logInfo(orgId, source, data) {
  return addEvent({ orgId, source, level: 'info', data });
}

/**
 * Log warning event
 * @param {string} orgId - Organization ID (optional)
 * @param {string} source - Event source
 * @param {object} data - Event data
 * @returns {object}
 */
function logWarn(orgId, source, data) {
  return addEvent({ orgId, source, level: 'warn', data });
}

/**
 * Log error event
 * @param {string} orgId - Organization ID (optional)
 * @param {string} source - Event source
 * @param {object} data - Event data
 * @returns {object}
 */
function logError(orgId, source, data) {
  return addEvent({ orgId, source, level: 'error', data });
}

/**
 * Clean up old events (keep last N days)
 * @param {number} days - Days to keep (default 30)
 * @returns {number} Number of events deleted
 */
function cleanup(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.run(
    'DELETE FROM telemetry_events WHERE created_at < $cutoff',
    { cutoff }
  );
  return result.changes;
}

/**
 * Delete event
 * @param {string} id - Event ID
 * @returns {boolean}
 */
function deleteEvent(id) {
  const result = db.run('DELETE FROM telemetry_events WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

function parseEventRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    source: row.source,
    level: row.level,
    data: db.parseJson(row.data_json),
    createdAt: row.created_at
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  listRecent,
  count,
  addEvent,
  logInfo,
  logWarn,
  logError,
  cleanup,
  delete: deleteEvent
};
