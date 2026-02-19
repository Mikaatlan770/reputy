/**
 * Google Business Profile Sync Orchestrator
 * 
 * High-level functions that combine OAuth + Business API:
 * - Complete OAuth flow (exchange code → pick account/location → store)
 * - Sync reviews from Google → local DB
 * - Post replies from local DB → Google
 * - Auto-refresh expired tokens
 */

const googleOAuth = require('./google-oauth');
const googleBusiness = require('./google-business');
const logger = require('../logger');

// ============================================================
// Ensure Valid Token
// ============================================================

/**
 * Get a valid access token for an org, refreshing if needed
 * @param {object} orgRepo - Org repository
 * @param {string} orgId - Organization ID
 * @returns {Promise<object>} { accessToken, oauthData } or throws
 */
async function getValidToken(orgRepo, orgId) {
  const org = orgRepo.getById(orgId);
  if (!org) throw new Error('Org not found');

  const oauthData = googleOAuth.parseOAuthJson(org.googleOauthJson);
  if (!oauthData || !oauthData.refreshToken) {
    throw new Error('Google not connected for this organization');
  }

  // Check if token needs refresh
  if (googleOAuth.isTokenExpired(oauthData.tokenExpiry)) {
    logger.logInfo('GOOGLE_TOKEN_REFRESH', `Refreshing Google token for org ${orgId}`);

    try {
      const refreshed = await googleOAuth.refreshAccessToken(oauthData.refreshToken);

      // Build updated OAuth JSON
      const updatedOAuthJson = googleOAuth.buildOAuthJson({
        accessToken: refreshed.accessToken,
        refreshToken: oauthData.refreshToken, // Keep existing refresh token
        expiresIn: refreshed.expiresIn,
        accountId: oauthData.accountId,
        locationId: oauthData.locationId,
        locationName: oauthData.locationName,
        connectedAt: oauthData.connectedAt,
        lastSyncAt: oauthData.lastSyncAt,
        syncStatus: oauthData.syncStatus,
      });

      // Update in DB
      const db = require('../db');
      db.run('UPDATE orgs SET google_oauth_json = $json, updated_at = $now WHERE id = $id', {
        json: updatedOAuthJson,
        now: db.nowISO(),
        id: orgId,
      });

      oauthData.accessToken = refreshed.accessToken;
      oauthData.tokenExpiry = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

      logger.logInfo('GOOGLE_TOKEN_REFRESHED', `Token refreshed for org ${orgId}`);
    } catch (err) {
      logger.logError('GOOGLE_TOKEN_REFRESH_FAILED', { orgId, error: err.message });
      throw new Error('Failed to refresh Google token. Please reconnect Google.');
    }
  }

  return { accessToken: oauthData.accessToken, oauthData };
}

// ============================================================
// Sync Reviews
// ============================================================

/**
 * Sync reviews from Google to local database
 * @param {object} orgRepo - Org repository
 * @param {object} reviewRepo - Review repository
 * @param {string} orgId - Organization ID
 * @param {object} [options] - { logSync: function }
 * @returns {Promise<object>} { imported, skipped, total, averageRating }
 */
async function syncReviews(orgRepo, reviewRepo, orgId, options = {}) {
  const { logSync } = options;

  // Get valid token
  const { accessToken, oauthData } = await getValidToken(orgRepo, orgId);

  if (!oauthData.accountId || !oauthData.locationId) {
    throw new Error('Google account/location not configured. Please complete setup.');
  }

  // Update sync status
  updateSyncStatus(orgId, 'syncing');

  try {
    // Fetch all reviews from Google
    const googleResult = await googleBusiness.listAllReviews(
      accessToken,
      oauthData.accountId,
      oauthData.locationId
    );

    // Transform for bulk insert
    const reviewsToInsert = googleResult.reviews.map(r => ({
      provider: 'google',
      providerLocationId: oauthData.locationId,
      providerReviewId: r.providerReviewId,
      authorName: r.authorName,
      rating: r.rating,
      comment: r.comment,
      reviewedAt: r.reviewedAt,
      sentiment: r.sentiment,
      rawJson: r.rawJson,
      // If Google already has a reply, mark as replied
      ...(r.googleReply ? {
        replyText: r.googleReply.comment,
        replyStatus: 'sent',
        replySentAt: r.googleReply.updateTime,
        status: 'replied',
      } : {}),
    }));

    // Bulk insert with deduplication
    const result = reviewRepo.bulkInsert(orgId, reviewsToInsert);

    // Update last sync timestamp
    updateSyncStatus(orgId, 'idle', new Date().toISOString());

    // Log sync result
    if (logSync) {
      logSync(orgId, 'sync_reviews', 'success', {
        imported: result.inserted,
        skipped: result.skipped,
        totalFromGoogle: googleResult.reviews.length,
        totalReviewCount: googleResult.totalReviewCount,
        averageRating: googleResult.averageRating,
      });
    }

    logger.logInfo('GOOGLE_SYNC_COMPLETE', {
      orgId,
      imported: result.inserted,
      skipped: result.skipped,
      totalFromGoogle: googleResult.reviews.length,
    });

    return {
      imported: result.inserted,
      skipped: result.skipped,
      total: googleResult.totalReviewCount,
      averageRating: googleResult.averageRating,
    };
  } catch (err) {
    updateSyncStatus(orgId, 'error');

    if (logSync) {
      logSync(orgId, 'sync_reviews', 'error', { error: err.message });
    }

    logger.logError('GOOGLE_SYNC_FAILED', { orgId, error: err.message });
    throw err;
  }
}

// ============================================================
// Post Reply to Google
// ============================================================

/**
 * Post a queued reply from local DB to Google
 * @param {object} orgRepo - Org repository
 * @param {object} reviewRepo - Review repository  
 * @param {string} orgId - Organization ID
 * @param {string} reviewId - Local review ID
 * @param {object} [options] - { logSync: function }
 * @returns {Promise<object>} Updated review
 */
async function postReplyToGoogle(orgRepo, reviewRepo, orgId, reviewId, options = {}) {
  const { logSync } = options;

  // Get review
  const review = reviewRepo.getById(orgId, reviewId);
  if (!review) throw new Error('Review not found');
  if (!review.replyText) throw new Error('No reply text to post');
  if (!review.providerReviewId) throw new Error('Review has no Google provider ID');

  // Get valid token
  const { accessToken, oauthData } = await getValidToken(orgRepo, orgId);

  if (!oauthData.accountId || !oauthData.locationId) {
    throw new Error('Google account/location not configured');
  }

  try {
    // Post reply to Google
    await googleBusiness.replyToReview(
      accessToken,
      oauthData.accountId,
      oauthData.locationId,
      review.providerReviewId,
      review.replyText
    );

    // Update local review status
    const now = new Date().toISOString();
    const updated = reviewRepo.updateReply(orgId, reviewId, {
      replyStatus: 'sent',
      replySentAt: now,
      replyError: null,
    });

    if (logSync) {
      logSync(orgId, 'post_reply', 'success', { reviewId, providerReviewId: review.providerReviewId });
    }

    logger.logInfo('GOOGLE_REPLY_POSTED', { orgId, reviewId, providerReviewId: review.providerReviewId });

    return updated;
  } catch (err) {
    // Mark reply as failed
    reviewRepo.updateReply(orgId, reviewId, {
      replyStatus: 'failed',
      replyError: err.message,
    });

    if (logSync) {
      logSync(orgId, 'post_reply', 'error', { reviewId, error: err.message });
    }

    logger.logError('GOOGLE_REPLY_FAILED', { orgId, reviewId, error: err.message });
    throw err;
  }
}

// ============================================================
// Disconnect
// ============================================================

/**
 * Disconnect Google from an org (remove tokens)
 * @param {string} orgId - Organization ID
 * @param {object} [options] - { logSync: function }
 */
function disconnectGoogle(orgId, options = {}) {
  const { logSync } = options;
  const db = require('../db');

  db.run('UPDATE orgs SET google_oauth_json = NULL, updated_at = $now WHERE id = $id', {
    now: db.nowISO(),
    id: orgId,
  });

  if (logSync) {
    logSync(orgId, 'disconnect', 'success', {});
  }

  logger.logInfo('GOOGLE_DISCONNECTED', { orgId });
}

// ============================================================
// Helpers
// ============================================================

/**
 * Update the sync status in google_oauth_json
 * @param {string} orgId - Organization ID
 * @param {string} syncStatus - 'idle' | 'syncing' | 'error'
 * @param {string} [lastSyncAt] - ISO timestamp
 */
function updateSyncStatus(orgId, syncStatus, lastSyncAt = null) {
  const db = require('../db');

  // Read current JSON, update syncStatus field
  const row = db.get('SELECT google_oauth_json FROM orgs WHERE id = $id', { id: orgId });
  if (!row || !row.google_oauth_json) return;

  try {
    const data = JSON.parse(row.google_oauth_json);
    data.syncStatus = syncStatus;
    if (lastSyncAt) data.lastSyncAt = lastSyncAt;

    db.run('UPDATE orgs SET google_oauth_json = $json, updated_at = $now WHERE id = $id', {
      json: JSON.stringify(data),
      now: db.nowISO(),
      id: orgId,
    });
  } catch (err) {
    // Ignore JSON parse errors
  }
}

/**
 * Log a sync event to google_sync_log table
 * @param {string} orgId - Organization ID
 * @param {string} action - 'sync_reviews' | 'post_reply' | 'token_refresh' | 'disconnect'
 * @param {string} status - 'success' | 'error'
 * @param {object} details - Additional details
 */
function logSyncEvent(orgId, action, status, details = {}) {
  try {
    const db = require('../db');
    const crypto = require('crypto');
    const id = 'gsync_' + crypto.randomBytes(8).toString('hex');

    db.run(`
      INSERT INTO google_sync_log (id, org_id, action, status, details_json)
      VALUES ($id, $orgId, $action, $status, $details)
    `, {
      id,
      orgId,
      action,
      status,
      details: JSON.stringify(details),
    });
  } catch (err) {
    // Don't let log failures break the flow
    logger.logError('GOOGLE_SYNC_LOG_ERROR', err.message);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getValidToken,
  syncReviews,
  postReplyToGoogle,
  disconnectGoogle,
  logSyncEvent,
  updateSyncStatus,
};
