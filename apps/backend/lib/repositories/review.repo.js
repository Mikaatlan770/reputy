/**
 * Review Repository
 * 
 * Manages reviews (avis Google) for ReputyBoard
 * Phase 1A: DB/API/UI without Google sync
 */

const db = require('../db');
const crypto = require('crypto');

// ============================================================
// Constants
// ============================================================

const VALID_STATUSES = ['pending', 'replied', 'ignored'];
const VALID_REPLY_STATUSES = ['none', 'draft', 'queued', 'sent', 'failed'];
const VALID_SENTIMENTS = ['positive', 'neutral', 'negative'];
const VALID_SORT_COLUMNS = ['reviewed_at', 'rating', 'created_at', 'author_name'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Period to days mapping (Phase 1B)
const PERIOD_TO_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};
const DEFAULT_PERIOD = '30d';

// ============================================================
// ID Generation
// ============================================================

/**
 * Generate a unique review ID
 * @returns {string} Review ID (rev_xxxx format)
 */
function generateId() {
  return 'rev_' + crypto.randomBytes(12).toString('hex');
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Get a review by ID (scoped by org)
 * @param {string} orgId - Organization ID
 * @param {string} reviewId - Review ID
 * @returns {object|null} Review object
 */
function getById(orgId, reviewId) {
  const row = db.get(
    'SELECT * FROM reviews WHERE id = $reviewId AND org_id = $orgId',
    { reviewId, orgId }
  );
  return row ? parseRow(row) : null;
}

/**
 * Get a review by provider review ID (for deduplication)
 * @param {string} orgId - Organization ID
 * @param {string} provider - Provider name (e.g., 'google')
 * @param {string} providerReviewId - Provider's review ID
 * @returns {object|null} Review object
 */
function getByProviderReviewId(orgId, provider, providerReviewId) {
  const row = db.get(
    `SELECT * FROM reviews 
     WHERE org_id = $orgId AND provider = $provider AND provider_review_id = $providerReviewId`,
    { orgId, provider, providerReviewId }
  );
  return row ? parseRow(row) : null;
}

/**
 * List reviews for an org with filters and pagination
 * @param {string} orgId - Organization ID
 * @param {object} filters - { status, rating, search }
 * @param {object} pagination - { sort, order, limit, offset }
 * @returns {object} { reviews: [], total: number, hasMore: boolean }
 */
function listReviews(orgId, filters = {}, pagination = {}) {
  const { status, rating, search } = filters;
  let { sort, order, limit, offset } = pagination;

  // Sanitize pagination
  sort = VALID_SORT_COLUMNS.includes(sort) ? sort : 'reviewed_at';
  order = order === 'asc' ? 'ASC' : 'DESC';
  limit = Math.min(Math.max(1, parseInt(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  offset = Math.max(0, parseInt(offset) || 0);

  // Build query
  let whereClauses = ['org_id = $orgId'];
  const params = { orgId };

  if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
    whereClauses.push('status = $status');
    params.status = status;
  }

  if (rating && rating >= 1 && rating <= 5) {
    whereClauses.push('rating = $rating');
    params.rating = parseInt(rating);
  }

  if (search && search.trim()) {
    whereClauses.push('(author_name LIKE $search OR comment LIKE $search)');
    params.search = `%${search.trim()}%`;
  }

  const whereSQL = whereClauses.join(' AND ');

  // Count total
  const countRow = db.get(
    `SELECT COUNT(*) as total FROM reviews WHERE ${whereSQL}`,
    params
  );
  const total = countRow?.total || 0;

  // Fetch reviews
  params.limit = limit;
  params.offset = offset;

  const rows = db.all(
    `SELECT * FROM reviews 
     WHERE ${whereSQL} 
     ORDER BY ${sort} ${order} 
     LIMIT $limit OFFSET $offset`,
    params
  );

  return {
    reviews: rows.map(parseRow),
    total,
    hasMore: offset + rows.length < total
  };
}

/**
 * Count reviews for an org with optional filters
 * @param {string} orgId - Organization ID
 * @param {object} filters - { status, rating }
 * @returns {number} Count
 */
function countReviews(orgId, filters = {}) {
  const { status, rating } = filters;
  let whereClauses = ['org_id = $orgId'];
  const params = { orgId };

  if (status && VALID_STATUSES.includes(status)) {
    whereClauses.push('status = $status');
    params.status = status;
  }

  if (rating && rating >= 1 && rating <= 5) {
    whereClauses.push('rating = $rating');
    params.rating = parseInt(rating);
  }

  const row = db.get(
    `SELECT COUNT(*) as count FROM reviews WHERE ${whereClauses.join(' AND ')}`,
    params
  );
  return row?.count || 0;
}

/**
 * Get advanced stats for an org's reviews (Phase 1B)
 * Supports period comparison with deltas vs previous period
 * 
 * @param {string} orgId - Organization ID
 * @param {string} period - '7d', '30d', '90d', '365d' (default: '30d')
 * @returns {object} Stats object with KPIs, deltas, and star distribution
 */
function getStats(orgId, period = DEFAULT_PERIOD) {
  // Validate period
  const days = PERIOD_TO_DAYS[period] || PERIOD_TO_DAYS[DEFAULT_PERIOD];
  const validPeriod = PERIOD_TO_DAYS[period] ? period : DEFAULT_PERIOD;

  // ========== ALL-TIME STATS ==========
  const allTimeStats = db.get(`
    SELECT 
      COUNT(*) as total,
      AVG(rating) as avgRating,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount
    FROM reviews 
    WHERE org_id = $orgId
  `, { orgId });

  // ========== CURRENT PERIOD STATS ==========
  const currentPeriodStats = db.get(`
    SELECT 
      COUNT(*) as total,
      AVG(rating) as avgRating,
      COUNT(CASE WHEN reply_status IN ('queued', 'sent') THEN 1 END) as repliedCount
    FROM reviews 
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
  `, { orgId });

  // ========== PREVIOUS PERIOD STATS (for deltas) ==========
  const prevPeriodStats = db.get(`
    SELECT 
      COUNT(*) as total,
      AVG(rating) as avgRating,
      COUNT(CASE WHEN reply_status IN ('queued', 'sent') THEN 1 END) as repliedCount
    FROM reviews 
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days * 2} days')
      AND reviewed_at < datetime('now', '-${days} days')
  `, { orgId });

  // ========== AVERAGE RESPONSE TIME (current period, only where reply_sent_at exists) ==========
  const responseTimeStats = db.get(`
    SELECT 
      AVG((julianday(reply_sent_at) - julianday(reviewed_at)) * 24) as avgHours
    FROM reviews 
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
      AND reply_sent_at IS NOT NULL
  `, { orgId });

  // ========== STAR DISTRIBUTION (current period) ==========
  const starRows = db.all(`
    SELECT rating as stars, COUNT(*) as count
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
    GROUP BY rating
    ORDER BY rating DESC
  `, { orgId });

  // Build star distribution (ensure all stars 1-5 are present)
  const totalPeriod = currentPeriodStats?.total || 0;
  const starDistributionPeriod = [5, 4, 3, 2, 1].map(stars => {
    const found = starRows.find(r => r.stars === stars);
    const count = found?.count || 0;
    return {
      stars,
      count,
      percentage: totalPeriod > 0 ? Math.round((count / totalPeriod) * 100) : 0
    };
  });

  // ========== PROVIDER BREAKDOWN (current period) ==========
  const providerRows = db.all(`
    SELECT COALESCE(provider, 'unknown') as provider, COUNT(*) as count
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
    GROUP BY COALESCE(provider, 'unknown')
    ORDER BY count DESC
  `, { orgId });

  const providerBreakdownPeriod = providerRows.map(r => ({
    provider: r.provider,
    count: r.count || 0,
    percentage: totalPeriod > 0 ? Math.round((r.count / totalPeriod) * 100) : 0,
  }));

  // ========== SENTIMENT BREAKDOWN (current period) ==========
  const sentimentRows = db.all(`
    SELECT sentiment, COUNT(*) as count
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
      AND sentiment IS NOT NULL
    GROUP BY sentiment
    ORDER BY count DESC
  `, { orgId });

  const sentimentBreakdownPeriod = sentimentRows.map(r => ({
    sentiment: r.sentiment,
    count: r.count || 0,
    percentage: totalPeriod > 0 ? Math.round((r.count / totalPeriod) * 100) : 0,
  }));

  // ========== RESPONSE TIME DISTRIBUTION (current period) ==========
  const noReplyRow = db.get(`
    SELECT COUNT(*) as count
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
      AND reply_sent_at IS NULL
  `, { orgId });

  const responseTimeDistRows = db.all(`
    SELECT
      CASE
        WHEN ((julianday(reply_sent_at) - julianday(reviewed_at)) * 24) < 1 THEN '<1h'
        WHEN ((julianday(reply_sent_at) - julianday(reviewed_at)) * 24) < 4 THEN '1-4h'
        WHEN ((julianday(reply_sent_at) - julianday(reviewed_at)) * 24) < 24 THEN '4-24h'
        WHEN ((julianday(reply_sent_at) - julianday(reviewed_at)) * 24) < 72 THEN '1-3d'
        ELSE '>3d'
      END as bucket,
      COUNT(*) as count
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
      AND reply_sent_at IS NOT NULL
    GROUP BY bucket
  `, { orgId });

  const RESPONSE_BUCKETS = ['<1h', '1-4h', '4-24h', '1-3d', '>3d'];
  const repliedWithTimeCount = responseTimeDistRows.reduce((s, r) => s + (r.count || 0), 0);

  const responseTimeDistributionPeriod = RESPONSE_BUCKETS.map(bucket => {
    const found = responseTimeDistRows.find(r => r.bucket === bucket);
    const count = found?.count || 0;
    return {
      bucket,
      count,
      percentage: repliedWithTimeCount > 0 ? Math.round((count / repliedWithTimeCount) * 100) : 0,
    };
  });

  const responseTimeNoReplyCount = noReplyRow?.count || 0;

  // ========== TAG BREAKDOWN (current period, top 12, JS aggregation) ==========
  const tagRows = db.all(`
    SELECT tags
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
      AND tags IS NOT NULL
      AND tags != '[]'
  `, { orgId });

  const tagCounts = new Map();
  for (const row of tagRows) {
    if (!row?.tags) continue;
    try {
      const arr = JSON.parse(row.tags);
      if (!Array.isArray(arr)) continue;
      for (const t of arr) {
        if (!t || typeof t !== 'string') continue;
        const key = t.trim().toLowerCase();
        if (!key) continue;
        tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
      }
    } catch (err) {
      console.debug('[REVIEW] Tag parse skipped:', err.message);
    }
  }

  const tagBreakdownPeriod = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: totalPeriod > 0 ? Math.round((count / totalPeriod) * 100) : 0,
    }));

  // ========== CALCULATE DERIVED VALUES ==========
  
  // Current period values
  const avgRatingPeriod = currentPeriodStats?.avgRating 
    ? Math.round(currentPeriodStats.avgRating * 10) / 10 
    : 0;
  const repliedCountPeriod = currentPeriodStats?.repliedCount || 0;
  const responseRatePeriod = totalPeriod > 0 
    ? Math.round((repliedCountPeriod / totalPeriod) * 100) 
    : 0;

  // Previous period values (for delta calculation)
  const prevTotal = prevPeriodStats?.total || 0;
  const prevAvgRating = prevPeriodStats?.avgRating 
    ? Math.round(prevPeriodStats.avgRating * 10) / 10 
    : 0;
  const prevRepliedCount = prevPeriodStats?.repliedCount || 0;
  const prevResponseRate = prevTotal > 0 
    ? Math.round((prevRepliedCount / prevTotal) * 100) 
    : 0;

  // ========== CALCULATE DELTAS ==========
  
  // Reviews delta: % change in volume
  // If prev = 0, return null (can't calculate % change from 0)
  let reviewsDeltaPct = null;
  if (prevTotal > 0) {
    reviewsDeltaPct = Math.round(((totalPeriod - prevTotal) / prevTotal) * 100);
  }

  // Rating delta: simple difference
  // If prev has no reviews, return null
  let avgRatingDelta = null;
  if (prevPeriodStats?.avgRating != null && prevTotal > 0) {
    avgRatingDelta = Math.round((avgRatingPeriod - prevAvgRating) * 10) / 10;
  }

  // Response rate delta: difference in percentage points
  // If prev = 0 reviews, return null
  let responseRateDeltaPct = null;
  if (prevTotal > 0) {
    responseRateDeltaPct = responseRatePeriod - prevResponseRate;
  }

  // Average response time (in hours, rounded)
  // null if no replied reviews with reply_sent_at
  let avgResponseTimeHours = null;
  if (responseTimeStats?.avgHours != null) {
    avgResponseTimeHours = Math.round(responseTimeStats.avgHours * 10) / 10;
  }

  // ========== RETURN FINAL OBJECT ==========
  return {
    period: validPeriod,

    // All-time stats
    totalAllTime: allTimeStats?.total || 0,
    avgRatingAllTime: allTimeStats?.avgRating 
      ? Math.round(allTimeStats.avgRating * 10) / 10 
      : 0,

    // Current period stats
    totalPeriod,
    avgRatingPeriod,
    pendingCount: allTimeStats?.pendingCount || 0, // all-time pending
    repliedCountPeriod,
    responseRatePeriod,
    avgResponseTimeHours,

    // Deltas vs previous period (null if not calculable)
    reviewsDeltaPct,
    avgRatingDelta,
    responseRateDeltaPct,

    // Star distribution for current period
    starDistributionPeriod,

    // Advanced breakdowns (PR-A analytics)
    providerBreakdownPeriod,
    sentimentBreakdownPeriod,
    responseTimeDistributionPeriod,
    responseTimeNoReplyCount,
    tagBreakdownPeriod,

    // Legacy fields (for backward compatibility)
    total: allTimeStats?.total || 0,
    avgRating: allTimeStats?.avgRating 
      ? Math.round(allTimeStats.avgRating * 10) / 10 
      : 0,
    repliedCount: currentPeriodStats?.repliedCount || 0,
    ignoredCount: 0, // deprecated, kept for compat
    responseRate: responseRatePeriod,
    reviews30Days: validPeriod === '30d' ? totalPeriod : 0,
    starDistribution: starDistributionPeriod
  };
}

/**
 * Get analytics time series for an org
 * @param {string} orgId - Organization ID
 * @param {string} period - '7d', '30d', '90d', '365d'
 * @param {string} groupBy - 'day', 'week', 'month'
 * @returns {object} { series: [] }
 */
function getAnalytics(orgId, period = '30d', groupBy = 'day') {
  // Calculate date range
  const periodDays = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '365d': 365
  };
  const days = periodDays[period] || 30;

  // Group by format
  let dateFormat;
  switch (groupBy) {
    case 'week':
      dateFormat = '%Y-W%W'; // Year-Week
      break;
    case 'month':
      dateFormat = '%Y-%m'; // Year-Month
      break;
    case 'day':
    default:
      dateFormat = '%Y-%m-%d'; // Year-Month-Day
  }

  const rows = db.all(`
    SELECT 
      strftime('${dateFormat}', reviewed_at) as period,
      COUNT(*) as reviews,
      AVG(rating) as avgRating
    FROM reviews
    WHERE org_id = $orgId
      AND reviewed_at >= datetime('now', '-${days} days')
    GROUP BY strftime('${dateFormat}', reviewed_at)
    ORDER BY period ASC
  `, { orgId });

  return {
    series: rows.map(r => ({
      period: r.period,
      reviews: r.reviews || 0,
      avgRating: r.avgRating ? Math.round(r.avgRating * 10) / 10 : 0
    }))
  };
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new review
 * @param {object} data - Review data
 * @returns {object} Created review
 */
function create(data) {
  const id = data.id || generateId();
  const now = db.nowISO();

  // Validate required fields
  if (!data.orgId) throw new Error('orgId is required');
  if (!data.authorName) throw new Error('authorName is required');
  if (!data.rating || data.rating < 1 || data.rating > 5) throw new Error('rating must be 1-5');
  if (!data.reviewedAt) throw new Error('reviewedAt is required');

  // Normalize sentiment
  let sentiment = null;
  if (data.sentiment && VALID_SENTIMENTS.includes(data.sentiment)) {
    sentiment = data.sentiment;
  } else if (data.rating >= 4) {
    sentiment = 'positive';
  } else if (data.rating === 3) {
    sentiment = 'neutral';
  } else {
    sentiment = 'negative';
  }

  // Ensure tags is valid JSON array
  let tags = '[]';
  if (data.tags) {
    if (Array.isArray(data.tags)) {
      tags = JSON.stringify(data.tags);
    } else if (typeof data.tags === 'string') {
      try {
        JSON.parse(data.tags);
        tags = data.tags;
      } catch {
        tags = '[]';
      }
    }
  }

  db.run(`
    INSERT INTO reviews (
      id, org_id, provider, provider_location_id, provider_review_id,
      author_name, rating, comment, reviewed_at, status,
      reply_text, reply_status, reply_sent_at, reply_error,
      tags, sentiment, raw_json, created_at, updated_at
    ) VALUES (
      $id, $orgId, $provider, $providerLocationId, $providerReviewId,
      $authorName, $rating, $comment, $reviewedAt, $status,
      $replyText, $replyStatus, $replySentAt, $replyError,
      $tags, $sentiment, $rawJson, $now, $now
    )
  `, {
    id,
    orgId: data.orgId,
    provider: data.provider || 'google',
    providerLocationId: data.providerLocationId || null,
    providerReviewId: data.providerReviewId || null,
    authorName: data.authorName,
    rating: data.rating,
    comment: data.comment || null,
    reviewedAt: data.reviewedAt,
    status: VALID_STATUSES.includes(data.status) ? data.status : 'pending',
    replyText: data.replyText || null,
    replyStatus: VALID_REPLY_STATUSES.includes(data.replyStatus) ? data.replyStatus : 'none',
    replySentAt: data.replySentAt || null,
    replyError: data.replyError || null,
    tags,
    sentiment,
    rawJson: data.rawJson || null,
    now
  });

  return getById(data.orgId, id);
}

/**
 * Update a review's reply (idempotent)
 * @param {string} orgId - Organization ID
 * @param {string} reviewId - Review ID
 * @param {object} replyData - { replyText, replyStatus, replySentAt, replyError }
 * @returns {object} Updated review or null
 */
function updateReply(orgId, reviewId, replyData) {
  const existing = getById(orgId, reviewId);
  if (!existing) return null;

  // Idempotence: if already queued or sent, return existing without change
  if (['queued', 'sent'].includes(existing.replyStatus) && replyData.replyStatus === 'queued') {
    return existing;
  }

  const now = db.nowISO();
  const updates = [];
  const params = { orgId, reviewId, now };

  if (replyData.replyText !== undefined) {
    updates.push('reply_text = $replyText');
    params.replyText = replyData.replyText;
  }

  if (replyData.replyStatus !== undefined && VALID_REPLY_STATUSES.includes(replyData.replyStatus)) {
    updates.push('reply_status = $replyStatus');
    params.replyStatus = replyData.replyStatus;

    // Update status to 'replied' if sending reply
    if (['queued', 'sent'].includes(replyData.replyStatus)) {
      updates.push("status = 'replied'");
    }
  }

  if (replyData.replySentAt !== undefined) {
    updates.push('reply_sent_at = $replySentAt');
    params.replySentAt = replyData.replySentAt;
  }

  if (replyData.replyError !== undefined) {
    updates.push('reply_error = $replyError');
    params.replyError = replyData.replyError;
  }

  updates.push('updated_at = $now');

  if (updates.length === 1) {
    // Only updated_at, nothing to change
    return existing;
  }

  db.run(`
    UPDATE reviews 
    SET ${updates.join(', ')} 
    WHERE id = $reviewId AND org_id = $orgId
  `, params);

  return getById(orgId, reviewId);
}

/**
 * Update a review's status
 * @param {string} orgId - Organization ID
 * @param {string} reviewId - Review ID
 * @param {string} status - New status
 * @returns {object} Updated review or null
 */
function updateStatus(orgId, reviewId, status) {
  if (!VALID_STATUSES.includes(status)) return null;

  const now = db.nowISO();
  db.run(`
    UPDATE reviews 
    SET status = $status, updated_at = $now 
    WHERE id = $reviewId AND org_id = $orgId
  `, { orgId, reviewId, status, now });

  return getById(orgId, reviewId);
}

/**
 * Delete a review
 * @param {string} orgId - Organization ID
 * @param {string} reviewId - Review ID
 * @returns {boolean} Success
 */
function remove(orgId, reviewId) {
  const result = db.run(
    'DELETE FROM reviews WHERE id = $reviewId AND org_id = $orgId',
    { orgId, reviewId }
  );
  return result.changes > 0;
}

/**
 * Bulk insert reviews (for import/sync)
 * @param {string} orgId - Organization ID
 * @param {array} reviews - Array of review data
 * @returns {object} { inserted: number, skipped: number }
 */
function bulkInsert(orgId, reviews) {
  let inserted = 0;
  let skipped = 0;

  for (const reviewData of reviews) {
    // Check for existing (deduplicate by provider_review_id)
    if (reviewData.providerReviewId) {
      const existing = getByProviderReviewId(
        orgId,
        reviewData.provider || 'google',
        reviewData.providerReviewId
      );
      if (existing) {
        skipped++;
        continue;
      }
    }

    try {
      create({ ...reviewData, orgId });
      inserted++;
    } catch (err) {
      console.error('[REVIEW-REPO] Insert error:', err.message);
      skipped++;
    }
  }

  return { inserted, skipped };
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Parse a database row into review object
 * @param {object} row - Database row
 * @returns {object} Review object
 */
function parseRow(row) {
  if (!row) return null;

  let tags = [];
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    orgId: row.org_id,
    provider: row.provider,
    providerLocationId: row.provider_location_id,
    providerReviewId: row.provider_review_id,
    authorName: row.author_name,
    rating: row.rating,
    comment: row.comment,
    reviewedAt: row.reviewed_at,
    status: row.status,
    replyText: row.reply_text,
    replyStatus: row.reply_status,
    replySentAt: row.reply_sent_at,
    replyError: row.reply_error,
    tags,
    sentiment: row.sentiment,
    rawJson: row.raw_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Constants
  VALID_STATUSES,
  VALID_REPLY_STATUSES,
  VALID_SENTIMENTS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
  PERIOD_TO_DAYS,
  DEFAULT_PERIOD,

  // Read
  getById,
  getByProviderReviewId,
  listReviews,
  countReviews,
  getStats,
  getAnalytics,

  // Write
  create,
  updateReply,
  updateStatus,
  remove,
  bulkInsert,

  // Helpers
  generateId
};
