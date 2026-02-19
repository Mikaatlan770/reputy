#!/usr/bin/env node

/**
 * Sync Competitors — Weekly Cron Job
 *
 * Fetches nearby competitors for all active orgs that have lat/lng configured.
 * Uses Google Places API (New) via Nearby Search, with Text Search fallback.
 *
 * Idempotent: uses `run_period_key` (ISO week) + `profile` + UNIQUE constraint.
 * Running multiple times in the same week is a no-op per org/profile.
 *
 * Usage:
 *   node lib/scripts/sync-competitors.js
 *   node lib/scripts/sync-competitors.js --dry-run
 *
 * Cron (every Monday at 04:00 Europe/Paris):
 *   Option A — crontab with CRON_TZ (recommandé pour serveurs en France):
 *     CRON_TZ=Europe/Paris
 *     0 4 * * 1 cd /path/to/backend && node lib/scripts/sync-competitors.js >> /var/log/reputy/sync-competitors.log 2>&1
 *
 *   Option B — UTC fixe (serveurs UTC):
 *     0 3 * * 1 cd /path/to/backend && node lib/scripts/sync-competitors.js >> /var/log/reputy/sync-competitors.log 2>&1
 */

// Load env
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

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
const MIN_NEARBY_RESULTS_FOR_FALLBACK = 5; // Text Search fallback threshold
const MAX_COMPETITORS_PER_ORG = 25; // Top N to store

// ============================================================
// Main
// ============================================================

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[SYNC-COMPETITORS] Starting weekly competitor sync...${isDryRun ? ' (DRY RUN)' : ''}`);

  // Check Google Places API is configured
  if (!googlePlaces.isConfigured()) {
    console.log('[SYNC-COMPETITORS] ⚠️  GOOGLE_PLACES_API_KEY not configured — skipping');
    process.exit(0);
  }

  // Initialize DB
  if (!db.isInitialized()) {
    db.initSchema();
  }
  db.runPendingMigrations();

  // Get current ISO week
  const periodKey = competitorRepo.getISOWeekKey();
  console.log(`[SYNC-COMPETITORS] Period: ${periodKey}`);

  // Get all active orgs with lat/lng
  const allOrgs = orgRepo.getAll({ status: 'active' });
  const eligibleOrgs = allOrgs.filter((org) => org.lat && org.lng);

  console.log(`[SYNC-COMPETITORS] Found ${eligibleOrgs.length} eligible orgs (of ${allOrgs.length} active)`);

  if (eligibleOrgs.length === 0) {
    console.log('[SYNC-COMPETITORS] No orgs with lat/lng configured. Exiting.');
    process.exit(0);
  }

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const org of eligibleOrgs.slice(0, MAX_ORGS_PER_RUN)) {
    try {
      // Resolve search profile (includes profileName)
      const profile = placesProfiles.getSearchProfile(org.vertical, org.specialty);
      const profileName = profile.profileName;

      // Check idempotence: already synced this week for this profile?
      if (competitorRepo.hasSyncRun(org.id, profileName, periodKey)) {
        console.log(`[SYNC-COMPETITORS] ⏩ Org "${org.name}" (${org.id}): already synced for ${periodKey} / ${profileName}`);
        totalSkipped++;
        continue;
      }

      console.log(`[SYNC-COMPETITORS] 🔍 Org "${org.name}" (${org.id}) — lat=${org.lat}, lng=${org.lng}, profile=${profileName}`);

      // ── Step 1: Nearby Search ──
      let places = [];
      let searchMethod = 'nearby';
      try {
        places = await googlePlaces.nearbySearch({
          lat: org.lat,
          lng: org.lng,
          radiusMeters: MAX_RADIUS_M,
          includedTypes: profile.includedTypes,
          maxResultCount: MAX_RESULTS_PER_SEARCH,
        });
      } catch (nearbyErr) {
        console.log(`[SYNC-COMPETITORS]   ⚠️  Nearby Search failed: ${nearbyErr.message}`);
      }

      // ── Step 2: Text Search fallback if Nearby returned < threshold ──
      //    Also search for textQueryVariants (e.g. "centre dentaire" for "dentiste")
      if (places.length < MIN_NEARBY_RESULTS_FOR_FALLBACK && profile.textQuery) {
        searchMethod = places.length > 0 ? 'nearby+text_fallback' : 'text_fallback';
        console.log(`[SYNC-COMPETITORS]   → Nearby returned ${places.length} (< ${MIN_NEARBY_RESULTS_FOR_FALLBACK}), trying Text Search fallback...`);

        // Build list of queries: primary + variants
        const textQueries = [profile.textQuery, ...(profile.textQueryVariants || [])];
        const existingIds = new Set(places.map((p) => p.placeId));

        for (const query of textQueries) {
          try {
            const textPlaces = await googlePlaces.textSearch({
              textQuery: query,
              lat: org.lat,
              lng: org.lng,
              radiusMeters: MAX_RADIUS_M,
              maxResultCount: MAX_RESULTS_PER_SEARCH,
            });
            let added = 0;
            for (const tp of textPlaces) {
              if (tp.placeId && !existingIds.has(tp.placeId)) {
                places.push(tp);
                existingIds.add(tp.placeId);
                added++;
              }
            }
            if (added > 0) {
              console.log(`[SYNC-COMPETITORS]   → Text Search "${query}" added ${added} new places (${places.length} total)`);
            }
          } catch (textErr) {
            console.log(`[SYNC-COMPETITORS]   ⚠️  Text Search "${query}" failed: ${textErr.message}`);
          }
          // Small delay between variant searches
          if (textQueries.length > 1) await sleep(200);
        }
      }

      console.log(`[SYNC-COMPETITORS]   → Found ${places.length} places (method: ${searchMethod})`);

      // ── Step 3: Filter out the org's own place ──
      places = places.filter((p) => {
        // Match by Google Place ID (exact)
        if (org.googlePlaceId && p.placeId === org.googlePlaceId) return false;
        // Fallback: distance < 50m + similar name (fuzzy)
        if (!org.googlePlaceId && p.lat && p.lng) {
          const dist = googlePlaces.haversineDistance(org.lat, org.lng, p.lat, p.lng);
          if (dist < 50 && org.name && p.name) {
            const normalize = (s) => s.toLowerCase().replace(/[^a-zàâéèêëïîôùûüç\s]/g, '').trim();
            const orgN = normalize(org.name);
            const placeN = normalize(p.name);
            if (placeN.includes(orgN) || orgN.includes(placeN)) {
              console.log(`[SYNC-COMPETITORS]   → Filtered own place: "${p.name}" (dist=${dist}m)`);
              return false;
            }
          }
        }
        return true;
      });

      // ── Step 4: Calculate distances and prepare snapshots ──
      const snapshots = places
        .map((place) => {
          const distanceM = googlePlaces.haversineDistance(
            org.lat, org.lng,
            place.lat, place.lng
          );
          return {
            orgId: org.id,
            profile: profileName,
            runPeriodKey: periodKey,
            placeId: place.placeId,
            name: place.name,
            // NOTE: address intentionally NOT stored in snapshots
            lat: place.lat,
            lng: place.lng,
            rating: place.rating,
            userRatingsTotal: place.userRatingsTotal,
            distanceM,
            types: place.types,
          };
        })
        .filter((s) => s.distanceM <= MAX_RADIUS_M) // Enforce max radius
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, MAX_COMPETITORS_PER_ORG); // Top 25

      // ── Step 5: Persist ──
      if (!isDryRun) {
        competitorRepo.bulkUpsertSnapshots(snapshots);

        competitorRepo.logSync({
          orgId: org.id,
          profile: profileName,
          runPeriodKey: periodKey,
          status: 'success',
          placesFound: places.length,
          placesStored: snapshots.length,
        });
      }

      console.log(`[SYNC-COMPETITORS]   ✅ ${isDryRun ? 'Would store' : 'Stored'} ${snapshots.length} competitors`);
      totalProcessed++;

      // Small delay to respect rate limits
      await sleep(500);

    } catch (err) {
      console.error(`[SYNC-COMPETITORS]   ❌ Error for org ${org.id}: ${err.message}`);

      // Resolve profile for error logging
      let profileName = 'unknown';
      try {
        profileName = placesProfiles.getSearchProfile(org.vertical, org.specialty).profileName;
      } catch (_) { /* ignore */ }

      if (!isDryRun) {
        competitorRepo.logSync({
          orgId: org.id,
          profile: profileName,
          runPeriodKey: periodKey,
          status: 'error',
          placesFound: 0,
          placesStored: 0,
          errorMessage: err.message,
        });
      }

      totalErrors++;
    }
  }

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
