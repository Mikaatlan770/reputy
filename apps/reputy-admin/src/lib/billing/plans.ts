/**
 * Définition des plans et packs Reputy
 * 
 * Les prix sont en centimes pour éviter les erreurs de calcul
 */

import type { Plan, Pack, PlanId } from './types'

// ===== PLANS =====

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    description: 'Pour découvrir Reputy',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Jusqu\'à 10 avis/mois',
      '1 établissement',
      '1 utilisateur',
      'QR Code de collecte',
      'Dashboard basique',
    ],
    quotas: {
      sms: 0,
      email: 10,
      ai: 0,
      locations: 1,
      users: 1,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Pour les indépendants',
    priceMonthly: 2900, // 29€
    priceYearly: 29000, // 290€ (2 mois offerts)
    stripePriceIdMonthly: 'price_starter_monthly',
    stripePriceIdYearly: 'price_starter_yearly',
    features: [
      'Avis illimités',
      '1 établissement',
      '2 utilisateurs',
      'QR Code + NFC',
      '25 SMS/mois inclus',
      '100 emails/mois inclus',
      'Réponses templates',
    ],
    quotas: {
      sms: 25,
      email: 100,
      ai: 0,
      locations: 1,
      users: 2,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Pour les professionnels',
    priceMonthly: 5900, // 59€
    priceYearly: 59000, // 590€ (2 mois offerts)
    stripePriceIdMonthly: 'price_pro_monthly',
    stripePriceIdYearly: 'price_pro_yearly',
    features: [
      'Tout Starter +',
      '3 établissements',
      '5 utilisateurs',
      '50 SMS/mois inclus',
      '500 emails/mois inclus',
      'Assistant IA (100 suggestions/mois)',
      'Analyse concurrence',
      'Campagnes automatiques',
      'Support prioritaire',
    ],
    quotas: {
      sms: 50,
      email: 500,
      ai: 100,
      locations: 3,
      users: 5,
    },
    popular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Pour les groupes',
    priceMonthly: 14900, // 149€
    priceYearly: 149000, // 1490€ (2 mois offerts)
    stripePriceIdMonthly: 'price_enterprise_monthly',
    stripePriceIdYearly: 'price_enterprise_yearly',
    features: [
      'Tout Pro +',
      'Établissements illimités',
      'Utilisateurs illimités',
      '200 SMS/mois inclus',
      'Emails illimités',
      'IA illimitée',
      'API access',
      'Account manager dédié',
      'SLA garanti',
    ],
    quotas: {
      sms: 200,
      email: -1, // illimité
      ai: -1, // illimité
      locations: -1, // illimité
      users: -1, // illimité
    },
  },
}

// ===== PACKS SMS =====

export const SMS_PACKS: Pack[] = [
  {
    id: 'sms-25',
    type: 'sms',
    name: '25 SMS',
    description: 'Pack de 25 crédits SMS',
    quantity: 25,
    price: 500, // 5€
    stripePriceId: 'price_sms_25',
  },
  {
    id: 'sms-100',
    type: 'sms',
    name: '100 SMS',
    description: 'Pack de 100 crédits SMS',
    quantity: 100,
    price: 1500, // 15€ (-25%)
    stripePriceId: 'price_sms_100',
    popular: true,
  },
  {
    id: 'sms-500',
    type: 'sms',
    name: '500 SMS',
    description: 'Pack de 500 crédits SMS',
    quantity: 500,
    price: 6000, // 60€ (-40%)
    stripePriceId: 'price_sms_500',
  },
]

// ===== PACKS EMAIL =====

export const EMAIL_PACKS: Pack[] = [
  {
    id: 'email-100',
    type: 'email',
    name: '100 Emails',
    description: 'Pack de 100 crédits email',
    quantity: 100,
    price: 200, // 2€
    stripePriceId: 'price_email_100',
  },
  {
    id: 'email-500',
    type: 'email',
    name: '500 Emails',
    description: 'Pack de 500 crédits email',
    quantity: 500,
    price: 800, // 8€ (-20%)
    stripePriceId: 'price_email_500',
    popular: true,
  },
  {
    id: 'email-2000',
    type: 'email',
    name: '2000 Emails',
    description: 'Pack de 2000 crédits email',
    quantity: 2000,
    price: 2500, // 25€ (-37%)
    stripePriceId: 'price_email_2000',
  },
]

// ===== PACKS IA =====

export const AI_PACKS: Pack[] = [
  {
    id: 'ai-50',
    type: 'ai',
    name: '50 crédits IA',
    description: 'Pack de 50 suggestions IA',
    quantity: 50,
    price: 500, // 5€
    stripePriceId: 'price_ai_50',
  },
  {
    id: 'ai-200',
    type: 'ai',
    name: '200 crédits IA',
    description: 'Pack de 200 suggestions IA',
    quantity: 200,
    price: 1500, // 15€ (-25%)
    stripePriceId: 'price_ai_200',
    popular: true,
  },
  {
    id: 'ai-500',
    type: 'ai',
    name: '500 crédits IA',
    description: 'Pack de 500 suggestions IA',
    quantity: 500,
    price: 3000, // 30€ (-40%)
    stripePriceId: 'price_ai_500',
  },
]

// ===== TOUS LES PACKS =====

export const ALL_PACKS: Pack[] = [...SMS_PACKS, ...EMAIL_PACKS, ...AI_PACKS]

// ===== HELPERS =====

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId]
}

export function getPack(packId: string): Pack | undefined {
  return ALL_PACKS.find(p => p.id === packId)
}

export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' \u20AC'
}

export function formatPriceHT(cents: number): string {
  return formatPrice(cents) + ' HT'
}

export function calculateVAT(amountHT: number, vatRate: number = 20): number {
  return Math.round(amountHT * vatRate / 100)
}

export function calculateTTC(amountHT: number, vatRate: number = 20): number {
  return amountHT + calculateVAT(amountHT, vatRate)
}





