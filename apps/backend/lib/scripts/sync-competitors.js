#!/usr/bin/env node

/**
 * Sync Competitors — Weekly Cron Job
 *
 * Fetches nearby competitors for all active orgs that have lat/lng configured.
 *
 * Search Strategy:
 * - Profiles with SPECIFIC Google types (dentist, pharmacy, veterinary_care, physiotherapist)
 *   → Nearby Search first, Text Search fallback
 * - Profiles with GENERIC type (doctor only)
 *   → Text Search first (more precise for specialties), Nearby Search fallback
 *
 * Post-filtering:
 * - Excludes irrelevant types (pharmacy, hospital, university, etc.)
 *   unless the profile explicitly targets those types.
 *
 * Idempotent: uses `run_period_key` (ISO week) + `profile` + UNIQUE constraint.
 * Running multiple times in the same week is a no-op per org/profile.
 *
 * Usage:
 *   node lib/scripts/sync-competitors.js
 *   node lib/scripts/sync-competitors.js --dry-run
 *   node lib/scripts/sync-competitors.js --force   (ignore idempotence, re-sync)
 *
 * Cron (every Monday at 04:00 Europe/Paris):
 *   CRON_TZ=Europe/Paris
 *   0 4 * * 1 cd /path/to/backend && node lib/scripts/sync-competitors.js
 */

// Load env
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });

const db = require('../db');
const googlePlaces = require('../google/google-places');
const placesProfiles = require('../google/places-profiles');
const competitorRepo = require('../repositories/competitor.repo');
const orgRepo = require('../repositories/org.repo');
const logger = require('../logger');

// ============================================================
// Configuration
// ============================================================

const MAX_RADIUS_M = 5000; // Maximum search radius
const MAX_RESULTS_PER_SEARCH = 20; // Google API limit per call
const MAX_ORGS_PER_RUN = 100; // Safety limit
const MIN_RESULTS_FOR_FALLBACK = 3; // Fallback threshold (lowered for better results)
const MAX_COMPETITORS_PER_ORG = 25; // Top N to store

// Google Place types that are specific enough for Nearby Search to be useful
const SPECIFIC_GOOGLE_TYPES = ['dentist', 'pharmacy', 'veterinary_care', 'physiotherapist', 'hospital'];

// Types to EXCLUDE from results (unless the profile explicitly includes them)
// These are clearly not competitors for most profiles
const IRRELEVANT_TYPES = [
  'pharmacy', 'drugstore',
  'hospital',
  'university', 'school', 'secondary_school', 'primary_school',
  'fire_station', 'police',
  'post_office',
  'supermarket', 'grocery_store',
  'gas_station',
  'parking',
  'atm', 'bank',
  'city_hall', 'local_government_office',
  'cemetery',
  'church', 'mosque', 'synagogue', 'hindu_temple',
  // Beauty / wellness — not medical competitors
  'beauty_salon', 'hair_salon', 'hair_care', 'spa',
  'nail_salon', 'tanning_studio',
];

// ============================================================
// Main
// ============================================================

async function dedupMerge(places, existingIds, fetcher, label) {
  try {
    const results = await fetcher();
    let added = 0;
    for (const p of results) {
      if (p.placeId && !existingIds.has(p.placeId)) {
        places.push(p);
        existingIds.add(p.placeId);
        added++;
      }
    }
    if (added > 0) console.log(`[SYNC-COMPETITORS]   → ${label}: +${added} (${places.length} total)`);
  } catch (err) {
    console.log(`[SYNC-COMPETITORS]   ⚠️  ${label} failed: ${err.message}`);
  }
}

async function searchTextFirst(profile, org) {
  const places = [];
  const existingIds = new Set();
  const radius = profile.maxRadius || MAX_RADIUS_M;
  const textQueries = [profile.textQuery, ...(profile.textQueryVariants || [])];

  for (const query of textQueries) {
    await dedupMerge(places, existingIds,
      () => googlePlaces.textSearch({ textQuery: query, lat: org.lat, lng: org.lng, radiusMeters: radius, maxResultCount: MAX_RESULTS_PER_SEARCH }),
      `Text Search "${query}"`
    );
    if (textQueries.length > 1) await sleep(200);
  }

  let method = 'text';
  if (places.length < MIN_RESULTS_FOR_FALLBACK) {
    method = places.length > 0 ? 'text+nearby_fallback' : 'nearby_fallback';
    await dedupMerge(places, existingIds,
      () => googlePlaces.nearbySearch({ lat: org.lat, lng: org.lng, radiusMeters: MAX_RADIUS_M, includedTypes: profile.includedTypes, maxResultCount: MAX_RESULTS_PER_SEARCH }),
      'Nearby fallback'
    );
  }
  return { places, method };
}

async function searchNearbyFirst(profile, org) {
  let places = [];
  const radius = profile.maxRadius || MAX_RADIUS_M;

  try {
    places = await googlePlaces.nearbySearch({ lat: org.lat, lng: org.lng, radiusMeters: radius, includedTypes: profile.includedTypes, maxResultCount: MAX_RESULTS_PER_SEARCH });
  } catch (err) {
    console.log(`[SYNC-COMPETITORS]   ⚠️  Nearby Search failed: ${err.message}`);
  }

  let method = 'nearby';
  if (places.length < MIN_RESULTS_FOR_FALLBACK && profile.textQuery) {
    method = places.length > 0 ? 'nearby+text_fallback' : 'text_fallback';
    const existingIds = new Set(places.map((p) => p.placeId));
    const textQueries = [profile.textQuery, ...(profile.textQueryVariants || [])];
    for (const query of textQueries) {
      await dedupMerge(places, existingIds,
        () => googlePlaces.textSearch({ textQuery: query, lat: org.lat, lng: org.lng, radiusMeters: radius, maxResultCount: MAX_RESULTS_PER_SEARCH }),
        `Text Search "${query}"`
      );
      if (textQueries.length > 1) await sleep(200);
    }
  }
  return { places, method };
}

function postFilterPlaces(places, profile) {
  const profileTargetsIrrelevant = profile.includedTypes.some((t) => IRRELEVANT_TYPES.includes(t));
  if (profileTargetsIrrelevant) return places;

  const beforeFilter = places.length;
  const filtered = places.filter((p) => {
    if (!p.types || p.types.length === 0) return true;
    return !p.types.some((t) => IRRELEVANT_TYPES.includes(t));
  });
  if (beforeFilter > filtered.length) {
    console.log(`[SYNC-COMPETITORS]   → Post-filter: removed ${beforeFilter - filtered.length} irrelevant places`);
  }
  return filtered;
}

function excludeOwnPlace(places, org) {
  return places.filter((p) => {
    if (org.googlePlaceId && p.placeId === org.googlePlaceId) return false;
    if (!org.googlePlaceId && p.lat && p.lng) {
      const dist = googlePlaces.haversineDistance(org.lat, org.lng, p.lat, p.lng);
      if (dist < 50 && org.name && p.name) {
        const normalize = (s) => s.toLowerCase().replace(/[^a-zàâéèêëïîôùûüç\s]/g, '').trim();
        if (normalize(p.name).includes(normalize(org.name)) || normalize(org.name).includes(normalize(p.name))) return false;
      }
    }
    return true;
  });
}

function buildSnapshots(places, org, profileName, periodKey) {
  const maxR = MAX_RADIUS_M;
  return places
    .map((place) => ({
      orgId: org.id, profile: profileName, runPeriodKey: periodKey,
      placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng,
      rating: place.rating, userRatingsTotal: place.userRatingsTotal,
      distanceM: googlePlaces.haversineDistance(org.lat, org.lng, place.lat, place.lng),
      types: place.types,
    }))
    .filter((s) => s.distanceM <= maxR)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_COMPETITORS_PER_ORG);
}

async function syncOneOrg(org, periodKey, isDryRun, isForce) {
  const profile = placesProfiles.getSearchProfile(org.vertical, org.specialty);
  const profileName = profile.profileName;

  if (!isForce && competitorRepo.hasSyncRun(org.id, profileName, periodKey)) {
    console.log(`[SYNC-COMPETITORS] ⏩ Org "${org.name}" (${org.id}): already synced for ${periodKey} / ${profileName}`);
    return 'skipped';
  }

  if (isForce) {
    try {
      db.run('DELETE FROM competitor_sync_log WHERE org_id = ? AND profile = ? AND run_period_key = ?', [org.id, profileName, periodKey]);
      db.run('DELETE FROM competitor_snapshots WHERE org_id = ? AND profile = ? AND run_period_key = ?', [org.id, profileName, periodKey]);
    } catch (err) { console.debug('[SYNC] Table cleanup skipped:', err.message); }
  }

  console.log(`[SYNC-COMPETITORS] 🔍 Org "${org.name}" (${org.id}) — profile=${profileName}`);

  const hasSpecificType = profile.includedTypes.some((t) => SPECIFIC_GOOGLE_TYPES.includes(t));
  const useTextFirst = !hasSpecificType && profile.textQuery;

  const { places: rawPlaces, method } = useTextFirst
    ? await searchTextFirst(profile, org)
    : await searchNearbyFirst(profile, org);

  console.log(`[SYNC-COMPETITORS]   → Found ${rawPlaces.length} raw places (method: ${method})`);

  const filtered = excludeOwnPlace(postFilterPlaces(rawPlaces, profile), org);
  const snapshots = buildSnapshots(filtered, org, profileName, periodKey);

  if (!isDryRun) {
    competitorRepo.bulkUpsertSnapshots(snapshots);
    competitorRepo.logSync({ orgId: org.id, profile: profileName, runPeriodKey: periodKey, status: 'success', placesFound: filtered.length, placesStored: snapshots.length });
  }

  console.log(`[SYNC-COMPETITORS]   ✅ ${isDryRun ? 'Would store' : 'Stored'} ${snapshots.length} competitors`);
  return 'processed';
}

function resolveProfileName(org) {
  try {
    return placesProfiles.getSearchProfile(org.vertical, org.specialty).profileName;
  } catch (e) {
    console.debug('[SYNC] Profile resolve failed:', e.message);
    return 'unknown';
  }
}

function logSyncError(org, err, periodKey, isDryRun) {
  console.error(`[SYNC-COMPETITORS]   ❌ Error for org ${org.id}: ${err.message}`);
  if (!isDryRun) {
    competitorRepo.logSync({
      orgId: org.id, profile: resolveProfileName(org), runPeriodKey: periodKey,
      status: 'error', placesFound: 0, placesStored: 0, errorMessage: err.message,
    });
  }
}

async function processOrgs(eligibleOrgs, periodKey, isDryRun, isForce) {
  let totalProcessed = 0, totalSkipped = 0, totalErrors = 0;

  for (const org of eligibleOrgs.slice(0, MAX_ORGS_PER_RUN)) {
    try {
      const result = await syncOneOrg(org, periodKey, isDryRun, isForce);
      if (result === 'skipped') totalSkipped++;
      else totalProcessed++;
      await sleep(500);
    } catch (err) {
      logSyncError(org, err, periodKey, isDryRun);
      totalErrors++;
    }
  }

  return { totalProcessed, totalSkipped, totalErrors };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isForce = process.argv.includes('--force');
  console.log(`[SYNC-COMPETITORS] Starting weekly competitor sync...${isDryRun ? ' (DRY RUN)' : ''}${isForce ? ' (FORCE)' : ''}`);

  if (!googlePlaces.isConfigured()) {
    console.log('[SYNC-COMPETITORS] ⚠️  GOOGLE_PLACES_API_KEY not configured — skipping');
    process.exit(0);
  }

  if (!db.isInitialized()) db.initSchema();
  db.runPendingMigrations();

  const periodKey = competitorRepo.getISOWeekKey();
  console.log(`[SYNC-COMPETITORS] Period: ${periodKey}`);

  const allOrgs = orgRepo.getAll({ status: 'active' });
  const eligibleOrgs = allOrgs.filter((org) => org.lat && org.lng);
  console.log(`[SYNC-COMPETITORS] Found ${eligibleOrgs.length} eligible orgs (of ${allOrgs.length} active)`);

  if (eligibleOrgs.length === 0) {
    console.log('[SYNC-COMPETITORS] No orgs with lat/lng configured. Exiting.');
    process.exit(0);
  }

  const { totalProcessed, totalSkipped, totalErrors } = await processOrgs(eligibleOrgs, periodKey, isDryRun, isForce);
  console.log(`[SYNC-COMPETITORS] Done! Processed: ${totalProcessed}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run
main().catch((err) => {
  console.error('[SYNC-COMPETITORS] Fatal error:', err);
  process.exit(1);
});
