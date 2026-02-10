/**
 * P0.4 + P0.6 - Email Quotas & Rate Limiting
 *
 * Checks plan-based email quotas and applies per-org rate limiting.
 * P0.6: checkRateLimit now accepts optional overrides for warm-up limits.
 */

const db = require('../db');
const { getPlanQuotas, normalizePlanCode } = require('../billing/plan-catalog');

// Configurable global per-org limits
const EMAIL_MAX_PER_HOUR = parseInt(process.env.EMAIL_MAX_PER_HOUR || '50', 10);
const EMAIL_MAX_PER_DAY = parseInt(process.env.EMAIL_MAX_PER_DAY || '200', 10);

/**
 * Check if an org has remaining email quota for current billing cycle
 * @param {object} org - Parsed org object (with plan, quotas, balances, subscriptionCredits)
 * @returns {{ allowed: boolean, used: number, limit: number, reason?: string }}
 */
function checkEmailQuota(org) {
  const planCode = normalizePlanCode(org.plan?.code);
  const planQuotas = getPlanQuotas(planCode);
  const emailLimit = planQuotas.emailIncluded || 0;

  if (emailLimit <= 0) {
    return { allowed: false, used: 0, limit: 0, reason: 'plan_no_email' };
  }

  // Current cycle start (from subscriptionCredits or fallback to month start)
  const cycleStart = org.subscriptionCredits?.cycleStart || getMonthStart();
  const used = countEmailsSentSince(org.id, cycleStart);

  // Pack wallet extras
  const extraEmails = (org.balances?.email || 0);
  const totalLimit = emailLimit + extraEmails;

  if (used >= totalLimit) {
    return { allowed: false, used, limit: totalLimit, reason: 'quota_exceeded' };
  }

  return { allowed: true, used, limit: totalLimit };
}

/**
 * Per-org rate limiting (anti-spam + SES warm-up)
 *
 * P0.6: accepts optional overrides for warm-up throttling.
 * Effective limits = min(global, override) for each dimension.
 *
 * @param {string} orgId
 * @param {object} [overrides] - Optional warm-up overrides
 * @param {number} [overrides.maxPerHour] - Warm-up hourly limit
 * @param {number} [overrides.maxPerDay]  - Warm-up daily limit
 * @returns {{
 *   allowed: boolean,
 *   reason?: string,
 *   hourCount: number,
 *   dayCount: number,
 *   limits: { hour: number, day: number }
 * }}
 */
function checkRateLimit(orgId, overrides) {
  // Effective limits = min(global, warm-up override)
  const effectiveHour = overrides?.maxPerHour != null
    ? Math.min(EMAIL_MAX_PER_HOUR, overrides.maxPerHour)
    : EMAIL_MAX_PER_HOUR;
  const effectiveDay = overrides?.maxPerDay != null
    ? Math.min(EMAIL_MAX_PER_DAY, overrides.maxPerDay)
    : EMAIL_MAX_PER_DAY;

  const now = new Date();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Count emails sent in last hour
  const hourRow = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox
     WHERE org_id = $orgId AND status IN ('sent','sending') AND sent_at >= $since`,
    { orgId, since: oneHourAgo }
  );
  const hourCount = hourRow?.cnt || 0;

  if (hourCount >= effectiveHour) {
    return {
      allowed: false,
      reason: overrides?.maxPerHour != null ? 'warmup_limit_hour' : 'rate_limit_hour',
      hourCount,
      dayCount: null,
      limits: { hour: effectiveHour, day: effectiveDay },
    };
  }

  // Count emails sent in last 24h
  const dayRow = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox
     WHERE org_id = $orgId AND status IN ('sent','sending') AND sent_at >= $since`,
    { orgId, since: oneDayAgo }
  );
  const dayCount = dayRow?.cnt || 0;

  if (dayCount >= effectiveDay) {
    return {
      allowed: false,
      reason: overrides?.maxPerDay != null ? 'warmup_limit_day' : 'rate_limit_day',
      hourCount,
      dayCount,
      limits: { hour: effectiveHour, day: effectiveDay },
    };
  }

  return {
    allowed: true,
    hourCount,
    dayCount,
    limits: { hour: effectiveHour, day: effectiveDay },
  };
}

/**
 * Count emails sent by org since a given ISO date
 */
function countEmailsSentSince(orgId, since) {
  const row = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox
     WHERE org_id = $orgId AND status = 'sent' AND sent_at >= $since`,
    { orgId, since }
  );
  return row?.cnt || 0;
}

function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

module.exports = {
  checkEmailQuota,
  checkRateLimit,
  countEmailsSentSince,
  EMAIL_MAX_PER_HOUR,
  EMAIL_MAX_PER_DAY,
};
