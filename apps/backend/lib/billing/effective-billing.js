/**
 * Effective Billing - Fonction centrale de calcul billing
 * 
 * Cette fonction retourne UN SEUL OBJET contenant toutes les données
 * billing/quotas/prix à afficher dans ReputyBoard et Facturation.
 * 
 * ⚠️ TOUTE logique d'affichage de prix/quotas DOIT utiliser ce résultat.
 * Ne pas lire directement org.plan.basePriceCents ou org.quotas.
 */

const { getPlan, getPlanQuotas, normalizePlanCode } = require('./plan-catalog');
const { calculateDiscountedPrice, getCouponRule } = require('./stripe-coupons');
const { ensureBillingPeriodIsCurrent } = require('./period-rollover');

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Compute effective billing for an organization
 * 
 * @param {object} params
 * @param {object} params.org - Organization object (may be mutated by period rollover)
 * @param {Date} [params.now] - Current date for calculations
 * @param {object} [params.repos] - Repository for persistence
 * @param {boolean} [params.ensurePeriod=true] - Whether to ensure period is current
 * @returns {object} Effective billing object
 */
function computeEffectiveBilling({ org, now = new Date(), repos = null, ensurePeriod = true }) {
  // Ensure billing period is current (may mutate org)
  let periodRollover = { changed: false };
  if (ensurePeriod) {
    periodRollover = ensureBillingPeriodIsCurrent({ org, now, repos });
  }
  
  // Get plan info from catalog
  const planCode = normalizePlanCode(org.plan?.code);
  const plan = getPlan(planCode);
  const quotasCatalog = getPlanQuotas(planCode);
  
  // Get price from catalog (not from org.plan.basePriceCents which may be outdated)
  const priceCatalogCents = plan?.priceCents || 0;
  
  // Get coupon and calculate effective price
  const stripeCouponId = org.billing?.stripeCouponId || null;
  const { priceEffectiveCents, discount } = calculateDiscountedPrice(priceCatalogCents, stripeCouponId);
  
  // Get monthly remaining from subscriptionCredits
  const subCredits = org.subscriptionCredits || {};
  const monthlyRemaining = {
    sms: Math.max(0, (subCredits.smsTotal || 0) - (subCredits.smsUsedThisPeriod || 0)),
    email: Math.max(0, (subCredits.emailTotal || 0) - (subCredits.emailUsedThisPeriod || 0)),
    ai: Math.max(0, (subCredits.aiTotal || 0) - (subCredits.aiUsedThisPeriod || 0)),
    qr: Math.max(0, (subCredits.qrIncludedMonthly || 0) - (subCredits.qrUsedThisPeriod || 0)),
    nfc: Math.max(0, (subCredits.nfcIncludedMonthly || 0) - (subCredits.nfcUsedThisPeriod || 0)),
  };
  
  // Get pack balances (persistent, not monthly)
  const packWallet = org.packWallet || org.balances || {};
  const packsBalance = {
    sms: packWallet.smsRemaining || 0,
    email: packWallet.emailRemaining || 0,
    ai: packWallet.aiRemaining || 0,
  };
  
  // Calculate total available this month
  const totalAvailableThisMonth = {
    sms: monthlyRemaining.sms + packsBalance.sms,
    email: monthlyRemaining.email + packsBalance.email,
    ai: monthlyRemaining.ai + packsBalance.ai,
    qr: monthlyRemaining.qr,
    nfc: monthlyRemaining.nfc,
  };
  
  // Bonus monthly (from gifts)
  const bonusMonthly = {
    sms: subCredits.smsGiftMonthly || subCredits.gifts?.smsGiftMonthly || 0,
    email: subCredits.emailGiftMonthly || subCredits.gifts?.emailGiftMonthly || 0,
    ai: subCredits.aiGiftMonthly || subCredits.gifts?.aiGiftMonthly || 0,
  };
  
  // Monthly usage
  const monthlyUsed = {
    sms: subCredits.smsUsedThisPeriod || 0,
    email: subCredits.emailUsedThisPeriod || 0,
    ai: subCredits.aiUsedThisPeriod || 0,
    qr: subCredits.qrUsedThisPeriod || 0,
    nfc: subCredits.nfcUsedThisPeriod || 0,
  };
  
  // Quotas effective (catalog + bonus)
  const quotasEffective = {
    smsIncluded: quotasCatalog.smsIncluded + bonusMonthly.sms,
    emailIncluded: quotasCatalog.emailIncluded + bonusMonthly.email,
    aiIncluded: quotasCatalog.aiIncluded + bonusMonthly.ai,
    qrIncluded: quotasCatalog.qrIncluded,
    nfcIncluded: quotasCatalog.nfcIncluded,
  };
  
  // Billing period
  const billingPeriod = {
    periodStart: org.billing?.periodStart || null,
    periodEnd: org.billing?.periodEnd || null,
  };
  
  // Format period end for display
  let periodEndFormatted = null;
  if (billingPeriod.periodEnd) {
    const endDate = new Date(billingPeriod.periodEnd);
    periodEndFormatted = endDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  
  // Coupon info for display
  let couponInfo = null;
  if (stripeCouponId) {
    const rule = getCouponRule(stripeCouponId);
    couponInfo = {
      id: stripeCouponId,
      label: rule?.label || stripeCouponId,
      description: rule?.description || '',
      type: rule?.type || 'unknown',
      value: rule?.value || 0,
    };
  }
  
  // Build effective billing object
  return {
    // Plan info
    planCode,
    planName: plan?.name || 'Inconnu',
    planTier: plan?.tier || 0,
    
    // Pricing
    priceCatalogCents,
    priceEffectiveCents,
    priceCatalogFormatted: formatPrice(priceCatalogCents),
    priceEffectiveFormatted: formatPrice(priceEffectiveCents),
    
    // Discount/Coupon
    stripeCouponId,
    discount,
    couponInfo,
    hasDiscount: stripeCouponId !== null,
    
    // Quotas from catalog
    quotasCatalog,
    
    // Quotas effective (catalog + bonus)
    quotasEffective,
    
    // Bonus monthly
    bonusMonthly,
    
    // Monthly remaining (subscription credits)
    monthlyRemaining,
    monthlyUsed,
    
    // Packs balance (persistent)
    packsBalance,
    
    // Total available this month (monthly + packs)
    totalAvailableThisMonth,
    
    // Billing period
    billingPeriod,
    periodEndFormatted,
    
    // Can send? (has remaining credits and active status)
    canSend: totalAvailableThisMonth.sms > 0 || totalAvailableThisMonth.email > 0,
    subscriptionActive: org.status === 'active',
    
    // Period rollover info
    periodRolledOver: periodRollover.changed,
    
    // Stripe info (for reference)
    stripeCustomerId: org.billing?.stripeCustomerId || null,
    stripeSubscriptionId: org.billing?.stripeSubscriptionId || null,
    billingProvider: org.billing?.provider || 'none',
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Format price in cents to display string
 * @param {number} cents
 * @returns {string}
 */
function formatPrice(cents) {
  return `${(cents / 100).toFixed(0)} €`;
}

/**
 * Format price in cents to number with decimals
 * @param {number} cents
 * @returns {string}
 */
function formatPriceDecimal(cents) {
  return `${(cents / 100).toFixed(2)} €`;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  computeEffectiveBilling,
  formatPrice,
  formatPriceDecimal,
};
