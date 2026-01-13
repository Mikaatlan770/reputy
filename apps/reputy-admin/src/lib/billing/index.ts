/**
 * Module Billing Reputy
 * 
 * Gestion des abonnements, paiements et factures
 */

// Types
export * from './types'

// Plans et packs
export {
  PLANS,
  SMS_PACKS,
  EMAIL_PACKS,
  AI_PACKS,
  ALL_PACKS,
  getPlan,
  getPack,
  formatPrice,
  formatPriceHT,
  calculateVAT,
  calculateTTC,
} from './plans'

// Service Stripe
export {
  stripeService,
  createPlanCheckoutUrl,
  createPackCheckoutUrl,
  STRIPE_PUBLISHABLE_KEY,
} from './stripe'

// Données mock
export {
  mockSubscription,
  mockBillingInfo,
  mockQuotas,
  mockPayments,
  mockInvoices,
  getPaymentsForOrg,
  getInvoicesForOrg,
  getSubscriptionForOrg,
} from './mock-data'





