/**
 * AI Auto-Reply Repository — Reputy
 *
 * Manages the ai_auto_replies tracking table.
 * Records every auto-reply attempt (template or AI), status, and token usage.
 *
 * Retry logic:
 *   - No UNIQUE(review_id) — allows retry rows
 *   - getEligibleReviews() excludes reviews with status 'success' or 'pending'
 *   - Failed entries (attempts < 2) can be retried on next cron run
 */

'use strict';

const db = require('../db');

// ── Create ───────────────────────────────────────────────────

/**
 * Create a tracking entry for an auto-reply attempt.
 *
 * @param {object} data
 * @param {string} data.orgId
 * @param {string} data.reviewId
 * @param {number} data.rating
 * @param {string} data.model       — 'gpt-4.1-mini', 'template', etc.
 * @param {string} [data.status]    — 'pending' (default), 'success', 'failed', 'skipped'
 * @param {string} [data.responseText]
 * @param {number} [data.inputTokensEst]
 * @param {number} [data.outputTokensEst]
 * @param {number} [data.temperature]
 * @param {number} [data.attempts]  — initial attempts count (default 0)
 * @param {string} [data.error]
 * @returns {object} Created entry
 */
function create(data) {
  const id = db.generateId();
  const now = db.nowISO();

  db.run(`
    INSERT INTO ai_auto_replies (
      id, org_id, review_id, rating, model,
      input_tokens_est, output_tokens_est, temperature,
      status, response_text, error, attempts, created_at
    ) VALUES (
      $id, $orgId, $reviewId, $rating, $model,
      $inputTokensEst, $outputTokensEst, $temperature,
      $status, $responseText, $error, $attempts, $createdAt
    )
  `, {
    id,
    orgId: data.orgId,
    reviewId: data.reviewId,
    rating: data.rating,
    model: data.model,
    inputTokensEst: data.inputTokensEst || 0,
    outputTokensEst: data.outputTokensEst || 0,
    temperature: data.temperature || 0.4,
    status: data.status || 'pending',
    responseText: data.responseText || null,
    error: data.error || null,
    attempts: data.attempts || 0,
    createdAt: now,
  });

  return getById(id);
}

// ── Read ─────────────────────────────────────────────────────

/**
 * Get entry by ID.
 */
function getById(id) {
  const row = db.get('SELECT * FROM ai_auto_replies WHERE id = $id', { id });
  return row ? parseRow(row) : null;
}

/**
 * Get the latest entry for a review (for retry check).
 *
 * @param {string} reviewId
 * @returns {object|null}
 */
function getByReviewId(reviewId) {
  const row = db.get(`
    SELECT * FROM ai_auto_replies
    WHERE review_id = $reviewId
    ORDER BY created_at DESC
    LIMIT 1
  `, { reviewId });
  return row ? parseRow(row) : null;
}

/**
 * Get reviews eligible for auto-reply.
 *
 * Criteria:
 *   - rating >= 4
 *   - reply_status IS NULL or 'none' (excludes 'draft', 'queued', 'sent')
 *   - reply_text IS NULL
 *   - No existing ai_auto_reply with status 'success' or 'pending'
 *   - Failed entries with attempts >= 2 are also excluded (max retry)
 *
 * @param {number} [limit=20]
 * @returns {object[]} Raw review rows from DB
 */
function getEligibleReviews(limit = 20) {
  const rows = db.all(`
    SELECT r.* FROM reviews r
    LEFT JOIN ai_auto_replies a
      ON a.review_id = r.id
      AND a.status IN ('success', 'pending')
    LEFT JOIN ai_auto_replies af
      ON af.review_id = r.id
      AND af.status = 'failed'
      AND af.attempts >= 2
    WHERE r.rating >= 4
      AND (r.reply_status IS NULL OR r.reply_status = 'none')
      AND r.reply_text IS NULL
      AND a.id IS NULL
      AND af.id IS NULL
    ORDER BY r.created_at ASC
    LIMIT $limit
  `, { limit });
  return rows;
}

// ── Update ───────────────────────────────────────────────────

/**
 * Update status of an entry (without touching attempts).
 *
 * @param {string} id
 * @param {string} status — 'success', 'failed', 'skipped'
 * @param {object} [extra] — { responseText, error, inputTokensEst, outputTokensEst, model }
 * @returns {object|null}
 */
function updateStatus(id, status, extra = {}) {
  const fields = ['status = $status'];
  const params = { id, status };

  if (extra.responseText !== undefined) {
    fields.push('response_text = $responseText');
    params.responseText = extra.responseText;
  }
  if (extra.error !== undefined) {
    fields.push('error = $error');
    params.error = extra.error;
  }
  if (extra.inputTokensEst !== undefined) {
    fields.push('input_tokens_est = $inputTokensEst');
    params.inputTokensEst = extra.inputTokensEst;
  }
  if (extra.outputTokensEst !== undefined) {
    fields.push('output_tokens_est = $outputTokensEst');
    params.outputTokensEst = extra.outputTokensEst;
  }
  if (extra.model !== undefined) {
    fields.push('model = $model');
    params.model = extra.model;
  }

  db.run(`UPDATE ai_auto_replies SET ${fields.join(', ')} WHERE id = $id`, params);
  return getById(id);
}

/**
 * Increment attempt counter (call BEFORE the actual AI call).
 * Separate from updateStatus to avoid incrementing on status-only changes.
 *
 * @param {string} id
 */
function incrementAttempts(id) {
  db.run('UPDATE ai_auto_replies SET attempts = attempts + 1 WHERE id = $id', { id });
}

// ── Stats ────────────────────────────────────────────────────

/**
 * Get auto-reply stats for an org.
 *
 * @param {string} orgId
 * @returns {{ total: number, success: number, failed: number, skipped: number, templateCount: number }}
 */
function getStats(orgId) {
  const row = db.get(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'success' THEN 1 END) as success,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
      COUNT(CASE WHEN model = 'template' THEN 1 END) as templateCount,
      SUM(CASE WHEN status = 'success' THEN input_tokens_est ELSE 0 END) as totalInputTokens,
      SUM(CASE WHEN status = 'success' THEN output_tokens_est ELSE 0 END) as totalOutputTokens
    FROM ai_auto_replies
    WHERE org_id = $orgId
  `, { orgId });

  return {
    total: row?.total || 0,
    success: row?.success || 0,
    failed: row?.failed || 0,
    skipped: row?.skipped || 0,
    templateCount: row?.templateCount || 0,
    totalInputTokens: row?.totalInputTokens || 0,
    totalOutputTokens: row?.totalOutputTokens || 0,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function parseRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    reviewId: row.review_id,
    rating: row.rating,
    model: row.model,
    inputTokensEst: row.input_tokens_est,
    outputTokensEst: row.output_tokens_est,
    temperature: row.temperature,
    status: row.status,
    responseText: row.response_text,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  create,
  getById,
  getByReviewId,
  getEligibleReviews,
  updateStatus,
  incrementAttempts,
  getStats,
};
