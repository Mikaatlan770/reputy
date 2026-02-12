/**
 * Review Request Repository
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get request by internal ID
 * @param {string} id - Internal database ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM review_requests WHERE id = $id', { id });
  return row ? parseRequestRow(row) : null;
}

/**
 * Get request by idempotency key (extension's requestId)
 * @param {string} idempotencyKey - UUID from extension
 * @returns {object|null}
 */
function getByIdempotencyKey(idempotencyKey) {
  const row = db.get(
    'SELECT * FROM review_requests WHERE idempotency_key = $idempotencyKey',
    { idempotencyKey }
  );
  return row ? parseRequestRow(row) : null;
}

/**
 * List requests for an organization
 * @param {string} orgId - Organization ID
 * @param {object} options - { status, channel, limit, offset, since }
 * @returns {array}
 */
function listByOrg(orgId, options = {}) {
  let sql = 'SELECT * FROM review_requests WHERE org_id = $orgId';
  const params = { orgId };
  
  if (options.status) {
    sql += ' AND status = $status';
    params.status = options.status;
  }
  if (options.channel) {
    sql += ' AND channel = $channel';
    params.channel = options.channel;
  }
  if (options.since) {
    sql += ' AND created_at >= $since';
    params.since = options.since;
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
  return rows.map(parseRequestRow);
}

/**
 * Count requests for an organization
 * @param {string} orgId - Organization ID
 * @param {object} options - { status, channel, since }
 * @returns {number}
 */
function countByOrg(orgId, options = {}) {
  let sql = 'SELECT COUNT(*) as count FROM review_requests WHERE org_id = $orgId';
  const params = { orgId };
  
  if (options.status) {
    sql += ' AND status = $status';
    params.status = options.status;
  }
  if (options.channel) {
    sql += ' AND channel = $channel';
    params.channel = options.channel;
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
 * Create or get existing request by idempotency key (IDEMPOTENT)
 * @param {string} idempotencyKey - UUID from extension
 * @param {object} data - Request data (used only if creating)
 * @returns {object} { request, created: boolean }
 */
function createOrGetByIdempotencyKey(idempotencyKey, data) {
  // Check if already exists
  const existing = getByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { request: existing, created: false };
  }
  
  // Create new
  const id = db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO review_requests (
      id, idempotency_key, org_id, channel, status,
      patient_json, feedback_url, meta_json, created_at, updated_at
    ) VALUES (
      $id, $idempotencyKey, $orgId, $channel, $status,
      $patientJson, $feedbackUrl, $metaJson, $createdAt, $updatedAt
    )
  `, {
    id,
    idempotencyKey,
    orgId: data.orgId,
    channel: data.channel || 'email',
    status: data.status || 'created',
    patientJson: db.toJson(data.patient),
    feedbackUrl: data.feedbackUrl || null,
    metaJson: db.toJson(data.meta),
    createdAt: now,
    updatedAt: now
  });
  
  return { request: getById(id), created: true };
}

/**
 * Create a new request (throws if idempotency_key exists)
 * @param {object} data - Request data including idempotencyKey
 * @returns {object} Created request
 */
function create(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO review_requests (
      id, idempotency_key, org_id, channel, status,
      patient_json, feedback_url, meta_json, created_at, updated_at
    ) VALUES (
      $id, $idempotencyKey, $orgId, $channel, $status,
      $patientJson, $feedbackUrl, $metaJson, $createdAt, $updatedAt
    )
  `, {
    id,
    idempotencyKey: data.idempotencyKey,
    orgId: data.orgId,
    channel: data.channel || 'email',
    status: data.status || 'created',
    patientJson: db.toJson(data.patient),
    feedbackUrl: data.feedbackUrl || null,
    metaJson: db.toJson(data.meta),
    createdAt: now,
    updatedAt: now
  });
  
  return getById(id);
}

/**
 * Update request status
 * @param {string} id - Request ID
 * @param {string} status - New status
 * @returns {object|null}
 */
function setStatus(id, status) {
  const now = db.nowISO();
  
  db.run(`
    UPDATE review_requests 
    SET status = $status, updated_at = $updatedAt 
    WHERE id = $id
  `, { id, status, updatedAt: now });
  
  return getById(id);
}

/**
 * Update request
 * @param {string} id - Request ID
 * @param {object} updates - Fields to update
 * @returns {object|null}
 */
function update(id, updates) {
  const request = getById(id);
  if (!request) return null;
  
  const fields = [];
  const params = { id };
  
  if (updates.status !== undefined) {
    fields.push('status = $status');
    params.status = updates.status;
  }
  if (updates.patient !== undefined) {
    fields.push('patient_json = $patientJson');
    params.patientJson = db.toJson(updates.patient);
  }
  if (updates.feedbackUrl !== undefined) {
    fields.push('feedback_url = $feedbackUrl');
    params.feedbackUrl = updates.feedbackUrl;
  }
  if (updates.meta !== undefined) {
    fields.push('meta_json = $metaJson');
    params.metaJson = db.toJson(updates.meta);
  }
  
  if (fields.length === 0) return request;
  
  fields.push('updated_at = $updatedAt');
  params.updatedAt = db.nowISO();
  
  db.run(`UPDATE review_requests SET ${fields.join(', ')} WHERE id = $id`, params);
  
  return getById(id);
}

/**
 * Delete request
 * @param {string} id - Request ID
 * @returns {boolean}
 */
function deleteRequest(id) {
  const result = db.run('DELETE FROM review_requests WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Stats
// ============================================================

/**
 * Get request statistics for an organization
 * @param {string} orgId - Organization ID
 * @param {string} since - ISO date string (optional)
 * @returns {object} { total, byStatus, byChannel }
 */
function getStats(orgId, since) {
  const params = { orgId };
  let whereClause = 'WHERE org_id = $orgId';
  
  if (since) {
    whereClause += ' AND created_at >= $since';
    params.since = since;
  }
  
  const total = db.get(
    `SELECT COUNT(*) as count FROM review_requests ${whereClause}`,
    params
  )?.count || 0;
  
  const byStatus = {};
  const statusRows = db.all(
    `SELECT status, COUNT(*) as count FROM review_requests ${whereClause} GROUP BY status`,
    params
  );
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }
  
  const byChannel = {};
  const channelRows = db.all(
    `SELECT channel, COUNT(*) as count FROM review_requests ${whereClause} GROUP BY channel`,
    params
  );
  for (const row of channelRows) {
    byChannel[row.channel] = row.count;
  }
  
  return { total, byStatus, byChannel };
}

// ============================================================
// Helper Functions
// ============================================================

function parseRequestRow(row) {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    orgId: row.org_id,
    channel: row.channel,
    status: row.status,
    patient: db.parseJson(row.patient_json),
    feedbackUrl: row.feedback_url,
    meta: db.parseJson(row.meta_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Lifecycle timestamps (migration 007)
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    feedbackReceivedAt: row.feedback_received_at,
    publicRedirectedAt: row.public_redirected_at,
  };
}

// ============================================================
// Lifecycle Helpers (migration 007)
// ============================================================

/**
 * Update request lifecycle status with corresponding timestamp.
 * 
 * MONOTONE: transitions only go forward, never backward.
 *   created(0) → queued(1) → sent(2) → feedback_received(3) → public_redirected(4)
 *   created(0) → queued(1) → failed(2)  (terminal branch)
 * 
 * IDEMPOTENT: re-applying same status is a silent no-op.
 * Retrograde transitions are logged and rejected.
 *
 * @param {string} id - Internal request DB ID
 * @param {string} status - queued|sent|failed|feedback_received|public_redirected
 * @returns {object|null}
 */
function setLifecycleStatus(id, status) {
  const TS_MAP = {
    queued: 'queued_at',
    sent: 'sent_at',
    failed: 'failed_at',
    feedback_received: 'feedback_received_at',
    public_redirected: 'public_redirected_at',
  };

  // Monotone ordering (higher = further in lifecycle)
  const ORDER = {
    created: 0,
    queued: 1,
    sent: 2,
    failed: 2,                // same level as sent (terminal branch)
    feedback_received: 3,
    public_redirected: 4,
  };

  const tsColumn = TS_MAP[status];
  if (!tsColumn) {
    // Unknown lifecycle status — fallback to simple status update
    return setStatus(id, status);
  }

  // Guard: check current status and reject retrograde transitions
  const current = getById(id);
  if (!current) return null;

  const currentOrder = ORDER[current.status] ?? -1;
  const targetOrder = ORDER[status] ?? -1;

  // Same status → idempotent no-op
  if (current.status === status) {
    return current;
  }

  // Retrograde → reject silently (log for audit)
  if (targetOrder <= currentOrder) {
    console.log(`[LIFECYCLE] Blocked retrograde: ${current.status}(${currentOrder}) → ${status}(${targetOrder}) for ${id}`);
    return current;
  }

  const now = db.nowISO();
  db.run(`
    UPDATE review_requests 
    SET status = $status, ${tsColumn} = $ts, updated_at = $ts
    WHERE id = $id
  `, { id, status, ts: now });

  return getById(id);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  getByIdempotencyKey,
  listByOrg,
  countByOrg,
  createOrGetByIdempotencyKey,
  create,
  setStatus,
  setLifecycleStatus,
  update,
  delete: deleteRequest,
  getStats
};
