/**
 * SMS Provider — Brevo (ex-Sendinblue) Transactional SMS
 *
 * Uses Brevo's REST API for SMS delivery.
 * Same pattern as lib/email/provider.js: SMS_DRY_RUN toggle.
 *
 * Brevo SMS API: POST https://api.brevo.com/v3/transactionalSMS/sms
 * Docs: https://developers.brevo.com/reference/sendtransacsms
 */

'use strict';

const logger = require('../logger');
const circuitBreaker = require('../resilience/circuit-breaker');

const CB_SERVICE = 'brevo_sms';

// ============ CONFIG ============
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'brevo';
const SMS_DRY_RUN = (process.env.SMS_DRY_RUN || 'true').toLowerCase() === 'true';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SMS_SENDER = process.env.BREVO_SMS_SENDER || 'Reputy';
const BREVO_SMS_API_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

// ============ HELPERS ============

/**
 * Normalize phone to Brevo format: country code + number, no leading +
 * "+33612345678" → "33612345678"
 * "0612345678"   → "33612345678" (French default)
 *
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-().]/g, '');

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // French number starting with 0 → prepend 33
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '33' + cleaned.substring(1);
  }

  return cleaned;
}

/**
 * Validate phone number (basic check)
 * @param {string} phone - raw phone input
 * @returns {boolean}
 */
function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  // Must be digits only, 10-15 chars (E.164 without +)
  return /^\d{10,15}$/.test(normalized);
}

// ============ SEND ============

/**
 * Send one SMS via Brevo (or dry-run).
 *
 * @param {{ to: string, body: string, tag?: string }} opts
 * @returns {Promise<{ messageId: string, smsCount: number, provider: string, usedCredits?: number, remainingCredits?: number }>}
 */
async function sendSms({ to, body, tag = 'review_request' }) {
  if (!to || !body) {
    throw new Error('[SMS] Missing "to" or "body"');
  }

  const recipient = normalizePhone(to);

  if (!isValidPhone(to)) {
    throw new Error(`[SMS] Invalid phone number: ${to}`);
  }

  // ── Dry-run ──
  if (SMS_DRY_RUN) {
    const fakeId = `sms_dry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.logInfo('SMS_DRY_RUN', 'SMS NOT sent (dry-run)', {
      to: recipient, bodyLength: body.length, tag,
    });
    console.log('\n' + '='.repeat(60));
    console.log('\uD83D\uDCF1 SMS DRY-RUN (non envoyé)');
    console.log('='.repeat(60));
    console.log(`De:       ${BREVO_SMS_SENDER}`);
    console.log(`\u00C0:        ${recipient}`);
    console.log(`Tag:      ${tag}`);
    console.log('-'.repeat(60));
    console.log(body);
    console.log('='.repeat(60) + '\n');
    return { messageId: fakeId, smsCount: 1, provider: 'dry_run' };
  }

  // ── Circuit breaker check ──
  if (!circuitBreaker.canCall(CB_SERVICE)) {
    const cbErr = new Error(`[SMS] Circuit breaker OPEN for ${CB_SERVICE} — skipping send to ${recipient}`);
    cbErr.code = 'CIRCUIT_OPEN';
    logger.logWarn('SMS_CIRCUIT_OPEN', cbErr.message, { to: recipient, service: CB_SERVICE });
    throw cbErr;
  }

  // ── Real send via Brevo ──
  if (!BREVO_API_KEY) {
    throw new Error('[SMS] BREVO_API_KEY not configured. Set SMS_DRY_RUN=true or provide the key.');
  }

  const payload = {
    type: 'transactional',
    unicodeEnabled: false,
    sender: BREVO_SMS_SENDER,
    recipient,
    content: body,
    tag,
  };

  try {
    const response = await fetch(BREVO_SMS_API_URL, {
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
      logger.logError('SMS_SEND_FAILED', `Brevo SMS error: ${errorMsg}`, {
        status: response.status,
        to: recipient,
        error: errorMsg,
        brevoCode: result.code,
      });
      const brevoErr = new Error(`Brevo SMS error (${response.status}): ${errorMsg}`);
      brevoErr.status = response.status;
      circuitBreaker.recordFailure(CB_SERVICE, brevoErr);
      throw brevoErr;
    }

    // Success → reset circuit breaker
    circuitBreaker.recordSuccess(CB_SERVICE);

    logger.logInfo('SMS_SENT', `SMS sent to ${recipient}`, {
      messageId: result.reference || result.messageId,
      smsCount: result.smsCount || 1,
      usedCredits: result.usedCredits,
      remainingCredits: result.remainingCredits,
      provider: 'brevo',
    });

    return {
      messageId: String(result.reference || result.messageId || `brevo_${Date.now()}`),
      smsCount: result.smsCount || 1,
      usedCredits: result.usedCredits || 0,
      remainingCredits: result.remainingCredits,
      provider: 'brevo',
    };

  } catch (err) {
    // Re-throw if already our error (circuit open or Brevo error with CB already recorded)
    if (err.code === 'CIRCUIT_OPEN' || err.message.startsWith('Brevo SMS error')) throw err;

    // Network / unexpected error
    circuitBreaker.recordFailure(CB_SERVICE, err);
    logger.logError('SMS_SEND_FAILED', `Failed to send SMS to ${recipient}`, {
      error: err.message,
      provider: 'brevo',
    });
    throw err;
  }
}

/**
 * Check Brevo SMS credits remaining
 * @returns {Promise<{ ok: boolean, credits?: number, error?: string, provider?: string }>}
 */
async function checkCredits() {
  if (SMS_DRY_RUN || !BREVO_API_KEY) {
    return { ok: true, credits: null, provider: SMS_DRY_RUN ? 'dry_run' : 'not_configured' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: {
        'api-key': BREVO_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const smsPlan = data.plan?.find(p => p.type === 'sms');

    return {
      ok: true,
      credits: smsPlan?.credits ?? data.credits?.sms ?? null,
      provider: 'brevo',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendSms,
  checkCredits,
  normalizePhone,
  isValidPhone,
  SMS_PROVIDER,
  SMS_DRY_RUN,
  BREVO_SMS_SENDER,
};
