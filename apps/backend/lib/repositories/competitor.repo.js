/**
 * Competitor Repository
 *
 * Manages competitor snapshots, place details cache, and sync logs.
 * Data comes from Google Places API (New) via weekly cron.
 *
 * Key design:
 * - `profile` is part of every UNIQUE key to prevent data mixing when specialty changes
 * - `address` is NOT stored in snapshots (belongs to Place Details / drawer only)
 * - `estimated30d` is computed via Math.max(0, delta) to protect against negative deltas
 * - `updated_at` on cache tracks last refresh time
 */

const db = require('../db');

// ============================================================
// ISO Week Helper
// ============================================================

/**
 * Get ISO week string for a date (e.g. "2026-W07")
 * @param {Date} [date] - Defaults to now
 * @returns {string} ISO week key
 */
function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday (ISO week starts Monday)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ============================================================
// Snapshot Operations
// ============================================================

/**
 * Upsert a competitor snapshot for a given org + profile + period + placeId
 * Uses ON CONFLICT on UNIQUE(org_id, profile, run_period_key, place_id).
 * NOTE: `address` is intentionally NOT stored here — it's fetched via Place Details.
 * @param {object} data
 * @returns {object} { changes }
 */
function upsertSnapshot(data) {
  const id = data.id || db.generateId();
  return db.run(`
    INSERT INTO competitor_snapshots (
      id, org_id, profile, run_period_key, place_id, name,
      lat, lng, rating, user_ratings_total, distance_m, types_json
    ) VALUES (
      $id, $orgId, $profile, $runPeriodKey, $placeId, $name,
      $lat, $lng, $rating, $userRatingsTotal, $distanceM, $typesJson
    )
    ON CONFLICT(org_id, profile, run_period_key, place_id)
    DO UPDATE SET
      name = excluded.name,
      lat = excluded.lat,
      lng = excluded.lng,
      rating = excluded.rating,
      user_ratings_total = excluded.user_ratings_total,
      distance_m = excluded.distance_m,
      types_json = excluded.types_json
  `, {
    id,
    orgId: data.orgId,
    profile: data.profile || 'default',
    runPeriodKey: data.runPeriodKey,
    placeId: data.placeId,
    name: data.name,
    lat: data.lat || null,
    lng: data.lng || null,
    rating: data.rating || null,
    userRatingsTotal: data.userRatingsTotal || 0,
    distanceM: data.distanceM || 0,
    typesJson: JSON.stringify(data.types || []),
  });
}

/**
 * Bulk upsert snapshots in a single transaction
 * @param {object[]} snapshots - Array of snapshot data
 */
function bulkUpsertSnapshots(snapshots) {
  db.transaction(() => {
    for (const snap of snapshots) {
      upsertSnapshot(snap);
    }
  });
}

/**
 * Get the latest snapshot period key for an org + profile
 * @param {string} orgId
 * @param {string} profile - Search profile name (e.g. "health_dentiste")
 * @returns {string|null} Latest run_period_key
 */
function getLatestPeriodKey(orgId, profile) {
  const row = db.get(`
    SELECT run_period_key FROM competitor_snapshots
    WHERE org_id = $orgId AND profile = $profile
    ORDER BY run_period_key DESC
    LIMIT 1
  `, { orgId, profile });
  return row?.run_period_key || null;
}

/**
 * Get competitor snapshots for an org + profile, optionally filtered by period
 * @param {string} orgId
 * @param {string} profile - Search profile name
 * @param {string} [periodKey] - If null, uses latest
 * @returns {object[]} Snapshots
 */
function getSnapshots(orgId, profile, periodKey = null) {
  const key = periodKey || getLatestPeriodKey(orgId, profile);
  if (!key) return [];

  return db.all(`
    SELECT * FROM competitor_snapshots
    WHERE org_id = $orgId AND profile = $profile AND run_period_key = $key
    ORDER BY distance_m ASC
  `, { orgId, profile, key }).map(parseSnapshotRow);
}

/**
 * Get a snapshot for a specific place across two periods (for 30d estimation)
 * @param {string} orgId
 * @param {string} profile
 * @param {string} placeId
 * @param {string} currentPeriod - e.g. "2026-W07"
 * @param {string} previousPeriod - e.g. "2026-W03" (4 weeks earlier)
 * @returns {{ current: object|null, previous: object|null }}
 */
function getSnapshotPair(orgId, profile, placeId, currentPeriod, previousPeriod) {
  const current = db.get(`
    SELECT * FROM competitor_snapshots
    WHERE org_id = $orgId AND profile = $profile AND place_id = $placeId AND run_period_key = $currentPeriod
  `, { orgId, profile, placeId, currentPeriod });

  const previous = db.get(`
    SELECT * FROM competitor_snapshots
    WHERE org_id = $orgId AND profile = $profile AND place_id = $placeId AND run_period_key = $previousPeriod
  `, { orgId, profile, placeId, previousPeriod });

  return {
    current: current ? parseSnapshotRow(current) : null,
    previous: previous ? parseSnapshotRow(previous) : null,
  };
}

/**
 * Get all distinct period keys for an org + profile (for history/dropdown)
 * @param {string} orgId
 * @param {string} profile
 * @returns {string[]} Period keys sorted DESC
 */
function getPeriodKeys(orgId, profile) {
  return db.all(`
    SELECT DISTINCT run_period_key FROM competitor_snapshots
    WHERE org_id = $orgId AND profile = $profile
    ORDER BY run_period_key DESC
  `, { orgId, profile }).map((r) => r.run_period_key);
}

/**
 * Check if a sync already ran for this org + profile + period
 * @param {string} orgId
 * @param {string} profile
 * @param {string} periodKey
 * @returns {boolean}
 */
function hasSyncRun(orgId, profile, periodKey) {
  const row = db.get(`
    SELECT id FROM competitor_sync_log
    WHERE org_id = $orgId AND profile = $profile AND run_period_key = $periodKey AND status = 'success'
    LIMIT 1
  `, { orgId, profile, periodKey });
  return !!row;
}

// ============================================================
// Place Details Cache
// ============================================================

/**
 * Get cached place details (returns null if expired or not found)
 * Uses fetched_at + TTL for expiration check.
 * @param {string} placeId
 * @param {number} [ttlDays=30] - Cache TTL in days
 * @returns {object|null}
 */
function getCachedPlaceDetails(placeId, ttlDays = 30) {
  const row = db.get(`
    SELECT * FROM competitor_place_details_cache
    WHERE place_id = $placeId
      AND datetime(fetched_at, '+' || $ttlDays || ' days') > datetime('now')
  `, { placeId, ttlDays });

  if (!row) return null;

  return {
    placeId: row.place_id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    website: row.website,
    rating: row.rating,
    userRatingsTotal: row.user_ratings_total,
    openingHours: db.parseJson(row.opening_hours_json),
    reviews: db.parseJson(row.reviews_json, []),
    types: db.parseJson(row.types_json, []),
    photos: db.parseJson(row.photos_json, []),
    fetchedAt: row.fetched_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Store/update place details in cache.
 * On conflict (re-fetch), updates all fields + sets updated_at to now.
 * @param {object} details - Place details object
 */
function cachePlaceDetails(details) {
  db.run(`
    INSERT INTO competitor_place_details_cache (
      place_id, name, address, phone, website, rating, user_ratings_total,
      opening_hours_json, reviews_json, types_json, photos_json, fetched_at, updated_at
    ) VALUES (
      $placeId, $name, $address, $phone, $website, $rating, $userRatingsTotal,
      $openingHoursJson, $reviewsJson, $typesJson, $photosJson, datetime('now'), datetime('now')
    )
    ON CONFLICT(place_id) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      phone = excluded.phone,
      website = excluded.website,
      rating = excluded.rating,
      user_ratings_total = excluded.user_ratings_total,
      opening_hours_json = excluded.opening_hours_json,
      reviews_json = excluded.reviews_json,
      types_json = excluded.types_json,
      photos_json = excluded.photos_json,
      fetched_at = excluded.fetched_at,
      updated_at = datetime('now')
  `, {
    placeId: details.placeId,
    name: details.name || null,
    address: details.address || null,
    phone: details.phone || null,
    website: details.website || null,
    rating: details.rating || null,
    userRatingsTotal: details.userRatingsTotal || 0,
    openingHoursJson: JSON.stringify(details.openingHours || {}),
    reviewsJson: JSON.stringify(details.reviews || []),
    typesJson: JSON.stringify(details.types || []),
    photosJson: JSON.stringify(details.photos || []),
  });
}

// ============================================================
// Sync Log
// ============================================================

/**
 * Log a competitor sync run
 * @param {object} data - { orgId, profile, runPeriodKey, status, placesFound, placesStored, errorMessage }
 */
function logSync(data) {
  db.run(`
    INSERT INTO competitor_sync_log (id, org_id, profile, run_period_key, status, places_found, places_stored, error_message)
    VALUES ($id, $orgId, $profile, $runPeriodKey, $status, $placesFound, $placesStored, $errorMessage)
  `, {
    id: db.generateId(),
    orgId: data.orgId,
    profile: data.profile || 'default',
    runPeriodKey: data.runPeriodKey,
    status: data.status,
    placesFound: data.placesFound || 0,
    placesStored: data.placesStored || 0,
    errorMessage: data.errorMessage || null,
  });
}

// ============================================================
// Bucket & Enrichment Helpers
// ============================================================

/**
 * Build server-side buckets (1000, 2000, 5000m) from snapshots
 * and estimate "avis 30j" from S vs S-4 delta.
 *
 * @param {string} orgId
 * @param {string} profile - Search profile name (e.g. "health_dentiste")
 * @param {number} maxRadiusM - Max radius (e.g. 5000)
 * @param {number} [topN=25] - Max competitors to return globally
 * @returns {{ buckets: { 1000: [], 2000: [], 5000: [] }, updatedAt: string, isEstimated30d: boolean }}
 */
function buildBuckets(orgId, profile, maxRadiusM = 5000, topN = 25) {
  const latestKey = getLatestPeriodKey(orgId, profile);
  if (!latestKey) {
    return { buckets: { 1000: [], 2000: [], 5000: [] }, updatedAt: null, isEstimated30d: false };
  }

  // Get all snapshots for latest period + profile
  let snapshots = getSnapshots(orgId, profile, latestKey);

  // Filter by max radius and sort by distance
  snapshots = snapshots
    .filter((s) => s.distanceM <= maxRadiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, topN);

  // Try to compute 30d estimation: find S-4 period
  const periodKeys = getPeriodKeys(orgId, profile);
  const previousKey = periodKeys.length >= 5 ? periodKeys[4] : null; // ~4 weeks earlier
  const isEstimated30d = !!previousKey;

  // Enrich each snapshot with estimated 30d reviews
  const enriched = snapshots.map((snap) => {
    let estimated30d = null;
    if (previousKey) {
      const pair = getSnapshotPair(orgId, profile, snap.placeId, latestKey, previousKey);
      if (pair.current && pair.previous) {
        // Protect against negative delta (Google can correct review counts)
        estimated30d = Math.max(0, pair.current.userRatingsTotal - pair.previous.userRatingsTotal);
      }
    }
    return { ...snap, estimated30d };
  });

  // Build buckets server-side
  const buckets = {
    1000: enriched.filter((s) => s.distanceM <= 1000),
    2000: enriched.filter((s) => s.distanceM <= 2000),
    5000: enriched.filter((s) => s.distanceM <= 5000),
  };

  // Find updatedAt from latest snapshot
  const updatedAt = snapshots.length > 0 ? snapshots[0].createdAt : null;

  return { buckets, updatedAt, isEstimated30d };
}

// ============================================================
// Row Parser
// ============================================================

function parseSnapshotRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    profile: row.profile,
    runPeriodKey: row.run_period_key,
    placeId: row.place_id,
    name: row.name,
    // NOTE: address intentionally NOT included — use Place Details cache for that
    lat: row.lat,
    lng: row.lng,
    rating: row.rating,
    userRatingsTotal: row.user_ratings_total,
    distanceM: row.distance_m,
    types: db.parseJson(row.types_json, []),
    createdAt: row.created_at,
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // ISO week
  getISOWeekKey,

  // Snapshots
  upsertSnapshot,
  bulkUpsertSnapshots,
  getSnapshots,
  getSnapshotPair,
  getLatestPeriodKey,
  getPeriodKeys,

  // Sync
  hasSyncRun,
  logSync,

  // Place details cache
  getCachedPlaceDetails,
  cachePlaceDetails,

  // Buckets
  buildBuckets,
};
