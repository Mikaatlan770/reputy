/**
 * Service Stripe pour Reputy
 * 
 * Abstraction pour les appels Stripe
 * En mode test, utilise des mocks
 */

import type { PlanId, Pack, Subscription, Payment } from './types'
import { PLANS, getPack } from './plans'

// ===== CONFIG =====

const STRIPE_MODE = process.env.NEXT_PUBLIC_STRIPE_MODE || 'test'
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_xxx'

export { STRIPE_PUBLISHABLE_KEY }

// ===== TYPES STRIPE =====

export interface CreateCheckoutSessionParams {
  orgId: string
  customerId?: string
  priceId: string
  mode: 'subscription' | 'payment'
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

export interface CreateCheckoutSessionResult {
  sessionId: string
  url: string
}

export interface CreateCustomerPortalParams {
  customerId: string
  returnUrl: string
}

// ===== SERVICE STRIPE =====

class StripeService {
  private isTestMode = STRIPE_MODE === 'test'

  /**
   * Crée une session Checkout Stripe
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CreateCheckoutSessionResult> {
    if (this.isTestMode) {
      // Mock en mode test
      return {
        sessionId: `cs_test_${Date.now()}`,
        url: `${params.successUrl}?session_id=cs_test_${Date.now()}`,
      }
    }

    // En production, appeler l'API Stripe via notre backend
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      throw new Error('Erreur lors de la création de la session de paiement')
    }

    return response.json()
  }

  /**
   * Crée un lien vers le portail client Stripe
   */
  async createCustomerPortal(params: CreateCustomerPortalParams): Promise<{ url: string }> {
    if (this.isTestMode) {
      return { url: params.returnUrl }
    }

    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      throw new Error('Erreur lors de la création du portail')
    }

    return response.json()
  }

  /**
   * Récupère le prix Stripe pour un plan
   */
  getPriceIdForPlan(planId: PlanId, interval: 'monthly' | 'yearly'): string | undefined {
    const plan = PLANS[planId]
    return interval === 'monthly' 
      ? plan.stripePriceIdMonthly 
      : plan.stripePriceIdYearly
  }

  /**
   * Récupère le prix Stripe pour un pack
   */
  getPriceIdForPack(packId: string): string | undefined {
    const pack = getPack(packId)
    return pack?.stripePriceId
  }
}

export const stripeService = new StripeService()

// ===== HELPERS =====

/**
 * Génère une URL de checkout pour un plan
 */
export async function createPlanCheckoutUrl(
  orgId: string,
  planId: PlanId,
  interval: 'monthly' | 'yearly' = 'monthly'
): Promise<string> {
  const priceId = stripeService.getPriceIdForPlan(planId, interval)
  if (!priceId) throw new Error('Prix non trouvé pour ce plan')

  const result = await stripeService.createCheckoutSession({
    orgId,
    priceId,
    mode: 'subscription',
    successUrl: `${window.location.origin}/billing?success=true`,
    cancelUrl: `${window.location.origin}/billing?canceled=true`,
    metadata: { planId, interval },
  })

  return result.url
}

/**
 * Génère une URL de checkout pour un pack
 */
export async function createPackCheckoutUrl(
  orgId: string,
  packId: string
): Promise<string> {
  const pack = getPack(packId)
  if (!pack?.stripePriceId) throw new Error('Pack non trouvé')

  const result = await stripeService.createCheckoutSession({
    orgId,
    priceId: pack.stripePriceId,
    mode: 'payment',
    successUrl: `${window.location.origin}/billing?success=true&pack=${packId}`,
    cancelUrl: `${window.location.origin}/billing?canceled=true`,
    metadata: { packId, packType: pack.type, quantity: pack.quantity.toString() },
  })

  return result.url
}





