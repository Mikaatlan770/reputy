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
 * @param {{ orgName: string, patientFirstName?: string, feedbackUrl: string }} data
 * @returns {{ body: string, tag: string }}
 */
function reviewRequest(data) {
  const { orgName, patientFirstName, feedbackUrl } = data;

  const greeting = patientFirstName
    ? `Bonjour ${patientFirstName}`
    : 'Bonjour';

  const body = [
    `${greeting}, suite à votre visite chez ${orgName}, votre avis nous est précieux !`,
    feedbackUrl,
    `Merci, l'équipe ${orgName}`,
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
