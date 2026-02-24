/**
 * P0.8 - Email Alerting Module
 *
 * Sends active notifications (webhook or email) when monitoring alerts are detected.
 * Supports cooldown-based dedup and file-based muting.
 *
 * State files (in .data/):
 * - alerting-state.json  : cooldown tracking { key: { lastSentAt } }
 * - alerting-mutes.json  : mute config { key: { mutedUntil, reason } }
 *
 * One active channel at a time: ALERTING_PROVIDER=webhook|email
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const logger = require('../logger');
const monitoring = require('./monitoring');

// ============ CONFIG ============

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const STATE_FILE = path.join(DATA_DIR, 'alerting-state.json');
const MUTES_FILE = path.join(DATA_DIR, 'alerting-mutes.json');

const ALERTING_PROVIDER = (process.env.ALERTING_PROVIDER || '').toLowerCase() || null; // 'webhook' | 'email' | null
const ALERTING_WEBHOOK_URL = process.env.ALERTING_WEBHOOK_URL || '';
const ALERTING_WEBHOOK_SECRET = process.env.ALERTING_WEBHOOK_SECRET || '';
const ALERTING_EMAIL_TO = process.env.ALERTING_EMAIL_TO || '';
const ALERTING_EMAIL_FROM = process.env.ALERTING_EMAIL_FROM || process.env.EMAIL_FROM || '';

// Optional: restrict webhook URL to known domains (CSV)
const ALERTING_WEBHOOK_ALLOWED_DOMAINS = (process.env.ALERTING_WEBHOOK_ALLOWED_DOMAINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const DEFAULT_COOLDOWN_HOURS = 6;

// ============ STATE FILE I/O ============

/**
 * Ensure .data/ directory exists.
 */
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    logger.logError('ALERTING_DATADIR_ERROR', `Cannot create ${DATA_DIR}: ${err.message}`, { error: err.message });
  }
}

/**
 * Read a JSON state file safely (returns {} on missing/corrupt).
 * @param {string} filePath
 * @returns {object}
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.logWarn('ALERTING_FILE_READ_ERROR', `Cannot read ${filePath}: ${err.message}`, { error: err.message });
    return {};
  }
}

/**
 * Write a JSON state file atomically.
 * @param {string} filePath
 * @param {object} data
 */
function writeJsonFile(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.logError('ALERTING_FILE_WRITE_ERROR', `Cannot write ${filePath}: ${err.message}`, { error: err.message });
  }
}

// ============ COOLDOWN ============

/**
 * Get the alert key for dedup/cooldown.
 * @param {object} alert - { type, orgId }
 * @returns {string}
 */
function alertKey(alert) {
  return `${alert.type}:${alert.orgId || 'global'}`;
}

/**
 * Check if an alert is within cooldown.
 * @param {string} key
 * @param {object} state - alerting state object
 * @param {number} cooldownMs - cooldown in ms
 * @param {number} now - current timestamp
 * @returns {boolean} true if still in cooldown (should skip)
 */
function isInCooldown(key, state, cooldownMs, now) {
  const entry = state[key];
  if (!entry || !entry.lastSentAt) return false;
  const lastSent = new Date(entry.lastSentAt).getTime();
  return (now - lastSent) < cooldownMs;
}

/**
 * Check if an alert is muted.
 * @param {string} key
 * @param {object} mutes - mutes object
 * @param {number} now - current timestamp
 * @returns {{ muted: boolean, reason?: string }}
 */
function isMuted(key, mutes, now) {
  const entry = mutes[key];
  if (!entry || !entry.mutedUntil) return { muted: false };
  const mutedUntil = new Date(entry.mutedUntil).getTime();
  if (now < mutedUntil) {
    return { muted: true, reason: entry.reason || 'muted' };
  }
  return { muted: false };
}

// ============ PROVIDERS ============

/**
 * Send alert notification via webhook (HTTP POST JSON).
 * @param {Array} alerts - alerts to send
 * @param {string} window - time window used
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendWebhook(alerts, window) {
  if (!ALERTING_WEBHOOK_URL) {
    return { ok: false, error: 'ALERTING_WEBHOOK_URL not configured' };
  }

  // Domain allowlist validation (optional — if set, reject unknown domains)
  if (ALERTING_WEBHOOK_ALLOWED_DOMAINS.length > 0) {
    try {
      const hostname = new URL(ALERTING_WEBHOOK_URL).hostname.toLowerCase();
      const allowed = ALERTING_WEBHOOK_ALLOWED_DOMAINS.some(d =>
        hostname === d || hostname.endsWith('.' + d)
      );
      if (!allowed) {
        logger.logError('ALERTING_WEBHOOK_DOMAIN_DENIED', `Webhook domain ${hostname} not in allowlist`, {
          hostname, allowlist: ALERTING_WEBHOOK_ALLOWED_DOMAINS,
        });
        return { ok: false, error: `Webhook domain ${hostname} not in allowlist` };
      }
    } catch (err) {
      return { ok: false, error: `Invalid webhook URL: ${err.message}` };
    }
  }

  // Unique request ID for tracing (logged + sent as header)
  const requestId = `alert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const payload = JSON.stringify({
    app: 'reputy',
    requestId,
    window,
    sentAt: new Date().toISOString(),
    alertCount: alerts.length,
    alerts: alerts.map(a => ({
      id: a.id,
      severity: a.severity,
      type: a.type,
      message: a.message,
      orgId: a.orgId || null,
      meta: a.meta,
    })),
  });

  return new Promise((resolve) => {
    try {
      const url = new URL(ALERTING_WEBHOOK_URL);
      const isHttps = url.protocol === 'https:';
      const mod = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Reputy-Alerting/0.8',
        'X-Request-Id': requestId,
      };
      if (ALERTING_WEBHOOK_SECRET) {
        headers['x-alerting-secret'] = ALERTING_WEBHOOK_SECRET;
      }

      const reqOpts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: 10000,
      };

      const request = mod.request(reqOpts, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, requestId });
          } else {
            resolve({ ok: false, error: `Webhook responded ${res.statusCode}: ${body.substring(0, 200)}`, requestId });
          }
        });
      });

      request.on('error', (err) => {
        resolve({ ok: false, error: `Webhook request error: ${err.message}`, requestId });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({ ok: false, error: 'Webhook request timed out (10s)', requestId });
      });

      request.write(payload);
      request.end();
    } catch (err) {
      resolve({ ok: false, error: `Webhook error: ${err.message}` });
    }
  });
}

/**
 * Send alert notification via email (using P0.4 email provider).
 * @param {Array} alerts - alerts to send
 * @param {string} window - time window used
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendEmail(alerts, window) {
  if (!ALERTING_EMAIL_TO) {
    return { ok: false, error: 'ALERTING_EMAIL_TO not configured' };
  }

  try {
    const emailProvider = require('./provider');
    const recipients = ALERTING_EMAIL_TO.split(',').map(s => s.trim()).filter(Boolean);

    if (recipients.length === 0) {
      return { ok: false, error: 'No valid email recipients' };
    }

    const maxSeverity = alerts.some(a => a.severity === 'red') ? 'RED' : 'ORANGE';
    const typesSummary = [...new Set(alerts.map(a => a.type))].join(', ');

    const subject = `[REPUTY][ALERT][${maxSeverity}] ${typesSummary}`;

    // Plain text body
    const lines = [
      `Reputy Email Monitoring Alert`,
      `Window: ${window}`,
      `Sent at: ${new Date().toISOString()}`,
      `Alert count: ${alerts.length}`,
      '',
      '---',
      '',
    ];

    for (const a of alerts) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.type}${a.orgId ? ` (org: ${a.orgId})` : ''}`);
      lines.push(`  ${a.message}`);
      if (a.meta) {
        const metaStr = Object.entries(a.meta).map(([k, v]) => `${k}=${v}`).join(', ');
        lines.push(`  Meta: ${metaStr}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('Actions: see docs/EMAIL_RUNBOOK.md');
    lines.push('Dashboard: GET /api/email/admin/health?include=topRisk,lastWebhook,alerts');

    const text = lines.join('\n');

    // Simple HTML
    const html = `<pre style="font-family:monospace;font-size:13px;line-height:1.5;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

    // Send to each recipient
    for (const to of recipients) {
      await emailProvider.sendEmail({
        to,
        subject,
        text,
        html,
      });
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Email send error: ${err.message}` };
  }
}

// ============ ALERTING HELPERS ============

function filterBySeverity(alerts, includeOrange) {
  return alerts.filter(a => {
    if (a.severity === 'red') return true;
    if (a.severity === 'orange' && includeOrange) return true;
    return false;
  });
}

function classifyAlerts(filtered, mutes, state, cooldownMs, now) {
  const eligible = [];
  const details = [];

  for (const alert of filtered) {
    const key = alertKey(alert);
    const muteCheck = isMuted(key, mutes, now);

    if (muteCheck.muted) {
      logger.logInfo('ALERT_SKIPPED_MUTED', `Alert ${key} is muted`, {
        key, mutedUntil: mutes[key]?.mutedUntil, reason: muteCheck.reason,
      });
      details.push({ key, status: 'muted', reason: muteCheck.reason });
      continue;
    }

    if (isInCooldown(key, state, cooldownMs, now)) {
      const nextEligible = new Date(new Date(state[key].lastSentAt).getTime() + cooldownMs).toISOString();
      logger.logInfo('ALERT_SKIPPED_COOLDOWN', `Alert ${key} in cooldown`, {
        key, lastSentAt: state[key].lastSentAt, nextEligibleAt: nextEligible,
      });
      details.push({ key, status: 'cooldown', nextEligibleAt: nextEligible });
      continue;
    }

    eligible.push(alert);
  }

  return { eligible, details };
}

function dispatchToProvider(eligible, window) {
  const PROVIDERS = { webhook: sendWebhook, email: sendEmail };
  const sender = PROVIDERS[ALERTING_PROVIDER];
  if (!sender) return null;
  return sender(eligible, window);
}

function recordSendSuccess(eligible, state, now, details) {
  for (const alert of eligible) {
    const key = alertKey(alert);
    state[key] = { lastSentAt: new Date(now).toISOString() };
    logger.logInfo('ALERT_SENT', `Alert sent: ${key}`, {
      provider: ALERTING_PROVIDER, key, severity: alert.severity, type: alert.type,
      orgId: alert.orgId || null,
    });
    details.push({ key, status: 'sent', provider: ALERTING_PROVIDER });
  }
  writeJsonFile(STATE_FILE, state);
}

function recordSendFailure(sendResult, eligible, details) {
  logger.logError('ALERT_SEND_FAILED', `Failed to send alerts: ${sendResult.error}`, {
    provider: ALERTING_PROVIDER, error: sendResult.error, alertCount: eligible.length,
  });
  for (const alert of eligible) {
    details.push({ key: alertKey(alert), status: 'send_failed', error: sendResult.error });
  }
}

function buildResult(allAlerts, filtered, sent, details) {
  return {
    total: allAlerts.length,
    filtered: filtered.length,
    sent,
    skipped: filtered.length - sent,
    errors: sent === 0 && filtered.length > 0 ? filtered.length : 0,
    details,
  };
}

// ============ MAIN ALERTING FUNCTION ============

/**
 * Run alerting: compute alerts, apply filters, send notifications.
 *
 * @param {object} opts
 * @param {string} [opts.window='7d'] - Time window for monitoring
 * @param {boolean} [opts.includeOrange=false] - Include orange alerts
 * @param {number} [opts.cooldownHours=6] - Cooldown between same-key alerts
 * @returns {Promise<{ total, filtered, sent, skipped, errors, details }>}
 */
async function runAlerting(opts = {}) {
  const {
    window = '7d',
    includeOrange = false,
    cooldownHours = DEFAULT_COOLDOWN_HOURS,
  } = opts;

  const now = Date.now();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const allAlerts = monitoring.computeAlerts(window);
  const filtered = filterBySeverity(allAlerts, includeOrange);

  if (filtered.length === 0) {
    logger.logInfo('ALERTING_RUN', 'No actionable alerts', { window, total: allAlerts.length, filtered: 0 });
    return buildResult(allAlerts, [], 0, []);
  }

  const mutes = readJsonFile(MUTES_FILE);
  const state = readJsonFile(STATE_FILE);
  const { eligible, details } = classifyAlerts(filtered, mutes, state, cooldownMs, now);

  if (eligible.length === 0) {
    return buildResult(allAlerts, filtered, 0, details);
  }

  const sendResult = await dispatchToProvider(eligible, window);

  if (!sendResult) {
    logger.logWarn('ALERTING_NO_PROVIDER', 'ALERTING_PROVIDER not set — alerts computed but not sent', {
      window, eligibleCount: eligible.length,
    });
    for (const alert of eligible) {
      details.push({ key: alertKey(alert), status: 'no_provider' });
    }
    return buildResult(allAlerts, filtered, 0, details);
  }

  if (sendResult.ok) {
    recordSendSuccess(eligible, state, now, details);
  } else {
    recordSendFailure(sendResult, eligible, details);
  }

  return buildResult(allAlerts, filtered, sendResult.ok ? eligible.length : 0, details);
}

// ============ EXPORTS ============

module.exports = {
  runAlerting,
  // Exported for testing
  alertKey,
  isInCooldown,
  isMuted,
  readJsonFile,
  writeJsonFile,
  sendWebhook,
  sendEmail,
  // Config (read-only)
  DATA_DIR,
  STATE_FILE,
  MUTES_FILE,
  DEFAULT_COOLDOWN_HOURS,
  ALERTING_WEBHOOK_ALLOWED_DOMAINS,
};
