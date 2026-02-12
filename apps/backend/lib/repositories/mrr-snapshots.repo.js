/**
 * MRR Snapshots Repository
 *
 * Stores and retrieves daily MRR snapshots for revenue trend analysis.
 * snapshot_date (YYYY-MM-DD UTC) is the primary key → upsert is idempotent per day.
 */

const db = require('../db');

// ============================================================
// Parse
// ============================================================

function parseSnapshotRow(row) {
  if (!row) return null;
  return {
    date: row.snapshot_date,
    mrrTotalCents: row.mrr_total_cents,
    orgsPaid: row.orgs_paid,
    orgsFree: row.orgs_free,
    arpuCents: row.arpu_cents,
    mrr_by_tier: db.parseJson(row.mrr_by_tier_json, {}),
    negotiatedOrgs: row.negotiated_orgs,
    negotiatedPercent: row.negotiated_percent,
    createdAt: row.created_at,
  };
}

// ============================================================
// Upsert (idempotent per snapshot_date)
// ============================================================

/**
 * Insert or replace a daily MRR snapshot.
 * Because snapshot_date is the PRIMARY KEY, INSERT OR REPLACE
 * will overwrite any existing row for the same date.
 */
function upsertSnapshot({
  snapshotDate,
  mrrTotalCents,
  orgsPaid,
  orgsFree,
  arpuCents,
  mrrByTierJson,
  negotiatedOrgs,
  negotiatedPercent,
}) {
  db.run(
    `INSERT OR REPLACE INTO mrr_snapshots
       (snapshot_date, mrr_total_cents, orgs_paid, orgs_free,
        arpu_cents, mrr_by_tier_json, negotiated_orgs, negotiated_percent, created_at)
     VALUES ($snapshotDate, $mrrTotalCents, $orgsPaid, $orgsFree,
             $arpuCents, $mrrByTierJson, $negotiatedOrgs, $negotiatedPercent, datetime('now'))`,
    {
      snapshotDate,
      mrrTotalCents,
      orgsPaid,
      orgsFree,
      arpuCents,
      mrrByTierJson: typeof mrrByTierJson === 'string' ? mrrByTierJson : JSON.stringify(mrrByTierJson || {}),
      negotiatedOrgs,
      negotiatedPercent,
    }
  );
}

// ============================================================
// Queries
// ============================================================

/**
 * List snapshots since a given date (YYYY-MM-DD), ordered ASC.
 */
function listSince(sinceDate) {
  const rows = db.all(
    `SELECT * FROM mrr_snapshots WHERE snapshot_date >= $sinceDate ORDER BY snapshot_date ASC`,
    { sinceDate }
  );
  return rows.map(parseSnapshotRow);
}

/**
 * List snapshots for the last N days (from UTC today).
 */
function listLastDays(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  const sinceDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
  return listSince(sinceDate);
}

/**
 * Get the most recent snapshot.
 */
function getLatest() {
  const row = db.get(
    `SELECT * FROM mrr_snapshots ORDER BY snapshot_date DESC LIMIT 1`
  );
  return parseSnapshotRow(row);
}

module.exports = {
  upsertSnapshot,
  listSince,
  listLastDays,
  getLatest,
};
