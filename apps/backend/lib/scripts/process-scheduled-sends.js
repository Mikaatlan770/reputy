#!/usr/bin/env node
/**
 * Scheduled SMS Processor (Worker/Cron)
 *
 * Fetches pending scheduled sends (SMS only) that are due,
 * and processes them via Brevo SMS API.
 *
 * Usage:
 *   cd apps/backend
 *   node lib/scripts/process-scheduled-sends.js              # up to 50
 *   node lib/scripts/process-scheduled-sends.js --limit=10   # up to 10
 *   node lib/scripts/process-scheduled-sends.js --dry        # dry-run mode
 *
 * Designed to be called by cron every 5 minutes.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../db');
const scheduledSendRepo = require('../repositories/scheduled-send.repo');
const orgRepo = require('../repositories/org.repo');
const usageRepo = require('../repositories/usage.repo');
const smsProvider = require('../sms/provider');
const smsTemplates = require('../sms/templates');
const heartbeatRepo = require('../repositories/worker-heartbeat.repo');
const cronLocks = require('../repositories/cron-locks.repo');
const sentry = require('../sentry');
sentry.setTag('worker', 'sms_worker');

const WORKER_NAME = 'sms_worker';
const LOCK_TTL_SECONDS = 600;
const lockOwner = cronLocks.makeOwner();

// ============ CLI ARGS ============
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;
const DRY_RUN = args.includes('--dry');

const REVIEWS_BASE_URL = process.env.REVIEWS_BASE_URL || 'http://127.0.0.1:8787';

console.log('='.repeat(60));
console.log('\uD83D\uDCF1 REPUTY SCHEDULED SMS PROCESSOR');
console.log('='.repeat(60));
console.log(`Batch limit: ${BATCH_LIMIT}`);
console.log(`Provider:    ${smsProvider.SMS_PROVIDER}`);
console.log(`Dry-run:     ${DRY_RUN || smsProvider.SMS_DRY_RUN}`);
console.log(`Sender:      ${smsProvider.BREVO_SMS_SENDER}`);
console.log(`API Key:     ${smsProvider.SMS_DRY_RUN ? 'n/a (dry-run)' : (process.env.BREVO_API_KEY ? '\u2705 configured' : '\u274C missing')}`);
console.log(`Now:         ${new Date().toISOString()}`);
console.log();

// ============ P1.6: MESSAGING KILL SWITCH ============
const MESSAGING_DISABLED = ['1', 'true'].includes((process.env.MESSAGING_DISABLED || '').toLowerCase());
if (MESSAGING_DISABLED) {
  console.warn('⚠️  MESSAGING_DISABLED=true — worker exiting without processing.');
  process.exit(0);
}

// ============ INIT DB ============
if (!db.isInitialized()) {
  console.error('\u274C Database not initialized. Run server first.');
  process.exit(1);
}

// ============ CRON LOCK ============
if (!cronLocks.acquire(WORKER_NAME, LOCK_TTL_SECONDS, lockOwner)) {
  const existing = cronLocks.getInfo(WORKER_NAME);
  console.log(`⏳ Lock held by ${existing?.owner || '?'} until ${existing?.lockedUntil || '?'} — skipping this run`);
  db.closeDb();
  process.exit(0);
}
console.log(`🔒 Lock acquired (owner: ${lockOwner}, TTL: ${LOCK_TTL_SECONDS}s)`);

// ============ MAIN ============
async function processScheduledSends() {
  // Pre-flight: check SMS credits (skip in dry-run)
  if (!DRY_RUN && !smsProvider.SMS_DRY_RUN) {
    const credits = await smsProvider.checkCredits();
    if (credits.ok && credits.credits !== null) {
      console.log(`\uD83D\uDCCA Brevo SMS credits: ${credits.credits}`);
      if (credits.credits <= 0) {
        console.error('\u274C No SMS credits remaining \u2014 aborting');
        return { processed: 0, sent: 0, failed: 0, skipped: 0 };
      }
    } else if (!credits.ok) {
      console.warn(`\u26A0\uFE0F Could not check credits: ${credits.error}`);
    }
  }

  const pending = scheduledSendRepo.getPending(BATCH_LIMIT);
  console.log(`Found ${pending.length} pending SMS send(s) ready to process\n`);

  if (pending.length === 0) {
    console.log('Nothing to process.');
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of pending) {
    try {
      console.log(`Processing: ${entry.id} \u2192 ${entry.recipient} (org: ${entry.orgId})`);

      // 1) Load org
      const org = orgRepo.getById(entry.orgId);
      if (!org) {
        console.log(`  \u26A0\uFE0F Org not found: ${entry.orgId} \u2014 marking failed`);
        scheduledSendRepo.updateStatus(entry.id, 'failed', { error: 'org_not_found' });
        failed++;
        continue;
      }

      // 2) Check org status
      if (org.status === 'suspended' || org.status === 'cancelled') {
        console.log(`  \u26D4 Org ${org.status} \u2014 cancelling`);
        scheduledSendRepo.updateStatus(entry.id, 'cancelled', { error: `org_${org.status}` });
        skipped++;
        continue;
      }

      // 3) Mark sending + increment attempts BEFORE send
      scheduledSendRepo.updateStatus(entry.id, 'sending');
      scheduledSendRepo.incrementAttempts(entry.id);

      // 4) Build SMS body from template
      const feedbackUrl = entry.payload?.feedbackUrl
        || `${REVIEWS_BASE_URL}/r/${entry.payload?.requestId || entry.id}`;

      const smsContent = smsTemplates.reviewRequest({
        orgName: org.name,
        patientFirstName: entry.payload?.patientFirstName || '',
        feedbackUrl,
      });

      // 5) Send SMS (or dry-run)
      if (DRY_RUN) {
        console.log(`  \uD83D\uDD04 [DRY-RUN] Would send SMS to ${entry.recipient}`);
        console.log(`     Body: ${smsContent.body.replace(/\n/g, ' | ')}`);
        scheduledSendRepo.updateStatus(entry.id, 'sent');
        sent++;
        continue;
      }

      console.log(`  \uD83D\uDCF1 Sending SMS to ${entry.recipient}...`);

      const result = await smsProvider.sendSms({
        to: entry.recipient,
        body: smsContent.body,
        tag: smsContent.tag,
      });

      // 6) Mark sent
      scheduledSendRepo.updateStatus(entry.id, 'sent');

      // 7) Record usage
      usageRepo.addEntry({
        orgId: entry.orgId,
        type: 'sms',
        qty: result.smsCount || 1,
        details: {
          scheduledSendId: entry.id,
          recipient: entry.recipient,
          source: 'scheduled_send',
          provider: result.provider,
          messageId: result.messageId,
          smsCount: result.smsCount,
        },
      });

      // 8) Update request lifecycle if linked
      if (entry.requestDbId) {
        try {
          db.run(`
            UPDATE review_requests
            SET status = 'sent', sent_at = $now, updated_at = $now
            WHERE id = $id AND status IN ('created', 'queued')
          `, { id: entry.requestDbId, now: db.nowISO() });
        } catch (e) {
          console.error(`  \u26A0\uFE0F Lifecycle update error: ${e.message}`);
        }
      }

      console.log(`  \u2705 Sent (${result.messageId}, ${result.smsCount} segment(s))`);
      sent++;

    } catch (err) {
      console.error(`  \u274C Error: ${err.message}`);
      scheduledSendRepo.updateStatus(entry.id, 'failed', { error: err.message });
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Processed: ${pending.length}`);
  console.log(`Sent:      ${sent}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Skipped:   ${skipped}`);

  return { processed: pending.length, sent, failed, skipped };
}

// Run
const startMs = Date.now();

processScheduledSends()
  .then(async (result) => {
    const durationMs = Date.now() - startMs;

    try {
      heartbeatRepo.upsert(WORKER_NAME, {
        ok: true,
        itemsProcessed: result.sent,
        durationMs,
      });
    } catch (e) {
      console.error(`⚠️ Heartbeat write failed: ${e.message}`);
    }

    try { cronLocks.release(WORKER_NAME, lockOwner); } catch (_) { /* best-effort */ }

    console.log(`\n✅ Done. (${durationMs}ms)`);
    await sentry.flush();
    db.closeDb();
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    const durationMs = Date.now() - startMs;

    sentry.captureException(err, { worker: WORKER_NAME });
    try {
      heartbeatRepo.upsert(WORKER_NAME, {
        ok: false,
        error: err.message,
        durationMs,
      });
    } catch (_) { /* ignore */ }

    try { cronLocks.release(WORKER_NAME, lockOwner); } catch (_) { /* best-effort */ }

    console.error('\n❌ Fatal error:', err.message);
    await sentry.flush();
    db.closeDb();
    process.exit(1);
  });
