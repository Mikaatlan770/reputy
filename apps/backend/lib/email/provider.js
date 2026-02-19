/**
 * P0.4 - Email Provider — Brevo REST API
 *
 * Replaces previous nodemailer/SMTP implementation with Brevo's
 * transactional email REST API for better performance, simpler config,
 * and serverless compatibility.
 *
 * - "brevo_api":  Brevo REST API (production) — default
 * - "ses_smtp":   Legacy SES SMTP via nodemailer (fallback)
 * - dry-run:      Logs to console + returns fake messageId (dev/sandbox)
 *
 * Toggle: EMAIL_DRY_RUN=true (default) → dry-run
 *         EMAIL_DRY_RUN=false          → real send via Brevo API
 */

'use strict';

const logger = require('../logger');
const circuitBreaker = require('../resilience/circuit-breaker');

const CB_SERVICE = 'brevo_email';

// ============ CONFIG ============
const EMAIL_FROM = process.env.EMAIL_FROM || 'Reputy <admin@reputyapp.com>';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@reputyapp.com';
const EMAIL_DRY_RUN = (process.env.EMAIL_DRY_RUN || 'true').toLowerCase() === 'true';
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'brevo_api';

// Brevo API config
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_EMAIL_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Legacy SMTP config (fallback)
const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// ============ HELPERS ============

/**
 * Parse "Name <email>" format into { name, email }
 * @param {string} from - e.g. "Reputy <admin@reputyapp.com>"
 * @returns {{ name: string|undefined, email: string }}
 */
function parseFromAddress(from) {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: from.trim() };
}

/**
 * Parse reply-to into structured format
 * @param {string} replyTo
 * @returns {{ email: string, name?: string }}
 */
function parseReplyTo(replyTo) {
  if (!replyTo) return undefined;
  const parsed = parseFromAddress(replyTo);
  return { email: parsed.email, ...(parsed.name ? { name: parsed.name } : {}) };
}

// ============ BREVO API SEND ============

/**
 * Send email via Brevo REST API
 *
 * @param {{ to: string, subject: string, text?: string, html?: string, headers?: object }} opts
 * @returns {Promise<{ messageId: string, response: string }>}
 */
async function sendViaBrevoApi({ to, subject, text, html, headers = {} }) {
  if (!BREVO_API_KEY) {
    throw new Error(
      '[EMAIL] BREVO_API_KEY not configured. Set EMAIL_DRY_RUN=true or provide the key.'
    );
  }

  const sender = parseFromAddress(EMAIL_FROM);
  const replyTo = parseReplyTo(EMAIL_REPLY_TO);

  const payload = {
    sender: { name: sender.name, email: sender.email },
    to: [{ email: to }],
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
    ...(replyTo ? { replyTo } : {}),
    headers: {
      'X-Mailer': 'Reputy/1.0',
      ...headers,
    },
  };

  const response = await fetch(BREVO_EMAIL_API_URL, {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.text();
  let result;

  try {
    result = JSON.parse(responseBody);
  } catch {
    result = { raw: responseBody };
  }

  if (!response.ok) {
    const errorMsg = result.message || result.code || `HTTP ${response.status}`;
    const err = new Error(`Brevo email error (${response.status}): ${errorMsg}`);
    err.status = response.status;
    throw err;
  }

  // Brevo returns { messageId: "<uuid@domain>" }
  const messageId = result.messageId || `brevo_${Date.now()}`;
  return { messageId, response: 'ok' };
}

// ============ LEGACY SMTP SEND (fallback) ============

let _transport = null;

/**
 * Get or create nodemailer transport (lazy singleton).
 * Only loaded if EMAIL_PROVIDER=ses_smtp.
 */
function getSmtpTransport() {
  if (_transport) return _transport;

  // Lazy-require nodemailer only when needed
  const nodemailer = require('nodemailer');

  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error(
      '[EMAIL] SMTP_USER / SMTP_PASS manquants pour le mode ses_smtp.'
    );
  }

  _transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: 14,
  });

  return _transport;
}

/**
 * Send email via legacy SMTP (nodemailer)
 */
async function sendViaSmtp({ to, subject, text, html, headers = {} }) {
  const transport = getSmtpTransport();

  const mailOptions = {
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
    replyTo: EMAIL_REPLY_TO,
    headers: { 'X-Mailer': 'Reputy/1.0', ...headers },
  };

  const result = await transport.sendMail(mailOptions);
  return { messageId: result.messageId, response: result.response || 'ok' };
}

// ============ DRY-RUN SEND ============

/**
 * Dry-run: log email to console, return fake messageId
 */
async function sendDryRun({ to, subject, text }) {
  const fakeId = `dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  logger.logInfo('EMAIL_DRY_RUN', 'Email NOT sent (dry-run)', {
    to, subject, messageId: fakeId,
  });
  console.log('\n' + '='.repeat(60));
  console.log('\uD83D\uDCE7 EMAIL DRY-RUN (non envoyé)');
  console.log('='.repeat(60));
  console.log(`De:      ${EMAIL_FROM}`);
  console.log(`\u00C0:       ${to}`);
  console.log(`Sujet:   ${subject}`);
  console.log(`ReplyTo: ${EMAIL_REPLY_TO}`);
  console.log('-'.repeat(60));
  console.log((text || '').substring(0, 500) || '(HTML only)');
  console.log('='.repeat(60) + '\n');
  return { messageId: fakeId, response: 'dry_run' };
}

// ============ PUBLIC API ============

/**
 * Send one email — dispatches to the configured provider.
 *
 * @param {{ to: string, subject: string, text?: string, html?: string, headers?: object }} opts
 * @returns {Promise<{ messageId: string, response: string }>}
 */
async function sendEmail({ to, subject, text, html, headers = {} }) {
  // 1) Dry-run?
  if (EMAIL_DRY_RUN) {
    return sendDryRun({ to, subject, text });
  }

  // 2) Circuit breaker check (Brevo API only)
  if (EMAIL_PROVIDER !== 'ses_smtp' && !circuitBreaker.canCall(CB_SERVICE)) {
    const cbErr = new Error(`[EMAIL] Circuit breaker OPEN for ${CB_SERVICE} — skipping send to ${to}`);
    cbErr.code = 'CIRCUIT_OPEN';
    logger.logWarn('EMAIL_CIRCUIT_OPEN', cbErr.message, { to, service: CB_SERVICE });
    throw cbErr;
  }

  // 3) Dispatch to provider
  try {
    let result;

    if (EMAIL_PROVIDER === 'ses_smtp') {
      result = await sendViaSmtp({ to, subject, text, html, headers });
    } else {
      // Default: brevo_api
      result = await sendViaBrevoApi({ to, subject, text, html, headers });
    }

    // Circuit breaker: record success
    if (EMAIL_PROVIDER !== 'ses_smtp') {
      circuitBreaker.recordSuccess(CB_SERVICE);
    }

    logger.logInfo('EMAIL_SENT', `Email sent to ${to}`, {
      messageId: result.messageId,
      provider: EMAIL_PROVIDER,
    });

    return result;

  } catch (err) {
    // Circuit breaker: record failure (only for network/API errors, not validation)
    if (EMAIL_PROVIDER !== 'ses_smtp' && err.code !== 'CIRCUIT_OPEN') {
      circuitBreaker.recordFailure(CB_SERVICE, err);
    }

    logger.logError('EMAIL_SEND_FAILED', `Failed to send email to ${to}`, {
      error: err.message,
      code: err.code,
      provider: EMAIL_PROVIDER,
    });
    throw err;
  }
}

/**
 * Verify email provider connectivity
 * @returns {Promise<{ ok: boolean, provider: string, error?: string }>}
 */
async function verifyConnection() {
  try {
    if (EMAIL_DRY_RUN) {
      return { ok: true, provider: 'dry_run' };
    }

    if (EMAIL_PROVIDER === 'ses_smtp') {
      const transport = getSmtpTransport();
      if (transport.verify) await transport.verify();
      return { ok: true, provider: 'ses_smtp' };
    }

    // Brevo API: check account to verify API key
    if (!BREVO_API_KEY) {
      return { ok: false, provider: 'brevo_api', error: 'BREVO_API_KEY not configured' };
    }

    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: {
        'api-key': BREVO_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return { ok: false, provider: 'brevo_api', error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      ok: true,
      provider: 'brevo_api',
      email: data.email,
      companyName: data.companyName,
    };

  } catch (err) {
    return { ok: false, provider: EMAIL_PROVIDER, error: err.message };
  }
}

module.exports = {
  sendEmail,
  verifyConnection,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  EMAIL_DRY_RUN,
  EMAIL_PROVIDER,
};
