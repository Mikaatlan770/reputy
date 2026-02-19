/**
 * Stripe Billing Module
 * 
 * Handles Stripe checkout sessions, customer portal, and webhook verification.
 * Gracefully degrades if Stripe is not configured (dev mode).
 * 
 * Version: 2.0.0 - Added Platinum + new packs
 */

const logger = require('../logger');

// ============================================================
// Configuration
// ============================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const REPUTY_DOMAIN = process.env.REPUTY_DOMAIN || 'http://localhost:3002';

// Subscription plan price IDs
const STRIPE_PRICE_ID_ARGENT = process.env.STRIPE_PRICE_ID_SILVER || process.env.STRIPE_PRICE_ID_ARGENT;
const STRIPE_PRICE_ID_OR = process.env.STRIPE_PRICE_ID_GOLD || process.env.STRIPE_PRICE_ID_OR;
const STRIPE_PRICE_ID_PLATINUM = process.env.STRIPE_PRICE_ID_PLATINUM;

// Pack price IDs (one-time purchases)
const STRIPE_PRICE_SMS_150 = process.env.STRIPE_PRICE_SMS_150;
const STRIPE_PRICE_SMS_300 = process.env.STRIPE_PRICE_SMS_300;
const STRIPE_PRICE_EMAIL_1000 = process.env.STRIPE_PRICE_EMAIL_1000;
const STRIPE_PRICE_EMAIL_2000 = process.env.STRIPE_PRICE_EMAIL_2000;
const STRIPE_PRICE_IA_MINI = process.env.STRIPE_PRICE_IA_MINI;
const STRIPE_PRICE_IA_MAXI = process.env.STRIPE_PRICE_IA_MAXI;
const STRIPE_PRICE_QR_EXTRA = process.env.STRIPE_PRICE_QR_EXTRA;
const STRIPE_PRICE_NFC_EXTRA = process.env.STRIPE_PRICE_NFC_EXTRA;

// ============================================================
// Plan Mappings
// ============================================================

// Plan ID (internal) → Stripe Price ID
const PLAN_TO_PRICE = {
  argent: STRIPE_PRICE_ID_ARGENT,
  or: STRIPE_PRICE_ID_OR,
  platinum: STRIPE_PRICE_ID_PLATINUM,
};

// Stripe Price ID → Plan ID (internal)
const PRICE_TO_PLAN = {};
if (STRIPE_PRICE_ID_ARGENT) PRICE_TO_PLAN[STRIPE_PRICE_ID_ARGENT] = 'argent';
if (STRIPE_PRICE_ID_OR) PRICE_TO_PLAN[STRIPE_PRICE_ID_OR] = 'or';
if (STRIPE_PRICE_ID_PLATINUM) PRICE_TO_PLAN[STRIPE_PRICE_ID_PLATINUM] = 'platinum';

// Pack ID (internal) → Stripe Price ID
const PACK_TO_PRICE = {
  'sms-150': STRIPE_PRICE_SMS_150,
  'sms-300': STRIPE_PRICE_SMS_300,
  'email-1000': STRIPE_PRICE_EMAIL_1000,
  'email-2000': STRIPE_PRICE_EMAIL_2000,
  'ia-mini': STRIPE_PRICE_IA_MINI,
  'ia-maxi': STRIPE_PRICE_IA_MAXI,
  'qr': STRIPE_PRICE_QR_EXTRA,
  'nfc': STRIPE_PRICE_NFC_EXTRA,
};

// Pack contents (what you get when you buy a pack)
// Note: Pack credits do NOT reset monthly, they persist until consumed
const PACK_CONTENTS = {
  'sms-150': { sms: 150 },
  'sms-300': { sms: 300 },
  'email-1000': { email: 1000 },
  'email-2000': { email: 2000 },
  'ia-mini': { ai: 25 },
  'ia-maxi': { ai: 75 },
  'qr': { qr: 1, qrScans: 500 },
  'nfc': { nfc: 1, nfcScans: 500 },
};

// Plan quotas (monthly allocations)
const PLAN_QUOTAS = {
  bronze: { sms: 0, email: 0, ai: 0, qr: 1, nfc: 0, qrScans: 50, nfcScans: 0 },
  argent: { sms: 100, email: 500, ai: 0, qr: 3, nfc: 1, qrScans: 500, nfcScans: 500 },
  or: { sms: 200, email: 1000, ai: 75, qr: 10, nfc: 3, qrScans: 500, nfcScans: 500 },
  platinum: { sms: 400, email: 2000, ai: 150, qr: 10, nfc: 3, qrScans: 500, nfcScans: 500 },
};

// Plan prices in cents (HT)
const PLAN_PRICES_HT = {
  bronze: 0,
  argent: 5900,    // 59€
  or: 9900,        // 99€
  platinum: 12900, // 129€
};

// Valid paid plans (for Stripe checkout)
const VALID_PAID_PLANS = ['argent', 'or', 'platinum'];

// ============================================================
// Initialize Stripe (lazy)
// ============================================================

let stripe = null;

function getStripe() {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripe) {
    try {
      const Stripe = require('stripe');
      stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16'
      });
    } catch (err) {
      logger.logError('STRIPE_INIT_ERROR', { error: err.message });
      return null;
    }
  }
  return stripe;
}

function isConfigured() {
  return !!STRIPE_SECRET_KEY && !!STRIPE_WEBHOOK_SECRET;
}

// ============================================================
// Checkout Session (Subscriptions)
// ============================================================

/**
 * Create a Stripe Checkout Session for subscription
 * Note: Bronze is free and should NEVER go through Stripe
 * @param {object} options
 * @param {string} options.orgId - Organization ID
 * @param {string} options.planId - Plan ID (argent|or|platinum)
 * @param {string} options.customerEmail - Customer email
 * @param {string} options.customerId - Existing Stripe customer ID (optional)
 * @param {string} options.successUrl - Redirect URL on success
 * @param {string} options.cancelUrl - Redirect URL on cancel
 * @returns {Promise<{url: string, sessionId: string} | {error: object}>}
 */
async function createCheckoutSession({ orgId, planId, customerEmail, customerId, successUrl, cancelUrl }) {
  const stripeClient = getStripe();
  
  if (!stripeClient) {
    logger.logAudit('STRIPE_NOT_CONFIGURED', { orgId, planId });
    return {
      error: {
        errorCategory: 'BILLING_NOT_CONFIGURED',
        errorCode: 'STRIPE_NOT_CONFIGURED',
        message: 'Le paiement par carte n\'est pas encore configuré.',
        action: 'CONTACT_SUPPORT'
      }
    };
  }
  
  // Bronze NEVER goes through Stripe
  if (planId === 'bronze') {
    return {
      error: {
        errorCategory: 'INVALID_PLAN',
        errorCode: 'BRONZE_IS_FREE',
        message: 'Le forfait Bronze est gratuit et ne nécessite pas de paiement.',
        action: 'USE_BRONZE_DIRECTLY'
      }
    };
  }
  
  // Validate plan
  if (!VALID_PAID_PLANS.includes(planId)) {
    return {
      error: {
        errorCategory: 'INVALID_PLAN',
        errorCode: 'INVALID_PLAN_ID',
        message: `Forfait invalide. Choisissez parmi: ${VALID_PAID_PLANS.join(', ')}.`,
        action: 'SELECT_VALID_PLAN'
      }
    };
  }
  
  const priceId = PLAN_TO_PRICE[planId];
  if (!priceId) {
    return {
      error: {
        errorCategory: 'INVALID_PLAN',
        errorCode: 'PRICE_NOT_CONFIGURED',
        message: `Le prix pour le forfait ${planId} n'est pas configuré.`,
        action: 'CONTACT_SUPPORT'
      }
    };
  }
  
  try {
    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Active toutes les méthodes de paiement configurées dans le Dashboard Stripe
      // (CB, Apple Pay, Google Pay, Link, etc.)
      payment_method_types: ['card', 'link'],
      success_url: successUrl || `${REPUTY_DOMAIN}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${REPUTY_DOMAIN}/billing?canceled=true`,
      metadata: {
        orgId,
        planId
      },
      subscription_data: {
        metadata: {
          orgId,
          planId
        }
      }
    };
    
    // Use existing customer or create by email
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }
    
    const session = await stripeClient.checkout.sessions.create(sessionParams);
    
    logger.logAudit('STRIPE_CHECKOUT_CREATED', {
      orgId,
      planId,
      sessionId: session.id
    });
    
    return {
      url: session.url,
      sessionId: session.id
    };
  } catch (err) {
    logger.logError('STRIPE_CHECKOUT_ERROR', {
      orgId,
      planId,
      error: err.message
    });
    
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'CHECKOUT_CREATION_FAILED',
        message: 'Erreur lors de la création de la session de paiement.',
        action: 'RETRY'
      }
    };
  }
}

// ============================================================
// Checkout Session (Packs - One-time purchases)
// ============================================================

/**
 * Create a Stripe Checkout Session for pack purchase
 * @param {object} options
 * @param {string} options.orgId - Organization ID
 * @param {string} options.packId - Pack ID (sms-150, email-1000, etc.)
 * @param {number} options.quantity - Quantity (default 1)
 * @param {string} options.customerEmail - Customer email
 * @param {string} options.customerId - Existing Stripe customer ID
 * @param {string} options.successUrl - Redirect URL on success
 * @param {string} options.cancelUrl - Redirect URL on cancel
 * @returns {Promise<{url: string, sessionId: string} | {error: object}>}
 */
async function createPackCheckoutSession({ orgId, packId, quantity = 1, customerEmail, customerId, successUrl, cancelUrl }) {
  const stripeClient = getStripe();
  
  if (!stripeClient) {
    return {
      error: {
        errorCategory: 'BILLING_NOT_CONFIGURED',
        errorCode: 'STRIPE_NOT_CONFIGURED',
        message: 'Le paiement par carte n\'est pas encore configuré.',
        action: 'CONTACT_SUPPORT'
      }
    };
  }
  
  const priceId = PACK_TO_PRICE[packId];
  if (!priceId) {
    return {
      error: {
        errorCategory: 'INVALID_PACK',
        errorCode: 'INVALID_PACK_ID',
        message: `Pack invalide: ${packId}`,
        action: 'SELECT_VALID_PACK'
      }
    };
  }
  
  try {
    const sessionParams = {
      mode: 'payment', // One-time payment, not subscription
      line_items: [{ price: priceId, quantity }],
      // Active toutes les méthodes de paiement (CB, Apple Pay, Google Pay, Link)
      payment_method_types: ['card', 'link'],
      success_url: successUrl || `${REPUTY_DOMAIN}/billing?pack_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${REPUTY_DOMAIN}/billing?pack_canceled=true`,
      metadata: {
        orgId,
        packId,
        quantity: String(quantity)
      }
    };
    
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }
    
    const session = await stripeClient.checkout.sessions.create(sessionParams);
    
    logger.logAudit('STRIPE_PACK_CHECKOUT_CREATED', {
      orgId,
      packId,
      quantity,
      sessionId: session.id
    });
    
    return {
      url: session.url,
      sessionId: session.id
    };
  } catch (err) {
    logger.logError('STRIPE_PACK_CHECKOUT_ERROR', {
      orgId,
      packId,
      error: err.message
    });
    
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'PACK_CHECKOUT_FAILED',
        message: 'Erreur lors de la création du paiement du pack.',
        action: 'RETRY'
      }
    };
  }
}

/**
 * Create a Stripe Checkout Session for multiple packs purchase
 * @param {object} options
 * @param {string} options.orgId - Organization ID
 * @param {Array<{packId: string, quantity: number}>} options.items - Array of packs to purchase
 * @param {string} options.customerEmail - Customer email
 * @param {string} options.customerId - Existing Stripe customer ID
 * @param {string} options.successUrl - Redirect URL on success
 * @param {string} options.cancelUrl - Redirect URL on cancel
 * @returns {Promise<{url: string, sessionId: string} | {error: object}>}
 */
async function createMultiPackCheckoutSession({ orgId, items, customerEmail, customerId, successUrl, cancelUrl }) {
  const stripeClient = getStripe();
  
  if (!stripeClient) {
    return {
      error: {
        errorCategory: 'BILLING_NOT_CONFIGURED',
        errorCode: 'STRIPE_NOT_CONFIGURED',
        message: 'Le paiement par carte n\'est pas encore configuré.',
        action: 'CONTACT_SUPPORT'
      }
    };
  }
  
  if (!items || items.length === 0) {
    return {
      error: {
        errorCategory: 'INVALID_REQUEST',
        errorCode: 'NO_ITEMS',
        message: 'Aucun pack sélectionné.',
        action: 'SELECT_PACKS'
      }
    };
  }
  
  // Build line_items and validate all packs
  const lineItems = [];
  const packsMetadata = [];
  
  for (const item of items) {
    const priceId = PACK_TO_PRICE[item.packId];
    if (!priceId) {
      return {
        error: {
          errorCategory: 'INVALID_PACK',
          errorCode: 'INVALID_PACK_ID',
          message: `Pack invalide: ${item.packId}`,
          action: 'SELECT_VALID_PACK'
        }
      };
    }
    
    lineItems.push({
      price: priceId,
      quantity: item.quantity || 1
    });
    
    packsMetadata.push(`${item.packId}:${item.quantity || 1}`);
  }
  
  try {
    const sessionParams = {
      mode: 'payment',
      line_items: lineItems,
      // Active toutes les méthodes de paiement (CB, Apple Pay, Google Pay, Link)
      payment_method_types: ['card', 'link'],
      success_url: successUrl || `${REPUTY_DOMAIN}/billing?pack_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${REPUTY_DOMAIN}/billing?pack_canceled=true`,
      metadata: {
        orgId,
        packs: packsMetadata.join(','), // e.g., "sms-150:2,email-1000:1"
        type: 'multi_pack'
      }
    };
    
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }
    
    const session = await stripeClient.checkout.sessions.create(sessionParams);
    
    logger.logAudit('STRIPE_MULTI_PACK_CHECKOUT_CREATED', {
      orgId,
      items,
      sessionId: session.id
    });
    
    return {
      url: session.url,
      sessionId: session.id
    };
  } catch (err) {
    logger.logError('STRIPE_MULTI_PACK_CHECKOUT_ERROR', {
      orgId,
      items,
      error: err.message
    });
    
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'PACK_CHECKOUT_FAILED',
        message: 'Erreur lors de la création du paiement.',
        action: 'RETRY'
      }
    };
  }
}

// ============================================================
// Customer Portal
// ============================================================

/**
 * Create a Stripe Customer Portal session
 * @param {object} options
 * @param {string} options.customerId - Stripe customer ID
 * @param {string} options.returnUrl - Return URL after portal
 * @returns {Promise<{url: string} | {error: object}>}
 */
async function createPortalSession({ customerId, returnUrl }) {
  const stripeClient = getStripe();
  
  if (!stripeClient) {
    return {
      error: {
        errorCategory: 'BILLING_NOT_CONFIGURED',
        errorCode: 'STRIPE_NOT_CONFIGURED',
        message: 'Le portail de facturation n\'est pas disponible.',
        action: 'CONTACT_SUPPORT'
      }
    };
  }
  
  if (!customerId) {
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'NO_CUSTOMER_ID',
        message: 'Aucun compte de facturation associé.',
        action: 'SETUP_BILLING'
      }
    };
  }
  
  try {
    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${REPUTY_DOMAIN}/billing`
    });
    
    logger.logAudit('STRIPE_PORTAL_CREATED', { customerId });
    
    return { url: session.url };
  } catch (err) {
    logger.logError('STRIPE_PORTAL_ERROR', {
      customerId,
      error: err.message
    });
    
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'PORTAL_CREATION_FAILED',
        message: 'Erreur lors de l\'accès au portail de facturation.',
        action: 'RETRY'
      }
    };
  }
}

// ============================================================
// Webhook Verification
// ============================================================

/**
 * Verify and parse a Stripe webhook event
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {{event: object} | {error: object}}
 */
function verifyWebhook(rawBody, signature) {
  const stripeClient = getStripe();
  
  if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
    return {
      error: {
        errorCategory: 'WEBHOOK_ERROR',
        errorCode: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook non configuré'
      }
    };
  }
  
  try {
    const event = stripeClient.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
    
    return { event };
  } catch (err) {
    logger.logError('STRIPE_WEBHOOK_VERIFICATION_FAILED', {
      error: err.message
    });
    
    return {
      error: {
        errorCategory: 'WEBHOOK_ERROR',
        errorCode: 'INVALID_SIGNATURE',
        message: 'Signature webhook invalide'
      }
    };
  }
}

// ============================================================
// Subscription Management
// ============================================================

/**
 * Get subscription details
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<object | null>}
 */
async function getSubscription(subscriptionId) {
  const stripeClient = getStripe();
  if (!stripeClient || !subscriptionId) return null;
  
  try {
    return await stripeClient.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    logger.logError('STRIPE_GET_SUBSCRIPTION_ERROR', {
      subscriptionId,
      error: err.message
    });
    return null;
  }
}

/**
 * Cancel a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {boolean} immediate - Cancel immediately or at period end
 * @returns {Promise<{success: boolean, subscription?: object, error?: object}>}
 */
async function cancelSubscription(subscriptionId, immediate = false) {
  const stripeClient = getStripe();
  if (!stripeClient) {
    return {
      success: false,
      error: { message: 'Stripe non configuré' }
    };
  }
  
  try {
    let subscription;
    if (immediate) {
      subscription = await stripeClient.subscriptions.cancel(subscriptionId);
    } else {
      subscription = await stripeClient.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });
    }
    
    logger.logAudit('STRIPE_SUBSCRIPTION_CANCELLED', {
      subscriptionId,
      immediate,
      cancelAt: subscription.cancel_at
    });
    
    return { success: true, subscription };
  } catch (err) {
    logger.logError('STRIPE_CANCEL_ERROR', {
      subscriptionId,
      error: err.message
    });
    
    return {
      success: false,
      error: { message: err.message }
    };
  }
}

// ============================================================
// Invoices
// ============================================================

/**
 * List invoices for a Stripe customer
 * Returns Stripe-hosted invoice data including PDF URLs
 * @param {string} customerId - Stripe customer ID
 * @param {number} limit - Max invoices to return (default 24 = ~2 years monthly)
 * @returns {Promise<{invoices: Array} | {error: object}>}
 */
async function listInvoices(customerId, limit = 24) {
  const stripeClient = getStripe();
  
  if (!stripeClient) {
    return {
      error: {
        errorCategory: 'BILLING_NOT_CONFIGURED',
        errorCode: 'STRIPE_NOT_CONFIGURED',
        message: 'La facturation n\'est pas configurée.',
        action: 'CONTACT_SUPPORT'
      }
    };
  }
  
  if (!customerId) {
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'NO_CUSTOMER_ID',
        message: 'Aucun compte de facturation associé.',
        action: 'SETUP_BILLING'
      }
    };
  }
  
  try {
    const stripeInvoices = await stripeClient.invoices.list({
      customer: customerId,
      limit,
      status: 'paid', // Only show paid invoices (not drafts or void)
    });
    
    const invoices = stripeInvoices.data.map(inv => ({
      id: inv.id,
      number: inv.number,
      date: new Date(inv.created * 1000).toISOString(),
      periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
      status: inv.status, // 'paid', 'open', 'void', 'uncollectible'
      amountDue: inv.amount_due, // in cents
      amountPaid: inv.amount_paid, // in cents
      currency: inv.currency,
      description: inv.description || inv.lines?.data?.[0]?.description || 'Abonnement Reputy',
      pdfUrl: inv.invoice_pdf, // Direct Stripe PDF download URL
      hostedUrl: inv.hosted_invoice_url, // Stripe hosted invoice page
      lines: (inv.lines?.data || []).map(line => ({
        description: line.description || 'Abonnement',
        quantity: line.quantity || 1,
        unitAmount: line.unit_amount_excluding_tax ? parseInt(line.unit_amount_excluding_tax) : (line.amount || 0),
        amount: line.amount || 0,
      })),
      subtotal: inv.subtotal_excluding_tax || inv.subtotal || 0,
      tax: inv.tax || 0,
      total: inv.total || 0,
    }));
    
    return { invoices };
  } catch (err) {
    logger.logError('STRIPE_LIST_INVOICES_ERROR', {
      customerId,
      error: err.message
    });
    
    return {
      error: {
        errorCategory: 'BILLING_ERROR',
        errorCode: 'INVOICES_FETCH_FAILED',
        message: 'Erreur lors de la récupération des factures.',
        action: 'RETRY'
      }
    };
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Get plan ID from Stripe price ID
 * @param {string} priceId - Stripe price ID
 * @returns {string|null} - Plan ID (argent|or|platinum) or null
 */
function getPlanFromPrice(priceId) {
  return PRICE_TO_PLAN[priceId] || null;
}

/**
 * Get Stripe price ID from plan ID
 * @param {string} planId - Plan ID (argent|or|platinum)
 * @returns {string|null} - Stripe price ID or null
 */
function getPriceFromPlan(planId) {
  return PLAN_TO_PRICE[planId] || null;
}

/**
 * Get pack contents by pack ID
 * @param {string} packId - Pack ID
 * @returns {object|null} - Pack contents or null
 */
function getPackContents(packId) {
  return PACK_CONTENTS[packId] || null;
}

/**
 * Get plan quotas
 * @param {string} planId - Plan ID
 * @returns {object} - Plan quotas
 */
function getPlanQuotas(planId) {
  return PLAN_QUOTAS[planId] || PLAN_QUOTAS.bronze;
}

/**
 * Check if a plan requires Stripe (paid plan)
 * @param {string} planId - Plan ID
 * @returns {boolean}
 */
function isPaidPlan(planId) {
  return VALID_PAID_PLANS.includes(planId);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Config
  isConfigured,
  getPlanFromPrice,
  getPriceFromPlan,
  getPackContents,
  getPlanQuotas,
  isPaidPlan,
  
  // Mappings (for external use)
  PLAN_TO_PRICE,
  PRICE_TO_PLAN,
  PACK_TO_PRICE,
  PACK_CONTENTS,
  PLAN_QUOTAS,
  PLAN_PRICES_HT,
  VALID_PAID_PLANS,
  
  // Sessions
  createCheckoutSession,
  createPackCheckoutSession,
  createMultiPackCheckoutSession,
  createPortalSession,
  
  // Webhooks
  verifyWebhook,
  
  // Subscriptions
  getSubscription,
  cancelSubscription,
  
  // Invoices
  listInvoices
};
