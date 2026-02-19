/**
 * Scheduled Send Repository — SMS only
 *
 * Manages the scheduled_sends table for delayed SMS delivery (60 min delay).
 * Email continues to use email_outbox exclusively.
 *
 * Anti-spam:
 *   - Max 1 SMS per recipient per 7 days (per org)
 *   - Idempotence: 1 SMS per request_db_id
 */

'use strict';

const db = require('../db');

// ── Constants ────────────────────────────────────────────────

const SMS_DELAY_MINUTES = 60;       // Delay before sending
const ANTI_SPAM_DAYS = 7;           // Min days between SMS to same recipient (per org)

// ── Create ───────────────────────────────────────────────────

/**
 * Create a scheduled SMS send entry.
 * The SMS will be sent by the cron worker after `scheduledFor`.
 *
 * @param {object} data
 * @param {string} data.orgId
 * @param {string} data.recipient      — phone number
 * @param {object} [data.payload]      — { patientName, requestId, ... }
 * @param {string} [data.requestDbId]  — review_requests.id (for idempotence)
 * @param {number} [data.delayMinutes] — override delay (default: 60)
 * @returns {object} Created entry
 */
function create(data) {
  const id = db.generateId();
  const now = db.nowISO();
  const delayMs = (data.delayMinutes || SMS_DELAY_MINUTES) * 60 * 1000;
  const scheduledFor = new Date(Date.now() + delayMs).toISOString();

  db.run(`
    INSERT INTO scheduled_sends (
      id, org_id, channel, recipient, payload_json,
      request_db_id, status, scheduled_for, attempts,
      max_attempts, created_at, updated_at
    ) VALUES (
      $id, $orgId, 'sms', $recipient, $payloadJson,
      $requestDbId, 'pending', $scheduledFor, 0,
      3, $createdAt, $updatedAt
    )
  `, {
    id,
    orgId: data.orgId,
    recipient: data.recipient,
    payloadJson: db.toJson(data.payload || {}),
    requestDbId: data.requestDbId || null,
    scheduledFor,
    createdAt: now,
    updatedAt: now,
  });

  return getById(id);
}

// ── Read ─────────────────────────────────────────────────────

/**
 * Get a scheduled send by ID.
 */
function getById(id) {
  const row = db.get('SELECT * FROM scheduled_sends WHERE id = $id', { id });
  return row ? parseRow(row) : null;
}

/**
 * Get pending sends that are due (scheduled_for <= now, status = 'pending').
 * Used by the cron worker.
 *
 * @param {number} [limit=50]
 * @returns {object[]}
 */
function getPending(limit = 50) {
  const now = db.nowISO();
  const rows = db.all(`
    SELECT * FROM scheduled_sends
    WHERE status = 'pending'
      AND scheduled_for <= $now
      AND attempts < max_attempts
    ORDER BY scheduled_for ASC
    LIMIT $limit
  `, { now, limit });
  return rows.map(parseRow);
}

/**
 * List sends for an org.
 */
function listByOrg(orgId, options = {}) {
  let sql = 'SELECT * FROM scheduled_sends WHERE org_id = $orgId';
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

  return db.all(sql, params).map(parseRow);
}

// ── Update ───────────────────────────────────────────────────

/**
 * Update status (and optional extra fields).
 */
function updateStatus(id, status, extra = {}) {
  const now = db.nowISO();
  const fields = ['status = $status', 'updated_at = $updatedAt'];
  const params = { id, status, updatedAt: now };

  if (extra.error) {
    fields.push('last_error = $lastError');
    params.lastError = extra.error;
  }
  if (status === 'sent') {
    fields.push('sent_at = $sentAt');
    params.sentAt = now;
  }

  db.run(`UPDATE scheduled_sends SET ${fields.join(', ')} WHERE id = $id`, params);
  return getById(id);
}

/**
 * Increment attempt counter (call BEFORE the actual send attempt).
 */
function incrementAttempts(id) {
  db.run(
    'UPDATE scheduled_sends SET attempts = attempts + 1, updated_at = $now WHERE id = $id',
    { id, now: db.nowISO() }
  );
}

/**
 * Cancel a pending send.
 */
function cancel(id) {
  return updateStatus(id, 'cancelled');
}

// ── Anti-spam / Idempotence ──────────────────────────────────

/**
 * Idempotence: check if a send already exists for this request_db_id.
 * If already queued/sending/sent → skip (don't create duplicate).
 *
 * @param {string} requestDbId
 * @returns {boolean} true if already exists (should skip)
 */
function hasExistingForRequest(requestDbId) {
  if (!requestDbId) return false;
  const row = db.get(`
    SELECT COUNT(*) as cnt FROM scheduled_sends
    WHERE request_db_id = $requestDbId
      AND status IN ('pending', 'sending', 'sent')
  `, { requestDbId });
  return (row?.cnt || 0) > 0;
}

/**
 * Anti-spam: check if a recipient has received an SMS recently (per org).
 * Block if sent within ANTI_SPAM_DAYS days.
 *
 * @param {string} orgId
 * @param {string} recipient — phone number
 * @returns {boolean} true if recent send exists (should block)
 */
function hasRecentSend(orgId, recipient) {
  if (!orgId || !recipient) return false;
  const since = new Date(Date.now() - ANTI_SPAM_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const row = db.get(`
    SELECT COUNT(*) as cnt FROM scheduled_sends
    WHERE org_id = $orgId
      AND recipient = $recipient
      AND status IN ('pending', 'sending', 'sent')
      AND created_at >= $since
  `, { orgId, recipient, since });
  return (row?.cnt || 0) > 0;
}

// ── Helpers ──────────────────────────────────────────────────

function parseRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    channel: row.channel,
    recipient: row.recipient,
    payload: db.parseJson(row.payload_json),
    requestDbId: row.request_db_id,
    status: row.status,
    scheduledFor: row.scheduled_for,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  create,
  getById,
  getPending,
  listByOrg,
  updateStatus,
  incrementAttempts,
  cancel,
  hasExistingForRequest,
  hasRecentSend,
  SMS_DELAY_MINUTES,
  ANTI_SPAM_DAYS,
};
