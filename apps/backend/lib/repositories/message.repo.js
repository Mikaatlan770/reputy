/**
 * Message Repository (SMS/Email delivery tracking)
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get message by ID
 * @param {string} id - Message ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM messages WHERE id = $id', { id });
  return row ? parseMessageRow(row) : null;
}

/**
 * Get messages by request DB ID
 * @param {string} requestDbId - Review request ID
 * @returns {array}
 */
function listByRequestDbId(requestDbId) {
  const rows = db.all(
    'SELECT * FROM messages WHERE request_db_id = $requestDbId ORDER BY created_at',
    { requestDbId }
  );
  return rows.map(parseMessageRow);
}

/**
 * Get messages by status
 * @param {string} status - Message status (queued/sent/failed)
 * @param {number} limit - Max messages to return
 * @returns {array}
 */
function listByStatus(status, limit = 100) {
  const rows = db.all(`
    SELECT * FROM messages 
    WHERE status = $status 
    ORDER BY created_at 
    LIMIT $limit
  `, { status, limit });
  return rows.map(parseMessageRow);
}

/**
 * Get queued messages for processing
 * @param {number} limit - Max messages to return
 * @returns {array}
 */
function getQueued(limit = 50) {
  return listByStatus('queued', limit);
}

/**
 * Count messages by status
 * @param {object} options - { status, channel, since }
 * @returns {number}
 */
function count(options = {}) {
  let sql = 'SELECT COUNT(*) as count FROM messages WHERE 1=1';
  const params = {};
  
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
 * Create a message
 * @param {object} data - Message data
 * @returns {object} Created message
 */
function create(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO messages (
      id, request_db_id, channel, recipient, status,
      provider_message_id, error_code, error_message, created_at, sent_at
    ) VALUES (
      $id, $requestDbId, $channel, $recipient, $status,
      $providerMessageId, $errorCode, $errorMessage, $createdAt, $sentAt
    )
  `, {
    id,
    requestDbId: data.requestDbId,
    channel: data.channel,
    recipient: data.recipient,
    status: data.status || 'queued',
    providerMessageId: data.providerMessageId || null,
    errorCode: data.errorCode || null,
    errorMessage: data.errorMessage || null,
    createdAt: now,
    sentAt: data.sentAt || null
  });
  
  return getById(id);
}

/**
 * Update message status
 * @param {string} id - Message ID
 * @param {string} status - New status (queued/sent/failed)
 * @param {object} extra - Optional { providerMessageId, errorCode, errorMessage }
 * @returns {object|null}
 */
function setStatus(id, status, extra = {}) {
  const fields = ['status = $status'];
  const params = { id, status };
  
  if (status === 'sent') {
    fields.push('sent_at = $sentAt');
    params.sentAt = db.nowISO();
  }
  
  if (extra.providerMessageId !== undefined) {
    fields.push('provider_message_id = $providerMessageId');
    params.providerMessageId = extra.providerMessageId;
  }
  if (extra.errorCode !== undefined) {
    fields.push('error_code = $errorCode');
    params.errorCode = extra.errorCode;
  }
  if (extra.errorMessage !== undefined) {
    fields.push('error_message = $errorMessage');
    params.errorMessage = extra.errorMessage;
  }
  
  db.run(`UPDATE messages SET ${fields.join(', ')} WHERE id = $id`, params);
  
  return getById(id);
}

/**
 * Mark message as sent
 * @param {string} id - Message ID
 * @param {string} providerMessageId - Optional provider message ID
 * @returns {object|null}
 */
function markSent(id, providerMessageId = null) {
  return setStatus(id, 'sent', { providerMessageId });
}

/**
 * Mark message as failed
 * @param {string} id - Message ID
 * @param {string} errorCode - Error code
 * @param {string} errorMessage - Error message
 * @returns {object|null}
 */
function markFailed(id, errorCode, errorMessage) {
  return setStatus(id, 'failed', { errorCode, errorMessage });
}

/**
 * Delete message
 * @param {string} id - Message ID
 * @returns {boolean}
 */
function deleteMessage(id) {
  const result = db.run('DELETE FROM messages WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

function parseMessageRow(row) {
  return {
    id: row.id,
    requestDbId: row.request_db_id,
    channel: row.channel,
    recipient: row.recipient,
    status: row.status,
    providerMessageId: row.provider_message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  listByRequestDbId,
  listByStatus,
  getQueued,
  count,
  create,
  setStatus,
  markSent,
  markFailed,
  delete: deleteMessage
};
