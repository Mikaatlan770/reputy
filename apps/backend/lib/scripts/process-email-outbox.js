#!/usr/bin/env node
/**
 * P0.4 + P0.6 - Email Outbox Processor (Worker/Job)
 *
 * Fetches pending emails, applies unsub + quota + warm-up + rate limit, sends, logs events.
 *
 * Usage:
 *   cd apps/backend
 *   node lib/scripts/process-email-outbox.js              # up to 50
 *   node lib/scripts/process-email-outbox.js --limit=10   # up to 10
 *   node lib/scripts/process-email-outbox.js --dry        # force dry-run
 *
 * Designed to be called by cron (e.g. every 1-5 minutes).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../db');
const logger = require('../logger');
const emailOutboxRepo = require('../repositories/email-outbox.repo');
const orgRepo = require('../repositories/org.repo');
const usageRepo = require('../repositories/usage.repo');
const emailProvider = require('../email/provider');
const emailTemplates = require('../email/templates');
const emailQuotas = require('../email/quotas');
const emailSigner = require('../email/signer');
const emailWarmup = require('../email/warmup');

const heartbeatRepo = require('../repositories/worker-heartbeat.repo');
const cronLocks = require('../repositories/cron-locks.repo');
const sentry = require('../sentry');
sentry.setTag('worker', 'email_worker');

const REVIEWS_BASE_URL = process.env.REVIEWS_BASE_URL || 'http://127.0.0.1:8787';
const WORKER_NAME = 'email_worker';
const LOCK_TTL_SECONDS = 600; // 10 min
const lockOwner = cronLocks.makeOwner();

// ============ CLI ARGS ============
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;
const FORCE_DRY = args.includes('--dry');

console.log('='.repeat(60));
console.log('📧 REPUTY EMAIL OUTBOX PROCESSOR');
console.log('='.repeat(60));
console.log(`Batch limit: ${BATCH_LIMIT}`);
console.log(`Provider:    ${FORCE_DRY ? 'FORCED DRY-RUN' : emailProvider.EMAIL_PROVIDER}`);
console.log(`Dry-run:     ${FORCE_DRY || emailProvider.EMAIL_DRY_RUN}`);
console.log(`Warm-up:     ${emailWarmup.EMAIL_WARMUP_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log();

// ============ P1.6: MESSAGING KILL SWITCH ============
const MESSAGING_DISABLED = ['1', 'true'].includes((process.env.MESSAGING_DISABLED || '').toLowerCase());
if (MESSAGING_DISABLED) {
  console.warn('⚠️  MESSAGING_DISABLED=true — worker exiting without processing.');
  process.exit(0);
}

// ============ INIT DB ============
// Ensure schema + migrations are applied (tables must exist)
if (!db.isInitialized()) {
  console.error('❌ Database not initialized. Run "npm run db:init && npm run db:migrate-v2" first.');
  process.exit(1);
}

// ============ CRON LOCK ============
if (!cronLocks.acquire(WORKER_NAME, LOCK_TTL_SECONDS, lockOwner)) {
  const existing = cronLocks.getInfo(WORKER_NAME);
  console.log(`⏳ Lock held by ${existing?.owner || '?'} until ${existing?.lockedUntil || '?'} — skipping this run`);
  process.exit(0);
}
console.log(`🔒 Lock acquired (owner: ${lockOwner}, TTL: ${LOCK_TTL_SECONDS}s)`);

// ============ LIFECYCLE HELPER ============

/**
 * Update review_request lifecycle after email send/fail.
 * Idempotent: only updates if status is still created/queued.
 * On first 'sent', also sets orgs.activated_at if null.
 */
function updateRequestLifecycle(entry, newStatus) {
  if (!entry.requestDbId) return;

  const now = db.nowISO();
  const tsCol = newStatus === 'sent' ? 'sent_at'
              : newStatus === 'failed' ? 'failed_at'
              : null;
  if (!tsCol) return;

  try {
    db.run(`
      UPDATE review_requests 
      SET status = $status, ${tsCol} = $now, updated_at = $now
      WHERE id = $id AND status IN ('created', 'queued')
    `, { id: entry.requestDbId, status: newStatus, now });

    // First sent → set orgs.activated_at = MIN(sent_at) (overrides proxy)
    if (newStatus === 'sent') {
      db.run(`
        UPDATE orgs SET activated_at = (
          SELECT MIN(rr.sent_at) FROM review_requests rr
          WHERE rr.org_id = (SELECT org_id FROM review_requests WHERE id = $id)
            AND rr.sent_at IS NOT NULL
        )
        WHERE id = (SELECT org_id FROM review_requests WHERE id = $id)
      `, { id: entry.requestDbId });
    }
  } catch (e) {
    console.error(`  ⚠️ Lifecycle update error: ${e.message}`);
  }
}

// ============ ENTRY PROCESSING HELPERS ============

function resolveOrg(entry) {
  const org = orgRepo.getById(entry.orgId);
  if (!org) {
    console.log(`  ⚠️ Org not found: ${entry.orgId} — marking failed`);
    emailOutboxRepo.updateStatus(entry.id, 'failed', { error: 'org_not_found' });
    updateRequestLifecycle(entry, 'failed');
  }
  return org || null;
}

function checkPreSendConditions(entry, org) {
  if (org.options?.emailPaused === true) {
    logger.logInfo('EMAIL_PAUSED', `Org ${org.id}: email paused by admin — skipping`, {
      orgId: org.id, outboxId: entry.id, reason: org.options.emailPausedReason || 'admin',
    });
    console.log(`  ⏸️ Email paused (${org.options.emailPausedReason || 'admin'}) — stays pending`);
    return 'skipped';
  }

  if (emailOutboxRepo.isUnsubscribed(entry.orgId, entry.toEmail)) {
    console.log('  ⛔ Unsubscribed — skipping');
    emailOutboxRepo.updateStatus(entry.id, 'cancelled', { error: 'unsubscribed' });
    return 'skipped';
  }

  const quotaCheck = emailQuotas.checkEmailQuota(org);
  if (!quotaCheck.allowed) {
    console.log(`  ⛔ Quota exceeded (${quotaCheck.used}/${quotaCheck.limit}) — skipping`);
    emailOutboxRepo.updateStatus(entry.id, 'failed', { error: `quota:${quotaCheck.reason}` });
    updateRequestLifecycle(entry, 'failed');
    return 'failed';
  }

  return 'ok';
}

function computeRateLimitOverrides(warmupState) {
  const isWarmingPhase = warmupState.status === 'cold' || warmupState.status === 'warming';
  if (warmupState.limits && isWarmingPhase) {
    return { maxPerHour: warmupState.limits.hourly, maxPerDay: warmupState.limits.daily };
  }
  return undefined;
}

function logRateLimitSkip(entry, org, warmupState, rateCheck) {
  if (rateCheck.reason?.startsWith('warmup_')) {
    logger.logInfo('WARMUP_LIMIT_REACHED', `Org ${entry.orgId}: warm-up limit reached — email stays pending`, {
      orgId: entry.orgId, orgName: org.name,
      warmupStatus: warmupState.status, warmupDay: warmupState.day,
      reason: rateCheck.reason, limits: rateCheck.limits,
      hourCount: rateCheck.hourCount, dayCount: rateCheck.dayCount,
    });
    console.log(`  🔥 Warm-up limit (${rateCheck.reason}, day ${warmupState.day}) — stays pending`);
  } else {
    console.log(`  ⏳ Rate limited (${rateCheck.reason}) — will retry later`);
  }
}

function checkWarmupRateLimit(entry, org) {
  emailWarmup.ensureWarmupInitialized(org);
  const warmupState = emailWarmup.getWarmupState(org);
  const overrides = computeRateLimitOverrides(warmupState);
  const rateCheck = emailQuotas.checkRateLimit(entry.orgId, overrides);

  if (!rateCheck.allowed) {
    logRateLimitSkip(entry, org, warmupState, rateCheck);
    return { allowed: false, state: warmupState };
  }
  return { allowed: true, state: warmupState };
}

function buildEmailPayload(entry, org) {
  const payload = { ...entry.payload };
  if (entry.templateKey === 'review_request') {
    const reviewToken = emailSigner.createReviewToken(entry.orgId, entry.toEmail, entry.id);
    const unsubToken = emailSigner.createUnsubscribeToken(entry.orgId, entry.toEmail);
    payload.reviewUrl = `${REVIEWS_BASE_URL}/r/review?token=${encodeURIComponent(reviewToken)}`;
    payload.unsubscribeUrl = `${REVIEWS_BASE_URL}/r/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    payload.orgName = payload.orgName || org.name;
  }
  return emailTemplates.renderTemplate(entry.templateKey, payload);
}

function resolveProviderName() {
  if (FORCE_DRY || emailProvider.EMAIL_DRY_RUN) return 'dry_run';
  return emailProvider.EMAIL_PROVIDER;
}

async function dispatchEmail(entry, rendered) {
  const unsubToken = emailSigner.createUnsubscribeToken(entry.orgId, entry.toEmail);
  const unsubUrl = `${REVIEWS_BASE_URL}/r/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  emailOutboxRepo.updateStatus(entry.id, 'sending');
  emailOutboxRepo.incrementAttempts(entry.id);

  return emailProvider.sendEmail({
    to: entry.toEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

function recordUsage(entry) {
  const emailPayload = entry.payload || {};
  usageRepo.recordEmail(entry.orgId, 1, {
    outboxId: entry.id,
    to: entry.toEmail,
    template: entry.templateKey,
    patientName: emailPayload.patientName || '',
    patientFirstName: emailPayload.patientFirstName || '',
    requestId: emailPayload.requestId || '',
    patientContact: entry.toEmail,
  });
}

function debitSubscriptionCredits(orgId) {
  try {
    const freshOrg = orgRepo.getById(orgId);
    if (!freshOrg) return;
    const subCredits = freshOrg.subscriptionCredits || {};
    orgRepo.update(orgId, {
      subscriptionCredits: {
        ...subCredits,
        emailUsedThisPeriod: (subCredits.emailUsedThisPeriod || 0) + 1,
      }
    });
  } catch (debitErr) {
    console.warn(`  ⚠️ Could not debit subscription credits: ${debitErr.message}`);
  }
}

function recordSendSuccess(entry, org, result, warmupState) {
  const providerName = resolveProviderName();
  emailOutboxRepo.updateStatus(entry.id, 'sent', {
    provider: providerName,
    providerMessageId: result.messageId,
  });
  emailOutboxRepo.addEvent(entry.id, 'sent', {
    messageId: result.messageId,
    provider: providerName,
  });

  updateRequestLifecycle(entry, 'sent');
  recordUsage(entry);
  debitSubscriptionCredits(entry.orgId);

  if (warmupState.status === 'cold') {
    emailWarmup.markWarmupStarted(org);
  }

  const warmupSuffix = warmupState.status !== 'warm'
    ? ` [warm-up: ${warmupState.status}, day ${warmupState.day}]` : '';
  console.log(`  ✅ Sent (${result.messageId})${warmupSuffix}`);
}

// ============ SINGLE ENTRY PROCESSOR ============

async function processEntry(entry) {
  try {
    console.log(`Processing: ${entry.id} → ${entry.toEmail} (${entry.templateKey})`);

    const org = resolveOrg(entry);
    if (!org) return 'failed';

    const preCheck = checkPreSendConditions(entry, org);
    if (preCheck !== 'ok') return preCheck;

    const warmup = checkWarmupRateLimit(entry, org);
    if (!warmup.allowed) return 'skipped';

    const rendered = buildEmailPayload(entry, org);
    const result = await dispatchEmail(entry, rendered);
    recordSendSuccess(entry, org, result, warmup.state);
    return 'sent';
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    emailOutboxRepo.updateStatus(entry.id, 'failed', { error: err.message });
    emailOutboxRepo.addEvent(entry.id, 'bounce', { error: err.message });
    updateRequestLifecycle(entry, 'failed');
    return 'failed';
  }
}

// ============ MAIN ============

async function processOutbox() {
  const pending = emailOutboxRepo.getPending(BATCH_LIMIT);
  console.log(`Found ${pending.length} pending email(s)\n`);

  if (pending.length === 0) {
    console.log('Nothing to process.');
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const counters = { sent: 0, failed: 0, skipped: 0 };
  for (const entry of pending) {
    const result = await processEntry(entry);
    if (result in counters) counters[result]++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Processed: ${pending.length}`);
  console.log(`Sent:      ${counters.sent}`);
  console.log(`Failed:    ${counters.failed}`);
  console.log(`Skipped:   ${counters.skipped}`);

  return { processed: pending.length, ...counters };
}

// Run
const startMs = Date.now();

processOutbox()
  .then(async (result) => {
    const durationMs = Date.now() - startMs;

    // Record heartbeat
    try {
      heartbeatRepo.upsert(WORKER_NAME, {
        ok: true,
        itemsProcessed: result.sent,
        durationMs,
      });
    } catch (e) {
      console.error(`⚠️ Heartbeat write failed: ${e.message}`);
    }

    // Release cron lock
    try { cronLocks.release(WORKER_NAME, lockOwner); } catch (err) { console.debug('[LOCK] release failed:', err.message); }

    console.log(`\n✅ Done. (${durationMs}ms)`);
    await sentry.flush();
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    const durationMs = Date.now() - startMs;

    // Report fatal to Sentry + heartbeat
    sentry.captureException(err, { worker: WORKER_NAME });
    try {
      heartbeatRepo.upsert(WORKER_NAME, {
        ok: false,
        error: err.message,
        durationMs,
      });
    } catch (hbErr) { console.debug('[HEARTBEAT] write failed:', hbErr.message); }

    // Release cron lock
    try { cronLocks.release(WORKER_NAME, lockOwner); } catch (lockErr) { console.debug('[LOCK] release failed:', lockErr.message); }

    console.error('\n❌ Fatal error:', err.message);
    await sentry.flush();
    process.exit(1);
  });
