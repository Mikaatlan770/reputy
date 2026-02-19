/**
 * Google Business Profile API Client
 * 
 * Wraps the Google Business Profile APIs:
 * - Account Management API (list accounts)
 * - My Business Business Information API (list locations)
 * - My Business API v4 (reviews + replies)
 * 
 * All methods accept a decrypted access token.
 */

const { httpsRequest } = require('./google-oauth');
const logger = require('../logger');

// ============================================================
// API Base URLs
// ============================================================

const ACCOUNT_MANAGEMENT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const MYBUSINESS_API_V4 = 'https://mybusiness.googleapis.com/v4';

// ============================================================
// Accounts
// ============================================================

/**
 * List all Google Business accounts for the authenticated user
 * @param {string} accessToken - Google OAuth access token
 * @returns {Promise<Array>} List of accounts
 */
async function listAccounts(accessToken) {
  const result = await httpsRequest(`${ACCOUNT_MANAGEMENT_API}/accounts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  return result.accounts || [];
}

// ============================================================
// Locations
// ============================================================

/**
 * List locations for a Google Business account
 * @param {string} accessToken - Google OAuth access token
 * @param {string} accountId - Account resource name (e.g. "accounts/123456789")
 * @returns {Promise<Array>} List of locations
 */
async function listLocations(accessToken, accountId) {
  // The read mask specifies which fields to return
  const readMask = 'name,title,storefrontAddress,metadata';
  const url = `${BUSINESS_INFO_API}/${accountId}/locations?readMask=${encodeURIComponent(readMask)}`;
  
  const result = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  return (result.locations || []).map(loc => ({
    name: loc.name,                        // e.g. "locations/987654321"
    title: loc.title,                      // Business name
    address: formatAddress(loc.storefrontAddress),
    placeId: loc.metadata?.placeId || null,
    mapsUri: loc.metadata?.mapsUri || null,
  }));
}

/**
 * Format a Google address object to a string
 * @param {object} address - Google address object
 * @returns {string} Formatted address
 */
function formatAddress(address) {
  if (!address) return '';
  const parts = [];
  if (address.addressLines) parts.push(...address.addressLines);
  if (address.locality) parts.push(address.locality);
  if (address.postalCode) parts.push(address.postalCode);
  return parts.join(', ');
}

// ============================================================
// Reviews
// ============================================================

/**
 * Fetch reviews for a Google Business location
 * @param {string} accessToken - Google OAuth access token
 * @param {string} accountId - Account resource name (e.g. "accounts/123456789")
 * @param {string} locationId - Location resource name (e.g. "locations/987654321")
 * @param {string} [pageToken] - Pagination token
 * @param {number} [pageSize=50] - Number of reviews per page (max 50)
 * @returns {Promise<object>} { reviews: [], totalReviewCount, averageRating, nextPageToken }
 */
async function listReviews(accessToken, accountId, locationId, pageToken = null, pageSize = 50) {
  let url = `${MYBUSINESS_API_V4}/${accountId}/${locationId}/reviews?pageSize=${pageSize}`;
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
  }

  const result = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  return {
    reviews: (result.reviews || []).map(parseGoogleReview),
    totalReviewCount: result.totalReviewCount || 0,
    averageRating: result.averageRating || 0,
    nextPageToken: result.nextPageToken || null,
  };
}

/**
 * Fetch ALL reviews (paginated, all pages)
 * @param {string} accessToken - Google OAuth access token
 * @param {string} accountId - Account resource name
 * @param {string} locationId - Location resource name
 * @param {number} [maxPages=10] - Safety limit on pages
 * @returns {Promise<object>} { reviews: [], totalReviewCount, averageRating }
 */
async function listAllReviews(accessToken, accountId, locationId, maxPages = 10) {
  const allReviews = [];
  let pageToken = null;
  let totalReviewCount = 0;
  let averageRating = 0;
  let page = 0;

  do {
    const result = await listReviews(accessToken, accountId, locationId, pageToken);
    allReviews.push(...result.reviews);
    totalReviewCount = result.totalReviewCount;
    averageRating = result.averageRating;
    pageToken = result.nextPageToken;
    page++;
  } while (pageToken && page < maxPages);

  return { reviews: allReviews, totalReviewCount, averageRating };
}

/**
 * Parse a Google review into our internal format
 * @param {object} googleReview - Raw Google review object
 * @returns {object} Normalized review object
 */
function parseGoogleReview(googleReview) {
  // Google rating is in STAR_RATING format: ONE, TWO, THREE, FOUR, FIVE
  const ratingMap = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5,
  };

  const rating = ratingMap[googleReview.starRating] || 0;
  
  // Determine sentiment from rating
  let sentiment = null;
  if (rating >= 4) sentiment = 'positive';
  else if (rating === 3) sentiment = 'neutral';
  else if (rating >= 1) sentiment = 'negative';

  return {
    providerReviewId: googleReview.reviewId || googleReview.name,
    authorName: googleReview.reviewer?.displayName || 'Utilisateur Google',
    rating,
    comment: googleReview.comment || null,
    reviewedAt: googleReview.createTime || googleReview.updateTime || new Date().toISOString(),
    provider: 'google',
    sentiment,
    // Include reply info from Google
    googleReply: googleReview.reviewReply ? {
      comment: googleReview.reviewReply.comment,
      updateTime: googleReview.reviewReply.updateTime,
    } : null,
    // Raw data for debugging
    rawJson: JSON.stringify(googleReview),
  };
}

// ============================================================
// Reply to Review
// ============================================================

/**
 * Post a reply to a Google review
 * @param {string} accessToken - Google OAuth access token
 * @param {string} accountId - Account resource name
 * @param {string} locationId - Location resource name
 * @param {string} reviewId - Review resource name (the providerReviewId)
 * @param {string} replyText - Reply text
 * @returns {Promise<object>} Reply response
 */
async function replyToReview(accessToken, accountId, locationId, reviewId, replyText) {
  const url = `${MYBUSINESS_API_V4}/${accountId}/${locationId}/reviews/${reviewId}/reply`;

  const result = await httpsRequest(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ comment: replyText }),
  });

  return result;
}

/**
 * Delete a reply to a Google review
 * @param {string} accessToken - Google OAuth access token
 * @param {string} accountId - Account resource name
 * @param {string} locationId - Location resource name
 * @param {string} reviewId - Review resource name
 * @returns {Promise<void>}
 */
async function deleteReply(accessToken, accountId, locationId, reviewId) {
  const url = `${MYBUSINESS_API_V4}/${accountId}/${locationId}/reviews/${reviewId}/reply`;

  await httpsRequest(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Accounts & Locations
  listAccounts,
  listLocations,
  
  // Reviews
  listReviews,
  listAllReviews,
  parseGoogleReview,
  
  // Replies
  replyToReview,
  deleteReply,
};
