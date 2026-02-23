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

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isForce = process.argv.includes('--force');
  console.log(`[SYNC-COMPETITORS] Starting weekly competitor sync...${isDryRun ? ' (DRY RUN)' : ''}${isForce ? ' (FORCE)' : ''}`);

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
      if (!isForce && competitorRepo.hasSyncRun(org.id, profileName, periodKey)) {
        console.log(`[SYNC-COMPETITORS] ⏩ Org "${org.name}" (${org.id}): already synced for ${periodKey} / ${profileName}`);
        totalSkipped++;
        continue;
      }

      // If force mode, clear previous data for this period
      if (isForce) {
        console.log(`[SYNC-COMPETITORS]   🔄 Force mode: clearing previous data for ${periodKey} / ${profileName}`);
        try {
          db.run('DELETE FROM competitor_sync_log WHERE org_id = ? AND profile = ? AND run_period_key = ?', [org.id, profileName, periodKey]);
          db.run('DELETE FROM competitor_snapshots WHERE org_id = ? AND profile = ? AND run_period_key = ?', [org.id, profileName, periodKey]);
        } catch (err) { console.debug('[SYNC] Table cleanup skipped:', err.message); }
      }

      console.log(`[SYNC-COMPETITORS] 🔍 Org "${org.name}" (${org.id}) — lat=${org.lat}, lng=${org.lng}, profile=${profileName}`);

      // ── Determine search strategy ──
      // Profiles with specific Google types (dentist, pharmacy, etc.) → Nearby Search first
      // Profiles with only generic 'doctor' → Text Search first (much more relevant for specialties)
      const hasSpecificType = profile.includedTypes.some((t) => SPECIFIC_GOOGLE_TYPES.includes(t));
      const useTextFirst = !hasSpecificType && profile.textQuery;

      let places = [];
      let searchMethod = '';

      if (useTextFirst) {
        // ════════════════════════════════════════════════
        // STRATEGY A: TEXT SEARCH FIRST (specialized profiles)
        // For "médecin esthétique", "cardiologue", etc.
        // Text Search is much more precise than Nearby with generic 'doctor' type
        // ════════════════════════════════════════════════
        searchMethod = 'text';
        console.log(`[SYNC-COMPETITORS]   → Strategy: Text Search first (generic 'doctor' type)`);

        const textQueries = [profile.textQuery, ...(profile.textQueryVariants || [])];
        const existingIds = new Set();

        for (const query of textQueries) {
          try {
            const textPlaces = await googlePlaces.textSearch({
              textQuery: query,
              lat: org.lat,
              lng: org.lng,
              radiusMeters: profile.maxRadius || MAX_RADIUS_M,
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
              console.log(`[SYNC-COMPETITORS]   → Text Search "${query}": +${added} (${places.length} total)`);
            }
          } catch (textErr) {
            console.log(`[SYNC-COMPETITORS]   ⚠️  Text Search "${query}" failed: ${textErr.message}`);
          }
          if (textQueries.length > 1) await sleep(200);
        }

        // Nearby Search as supplement only if very few Text Search results
        if (places.length < MIN_RESULTS_FOR_FALLBACK) {
          searchMethod = places.length > 0 ? 'text+nearby_fallback' : 'nearby_fallback';
          console.log(`[SYNC-COMPETITORS]   → Text Search returned ${places.length} (< ${MIN_RESULTS_FOR_FALLBACK}), trying Nearby Search fallback...`);
          try {
            const nearbyPlaces = await googlePlaces.nearbySearch({
              lat: org.lat,
              lng: org.lng,
              radiusMeters: MAX_RADIUS_M,
              includedTypes: profile.includedTypes,
              maxResultCount: MAX_RESULTS_PER_SEARCH,
            });
            let added = 0;
            for (const np of nearbyPlaces) {
              if (np.placeId && !existingIds.has(np.placeId)) {
                places.push(np);
                existingIds.add(np.placeId);
                added++;
              }
            }
            if (added > 0) {
              console.log(`[SYNC-COMPETITORS]   → Nearby fallback: +${added} (${places.length} total)`);
            }
          } catch (nearbyErr) {
            console.log(`[SYNC-COMPETITORS]   ⚠️  Nearby Search fallback failed: ${nearbyErr.message}`);
          }
        }

      } else {
        // ════════════════════════════════════════════════
        // STRATEGY B: NEARBY SEARCH FIRST (specific types)
        // For dentist, pharmacy, veterinary_care, etc.
        // Nearby Search with specific types is precise enough
        // ════════════════════════════════════════════════
        searchMethod = 'nearby';
        console.log(`[SYNC-COMPETITORS]   → Strategy: Nearby Search first (specific types: ${profile.includedTypes.join(', ')})`);

        try {
          places = await googlePlaces.nearbySearch({
            lat: org.lat,
            lng: org.lng,
            radiusMeters: profile.maxRadius || MAX_RADIUS_M,
            includedTypes: profile.includedTypes,
            maxResultCount: MAX_RESULTS_PER_SEARCH,
          });
        } catch (nearbyErr) {
          console.log(`[SYNC-COMPETITORS]   ⚠️  Nearby Search failed: ${nearbyErr.message}`);
        }

        // Text Search fallback if Nearby returned few results
        if (places.length < MIN_RESULTS_FOR_FALLBACK && profile.textQuery) {
          searchMethod = places.length > 0 ? 'nearby+text_fallback' : 'text_fallback';
          console.log(`[SYNC-COMPETITORS]   → Nearby returned ${places.length} (< ${MIN_RESULTS_FOR_FALLBACK}), trying Text Search fallback...`);

          const textQueries = [profile.textQuery, ...(profile.textQueryVariants || [])];
          const existingIds = new Set(places.map((p) => p.placeId));

          for (const query of textQueries) {
            try {
              const textPlaces = await googlePlaces.textSearch({
                textQuery: query,
                lat: org.lat,
                lng: org.lng,
                radiusMeters: profile.maxRadius || MAX_RADIUS_M,
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
                console.log(`[SYNC-COMPETITORS]   → Text Search "${query}": +${added} (${places.length} total)`);
              }
            } catch (textErr) {
              console.log(`[SYNC-COMPETITORS]   ⚠️  Text Search "${query}" failed: ${textErr.message}`);
            }
            if (textQueries.length > 1) await sleep(200);
          }
        }
      }

      console.log(`[SYNC-COMPETITORS]   → Found ${places.length} raw places (method: ${searchMethod})`);

      // ── Post-filter: exclude clearly irrelevant types ──
      // Only filter if the profile does NOT explicitly target these types
      const profileTargetsIrrelevant = profile.includedTypes.some((t) => IRRELEVANT_TYPES.includes(t));
      if (!profileTargetsIrrelevant) {
        const beforeFilter = places.length;
        places = places.filter((p) => {
          if (!p.types || p.types.length === 0) return true;
          // Exclude if ANY of the place's types is in the irrelevant list
          const hasIrrelevant = p.types.some((t) => IRRELEVANT_TYPES.includes(t));
          if (hasIrrelevant) {
            console.log(`[SYNC-COMPETITORS]     ✂ Filtered: "${p.name}" (types: ${p.types.slice(0, 3).join(', ')})`);
          }
          return !hasIrrelevant;
        });
        if (beforeFilter > places.length) {
          console.log(`[SYNC-COMPETITORS]   → Post-filter: removed ${beforeFilter - places.length} irrelevant places (${places.length} remaining)`);
        }
      }

      // ── Filter out the org's own place ──
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

      // ── Calculate distances and prepare snapshots ──
      const maxRadiusForProfile = profile.maxRadius || MAX_RADIUS_M;
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
            lat: place.lat,
            lng: place.lng,
            rating: place.rating,
            userRatingsTotal: place.userRatingsTotal,
            distanceM,
            types: place.types,
          };
        })
        .filter((s) => s.distanceM <= maxRadiusForProfile)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, MAX_COMPETITORS_PER_ORG);

      // ── Persist ──
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
      } catch (err) { console.debug('[SYNC] Profile resolve failed:', err.message); }

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
