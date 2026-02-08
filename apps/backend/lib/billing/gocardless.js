/**
 * GoCardless Billing Module (STUB)
 * 
 * SEPA Direct Debit payments via GoCardless.
 * 
 * TODO: Full implementation for V1.1
 * - Create mandate flow
 * - Handle webhook events
 * - Subscription management
 */

const logger = require('../logger');

// ============================================================
// Configuration
// ============================================================

const GOCARDLESS_ACCESS_TOKEN = process.env.GOCARDLESS_ACCESS_TOKEN;
const GOCARDLESS_WEBHOOK_SECRET = process.env.GOCARDLESS_WEBHOOK_SECRET;
const GOCARDLESS_ENVIRONMENT = process.env.GOCARDLESS_ENVIRONMENT || 'sandbox';
const REPUTY_DOMAIN = process.env.REPUTY_DOMAIN || 'http://localhost:3002';

// ============================================================
// Stub Implementation
// ============================================================

function isConfigured() {
  // TODO: Implement when GoCardless is ready
  return false;
}

/**
 * Create a GoCardless mandate flow for SEPA
 * @param {object} options
 * @param {string} options.orgId - Organization ID
 * @param {string} options.planId - Plan ID (argent|or)
 * @param {object} options.billingDetails - Customer billing info
 * @param {string} options.successUrl - Redirect URL on success
 * @param {string} options.cancelUrl - Redirect URL on cancel
 * @returns {Promise<{url: string} | {error: object}>}
 */
async function createMandateFlow({ orgId, planId, billingDetails, successUrl, cancelUrl }) {
  logger.logAudit('GOCARDLESS_MANDATE_REQUESTED', { orgId, planId });
  
  // TODO: Implement GoCardless mandate flow
  // 1. Create redirect flow
  // 2. Store flow ID for callback
  // 3. Return redirect URL
  
  return {
    error: {
      errorCategory: 'BILLING_NOT_AVAILABLE',
      errorCode: 'SEPA_NOT_READY',
      message: 'Le prélèvement SEPA sera bientôt disponible.',
      action: 'USE_CARD'
    }
  };
}

/**
 * Verify GoCardless webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Webhook-Signature header
 * @returns {{events: Array} | {error: object}}
 */
function verifyWebhook(rawBody, signature) {
  if (!GOCARDLESS_WEBHOOK_SECRET) {
    return {
      error: {
        errorCategory: 'WEBHOOK_ERROR',
        errorCode: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook GoCardless non configuré'
      }
    };
  }
  
  // TODO: Implement webhook verification
  // GoCardless sends an array of events in "events" field
  
  return {
    error: {
      errorCategory: 'BILLING_NOT_AVAILABLE',
      errorCode: 'SEPA_NOT_READY',
      message: 'GoCardless non implémenté'
    }
  };
}

/**
 * Handle GoCardless webhook events
 * @param {Array} events - Array of GoCardless events
 * @returns {Promise<{processed: number, errors: number}>}
 */
async function handleWebhookEvents(events) {
  // TODO: Implement event handling
  // Event types to handle:
  // - mandates (created, cancelled, failed)
  // - payments (created, confirmed, failed, charged_back)
  // - subscriptions (created, cancelled, payment_created)
  
  logger.logAudit('GOCARDLESS_WEBHOOK_RECEIVED', {
    eventCount: events?.length || 0,
    status: 'not_implemented'
  });
  
  return { processed: 0, errors: 0 };
}

// ============================================================
// Plan & Pricing (for future use)
// ============================================================

// GoCardless subscription plan IDs (to be configured)
const PLAN_TO_SUBSCRIPTION = {
  argent: process.env.GOCARDLESS_PLAN_ID_ARGENT || null,
  or: process.env.GOCARDLESS_PLAN_ID_OR || null
};

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Config
  isConfigured,
  PLAN_TO_SUBSCRIPTION,
  
  // Mandate
  createMandateFlow,
  
  // Webhooks
  verifyWebhook,
  handleWebhookEvents
};
