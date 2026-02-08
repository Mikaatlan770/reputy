/**
 * Period Rollover - Gestion automatique des périodes de facturation
 * 
 * Assure que la période billing (periodStart/periodEnd) est toujours actuelle.
 * Si la période est dépassée, avance automatiquement au cycle suivant
 * et reset les crédits mensuels.
 * 
 * ⚠️ Cette fonction doit être appelée avant tout calcul de billing/quotas
 */

const { getPlan, getPlanQuotas } = require('./plan-catalog');

// ============================================================
// DATE HELPERS
// ============================================================

/**
 * Get start of month for a date (1st of month, 00:00:00)
 * @param {Date} date
 * @returns {Date}
 */
function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get end of month for a date (last day, 23:59:59.999)
 * @param {Date} date
 * @returns {Date}
 */
function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Format date to ISO string
 * @param {Date} date
 * @returns {string}
 */
function toISO(date) {
  return date.toISOString();
}

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Ensure billing period is current - MUTATES org object
 * 
 * @param {object} params
 * @param {object} params.org - Organization object (will be mutated)
 * @param {Date} [params.now] - Current date (defaults to new Date())
 * @param {object} [params.repos] - Repository object with org.update method
 * @param {boolean} [params.persist=true] - Whether to persist changes to DB
 * @returns {object} { changed: boolean, oldPeriod, newPeriod, creditsReset }
 */
function ensureBillingPeriodIsCurrent({ org, now = new Date(), repos = null, persist = true }) {
  // Initialize billing if missing
  if (!org.billing) {
    org.billing = {
      provider: 'none',
      status: 'active',
      startedAt: toISO(now),
      anchor: 'calendar_month',
    };
  }
  
  // Initialize period if missing
  if (!org.billing.periodStart || !org.billing.periodEnd) {
    const monthStart = getMonthStart(now);
    const monthEnd = getMonthEnd(now);
    org.billing.periodStart = toISO(monthStart);
    org.billing.periodEnd = toISO(monthEnd);
    
    // Initialize monthly credits
    initializeMonthlyCredits(org);
    
    if (persist && repos?.org?.update) {
      repos.org.update(org.id, {
        billing: org.billing,
        subscriptionCredits: org.subscriptionCredits,
      });
    }
    
    return {
      changed: true,
      oldPeriod: null,
      newPeriod: { periodStart: org.billing.periodStart, periodEnd: org.billing.periodEnd },
      creditsReset: true,
    };
  }
  
  const periodEnd = new Date(org.billing.periodEnd);
  
  // Check if period is still current
  if (now <= periodEnd) {
    return {
      changed: false,
      oldPeriod: { periodStart: org.billing.periodStart, periodEnd: org.billing.periodEnd },
      newPeriod: { periodStart: org.billing.periodStart, periodEnd: org.billing.periodEnd },
      creditsReset: false,
    };
  }
  
  // Period has expired - need to rollover
  const oldPeriod = {
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
  };
  
  // Advance period until it covers 'now'
  let newPeriodStart = new Date(org.billing.periodEnd);
  newPeriodStart.setTime(newPeriodStart.getTime() + 1); // Move to next millisecond
  newPeriodStart = getMonthStart(newPeriodStart); // Normalize to month start
  
  let newPeriodEnd = getMonthEnd(newPeriodStart);
  
  // Loop in case multiple months have passed
  while (now > newPeriodEnd) {
    newPeriodStart = new Date(newPeriodEnd.getTime() + 1);
    newPeriodStart = getMonthStart(newPeriodStart);
    newPeriodEnd = getMonthEnd(newPeriodStart);
  }
  
  // Update org.billing
  org.billing.periodStart = toISO(newPeriodStart);
  org.billing.periodEnd = toISO(newPeriodEnd);
  
  // Reset monthly credits according to plan
  initializeMonthlyCredits(org);
  
  // Log the rollover
  console.log(`[BILLING][ROLLOVER] Org ${org.id}: ${oldPeriod.periodStart.substring(0, 10)} → ${org.billing.periodStart.substring(0, 10)}`);
  
  // Persist changes
  if (persist && repos?.org?.update) {
    repos.org.update(org.id, {
      billing: org.billing,
      subscriptionCredits: org.subscriptionCredits,
    });
  }
  
  return {
    changed: true,
    oldPeriod,
    newPeriod: { periodStart: org.billing.periodStart, periodEnd: org.billing.periodEnd },
    creditsReset: true,
  };
}

/**
 * Initialize monthly credits based on plan catalog
 * @param {object} org - Organization object (will be mutated)
 */
function initializeMonthlyCredits(org) {
  const planCode = org.plan?.code || 'health_bronze';
  const quotas = getPlanQuotas(planCode);
  
  // Get existing gift credits (don't reset these)
  const existingGifts = org.subscriptionCredits?.gifts || {
    smsGiftMonthly: 0,
    emailGiftMonthly: 0,
    aiGiftMonthly: 0,
  };
  
  // Initialize subscriptionCredits
  org.subscriptionCredits = {
    // Period info
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
    
    // Included quotas (from plan)
    smsIncludedMonthly: quotas.smsIncluded,
    emailIncludedMonthly: quotas.emailIncluded,
    aiIncludedMonthly: quotas.aiIncluded,
    qrIncludedMonthly: quotas.qrIncluded,
    nfcIncludedMonthly: quotas.nfcIncluded,
    
    // Gift quotas (preserved)
    smsGiftMonthly: existingGifts.smsGiftMonthly || 0,
    emailGiftMonthly: existingGifts.emailGiftMonthly || 0,
    aiGiftMonthly: existingGifts.aiGiftMonthly || 0,
    
    // Total = included + gift
    smsTotal: quotas.smsIncluded + (existingGifts.smsGiftMonthly || 0),
    emailTotal: quotas.emailIncluded + (existingGifts.emailGiftMonthly || 0),
    aiTotal: quotas.aiIncluded + (existingGifts.aiGiftMonthly || 0),
    
    // Usage counters (reset to 0)
    smsUsedThisPeriod: 0,
    emailUsedThisPeriod: 0,
    aiUsedThisPeriod: 0,
    qrUsedThisPeriod: 0,
    nfcUsedThisPeriod: 0,
    
    // Gifts object for preservation
    gifts: existingGifts,
  };
}

/**
 * Check if billing period is expired
 * @param {object} org
 * @param {Date} [now]
 * @returns {boolean}
 */
function isPeriodExpired(org, now = new Date()) {
  if (!org.billing?.periodEnd) return true;
  const periodEnd = new Date(org.billing.periodEnd);
  return now > periodEnd;
}

/**
 * Get remaining days in current period
 * @param {object} org
 * @param {Date} [now]
 * @returns {number}
 */
function getDaysRemainingInPeriod(org, now = new Date()) {
  if (!org.billing?.periodEnd) return 0;
  const periodEnd = new Date(org.billing.periodEnd);
  const msRemaining = periodEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  ensureBillingPeriodIsCurrent,
  initializeMonthlyCredits,
  isPeriodExpired,
  getDaysRemainingInPeriod,
  // Helpers for testing
  getMonthStart,
  getMonthEnd,
};
