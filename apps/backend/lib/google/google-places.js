/**
 * Google Places API (New) Client
 *
 * Uses API Key authentication (not OAuth).
 * Implements Nearby Search (New) and Place Details (New).
 *
 * Cost control:
 * - Minimal FieldMask on every request
 * - No client-side refresh; only backend cron calls
 * - Results cached in SQLite
 *
 * Required env var:
 * - GOOGLE_PLACES_API_KEY
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/
 */

const https = require('https');
const logger = require('../logger');

// ============================================================
// Configuration
// ============================================================

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

// ============================================================
// HTTPS Helper (JSON POST for Places API New)
// ============================================================

/**
 * Make an HTTPS request to Google Places API (New)
 * @param {string} url - Full URL
 * @param {object} options - { method, headers, body }
 * @returns {Promise<object>} Parsed JSON response
 */
function placesRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('error', reject);
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            const errMsg = json.error?.message || json.error?.status || `HTTP ${res.statusCode}`;
            const err = new Error(`Google Places API: ${errMsg} (HTTP ${res.statusCode})`);
            err.statusCode = res.statusCode;
            err.body = json;
            reject(err);
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Places API response: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Google Places API request timeout'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// ============================================================
// Nearby Search (New)
// ============================================================

/**
 * Search for nearby places using Google Places API (New)
 *
 * Uses "Nearby Search (New)" endpoint.
 * FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types
 *
 * @param {object} params
 * @param {number} params.lat - Latitude of center
 * @param {number} params.lng - Longitude of center
 * @param {number} params.radiusMeters - Search radius in meters (max 50000)
 * @param {string[]} params.includedTypes - Google Place types (e.g. ['doctor', 'dentist'])
 * @param {number} [params.maxResultCount=20] - Max results (1-20)
 * @returns {Promise<Array>} Array of place objects
 */
async function nearbySearch({ lat, lng, radiusMeters, includedTypes, maxResultCount = 20 }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.types',
  ].join(',');

  const body = {
    includedTypes,
    maxResultCount: Math.min(maxResultCount, 20),
    languageCode: 'fr',
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
  };

  const result = await placesRequest(`${PLACES_BASE_URL}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': fieldMask,
    },
    body,
  });

  return (result.places || []).map(parseNearbyPlace);
}

/**
 * Text Search (New) — for keyword-based searches (more specific than Nearby)
 *
 * Used when we need specialty-specific results (e.g. "dermatologue Paris 11")
 *
 * @param {object} params
 * @param {string} params.textQuery - Search text (e.g. "dentiste")
 * @param {number} params.lat - Latitude bias
 * @param {number} params.lng - Longitude bias
 * @param {number} params.radiusMeters - Bias radius
 * @param {number} [params.maxResultCount=20] - Max results
 * @returns {Promise<Array>} Array of place objects
 */
async function textSearch({ textQuery, lat, lng, radiusMeters, maxResultCount = 20 }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.types',
  ].join(',');

  const body = {
    textQuery,
    maxResultCount: Math.min(maxResultCount, 20),
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    languageCode: 'fr',
  };

  const result = await placesRequest(`${PLACES_BASE_URL}/places:searchText`, {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': fieldMask,
    },
    body,
  });

  return (result.places || []).map(parseNearbyPlace);
}

// ============================================================
// Place Details (New)
// ============================================================

/**
 * Fetch detailed information about a place
 *
 * Minimal FieldMask for cost control:
 * id, displayName, formattedAddress, internationalPhoneNumber,
 * websiteUri, rating, userRatingCount, regularOpeningHours,
 * reviews (last 5), types, photos
 *
 * @param {string} placeId - Google Place ID (e.g. "ChIJ...")
 * @returns {Promise<object>} Detailed place object
 */
async function getPlaceDetails(placeId) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'location',
    'internationalPhoneNumber',
    'websiteUri',
    'rating',
    'userRatingCount',
    'regularOpeningHours',
    'reviews',
    'types',
    'photos',
  ].join(',');

  const result = await placesRequest(`${PLACES_BASE_URL}/places/${placeId}?languageCode=fr`, {
    method: 'GET',
    headers: {
      'X-Goog-FieldMask': fieldMask,
    },
  });

  return parsePlaceDetails(result);
}

// ============================================================
// Parsers
// ============================================================

/**
 * Parse a place from Nearby/Text search result
 * @param {object} place - Raw Google Places API place object
 * @returns {object} Normalized place
 */
function parseNearbyPlace(place) {
  return {
    placeId: place.id || null,
    name: place.displayName?.text || place.displayName || '(sans nom)',
    address: place.formattedAddress || '',
    lat: place.location?.latitude || null,
    lng: place.location?.longitude || null,
    rating: place.rating || null,
    userRatingsTotal: place.userRatingCount || 0,
    types: place.types || [],
  };
}

/**
 * Parse Place Details response
 * @param {object} place - Raw Google Places API detail response
 * @returns {object} Normalized detail object
 */
function parsePlaceDetails(place) {
  return {
    placeId: place.id || null,
    name: place.displayName?.text || place.displayName || '(sans nom)',
    address: place.formattedAddress || '',
    lat: place.location?.latitude || null,
    lng: place.location?.longitude || null,
    phone: place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
    rating: place.rating || null,
    userRatingsTotal: place.userRatingCount || 0,
    openingHours: place.regularOpeningHours || null,
    reviews: (place.reviews || []).slice(0, 5).map((r) => ({
      author: r.authorAttribution?.displayName || 'Anonyme',
      rating: r.rating || 0,
      text: r.text?.text || r.originalText?.text || '',
      publishTime: r.publishTime || null,
      relativePublishTimeDescription: r.relativePublishTimeDescription || '',
    })),
    types: place.types || [],
    photos: (place.photos || []).slice(0, 3).map((p) => p.name || null).filter(Boolean),
  };
}

// ============================================================
// Autocomplete (New)
// ============================================================

/**
 * Autocomplete addresses using Google Places API (New)
 *
 * Used for address search in the admin UI (org configuration).
 * Backend proxy to keep API key server-side only.
 *
 * @param {object} params
 * @param {string} params.input - User search input (min 3 chars recommended)
 * @param {string} [params.languageCode='fr'] - Language for results
 * @param {string} [params.regionCode='FR'] - Region bias
 * @returns {Promise<Array<{placeId: string, description: string, mainText: string, secondaryText: string}>>}
 */
async function autocomplete({ input, languageCode = 'fr', regionCode = 'FR' }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  if (!input || input.length < 2) {
    return [];
  }

  const body = {
    input,
    languageCode,
    regionCode,
  };

  const result = await placesRequest(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: 'POST',
    body,
  });

  return (result.suggestions || [])
    .filter((s) => s.placePrediction)
    .map((s) => {
      const pred = s.placePrediction;
      return {
        placeId: pred.placeId || pred.place?.split('/').pop() || null,
        description: pred.text?.text || '',
        mainText: pred.structuredFormat?.mainText?.text || '',
        secondaryText: pred.structuredFormat?.secondaryText?.text || '',
      };
    });
}

/**
 * Get place geometry (lat/lng + address) from a Place ID
 *
 * Minimal FieldMask: id, location, formattedAddress, displayName
 * Used after autocomplete selection to get coordinates.
 *
 * @param {string} placeId - Google Place ID
 * @returns {Promise<{placeId: string, lat: number, lng: number, address: string, name: string}>}
 */
async function getPlaceGeometry(placeId) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  const fieldMask = ['id', 'location', 'formattedAddress', 'displayName'].join(',');

  const result = await placesRequest(`${PLACES_BASE_URL}/places/${placeId}?languageCode=fr`, {
    method: 'GET',
    headers: {
      'X-Goog-FieldMask': fieldMask,
    },
  });

  return {
    placeId: result.id || placeId,
    lat: result.location?.latitude || null,
    lng: result.location?.longitude || null,
    address: result.formattedAddress || '',
    name: result.displayName?.text || '',
  };
}

// ============================================================
// Geo Utilities
// ============================================================

/**
 * Calculate distance between two lat/lng points using Haversine formula
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Check if Places API is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!GOOGLE_PLACES_API_KEY;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  nearbySearch,
  textSearch,
  getPlaceDetails,
  autocomplete,
  getPlaceGeometry,
  haversineDistance,
  parseNearbyPlace,
  parsePlaceDetails,
  isConfigured,
};
