/**
 * Campaign Repository — Gestion des campagnes d'envoi (avis + marketing)
 *
 * Fonctionnalités :
 *   - CRUD campagnes
 *   - Gestion des destinataires (campaign_recipients)
 *   - Stats agrégées
 */

const db = require('../db');
const crypto = require('crypto');

// ============================================================
// Helpers
// ============================================================

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function parseCampaignRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    type: row.type || 'review',
    channel: row.channel,
    status: row.status || 'draft',
    template: row.template || null,
    subject: row.subject || null,
    scheduledAt: row.scheduled_at || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    spamThreshold: row.spam_threshold || 3,
    totalRecipients: row.total_recipients || 0,
    totalSent: row.total_sent || 0,
    totalClicks: row.total_clicks || 0,
    totalReviews: row.total_reviews || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseRecipientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    status: row.status || 'pending',
    excludedReason: row.excluded_reason || null,
    sentAt: row.sent_at || null,
    clickedAt: row.clicked_at || null,
    reviewedAt: row.reviewed_at || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at,
    // Joined contact fields (if available)
    contactFirstName: row.first_name || null,
    contactLastName: row.last_name || null,
    contactEmail: row.email || null,
    contactPhone: row.phone || null,
  };
}

// ============================================================
// Campaign CRUD
// ============================================================

function getById(id) {
  const row = db.get('SELECT * FROM campaigns WHERE id = $id', { id });
  return parseCampaignRow(row);
}

/**
 * List campaigns for an org
 */
function listByOrg(orgId, opts = {}) {
  const params = { orgId };
  let where = 'WHERE org_id = $orgId';

  if (opts.status) {
    where += ' AND status = $status';
    params.status = opts.status;
  }
  if (opts.type) {
    where += ' AND type = $type';
    params.type = opts.type;
  }

  const countRow = db.get(`SELECT COUNT(*) as total FROM campaigns ${where}`, params);

  let sql = `SELECT * FROM campaigns ${where} ORDER BY created_at DESC`;
  if (opts.limit) {
    sql += ' LIMIT $limit';
    params.limit = opts.limit;
  }
  if (opts.offset) {
    sql += ' OFFSET $offset';
    params.offset = opts.offset;
  }

  const rows = db.all(sql, params);
  return {
    campaigns: rows.map(parseCampaignRow),
    total: countRow?.total || 0,
  };
}

/**
 * Create a campaign
 */
function create(orgId, data) {
  const id = generateId();
  db.run(`INSERT INTO campaigns
    (id, org_id, name, type, channel, status, template, subject, scheduled_at, spam_threshold)
    VALUES ($id, $orgId, $name, $type, $channel, $status, $template, $subject, $scheduledAt, $spamThreshold)`, {
    id,
    orgId,
    name: data.name,
    type: data.type || 'review',
    channel: data.channel,
    status: data.status || 'draft',
    template: data.template || null,
    subject: data.subject || null,
    scheduledAt: data.scheduledAt || null,
    spamThreshold: data.spamThreshold ?? 3,
  });
  return getById(id);
}

/**
 * Update a campaign
 */
function update(id, data) {
  const sets = [];
  const params = { id };

  if (data.name !== undefined) { sets.push('name = $name'); params.name = data.name; }
  if (data.template !== undefined) { sets.push('template = $template'); params.template = data.template; }
  if (data.subject !== undefined) { sets.push('subject = $subject'); params.subject = data.subject; }
  if (data.status !== undefined) { sets.push('status = $status'); params.status = data.status; }
  if (data.scheduledAt !== undefined) { sets.push('scheduled_at = $scheduledAt'); params.scheduledAt = data.scheduledAt; }
  if (data.spamThreshold !== undefined) { sets.push('spam_threshold = $spamThreshold'); params.spamThreshold = data.spamThreshold; }

  if (sets.length === 0) return getById(id);

  sets.push("updated_at = datetime('now')");
  db.run(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = $id`, params);
  return getById(id);
}

/**
 * Delete a campaign (and its recipients via CASCADE)
 */
function remove(id) {
  db.run('DELETE FROM campaigns WHERE id = $id', { id });
}

// ============================================================
// Campaign Recipients
// ============================================================

/**
 * Add recipients to a campaign
 * @param {string} campaignId
 * @param {Array<{contactId, excludedReason?}>} recipients
 */
function addRecipients(campaignId, recipients) {
  let added = 0;
  let excluded = 0;

  for (const r of recipients) {
    const id = generateId();
    const status = r.excludedReason ? 'excluded' : 'pending';
    try {
      db.run(`INSERT OR IGNORE INTO campaign_recipients
        (id, campaign_id, contact_id, status, excluded_reason)
        VALUES ($id, $campaignId, $contactId, $status, $excludedReason)`, {
        id,
        campaignId,
        contactId: r.contactId,
        status,
        excludedReason: r.excludedReason || null,
      });
      if (r.excludedReason) excluded++;
      else added++;
    } catch {
      // Duplicate — ignore
    }
  }

  // Update campaign total
  db.run(`UPDATE campaigns SET
    total_recipients = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $campaignId AND excluded_reason IS NULL),
    updated_at = datetime('now')
    WHERE id = $campaignId`, { campaignId });

  return { added, excluded };
}

/**
 * List recipients of a campaign (with contact info)
 */
function listRecipients(campaignId, opts = {}) {
  const params = { campaignId };
  let where = 'WHERE cr.campaign_id = $campaignId';

  if (opts.status) {
    where += ' AND cr.status = $status';
    params.status = opts.status;
  }
  if (opts.excludeExcluded) {
    where += ' AND cr.excluded_reason IS NULL';
  }

  const sql = `
    SELECT cr.*, c.first_name, c.last_name, c.email, c.phone
    FROM campaign_recipients cr
    JOIN contacts c ON cr.contact_id = c.id
    ${where}
    ORDER BY cr.created_at DESC
  `;

  const rows = db.all(sql, params);
  return rows.map(parseRecipientRow);
}

/**
 * Update recipient status
 */
function updateRecipientStatus(recipientId, status, extra = {}) {
  const sets = ['status = $status'];
  const params = { id: recipientId, status };

  if (status === 'sent') { sets.push("sent_at = datetime('now')"); }
  if (status === 'clicked') { sets.push("clicked_at = datetime('now')"); }
  if (status === 'reviewed') { sets.push("reviewed_at = datetime('now')"); }
  if (extra.errorMessage) { sets.push('error_message = $errorMessage'); params.errorMessage = extra.errorMessage; }

  db.run(`UPDATE campaign_recipients SET ${sets.join(', ')} WHERE id = $id`, params);
}

/**
 * Get campaign stats
 */
function getStats(campaignId) {
  const row = db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN excluded_reason IS NULL THEN 1 ELSE 0 END) as eligible,
      SUM(CASE WHEN status = 'sent' OR status = 'clicked' OR status = 'reviewed' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'clicked' OR status = 'reviewed' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) as reviewed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN excluded_reason = 'spam_threshold' THEN 1 ELSE 0 END) as excluded_spam,
      SUM(CASE WHEN excluded_reason = 'already_reviewed' THEN 1 ELSE 0 END) as excluded_reviewed
    FROM campaign_recipients
    WHERE campaign_id = $campaignId
  `, { campaignId });

  const sent = row?.sent || 0;
  const clicked = row?.clicked || 0;
  const reviewed = row?.reviewed || 0;

  return {
    total: row?.total || 0,
    eligible: row?.eligible || 0,
    sent,
    clicked,
    reviewed,
    failed: row?.failed || 0,
    excludedSpam: row?.excluded_spam || 0,
    excludedReviewed: row?.excluded_reviewed || 0,
    clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
    conversionRate: sent > 0 ? Math.round((reviewed / sent) * 1000) / 10 : 0,
  };
}

/**
 * Refresh aggregated stats on campaign (from recipients)
 */
function refreshCampaignStats(campaignId) {
  const stats = getStats(campaignId);
  db.run(`UPDATE campaigns SET
    total_recipients = $eligible,
    total_sent = $sent,
    total_clicks = $clicked,
    total_reviews = $reviewed,
    updated_at = datetime('now')
    WHERE id = $campaignId`, {
    campaignId,
    eligible: stats.eligible,
    sent: stats.sent,
    clicked: stats.clicked,
    reviewed: stats.reviewed,
  });
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  listByOrg,
  create,
  update,
  remove,
  addRecipients,
  listRecipients,
  updateRecipientStatus,
  getStats,
  refreshCampaignStats,
};
