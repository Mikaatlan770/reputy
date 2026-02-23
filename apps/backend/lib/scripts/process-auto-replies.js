#!/usr/bin/env node
/**
 * AI Auto-Reply Processor (Worker/Cron)
 *
 * Finds eligible reviews (4-5★, no reply yet) and generates auto-replies:
 *   - Without comment: template reply (zero AI cost)
 *   - With comment: OpenAI call (gpt-4.1-mini, max 300 output tokens)
 *
 * Replies are saved as 'draft' (reply_status='draft') for human validation.
 *
 * Usage:
 *   cd apps/backend
 *   node lib/scripts/process-auto-replies.js              # up to 20
 *   node lib/scripts/process-auto-replies.js --limit=5    # up to 5
 *   node lib/scripts/process-auto-replies.js --dry        # dry-run (no OpenAI calls)
 *
 * Designed to be called by cron every 15 minutes.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../db');
const aiAutoReplyRepo = require('../repositories/ai-auto-reply.repo');
const reviewRepo = require('../repositories/review.repo');
const orgRepo = require('../repositories/org.repo');
const { shouldAutoReply, prepareAiInput, getNoCommentTemplate } = require('../ai/auto-reply');
const { autoReply } = require('../ai/openai-provider');
const heartbeatRepo = require('../repositories/worker-heartbeat.repo');
const cronLocks = require('../repositories/cron-locks.repo');
const sentry = require('../sentry');
sentry.setTag('worker', 'auto_reply_worker');

const WORKER_NAME = 'auto_reply_worker';
const LOCK_TTL_SECONDS = 600;
const lockOwner = cronLocks.makeOwner();

// ============ CLI ARGS ============
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;
const DRY_RUN = args.includes('--dry');

console.log('='.repeat(60));
console.log('🤖 REPUTY AI AUTO-REPLY PROCESSOR');
console.log('='.repeat(60));
console.log(`Batch limit: ${BATCH_LIMIT}`);
console.log(`Dry-run:     ${DRY_RUN}`);
console.log(`Model:       ${process.env.OPENAI_AUTO_REPLY_MODEL || 'gpt-4.1-mini'}`);
console.log(`API Key:     ${process.env.OPENAI_API_KEY ? '✅ configured' : '❌ MISSING'}`);
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
  console.error('❌ Database not initialized. Run server first.');
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

// ============ HELPERS ============

/**
 * Parse raw review row from DB (snake_case → camelCase)
 */
function parseReviewRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    rating: row.rating,
    comment: row.comment,
    replyStatus: row.reply_status,
    replyText: row.reply_text,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

// ============ MAIN ============
async function processAutoReplies() {
  // 1) Get eligible reviews
  const rawRows = aiAutoReplyRepo.getEligibleReviews(BATCH_LIMIT);
  console.log(`Found ${rawRows.length} eligible review(s) for auto-reply\n`);

  if (rawRows.length === 0) {
    console.log('Nothing to process.');
    return { processed: 0, success: 0, failed: 0, skipped: 0, templates: 0 };
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let templates = 0;

  // Cache org names to avoid repeated lookups
  const orgNameCache = {};

  for (const rawRow of rawRows) {
    const review = parseReviewRow(rawRow);

    try {
      console.log(`Processing: review ${review.id} (${review.rating}★) — org: ${review.orgId}`);

      // 2) Re-check eligibility (race condition guard)
      const eligibility = shouldAutoReply(review);
      if (!eligibility.eligible) {
        console.log(`  ⏩ Skipped: ${eligibility.reason}`);
        skipped++;
        continue;
      }

      // 3) Get org name
      if (!orgNameCache[review.orgId]) {
        const org = orgRepo.getById(review.orgId);
        orgNameCache[review.orgId] = org?.name || '';
      }
      const orgName = orgNameCache[review.orgId];

      // ── 4A) No-comment template (zero AI cost) ──
      if (eligibility.useTemplate) {
        const templateText = getNoCommentTemplate(review.rating);
        if (!templateText) {
          console.log(`  ⏩ No template available for ${review.rating}★ — skipping`);
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`  🔄 [DRY-RUN] Would save template: "${templateText.substring(0, 60)}..."`);
          templates++;
          success++;
          continue;
        }

        // Save tracking entry
        aiAutoReplyRepo.create({
          orgId: review.orgId,
          reviewId: review.id,
          rating: review.rating,
          model: 'template',
          status: 'success',
          responseText: templateText,
          attempts: 1,
          inputTokensEst: 0,
          outputTokensEst: 0,
        });

        // Save as draft reply on review
        reviewRepo.updateReply(review.orgId, review.id, {
          replyText: templateText,
          replyStatus: 'draft',
        });

        console.log(`  📝 Template (${review.rating}★ sans commentaire): "${templateText.substring(0, 50)}..."`);
        templates++;
        success++;
        continue;
      }

      // ── 4B) AI call (review has comment) ──
      const { cleaned, truncated, estimatedTokens } = prepareAiInput(review.comment);

      console.log(`  📊 Input: ${cleaned.length} chars, ~${estimatedTokens} tokens${truncated ? ' (truncated)' : ''}`);

      // Check for existing failed attempt (retry logic)
      const existingEntry = aiAutoReplyRepo.getByReviewId(review.id);
      let trackingId;

      if (existingEntry && existingEntry.status === 'failed' && existingEntry.attempts < 2) {
        // Retry existing failed entry
        trackingId = existingEntry.id;
        aiAutoReplyRepo.incrementAttempts(trackingId);
        console.log(`  🔄 Retrying failed entry (attempt ${existingEntry.attempts + 1})`);
      } else {
        // Create new tracking entry with attempts=1
        const modelName = process.env.OPENAI_AUTO_REPLY_MODEL || 'gpt-4.1-mini';
        const newEntry = aiAutoReplyRepo.create({
          orgId: review.orgId,
          reviewId: review.id,
          rating: review.rating,
          model: modelName,
          status: 'pending',
          attempts: 1,
          inputTokensEst: estimatedTokens,
        });
        trackingId = newEntry.id;
      }

      if (DRY_RUN) {
        console.log(`  🔄 [DRY-RUN] Would call OpenAI for: "${cleaned.substring(0, 80)}..."`);
        aiAutoReplyRepo.updateStatus(trackingId, 'skipped', { error: 'dry_run' });
        skipped++;
        continue;
      }

      // 5) Call OpenAI
      try {
        const result = await autoReply({
          reviewText: cleaned,
          rating: review.rating,
          orgName,
        });

        // 6) Save success
        aiAutoReplyRepo.updateStatus(trackingId, 'success', {
          responseText: result.draft,
          model: result.model,
          inputTokensEst: result.inputTokensEst,
          outputTokensEst: result.outputTokensEst,
        });

        // 7) Save as draft reply on review
        reviewRepo.updateReply(review.orgId, review.id, {
          replyText: result.draft,
          replyStatus: 'draft',
        });

        console.log(`  ✅ AI reply (${result.model}): "${result.draft.substring(0, 60)}..."`);
        console.log(`     Tokens: in=${result.inputTokensEst}, out=${result.outputTokensEst}`);
        success++;

      } catch (aiErr) {
        console.error(`  ❌ OpenAI error: ${aiErr.message}`);
        aiAutoReplyRepo.updateStatus(trackingId, 'failed', {
          error: aiErr.message,
        });
        failed++;
        // No retry loop — next cron run will pick up failed entries (if attempts < 2)
      }

    } catch (err) {
      console.error(`  ❌ Unexpected error for review ${review.id}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Processed:  ${rawRows.length}`);
  console.log(`Success:    ${success} (AI: ${success - templates}, Templates: ${templates})`);
  console.log(`Failed:     ${failed}`);
  console.log(`Skipped:    ${skipped}`);

  return { processed: rawRows.length, success, failed, skipped, templates };
}

// Run
const startMs = Date.now();

processAutoReplies()
  .then(async (result) => {
    const durationMs = Date.now() - startMs;

    try {
      heartbeatRepo.upsert(WORKER_NAME, {
        ok: true,
        itemsProcessed: result.success,
        durationMs,
      });
    } catch (e) {
      console.error(`⚠️ Heartbeat write failed: ${e.message}`);
    }

    try { cronLocks.release(WORKER_NAME, lockOwner); } catch (err) { console.debug('[LOCK] release failed:', err.message); }

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
    } catch (hbErr) { console.debug('[HEARTBEAT] write failed:', hbErr.message); }

    try { cronLocks.release(WORKER_NAME, lockOwner); } catch (lockErr) { console.debug('[LOCK] release failed:', lockErr.message); }

    console.error('\n❌ Fatal error:', err.message);
    await sentry.flush();
    db.closeDb();
    process.exit(1);
  });
