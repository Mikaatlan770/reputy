/**
 * Plan Catalog - Source de vérité pour les plans Reputy
 * 
 * Ce fichier définit les plans disponibles avec leurs prix et quotas.
 * TOUTE logique de prix/quotas doit utiliser ce catalogue comme référence.
 * 
 * ⚠️ NE PAS MODIFIER sans vérifier l'impact sur :
 * - computeEffectiveBilling()
 * - assign-plan endpoint
 * - ReputyBoard affichage
 */

// ============================================================
// PLAN CATALOG
// ============================================================

const PLAN_CATALOG = {
  // ──────────────────────────────────────────────────────────────
  // BRONZE - GRATUIT (pas de Stripe)
  // ──────────────────────────────────────────────────────────────
  health_bronze: {
    code: 'health_bronze',
    name: 'Bronze',
    priceCents: 0,
    currency: 'EUR',
    billingCycle: 'monthly',
    quotas: {
      smsIncluded: 0,
      emailIncluded: 0,
      aiIncluded: 0,
      qrIncluded: 1,
      nfcIncluded: 0,
      qrScans: 50,
      nfcScans: 0,
    },
    features: ['reputyboard', 'manual_replies', 'qr_basic'],
    tier: 0,
  },

  // ──────────────────────────────────────────────────────────────
  // ARGENT - 59€ HT/mois
  // ──────────────────────────────────────────────────────────────
  health_argent: {
    code: 'health_argent',
    name: 'Argent',
    priceCents: 5900,
    currency: 'EUR',
    billingCycle: 'monthly',
    quotas: {
      smsIncluded: 100,
      emailIncluded: 500,
      aiIncluded: 0,
      qrIncluded: 3,
      nfcIncluded: 1,
      qrScans: 500,
      nfcScans: 500,
    },
    features: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib'],
    tier: 1,
  },

  // ──────────────────────────────────────────────────────────────
  // OR - 99€ HT/mois
  // ──────────────────────────────────────────────────────────────
  health_or: {
    code: 'health_or',
    name: 'Or',
    priceCents: 9900,
    currency: 'EUR',
    billingCycle: 'monthly',
    quotas: {
      smsIncluded: 200,
      emailIncluded: 1000,
      aiIncluded: 75,
      qrIncluded: 10,
      nfcIncluded: 3,
      qrScans: 500,
      nfcScans: 500,
    },
    features: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib', 'ai', 'monthly_report'],
    tier: 2,
  },

  // ──────────────────────────────────────────────────────────────
  // PLATINUM - 129€ HT/mois
  // ──────────────────────────────────────────────────────────────
  health_platinum: {
    code: 'health_platinum',
    name: 'Platinum',
    priceCents: 12900,
    currency: 'EUR',
    billingCycle: 'monthly',
    quotas: {
      smsIncluded: 400,
      emailIncluded: 2000,
      aiIncluded: 150,
      qrIncluded: 10,
      nfcIncluded: 3,
      qrScans: 500,
      nfcScans: 500,
    },
    features: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib', 'ai', 'advanced_report', 'priority_support'],
    tier: 3,
  },

  // ──────────────────────────────────────────────────────────────
  // ALIASES pour rétrocompatibilité
  // ──────────────────────────────────────────────────────────────
  health_basic: null,  // Redirige vers bronze
  health_silver: null, // Redirige vers argent
  health_gold: null,   // Redirige vers or
  health_pro: null,    // Redirige vers argent
  health_enterprise: null, // Redirige vers or
};

// Résoudre les alias
PLAN_CATALOG.health_basic = PLAN_CATALOG.health_bronze;
PLAN_CATALOG.health_silver = PLAN_CATALOG.health_argent;
PLAN_CATALOG.health_gold = PLAN_CATALOG.health_or;
PLAN_CATALOG.health_pro = PLAN_CATALOG.health_argent;
PLAN_CATALOG.health_enterprise = PLAN_CATALOG.health_or;

// ============================================================
// HELPERS
// ============================================================

/**
 * Get plan from catalog by code
 * @param {string} planCode - e.g., 'health_argent'
 * @returns {object|null} Plan object or null if not found
 */
function getPlan(planCode) {
  if (!planCode) return null;
  return PLAN_CATALOG[planCode] || null;
}

/**
 * Get plan code normalized (resolve aliases)
 * @param {string} planCode - e.g., 'health_basic'
 * @returns {string} Canonical plan code
 */
function normalizePlanCode(planCode) {
  if (!planCode) return 'health_bronze';
  const plan = PLAN_CATALOG[planCode];
  return plan?.code || 'health_bronze';
}

/**
 * Get price in cents for a plan
 * @param {string} planCode
 * @returns {number} Price in cents
 */
function getPlanPrice(planCode) {
  const plan = getPlan(planCode);
  return plan?.priceCents || 0;
}

/**
 * Get quotas for a plan
 * @param {string} planCode
 * @returns {object} Quotas object
 */
function getPlanQuotas(planCode) {
  const plan = getPlan(planCode);
  return plan?.quotas || {
    smsIncluded: 0,
    emailIncluded: 0,
    aiIncluded: 0,
    qrIncluded: 1,
    nfcIncluded: 0,
  };
}

/**
 * Check if plan is paid (requires Stripe)
 * @param {string} planCode
 * @returns {boolean}
 */
function isPaidPlan(planCode) {
  const plan = getPlan(planCode);
  return (plan?.priceCents || 0) > 0;
}

/**
 * Get all available plan codes (no aliases)
 * @returns {string[]}
 */
function getAvailablePlanCodes() {
  return ['health_bronze', 'health_argent', 'health_or', 'health_platinum'];
}

/**
 * Get plan display info for UI
 * @param {string} planCode
 * @returns {object}
 */
function getPlanDisplayInfo(planCode) {
  const plan = getPlan(planCode);
  if (!plan) return { name: 'Inconnu', priceFormatted: '0 €', color: 'gray' };
  
  const colors = {
    health_bronze: 'orange',
    health_argent: 'slate',
    health_or: 'amber',
    health_platinum: 'purple',
  };
  
  return {
    name: plan.name,
    priceFormatted: `${(plan.priceCents / 100).toFixed(0)} €`,
    priceCents: plan.priceCents,
    color: colors[plan.code] || 'gray',
    tier: plan.tier,
    quotas: plan.quotas,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  PLAN_CATALOG,
  getPlan,
  normalizePlanCode,
  getPlanPrice,
  getPlanQuotas,
  isPaidPlan,
  getAvailablePlanCodes,
  getPlanDisplayInfo,
};
