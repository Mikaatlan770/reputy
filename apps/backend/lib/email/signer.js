/**
 * P0.4 - Email Token Signer/Verifier
 *
 * HMAC-SHA256 signed tokens for:
 * - Unsubscribe links (one-click opt-out)
 * - Review links (unique per patient/org)
 *
 * Token format: base64url(JSON) + "." + base64url(HMAC)
 */

const { createHmac, timingSafeEqual } = require('node:crypto');

const EMAIL_SIGNING_SECRET = process.env.EMAIL_SIGNING_SECRET || 'dev-email-signing-secret-change-me';

/**
 * Sign a payload → URL-safe token
 * @param {object} payload
 * @returns {string} "data.sig"
 */
function signToken(payload) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json).toString('base64url');
  const sig = createHmac('sha256', EMAIL_SIGNING_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verify and decode a signed token
 * @param {string} token
 * @returns {{ valid: boolean, payload: object|null, error?: string }}
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, payload: null, error: 'missing_token' };
  }

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) {
    return { valid: false, payload: null, error: 'malformed_token' };
  }

  const data = token.substring(0, dotIndex);
  const sig = token.substring(dotIndex + 1);

  // Recompute expected signature
  const expectedSig = createHmac('sha256', EMAIL_SIGNING_SECRET)
    .update(data)
    .digest('base64url');

  // Timing-safe comparison
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expectedSig, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, payload: null, error: 'invalid_signature' };
    }
  } catch {
    return { valid: false, payload: null, error: 'invalid_signature' };
  }

  // Decode payload
  try {
    const json = Buffer.from(data, 'base64url').toString('utf8');
    const payload = JSON.parse(json);

    // Check expiration if present
    if (payload.exp && Date.now() > payload.exp) {
      return { valid: false, payload, error: 'token_expired' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null, error: 'decode_error' };
  }
}

/**
 * Unsubscribe token (no expiration — must always work)
 */
function createUnsubscribeToken(orgId, email) {
  return signToken({
    type: 'unsubscribe',
    org_id: orgId,
    email: email.toLowerCase().trim(),
  });
}

/**
 * Review link token (expires 30 days)
 */
function createReviewToken(orgId, email, outboxId) {
  return signToken({
    type: 'review',
    org_id: orgId,
    email: email.toLowerCase().trim(),
    outbox_id: outboxId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
}

module.exports = {
  signToken,
  verifyToken,
  createUnsubscribeToken,
  createReviewToken,
};
