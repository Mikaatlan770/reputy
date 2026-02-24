/**
 * P0.7 - Email Deliverability Monitoring & Alerting
 *
 * Fournit des métriques de délivrabilité (bounce, complaint, delivery, click)
 * par org et globales, sur fenêtres temporelles configurables.
 * Calcule des alertes basées sur des seuils (complaint rate, bounce rate,
 * webhook silence, warming too long).
 *
 * Aucune migration DB requise — utilise email_outbox, email_events, webhook_events.
 * Delivery rate est best-effort (pas d'alerte si delivered absent).
 */

const db = require('../db');
const logger = require('../logger');
const orgRepo = require('../repositories/org.repo');
const warmup = require('./warmup');

// ============ SEUILS D'ALERTE (constantes) ============

const ALERT_THRESHOLDS = {
  complaintRateOrange: 0.0005,   // 0.05%
  complaintRateRed: 0.001,       // 0.1%
  hardBounceOrange: 0.02,        // 2%
  hardBounceRed: 0.05,           // 5%
  webhookSilenceOrangeHours: 12,
  webhookSilenceRedHours: 24,
  warmingTooLongDaysOrange: 10,
};

// ============ HELPERS ============

/**
 * Parse une fenêtre temporelle ('24h', '7d', '30d') en sinceISO.
 * @param {string} windowStr - '24h' | '7d' | '30d' (default '7d')
 * @returns {{ window: string, sinceISO: string }}
 */
function parseWindow(windowStr) {
  const VALID_WINDOWS = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24 };
  const key = VALID_WINDOWS[windowStr] ? windowStr : '7d';
  const hours = VALID_WINDOWS[key];
  const sinceMs = Date.now() - hours * 60 * 60 * 1000;
  return {
    window: key,
    sinceISO: new Date(sinceMs).toISOString(),
  };
}

/**
 * Division sûre (retourne 0 si denom <= 0).
 * @param {number} num
 * @param {number} denom
 * @returns {number}
 */
function safeRate(num, denom) {
  if (!denom || denom <= 0) return 0;
  if (!num && num !== 0) return 0; // null, undefined, NaN
  return num / denom;
}

/**
 * Arrondi à N décimales (pour les taux affichés).
 */
function roundRate(rate, decimals = 6) {
  return Math.round(rate * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ============ STATS PAR ORG ============

/**
 * Récupère les stats email d'une org sur une fenêtre donnée.
 *
 * @param {string} orgId
 * @param {string} windowStr - '24h' | '7d' | '30d'
 * @returns {object} Stats avec counts et rates
 */
function getOrgEmailStats(orgId, windowStr) {
  const { window: win, sinceISO } = parseWindow(windowStr);

  // 1) Count sent emails
  const sentRow = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox
     WHERE org_id = $orgId AND status = 'sent' AND sent_at >= $since`,
    { orgId, since: sinceISO }
  );
  const sentCount = sentRow?.cnt || 0;

  // 2) Count events by type (JOIN email_events → email_outbox)
  const eventRows = db.all(
    `SELECT ee.event_type, COUNT(*) as cnt
     FROM email_events ee
     JOIN email_outbox eo ON ee.outbox_id = eo.id
     WHERE eo.org_id = $orgId AND ee.created_at >= $since
     GROUP BY ee.event_type`,
    { orgId, since: sinceISO }
  );

  const events = {};
  for (const row of eventRows) {
    events[row.event_type] = row.cnt;
  }

  const bounceCount = events.bounce || 0;
  const complaintCount = events.complaint || 0;
  const deliveredCount = events.delivered || 0;
  const clickCount = events.click || 0;
  const sentEventCount = events.sent || 0;

  return {
    window: win,
    sinceISO,
    sentCount,
    deliveredCount,
    bounceCount,
    complaintCount,
    clickCount,
    sentEventCount,
    bounceRate: roundRate(safeRate(bounceCount, sentCount)),
    complaintRate: roundRate(safeRate(complaintCount, sentCount)),
    deliveryRate: roundRate(safeRate(deliveredCount, sentCount)),
    clickRate: roundRate(safeRate(clickCount, sentCount)),
  };
}

// ============ STATS GLOBALES ============

/**
 * Récupère les stats globales de délivrabilité sur une fenêtre donnée.
 *
 * @param {string} windowStr - '24h' | '7d' | '30d'
 * @returns {object}
 */
function getGlobalEmailHealth(windowStr) {
  const { window: win, sinceISO } = parseWindow(windowStr);

  // 1) Global sent count
  const sentRow = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox
     WHERE status = 'sent' AND sent_at >= $since`,
    { since: sinceISO }
  );
  const sentCount = sentRow?.cnt || 0;

  // 2) Global events by type
  const eventRows = db.all(
    `SELECT ee.event_type, COUNT(*) as cnt
     FROM email_events ee
     JOIN email_outbox eo ON ee.outbox_id = eo.id
     WHERE ee.created_at >= $since AND eo.status = 'sent' AND eo.sent_at >= $since
     GROUP BY ee.event_type`,
    { since: sinceISO }
  );

  const events = {};
  for (const row of eventRows) {
    events[row.event_type] = row.cnt;
  }

  const bounceCount = events.bounce || 0;
  const complaintCount = events.complaint || 0;
  const deliveredCount = events.delivered || 0;
  const clickCount = events.click || 0;

  // 3) Pending + failed counts (useful for dashboard)
  const pendingRow = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox WHERE status = 'pending'`
  );
  const failedRow = db.get(
    `SELECT COUNT(*) as cnt FROM email_outbox
     WHERE status = 'failed' AND created_at >= $since`,
    { since: sinceISO }
  );

  return {
    window: win,
    sinceISO,
    sentCount,
    deliveredCount,
    bounceCount,
    complaintCount,
    clickCount,
    pendingCount: pendingRow?.cnt || 0,
    failedCount: failedRow?.cnt || 0,
    bounceRate: roundRate(safeRate(bounceCount, sentCount)),
    complaintRate: roundRate(safeRate(complaintCount, sentCount)),
    deliveryRate: roundRate(safeRate(deliveredCount, sentCount)),
    clickRate: roundRate(safeRate(clickCount, sentCount)),
  };
}

// ============ TOP RISK ORGS ============

/**
 * Récupère les orgs les plus à risque (complaint/bounce élevés).
 * Une seule query agrégée, enrichie en JS avec org metadata.
 *
 * @param {string} windowStr
 * @param {number} limit - Max orgs (default 20)
 * @returns {Array<object>}
 */
function getTopRiskOrgs(windowStr, limit = 20) {
  const { sinceISO } = parseWindow(windowStr);

  const rows = db.all(
    `SELECT
       eo.org_id AS org_id,
       COUNT(*) AS sent,
       SUM(CASE WHEN ee.event_type = 'bounce' THEN 1 ELSE 0 END) AS bounces,
       SUM(CASE WHEN ee.event_type = 'complaint' THEN 1 ELSE 0 END) AS complaints,
       SUM(CASE WHEN ee.event_type = 'delivered' THEN 1 ELSE 0 END) AS delivered
     FROM email_outbox eo
     LEFT JOIN email_events ee
       ON ee.outbox_id = eo.id AND ee.created_at >= $since
     WHERE eo.status = 'sent' AND eo.sent_at >= $since
     GROUP BY eo.org_id
     HAVING sent > 0
     ORDER BY (CAST(complaints AS REAL) / sent) DESC,
              (CAST(bounces AS REAL) / sent) DESC,
              sent DESC
     LIMIT $limit`,
    { since: sinceISO, limit }
  );

  // Batch enrich with org metadata
  return rows.map(row => {
    const org = orgRepo.getById(row.org_id);
    const warmupState = org ? warmup.getWarmupState(org) : null;

    return {
      orgId: row.org_id,
      orgName: org?.name || 'Unknown',
      plan: org?.plan?.code || 'unknown',
      warmupStatus: warmupState?.status || null,
      sentCount: row.sent,
      bounceCount: row.bounces,
      complaintCount: row.complaints,
      deliveredCount: row.delivered,
      bounceRate: roundRate(safeRate(row.bounces, row.sent)),
      complaintRate: roundRate(safeRate(row.complaints, row.sent)),
      deliveryRate: roundRate(safeRate(row.delivered, row.sent)),
    };
  });
}

// ============ LAST SES WEBHOOK ============

/**
 * Dernier webhook SES reçu (via webhook_events provider='ses').
 *
 * @returns {{ lastSeenAt: string|null, hoursSince: number|null }}
 */
function getLastSesWebhookSeen() {
  const row = db.get(
    `SELECT MAX(created_at) as last_seen FROM webhook_events WHERE provider = 'ses'`
  );

  const lastSeenAt = row?.last_seen || null;

  if (!lastSeenAt) {
    return { lastSeenAt: null, hoursSince: null };
  }

  const hoursSince = (Date.now() - new Date(lastSeenAt).getTime()) / (60 * 60 * 1000);
  return {
    lastSeenAt,
    hoursSince: Math.round(hoursSince * 100) / 100, // arrondi à 2 décimales
  };
}

// ============ ALERT COMPUTATION HELPERS ============

function checkOrgRateAlerts(topRisk, rateKey, countKey, type, redThreshold, orangeThreshold, T) {
  const alerts = [];
  for (const org of topRisk) {
    if (org.sentCount <= 0) continue;
    const rate = org[rateKey];
    const isRed = rate >= redThreshold;
    const isOrange = !isRed && rate >= orangeThreshold;
    if (!isRed && !isOrange) continue;

    const severity = isRed ? 'red' : 'orange';
    const threshold = isRed ? redThreshold : orangeThreshold;
    const label = isRed ? 'critique' : "d'attention";
    alerts.push({
      id: `${rateKey.replace('Rate', '')}_${severity}_${org.orgId}`,
      severity,
      type,
      message: `${org.orgName}: ${rateKey.replace('Rate', '')} rate ${(rate * 100).toFixed(3)}% dépasse le seuil ${label} (${(threshold * 100).toFixed(2)}%)`,
      orgId: org.orgId,
      meta: { [rateKey]: rate, [countKey]: org[countKey], sent: org.sentCount, threshold },
    });
  }
  return alerts;
}

function checkWebhookSilenceAlerts(globalStats24h, lastSes, T) {
  if (globalStats24h.sentCount <= 0) return [];
  const baseMeta = { sent24h: globalStats24h.sentCount };

  if (lastSes.lastSeenAt === null) {
    return [{
      id: 'webhook_silence_red', severity: 'red', type: 'GLOBAL_WEBHOOK_SILENCE',
      message: `Aucun webhook SES reçu alors que ${globalStats24h.sentCount} email(s) envoyé(s) les dernières 24h. Vérifier la config SNS/SES.`,
      meta: { lastSeenAt: null, ...baseMeta },
    }];
  }

  if (lastSes.hoursSince >= T.webhookSilenceRedHours) {
    return [{
      id: 'webhook_silence_red', severity: 'red', type: 'GLOBAL_WEBHOOK_SILENCE',
      message: `Dernier webhook SES reçu il y a ${lastSes.hoursSince.toFixed(1)}h (> ${T.webhookSilenceRedHours}h). Vérifier la config SNS/SES.`,
      meta: { lastSeenAt: lastSes.lastSeenAt, hoursSince: lastSes.hoursSince, ...baseMeta, threshold: T.webhookSilenceRedHours },
    }];
  }

  if (lastSes.hoursSince >= T.webhookSilenceOrangeHours) {
    return [{
      id: 'webhook_silence_orange', severity: 'orange', type: 'GLOBAL_WEBHOOK_SILENCE',
      message: `Dernier webhook SES reçu il y a ${lastSes.hoursSince.toFixed(1)}h (> ${T.webhookSilenceOrangeHours}h). À surveiller.`,
      meta: { lastSeenAt: lastSes.lastSeenAt, hoursSince: lastSes.hoursSince, ...baseMeta, threshold: T.webhookSilenceOrangeHours },
    }];
  }

  return [];
}

function checkWarmingAlerts(T) {
  const alerts = [];
  try {
    const allOrgs = orgRepo.getAll();
    for (const org of allOrgs) {
      const wState = org.options?.emailWarmup;
      if (!wState || wState.status !== 'warming' || !wState.startedAt) continue;

      const daysSinceStart = (Date.now() - new Date(wState.startedAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceStart >= T.warmingTooLongDaysOrange) {
        alerts.push({
          id: `warming_too_long_${org.id}`, severity: 'orange', type: 'ORG_WARMING_TOO_LONG',
          message: `${org.name}: en warm-up depuis ${Math.floor(daysSinceStart)} jours (seuil: ${T.warmingTooLongDaysOrange}j). Vérifier ou forcer warm.`,
          orgId: org.id,
          meta: { warmupStatus: wState.status, startedAt: wState.startedAt, daysSinceStart: Math.floor(daysSinceStart), threshold: T.warmingTooLongDaysOrange },
        });
      }
    }
  } catch (err) {
    logger.logError('MONITORING_WARMING_CHECK_ERROR', err.message, { error: err.message });
  }
  return alerts;
}

// ============ ALERTES ============

/**
 * Calcule les alertes de délivrabilité.
 *
 * @param {string} windowStr - Fenêtre pour les stats par org
 * @param {object} [injected] - Données pré-calculées (évite re-query)
 * @param {object} [injected.globalStats] - Résultat de getGlobalEmailHealth
 * @param {object} [injected.lastSesWebhook] - Résultat de getLastSesWebhookSeen
 * @param {Array}  [injected.topRiskOrgs] - Résultat de getTopRiskOrgs
 * @returns {Array<{ id: string, severity: string, type: string, message: string, orgId?: string, meta: object }>}
 */
function computeAlerts(windowStr = '7d', injected = {}) {
  const T = ALERT_THRESHOLDS;
  const lastSes = injected.lastSesWebhook || getLastSesWebhookSeen();
  const topRisk = injected.topRiskOrgs || getTopRiskOrgs(windowStr, 50);
  const globalStats24h = injected.globalStats24h || getGlobalEmailHealth('24h');

  const alerts = [
    ...checkOrgRateAlerts(topRisk, 'complaintRate', 'complaintCount', 'ORG_COMPLAINT_RATE', T.complaintRateRed, T.complaintRateOrange, T),
    ...checkOrgRateAlerts(topRisk, 'bounceRate', 'bounceCount', 'ORG_BOUNCE_RATE', T.hardBounceRed, T.hardBounceOrange, T),
    ...checkWebhookSilenceAlerts(globalStats24h, lastSes, T),
    ...checkWarmingAlerts(T),
  ];

  const severityOrder = { red: 0, orange: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return alerts;
}

// ============ EXPORTS ============

module.exports = {
  // Helpers (exported for testing)
  parseWindow,
  safeRate,
  roundRate,
  ALERT_THRESHOLDS,

  // Core functions
  getOrgEmailStats,
  getGlobalEmailHealth,
  getTopRiskOrgs,
  getLastSesWebhookSeen,
  computeAlerts,
};
