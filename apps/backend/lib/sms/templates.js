/**
 * SMS Templates — Review Request
 *
 * Short text messages (max ~160 chars per segment for GSM-7).
 * Unicode (emoji) messages: ~70 chars per segment.
 * French law: STOP mention handled automatically by Brevo for transactional SMS.
 */

'use strict';

/**
 * Review request SMS template
 *
 * IMPORTANT: This template MUST stay aligned with the frontend dashboard preview
 * (apps/reputy-admin/src/lib/sms/constants.ts → SMS_DEFAULT_MESSAGE).
 * Total body (message + URL) must be ≤160 chars GSM-7 = 1 segment garanti.
 *
 * GSM-7 safe: no emoji, no special unicode. Accents è é à ù are GSM-7 basic.
 * Using plain ASCII "a" instead of "à" to match the frontend exactly.
 *
 * @param {{ orgName: string, patientFirstName?: string, feedbackUrl: string }} data
 * @returns {{ body: string, tag: string }}
 */
function reviewRequest(data) {
  const { feedbackUrl } = data;

  // ~87 chars message + ~50 chars URL ≈ 137 chars → 1 segment ✅
  const body = [
    'Bonjour, suite a votre visite, pouvez-vous nous laisser un avis ?',
    'Cela nous aide beaucoup.',
    'Merci !',
    feedbackUrl,
  ].join('\n');

  return { body, tag: 'review_request' };
}

/**
 * Test SMS template
 *
 * @param {{ orgName: string }} data
 * @returns {{ body: string, tag: string }}
 */
function testSms(data) {
  const { orgName } = data;
  return {
    body: `[TEST] Reputy SMS pour ${orgName}. Si vous recevez ce message, la configuration fonctionne.`,
    tag: 'test',
  };
}

// ── REGISTRY ──────────────────────────────────────────────────

const TEMPLATES = {
  review_request: reviewRequest,
  test: testSms,
};

/**
 * Render a SMS template by key
 * @param {string} templateKey
 * @param {object} data
 * @returns {{ body: string, tag: string }}
 */
function renderTemplate(templateKey, data) {
  const fn = TEMPLATES[templateKey];
  if (!fn) throw new Error(`Unknown SMS template: ${templateKey}`);
  return fn(data);
}

module.exports = {
  reviewRequest,
  testSms,
  renderTemplate,
  TEMPLATES,
};
