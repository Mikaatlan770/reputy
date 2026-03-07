/**
 * Worker Heartbeat Repository
 *
 * Each cron worker (sms_worker, email_worker, auto_reply_worker)
 * updates its heartbeat at the end of each run.
 *
 * The /health endpoint reads heartbeats to detect stale/down workers.
 */

'use strict';

const db = require('../db');

// ── Thresholds ───────────────────────────────────────────────
const STALE_MINUTES = 15;   // default "stale" threshold
const DOWN_MINUTES = 60;    // default "down" threshold

// Per-worker overrides — must be > cron interval + safety margin
const WORKER_STALE_MINUTES = {
  sms_worker:         10,  // cron: every 2 min
  email_worker:       10,  // cron: every 2 min
  auto_reply_worker:  30,  // cron: every 15 min — needs wider margin
  competitor_worker:  180, // cron: weekly
  mrr_worker:         2880 // cron: monthly
};

// ── Upsert ───────────────────────────────────────────────────

/**
 * Update or insert a worker heartbeat.
 * Called at the end of each worker run.
 *
 * @param {string} workerName - e.g. 'sms_worker', 'email_worker', 'auto_reply_worker'
 * @param {object} data
 * @param {boolean} data.ok - true if run succeeded (even if 0 items)
 * @param {number}  [data.itemsProcessed=0]
 * @param {number}  [data.durationMs]
 * @param {string}  [data.error] - error message if !ok
 */
function upsert(workerName, data) {
  const now = db.nowISO();

  db.run(`
    INSERT INTO worker_heartbeats (
      worker_name, last_run_at, last_ok_at, last_error,
      items_processed, run_duration_ms, updated_at
    ) VALUES (
      $workerName, $now, $lastOkAt, $lastError,
      $itemsProcessed, $durationMs, $now
    )
    ON CONFLICT(worker_name) DO UPDATE SET
      last_run_at = $now,
      last_ok_at = CASE WHEN $ok = 1 THEN $now ELSE worker_heartbeats.last_ok_at END,
      last_error = $lastError,
      items_processed = $itemsProcessed,
      run_duration_ms = $durationMs,
      updated_at = $now
  `, {
    workerName,
    now,
    lastOkAt: data.ok ? now : null,
    lastError: data.ok ? null : (data.error || 'unknown'),
    itemsProcessed: data.itemsProcessed || 0,
    durationMs: data.durationMs || null,
    ok: data.ok ? 1 : 0,
  });
}

// ── Read ─────────────────────────────────────────────────────

/**
 * Get all heartbeats with computed status.
 *
 * @returns {Array<{ workerName, status, lastRunAt, lastOkAt, lastError, itemsProcessed, runDurationMs, updatedAt }>}
 */
function getAll() {
  const rows = db.all('SELECT * FROM worker_heartbeats ORDER BY worker_name');
  return rows.map(parseRow);
}

/**
 * Get a single worker heartbeat.
 * @param {string} workerName
 */
function getByName(workerName) {
  const row = db.get(
    'SELECT * FROM worker_heartbeats WHERE worker_name = $name',
    { name: workerName }
  );
  return row ? parseRow(row) : null;
}

/**
 * Get workers that are stale or down.
 * @param {string[]} [expectedWorkers] - list of worker names that SHOULD exist
 * @returns {Array<{ workerName, status, ... }>}
 */
function getUnhealthy(expectedWorkers = ['sms_worker', 'email_worker', 'auto_reply_worker']) {
  const all = getAll();
  const found = new Set(all.map(w => w.workerName));

  const unhealthy = [];

  // Workers that exist but are stale/down
  for (const w of all) {
    if (w.status !== 'ok') {
      unhealthy.push(w);
    }
  }

  // Workers that SHOULD exist but have never reported
  for (const name of expectedWorkers) {
    if (!found.has(name)) {
      unhealthy.push({
        workerName: name,
        status: 'never_seen',
        lastRunAt: null,
        lastOkAt: null,
        lastError: null,
        itemsProcessed: 0,
        runDurationMs: null,
        updatedAt: null,
      });
    }
  }

  return unhealthy;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Compute worker status based on last_ok_at.
 * @param {string|null} lastOkAt - ISO timestamp
 * @returns {'ok'|'stale'|'down'|'never_seen'}
 */
function computeStatus(lastOkAt, workerName) {
  if (!lastOkAt) return 'never_seen';

  const elapsed = Date.now() - new Date(lastOkAt).getTime();
  const elapsedMinutes = elapsed / (60 * 1000);

  const staleMin = (workerName && WORKER_STALE_MINUTES[workerName]) || STALE_MINUTES;
  const downMin  = Math.max(staleMin * 4, DOWN_MINUTES);

  if (elapsedMinutes <= staleMin) return 'ok';
  if (elapsedMinutes <= downMin)  return 'stale';
  return 'down';
}

function parseRow(row) {
  const lastOkAt = row.last_ok_at || null;
  return {
    workerName: row.worker_name,
    status: computeStatus(lastOkAt, row.worker_name),
    lastRunAt: row.last_run_at,
    lastOkAt,
    lastError: row.last_error,
    itemsProcessed: row.items_processed,
    runDurationMs: row.run_duration_ms,
    updatedAt: row.updated_at,
  };
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  upsert,
  getAll,
  getByName,
  getUnhealthy,
  computeStatus,
  STALE_MINUTES,
  DOWN_MINUTES,
};
