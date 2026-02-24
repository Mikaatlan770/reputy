/**
 * Contact Repository — Gestion de la base de contacts clients
 *
 * Fonctionnalités :
 *   - CRUD contacts
 *   - Import en masse (CSV/Excel)
 *   - Sync depuis review_requests
 *   - Compteur anti-spam (solicitations sans réponse)
 *   - Déduplication par email/phone au sein d'une org
 */

const db = require('../db');
const crypto = require('node:crypto');

// ============================================================
// Helpers
// ============================================================

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function parseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    email: row.email || null,
    phone: row.phone || null,
    source: row.source || 'manual',
    tags: safeJsonParse(row.tags, []),
    reviewSolicitationsNoReply: row.review_solicitations_no_reply || 0,
    hasLeftReview: row.has_left_review === 1,
    lastSolicitedAt: row.last_solicited_at || null,
    lastReviewAt: row.last_review_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Get a single contact by ID
 */
function getById(id) {
  const row = db.get('SELECT * FROM contacts WHERE id = $id', { id });
  return parseRow(row);
}

/**
 * List contacts for an org
 * @param {string} orgId
 * @param {object} opts - { search, source, limit, offset, hasEmail, hasPhone }
 */
function listByOrg(orgId, opts = {}) {
  const params = { orgId };
  let where = 'WHERE org_id = $orgId';

  if (opts.source) {
    where += ' AND source = $source';
    params.source = opts.source;
  }
  if (opts.hasEmail) {
    where += " AND email IS NOT NULL AND email != ''";
  }
  if (opts.hasPhone) {
    where += " AND phone IS NOT NULL AND phone != ''";
  }
  if (opts.search) {
    where += " AND (first_name LIKE $search OR last_name LIKE $search OR email LIKE $search OR phone LIKE $search)";
    params.search = `%${opts.search}%`;
  }

  const countRow = db.get(`SELECT COUNT(*) as total FROM contacts ${where}`, params);
  const total = countRow?.total || 0;

  let sql = `SELECT * FROM contacts ${where} ORDER BY created_at DESC`;
  if (opts.limit) {
    sql += ' LIMIT $limit';
    params.limit = opts.limit;
  }
  if (opts.offset) {
    sql += ' OFFSET $offset';
    params.offset = opts.offset;
  }

  const rows = db.all(sql, params);
  return { contacts: rows.map(parseRow), total };
}

/**
 * Count contacts by source
 */
function countBySource(orgId) {
  const rows = db.all(
    `SELECT source, COUNT(*) as count FROM contacts WHERE org_id = $orgId GROUP BY source`,
    { orgId }
  );
  const result = { total: 0, manual: 0, import_csv: 0, import_excel: 0, review_request: 0, sync: 0 };
  for (const r of rows) {
    result[r.source] = r.count || 0;
    result.total += r.count || 0;
  }
  // Count with email / phone
  const emailRow = db.get(
    `SELECT COUNT(*) as c FROM contacts WHERE org_id = $orgId AND email IS NOT NULL AND email != ''`,
    { orgId }
  );
  const phoneRow = db.get(
    `SELECT COUNT(*) as c FROM contacts WHERE org_id = $orgId AND phone IS NOT NULL AND phone != ''`,
    { orgId }
  );
  result.withEmail = emailRow?.c || 0;
  result.withPhone = phoneRow?.c || 0;
  return result;
}

/**
 * Get eligible contacts for a review campaign (anti-spam applied)
 * @param {string} orgId
 * @param {string} channel - 'sms' or 'email'
 * @param {number} spamThreshold - max solicitations without reply (default 3)
 */
function listEligibleForReviewCampaign(orgId, channel, spamThreshold = 3) {
  const channelFilter = channel === 'sms'
    ? "AND phone IS NOT NULL AND phone != ''"
    : "AND email IS NOT NULL AND email != ''";

  const rows = db.all(`
    SELECT * FROM contacts
    WHERE org_id = $orgId
      ${channelFilter}
      AND review_solicitations_no_reply < $spamThreshold
      AND has_left_review = 0
    ORDER BY last_solicited_at ASC NULLS FIRST, created_at DESC
  `, { orgId, spamThreshold });

  return rows.map(parseRow);
}

/**
 * Get contacts excluded from review campaign (for display)
 */
function listExcludedFromReviewCampaign(orgId, channel, spamThreshold = 3) {
  const channelFilter = channel === 'sms'
    ? "AND phone IS NOT NULL AND phone != ''"
    : "AND email IS NOT NULL AND email != ''";

  const spamExcluded = db.all(`
    SELECT *, 'spam_threshold' as excluded_reason FROM contacts
    WHERE org_id = $orgId ${channelFilter}
      AND review_solicitations_no_reply >= $spamThreshold
  `, { orgId, spamThreshold });

  const reviewedExcluded = db.all(`
    SELECT *, 'already_reviewed' as excluded_reason FROM contacts
    WHERE org_id = $orgId ${channelFilter}
      AND has_left_review = 1
  `, { orgId });

  return {
    spamExcluded: spamExcluded.map(r => ({ ...parseRow(r), excludedReason: 'spam_threshold' })),
    reviewedExcluded: reviewedExcluded.map(r => ({ ...parseRow(r), excludedReason: 'already_reviewed' })),
  };
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a single contact (with dedup by email)
 * @returns {{ contact, created }} — created=false if duplicate
 */
function create(orgId, data) {
  const email = (data.email || '').trim().toLowerCase() || null;
  const phone = (data.phone || '').trim().replace(/\s+/g, '') || null;

  if (!email && !phone) {
    throw new Error('Contact must have email or phone');
  }

  // Check duplicate by email
  if (email) {
    const existing = db.get(
      `SELECT * FROM contacts WHERE org_id = $orgId AND email = $email`,
      { orgId, email }
    );
    if (existing) {
      // Update name/phone if missing
      if ((data.firstName || data.lastName || phone) && (!existing.first_name && !existing.last_name)) {
        db.run(`UPDATE contacts SET
          first_name = COALESCE($firstName, first_name),
          last_name = COALESCE($lastName, last_name),
          phone = COALESCE($phone, phone),
          updated_at = datetime('now')
          WHERE id = $id`, {
          id: existing.id,
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          phone: phone,
        });
      }
      return { contact: parseRow(existing), created: false };
    }
  }

  // Check duplicate by phone (only if no email match)
  if (phone && !email) {
    const existing = db.get(
      `SELECT * FROM contacts WHERE org_id = $orgId AND phone = $phone`,
      { orgId, phone }
    );
    if (existing) {
      return { contact: parseRow(existing), created: false };
    }
  }

  const id = generateId();
  db.run(`INSERT INTO contacts (id, org_id, first_name, last_name, email, phone, source, tags)
    VALUES ($id, $orgId, $firstName, $lastName, $email, $phone, $source, $tags)`, {
    id,
    orgId,
    firstName: data.firstName || null,
    lastName: data.lastName || null,
    email,
    phone,
    source: data.source || 'manual',
    tags: JSON.stringify(data.tags || []),
  });

  return { contact: getById(id), created: true };
}

/**
 * Import contacts in bulk (returns stats)
 */
function bulkImport(orgId, contacts, source = 'import_csv') {
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;

  for (const c of contacts) {
    const email = (c.email || '').trim().toLowerCase() || null;
    const phone = (c.phone || '').trim().replace(/\s+/g, '') || null;

    if (!email && !phone) {
      invalid++;
      continue;
    }

    try {
      const result = create(orgId, { ...c, source });
      if (result.created) imported++;
      else duplicates++;
    } catch {
      invalid++;
    }
  }

  return { imported, duplicates, invalid, total: contacts.length };
}

/**
 * Sync contacts from review_requests table
 * Extracts patient info from existing review requests
 */
function syncFromReviewRequests(orgId) {
  const rows = db.all(`
    SELECT patient_json FROM review_requests
    WHERE org_id = $orgId AND patient_json IS NOT NULL AND patient_json != '{}'
  `, { orgId });

  const contacts = [];
  for (const row of rows) {
    try {
      const patient = JSON.parse(row.patient_json);
      if (patient.email || patient.phone) {
        contacts.push({
          firstName: patient.firstName || patient.name?.split(' ')[0] || null,
          lastName: patient.lastName || patient.name?.split(' ').slice(1).join(' ') || null,
          email: patient.email || null,
          phone: patient.phone || null,
        });
      }
    } catch {
      // skip invalid JSON
    }
  }

  return bulkImport(orgId, contacts, 'sync');
}

/**
 * Delete a contact
 */
function remove(id) {
  db.run('DELETE FROM contacts WHERE id = $id', { id });
}

/**
 * Increment solicitation counter (called when sending review campaign)
 */
function incrementSolicitation(id) {
  db.run(`UPDATE contacts SET
    review_solicitations_no_reply = review_solicitations_no_reply + 1,
    last_solicited_at = datetime('now'),
    updated_at = datetime('now')
    WHERE id = $id`, { id });
}

/**
 * Mark contact as having left a review (resets solicitation counter)
 */
function markReviewed(id) {
  db.run(`UPDATE contacts SET
    has_left_review = 1,
    review_solicitations_no_reply = 0,
    last_review_at = datetime('now'),
    updated_at = datetime('now')
    WHERE id = $id`, { id });
}

/**
 * Reset solicitation counter (e.g. when contact clicks a link)
 */
function resetSolicitations(id) {
  db.run(`UPDATE contacts SET
    review_solicitations_no_reply = 0,
    updated_at = datetime('now')
    WHERE id = $id`, { id });
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  listByOrg,
  countBySource,
  listEligibleForReviewCampaign,
  listExcludedFromReviewCampaign,
  create,
  bulkImport,
  syncFromReviewRequests,
  remove,
  incrementSolicitation,
  markReviewed,
  resetSolicitations,
};
