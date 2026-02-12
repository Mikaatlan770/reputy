/**
 * P0.4 - Email Outbox Repository
 *
 * CRUD for email_outbox, email_events, email_unsubscribes tables.
 */

const db = require('../db');

// ============================================================
// EMAIL OUTBOX
// ============================================================

/**
 * Create an outbox entry (queue an email)
 */
function createOutbox(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();

  db.run(`
    INSERT INTO email_outbox (
      id, org_id, to_email, template_key, payload_json,
      status, idempotency_key, scheduled_at, request_db_id, created_at, updated_at
    ) VALUES (
      $id, $orgId, $toEmail, $templateKey, $payloadJson,
      $status, $idempotencyKey, $scheduledAt, $requestDbId, $createdAt, $updatedAt
    )
  `, {
    id,
    orgId: data.orgId,
    toEmail: data.toEmail.toLowerCase().trim(),
    templateKey: data.templateKey,
    payloadJson: db.toJson(data.payload || {}),
    status: data.status || 'pending',
    idempotencyKey: data.idempotencyKey || null,
    scheduledAt: data.scheduledAt || null,
    requestDbId: data.requestDbId || null,
    createdAt: now,
    updatedAt: now,
  });

  return getOutboxById(id);
}

/**
 * Get outbox entry by ID
 */
function getOutboxById(id) {
  const row = db.get('SELECT * FROM email_outbox WHERE id = $id', { id });
  return row ? parseOutboxRow(row) : null;
}

/**
 * Get by idempotency key
 */
function getByIdempotencyKey(key) {
  if (!key) return null;
  const row = db.get('SELECT * FROM email_outbox WHERE idempotency_key = $key', { key });
  return row ? parseOutboxRow(row) : null;
}

/**
 * P0.5: Get outbox entry by SES provider_message_id
 * Used to link SES bounce/complaint/delivery events back to the outbox row
 */
function getByProviderMessageId(providerMessageId) {
  if (!providerMessageId) return null;
  const row = db.get(
    'SELECT * FROM email_outbox WHERE provider_message_id = $msgId LIMIT 1',
    { msgId: providerMessageId }
  );
  return row ? parseOutboxRow(row) : null;
}

/**
 * Get pending emails ready to send
 * @param {number} limit
 */
function getPending(limit = 50) {
  const now = db.nowISO();
  const rows = db.all(`
    SELECT * FROM email_outbox
    WHERE status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= $now)
      AND attempts < 3
    ORDER BY created_at ASC
    LIMIT $limit
  `, { now, limit });
  return rows.map(parseOutboxRow);
}

/**
 * Update outbox status + optional extra fields
 */
function updateStatus(id, status, extra = {}) {
  const now = db.nowISO();
  const fields = ['status = $status', 'updated_at = $updatedAt'];
  const params = { id, status, updatedAt: now };

  if (extra.provider) {
    fields.push('provider = $provider');
    params.provider = extra.provider;
  }
  if (extra.providerMessageId) {
    fields.push('provider_message_id = $providerMessageId');
    params.providerMessageId = extra.providerMessageId;
  }
  if (extra.error) {
    fields.push('error = $error');
    params.error = extra.error;
  }
  if (status === 'sent') {
    fields.push('sent_at = $sentAt');
    params.sentAt = now;
  }

  db.run(`UPDATE email_outbox SET ${fields.join(', ')} WHERE id = $id`, params);
  return getOutboxById(id);
}

/**
 * Increment attempt counter
 */
function incrementAttempts(id) {
  db.run(
    'UPDATE email_outbox SET attempts = attempts + 1, updated_at = $now WHERE id = $id',
    { id, now: db.nowISO() }
  );
}

/**
 * List outbox for an org
 */
function listByOrg(orgId, options = {}) {
  let sql = 'SELECT * FROM email_outbox WHERE org_id = $orgId';
  const params = { orgId };

  if (options.status) {
    sql += ' AND status = $status';
    params.status = options.status;
  }
  sql += ' ORDER BY created_at DESC';
  if (options.limit) {
    sql += ' LIMIT $limit';
    params.limit = options.limit;
  }

  return db.all(sql, params).map(parseOutboxRow);
}

// ============================================================
// EMAIL EVENTS
// ============================================================

/**
 * Record an email event (sent, delivered, bounce, complaint, open, click)
 */
function addEvent(outboxId, eventType, eventData = {}) {
  const id = db.generateId();
  db.run(`
    INSERT INTO email_events (id, outbox_id, event_type, event_json, created_at)
    VALUES ($id, $outboxId, $eventType, $eventJson, $createdAt)
  `, {
    id,
    outboxId,
    eventType,
    eventJson: db.toJson(eventData),
    createdAt: db.nowISO(),
  });
  return { id, outboxId, eventType };
}

/**
 * Get events for an outbox entry
 */
function getEvents(outboxId) {
  return db.all(
    'SELECT * FROM email_events WHERE outbox_id = $outboxId ORDER BY created_at ASC',
    { outboxId }
  ).map(row => ({
    id: row.id,
    outboxId: row.outbox_id,
    eventType: row.event_type,
    eventData: db.parseJson(row.event_json),
    createdAt: row.created_at,
  }));
}

// ============================================================
// EMAIL UNSUBSCRIBES
// ============================================================

/**
 * Add unsubscribe record (idempotent — UNIQUE constraint on org_id+email)
 */
function addUnsubscribe(orgId, email, reason = 'user_request', tokenHash = null) {
  const id = db.generateId();
  try {
    db.run(`
      INSERT INTO email_unsubscribes (id, org_id, email, reason, token_hash, created_at)
      VALUES ($id, $orgId, $email, $reason, $tokenHash, $createdAt)
    `, {
      id,
      orgId,
      email: email.toLowerCase().trim(),
      reason,
      tokenHash,
      createdAt: db.nowISO(),
    });
    return { id, orgId, email, reason };
  } catch (err) {
    // UNIQUE constraint = already unsubscribed → OK
    if (err.message?.includes('UNIQUE')) {
      return { id: null, orgId, email, reason: 'already_unsubscribed' };
    }
    throw err;
  }
}

/**
 * Check if an email is unsubscribed for a given org
 */
function isUnsubscribed(orgId, email) {
  const row = db.get(
    'SELECT id FROM email_unsubscribes WHERE org_id = $orgId AND email = $email',
    { orgId, email: email.toLowerCase().trim() }
  );
  return !!row;
}

/**
 * Remove unsubscribe (re-subscribe)
 */
function removeUnsubscribe(orgId, email) {
  const result = db.run(
    'DELETE FROM email_unsubscribes WHERE org_id = $orgId AND email = $email',
    { orgId, email: email.toLowerCase().trim() }
  );
  return result.changes > 0;
}

// ============================================================
// HELPERS
// ============================================================

function parseOutboxRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    toEmail: row.to_email,
    templateKey: row.template_key,
    payload: db.parseJson(row.payload_json),
    status: row.status,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    error: row.error,
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requestDbId: row.request_db_id,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Outbox
  createOutbox,
  getOutboxById,
  getByIdempotencyKey,
  getByProviderMessageId,
  getPending,
  updateStatus,
  incrementAttempts,
  listByOrg,
  // Events
  addEvent,
  getEvents,
  // Unsubscribes
  addUnsubscribe,
  isUnsubscribed,
  removeUnsubscribe,
};
