/**
 * Stripe Coupons - Mapping et règles de calcul des remises
 * 
 * Les coupons sont créés dans Stripe Dashboard, ce fichier contient :
 * 1. Le mapping des clés internes vers les IDs Stripe
 * 2. Les règles de calcul pour afficher le prix effectif
 * 
 * ⚠️ Les coupon IDs doivent correspondre exactement à ceux créés dans Stripe
 */

// ============================================================
// STRIPE COUPONS MAPPING
// ============================================================

/**
 * Mapping clé interne -> ID coupon Stripe
 * Ces IDs doivent exister dans le compte Stripe
 */
const STRIPE_COUPONS = {
  // Remises fixes (en euros)
  FIXED_5: 'DISC_5_EUR',
  FIXED_10: 'DISC_10_EUR',
  FIXED_20: 'DISC_20_EUR',
  
  // Remises en pourcentage
  PCT_10: 'DISC_10_PCT',
  PCT_20: 'DISC_20_PCT',
};

// ============================================================
// COUPON RULES - Calcul du prix effectif
// ============================================================

/**
 * Règles de calcul pour chaque coupon
 * Utilisé par computeEffectiveBilling() pour calculer priceEffectiveCents
 */
const COUPON_RULES = {
  // Remises fixes (soustraction en centimes)
  DISC_5_EUR: {
    id: 'DISC_5_EUR',
    type: 'fixed',
    value: 500, // 5€ en centimes
    label: '-5 €',
    description: 'Remise de 5€ sur l\'abonnement',
  },
  DISC_10_EUR: {
    id: 'DISC_10_EUR',
    type: 'fixed',
    value: 1000, // 10€ en centimes
    label: '-10 €',
    description: 'Remise de 10€ sur l\'abonnement',
  },
  DISC_20_EUR: {
    id: 'DISC_20_EUR',
    type: 'fixed',
    value: 2000, // 20€ en centimes
    label: '-20 €',
    description: 'Remise de 20€ sur l\'abonnement',
  },
  
  // Remises en pourcentage
  DISC_10_PCT: {
    id: 'DISC_10_PCT',
    type: 'percent',
    value: 10, // 10%
    label: '-10%',
    description: 'Remise de 10% sur l\'abonnement',
  },
  DISC_20_PCT: {
    id: 'DISC_20_PCT',
    type: 'percent',
    value: 20, // 20%
    label: '-20%',
    description: 'Remise de 20% sur l\'abonnement',
  },
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Get Stripe coupon ID from internal key
 * @param {string} couponKey - e.g., 'FIXED_10'
 * @returns {string|null} Stripe coupon ID or null
 */
function getStripeCouponId(couponKey) {
  return STRIPE_COUPONS[couponKey] || null;
}

/**
 * Get coupon rule by Stripe coupon ID
 * @param {string} stripeCouponId - e.g., 'DISC_10_EUR'
 * @returns {object|null} Coupon rule or null
 */
function getCouponRule(stripeCouponId) {
  return COUPON_RULES[stripeCouponId] || null;
}

/**
 * Calculate effective price after applying coupon
 * @param {number} basePriceCents - Original price in cents
 * @param {string|null} stripeCouponId - Coupon ID or null
 * @returns {object} { priceEffectiveCents, discount }
 */
function calculateDiscountedPrice(basePriceCents, stripeCouponId) {
  if (!stripeCouponId) {
    return {
      priceEffectiveCents: basePriceCents,
      discount: { type: null, value: null, label: null },
    };
  }
  
  const rule = getCouponRule(stripeCouponId);
  if (!rule) {
    return {
      priceEffectiveCents: basePriceCents,
      discount: { type: null, value: null, label: null },
    };
  }
  
  let priceEffectiveCents;
  
  if (rule.type === 'fixed') {
    // Soustraction fixe
    priceEffectiveCents = Math.max(0, basePriceCents - rule.value);
  } else if (rule.type === 'percent') {
    // Pourcentage
    const discountAmount = Math.round(basePriceCents * rule.value / 100);
    priceEffectiveCents = basePriceCents - discountAmount;
  } else {
    priceEffectiveCents = basePriceCents;
  }
  
  return {
    priceEffectiveCents,
    discount: {
      type: rule.type,
      value: rule.value,
      label: rule.label,
      description: rule.description,
    },
  };
}

/**
 * Get all available coupon keys for UI
 * @returns {Array<{key, label, description}>}
 */
function getAvailableCoupons() {
  return Object.entries(STRIPE_COUPONS).map(([key, stripeCouponId]) => {
    const rule = COUPON_RULES[stripeCouponId];
    return {
      key,
      stripeCouponId,
      label: rule?.label || key,
      description: rule?.description || '',
      type: rule?.type || 'unknown',
      value: rule?.value || 0,
    };
  });
}

/**
 * Validate coupon key
 * @param {string} couponKey
 * @returns {boolean}
 */
function isValidCouponKey(couponKey) {
  return couponKey in STRIPE_COUPONS;
}

/**
 * Validate Stripe coupon ID
 * @param {string} stripeCouponId
 * @returns {boolean}
 */
function isValidStripeCouponId(stripeCouponId) {
  return stripeCouponId in COUPON_RULES;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  STRIPE_COUPONS,
  COUPON_RULES,
  getStripeCouponId,
  getCouponRule,
  calculateDiscountedPrice,
  getAvailableCoupons,
  isValidCouponKey,
  isValidStripeCouponId,
};
