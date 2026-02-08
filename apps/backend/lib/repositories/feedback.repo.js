/**
 * Feedback Repository
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get feedback by ID
 * @param {string} id - Feedback ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM feedbacks WHERE id = $id', { id });
  return row ? parseFeedbackRow(row) : null;
}

/**
 * Get feedback by request DB ID
 * @param {string} requestDbId - Review request ID
 * @returns {object|null}
 */
function getByRequestDbId(requestDbId) {
  const row = db.get(
    'SELECT * FROM feedbacks WHERE request_db_id = $requestDbId',
    { requestDbId }
  );
  return row ? parseFeedbackRow(row) : null;
}

/**
 * List feedbacks for an organization
 * @param {string} orgId - Organization ID
 * @param {object} options - { minRating, maxRating, limit, offset, since }
 * @returns {array}
 */
function listByOrg(orgId, options = {}) {
  let sql = `
    SELECT f.* FROM feedbacks f
    JOIN review_requests r ON f.request_db_id = r.id
    WHERE r.org_id = $orgId
  `;
  const params = { orgId };
  
  if (options.minRating !== undefined) {
    sql += ' AND f.rating >= $minRating';
    params.minRating = options.minRating;
  }
  if (options.maxRating !== undefined) {
    sql += ' AND f.rating <= $maxRating';
    params.maxRating = options.maxRating;
  }
  if (options.since) {
    sql += ' AND f.created_at >= $since';
    params.since = options.since;
  }
  
  sql += ' ORDER BY f.created_at DESC';
  
  if (options.limit) {
    sql += ' LIMIT $limit';
    params.limit = options.limit;
  }
  if (options.offset) {
    sql += ' OFFSET $offset';
    params.offset = options.offset;
  }
  
  const rows = db.all(sql, params);
  return rows.map(parseFeedbackRow);
}

/**
 * Get feedback statistics for an organization
 * @param {string} orgId - Organization ID
 * @param {string} since - ISO date (optional)
 * @returns {object} { total, avgRating, byRating }
 */
function getStats(orgId, since) {
  let whereClause = 'WHERE r.org_id = $orgId';
  const params = { orgId };
  
  if (since) {
    whereClause += ' AND f.created_at >= $since';
    params.since = since;
  }
  
  const stats = db.get(`
    SELECT 
      COUNT(*) as total,
      AVG(f.rating) as avg_rating
    FROM feedbacks f
    JOIN review_requests r ON f.request_db_id = r.id
    ${whereClause}
  `, params);
  
  const byRating = {};
  const ratingRows = db.all(`
    SELECT f.rating, COUNT(*) as count
    FROM feedbacks f
    JOIN review_requests r ON f.request_db_id = r.id
    ${whereClause}
    GROUP BY f.rating
  `, params);
  
  for (const row of ratingRows) {
    byRating[row.rating] = row.count;
  }
  
  return {
    total: stats?.total || 0,
    avgRating: stats?.avg_rating ? Math.round(stats.avg_rating * 10) / 10 : null,
    byRating
  };
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a feedback
 * @param {object} data - Feedback data
 * @returns {object} Created feedback
 */
function create(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO feedbacks (
      id, request_db_id, rating, comment, source, created_at
    ) VALUES (
      $id, $requestDbId, $rating, $comment, $source, $createdAt
    )
  `, {
    id,
    requestDbId: data.requestDbId,
    rating: data.rating || null,
    comment: data.comment || null,
    source: data.source || null,
    createdAt: now
  });
  
  return getById(id);
}

/**
 * Update feedback
 * @param {string} id - Feedback ID
 * @param {object} updates - Fields to update
 * @returns {object|null}
 */
function update(id, updates) {
  const feedback = getById(id);
  if (!feedback) return null;
  
  const fields = [];
  const params = { id };
  
  if (updates.rating !== undefined) {
    fields.push('rating = $rating');
    params.rating = updates.rating;
  }
  if (updates.comment !== undefined) {
    fields.push('comment = $comment');
    params.comment = updates.comment;
  }
  if (updates.source !== undefined) {
    fields.push('source = $source');
    params.source = updates.source;
  }
  
  if (fields.length === 0) return feedback;
  
  db.run(`UPDATE feedbacks SET ${fields.join(', ')} WHERE id = $id`, params);
  
  return getById(id);
}

/**
 * Delete feedback
 * @param {string} id - Feedback ID
 * @returns {boolean}
 */
function deleteFeedback(id) {
  const result = db.run('DELETE FROM feedbacks WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

function parseFeedbackRow(row) {
  return {
    id: row.id,
    requestDbId: row.request_db_id,
    rating: row.rating,
    comment: row.comment,
    source: row.source,
    createdAt: row.created_at
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  getByRequestDbId,
  listByOrg,
  getStats,
  create,
  update,
  delete: deleteFeedback
};
