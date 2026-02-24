#!/usr/bin/env node
/**
 * P2 — Daily MRR Snapshot
 *
 * Computes the current MRR state and upserts a row into mrr_snapshots
 * for today's UTC date. Idempotent: running twice on the same day
 * overwrites the same row (snapshot_date is PRIMARY KEY).
 *
 * Usage:
 *   cd apps/backend
 *   node lib/scripts/snapshot-mrr.js          # snapshot for today
 *   node lib/scripts/snapshot-mrr.js --dry    # compute but don't write
 *
 * Designed to run via PM2 cron_restart at 00:05 UTC daily.
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../db');
const mrrSnapshotRepo = require('../repositories/mrr-snapshots.repo');

const DRY_RUN = process.argv.includes('--dry');

// ============================================================
// SQL fragments — IDENTICAL to server.js handleAdminMetrics §Revenue
// Any change here MUST be mirrored in server.js (and vice-versa).
// Future: extract into shared lib/sql-fragments/mrr.js
// ============================================================

const MRR_CASE = `
  CASE
    WHEN CAST(json_extract(negotiated_json,'$.enabled') AS INTEGER) = 1
      AND CAST(json_extract(negotiated_json,'$.customPriceCents') AS INTEGER) > 0
    THEN CAST(json_extract(negotiated_json,'$.customPriceCents') AS INTEGER)
    WHEN CAST(json_extract(negotiated_json,'$.enabled') AS INTEGER) = 1
      AND CAST(json_extract(negotiated_json,'$.discountPercent') AS REAL) > 0
    THEN CAST(ROUND(
      CAST(json_extract(plan_json,'$.basePriceCents') AS REAL)
      * (1.0 - CAST(json_extract(negotiated_json,'$.discountPercent') AS REAL) / 100.0)
    ) AS INTEGER)
    WHEN json_extract(plan_json,'$.basePriceCents') IS NULL THEN 0
    ELSE CAST(json_extract(plan_json,'$.basePriceCents') AS INTEGER)
  END`;

const TIER_CASE = `
  CASE
    WHEN json_extract(plan_json,'$.code') IS NULL THEN 'unknown'
    WHEN INSTR(json_extract(plan_json,'$.code'),'_') = 0 THEN json_extract(plan_json,'$.code')
    ELSE SUBSTR(json_extract(plan_json,'$.code'), INSTR(json_extract(plan_json,'$.code'),'_') + 1)
  END`;

const ACTIVE_FILTER = `status = 'active' AND json_extract(billing_json,'$.status') = 'active'`;

// Same tier normalization as server.js — V2: "or/gold" → platinum
const TIER_ALIASES = { basic: 'bronze', silver: 'argent', or: 'platinum', gold: 'platinum' };
const TIER_BUCKETS = { bronze: 0, argent: 0, platinum: 0, custom: 0 };

// ============================================================
// Main
// ============================================================

function computeSnapshot() {
  const database = db.getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  console.log(`[SNAPSHOT-MRR] Computing snapshot for ${today}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // 1. MRR total + orgs_paid
  const mrrRow = database.prepare(`
    SELECT SUM(monthly) AS total_mrr, COUNT(*) AS paid_count
    FROM (
      SELECT ${MRR_CASE} AS monthly
      FROM orgs
      WHERE ${ACTIVE_FILTER}
    )
    WHERE monthly > 0
  `).get();
  const mrrTotalCents = mrrRow?.total_mrr || 0;
  const orgsPaid = mrrRow?.paid_count || 0;

  // 2. orgs_free (active + billing active + monthly = 0)
  const freeRow = database.prepare(`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT ${MRR_CASE} AS monthly
      FROM orgs
      WHERE ${ACTIVE_FILTER}
    )
    WHERE monthly = 0
  `).get();
  const orgsFree = freeRow?.cnt || 0;

  // 3. ARPU (safe divide)
  const arpuCents = orgsPaid > 0 ? Math.round(mrrTotalCents / orgsPaid) : 0;

  // 4. negotiated_orgs
  const negRow = database.prepare(`
    SELECT COUNT(*) AS cnt FROM orgs
    WHERE ${ACTIVE_FILTER}
      AND CAST(json_extract(negotiated_json,'$.enabled') AS INTEGER) = 1
  `).get();
  const negotiatedOrgs = negRow?.cnt || 0;
  const negotiatedPercent = orgsPaid > 0
    ? +((negotiatedOrgs / orgsPaid) * 100).toFixed(1)
    : 0;

  // 5. MRR by tier (with TIER_ALIASES remapping — same as server.js)
  const tierRows = database.prepare(`
    SELECT tier, SUM(monthly) AS total
    FROM (
      SELECT ${TIER_CASE} AS tier, ${MRR_CASE} AS monthly
      FROM orgs
      WHERE ${ACTIVE_FILTER}
    )
    WHERE monthly > 0
    GROUP BY tier
  `).all();

  const mrrByTier = { ...TIER_BUCKETS };
  for (const row of tierRows) {
    const normalized = TIER_ALIASES[row.tier] || row.tier;
    const t = (normalized in mrrByTier) ? normalized : 'custom';
    mrrByTier[t] += (row.total || 0);
  }

  // ============================================================
  // Upsert
  // ============================================================
  const snapshot = {
    snapshotDate: today,
    mrrTotalCents,
    orgsPaid,
    orgsFree,
    arpuCents,
    mrrByTierJson: JSON.stringify(mrrByTier),
    negotiatedOrgs,
    negotiatedPercent,
  };

  if (!DRY_RUN) {
    mrrSnapshotRepo.upsertSnapshot(snapshot);
    console.log(`[SNAPSHOT-MRR] ✓ Upserted into mrr_snapshots`);
  } else {
    console.log(`[SNAPSHOT-MRR] (dry run — not writing to DB)`);
  }

  // Compact JSON log for ops
  const logPayload = {
    date: today,
    mrr_total_cents: mrrTotalCents,
    mrr_total_eur: +(mrrTotalCents / 100).toFixed(2),
    orgs_paid: orgsPaid,
    orgs_free: orgsFree,
    arpu_cents: arpuCents,
    mrr_by_tier: mrrByTier,
    negotiated_orgs: negotiatedOrgs,
    negotiated_percent: negotiatedPercent,
    dry_run: DRY_RUN,
  };

  console.log(JSON.stringify(logPayload));
  return logPayload;
}

// ============================================================
// Run
// ============================================================
try {
  computeSnapshot();
  process.exit(0);
} catch (err) {
  console.error(`[SNAPSHOT-MRR] ❌ Fatal:`, err.message);
  process.exit(1);
}
