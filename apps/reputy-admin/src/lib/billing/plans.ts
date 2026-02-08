/**
 * Définition des plans et packs Reputy
 * 
 * Les prix sont en centimes HT pour éviter les erreurs de calcul
 * Version: 2.0.0 - Nouvelle grille tarifaire (Bronze/Argent/Or/Platinum)
 */

import type { Plan, Pack, PlanId } from './types'

// ===== PLANS =====

export const PLANS: Record<PlanId, Plan> = {
  bronze: {
    id: 'bronze',
    name: 'Pack Bronze',
    description: 'Gratuit, sans limite de durée',
    priceMonthly: 0,
    features: [
      'Accès au ReputyBoard',
      'Réponses manuelles aux avis',
      '1 QR code (50 scans)',
      'Module Doctolib',
    ],
    quotas: {
      sms: 0,
      email: 0,
      ai: 0,
      qr: 1,
      nfc: 0,
    },
  },
  argent: {
    id: 'argent',
    name: 'Pack Argent',
    description: 'Pour les cabinets en croissance',
    priceMonthly: 5900, // 59€ HT
    stripePriceId: 'price_1SxEX8Erzua3Kw4jWzNbxl2E',
    features: [
      '100 SMS / mois',
      '500 emails / mois',
      '3 QR codes',
      '1 Tag NFC',
      'Module Doctolib',
      'Support prioritaire',
    ],
    quotas: {
      sms: 100,
      email: 500,
      ai: 0,
      qr: 3,
      nfc: 1,
    },
  },
  or: {
    id: 'or',
    name: 'Pack Or',
    description: 'Pour les cabinets exigeants',
    priceMonthly: 9900, // 99€ HT
    stripePriceId: 'price_1SxEZ8Erzua3Kw4jNIwnz2ra',
    features: [
      '200 SMS / mois',
      '1 000 emails / mois',
      '75 réponses IA / mois',
      '10 QR codes',
      '3 Tags NFC',
      'Module Doctolib',
      'Support prioritaire',
      'Statistiques avancées',
    ],
    quotas: {
      sms: 200,
      email: 1000,
      ai: 75,
      qr: 10,
      nfc: 3,
    },
    popular: true,
  },
  platinum: {
    id: 'platinum',
    name: 'Pack Platinum',
    description: 'Pour les groupes & multi-sites',
    priceMonthly: 14900, // 149€ HT
    stripePriceId: 'price_1SxU5sErzua3Kw4jH3fUzSIZ',
    features: [
      '400 SMS / mois',
      '2 000 emails / mois',
      '150 réponses IA / mois',
      '10 QR codes',
      '3 Tags NFC',
      'Module Doctolib',
      'Support prioritaire',
      'Statistiques avancées',
      'Account manager dédié',
    ],
    quotas: {
      sms: 400,
      email: 2000,
      ai: 150,
      qr: 10,
      nfc: 3,
    },
  },
}

// ===== PACKS SMS =====

export const SMS_PACKS: Pack[] = [
  {
    id: 'sms-150',
    type: 'sms',
    name: 'Pack SMS 150',
    description: '150 SMS supplémentaires',
    quantity: 150,
    price: 2900, // 29€ HT
    stripePriceId: 'price_1SxEbpErzua3Kw4jA3FO542Q',
  },
  {
    id: 'sms-300',
    type: 'sms',
    name: 'Pack SMS 300',
    description: '300 SMS supplémentaires',
    quantity: 300,
    price: 4900, // 49€ HT
    stripePriceId: 'price_1SxEcwErzua3Kw4jKVy1EGzu',
    popular: true,
  },
]

// ===== PACKS EMAIL =====

export const EMAIL_PACKS: Pack[] = [
  {
    id: 'email-1000',
    type: 'email',
    name: 'Pack Email 1000',
    description: '1 000 emails supplémentaires',
    quantity: 1000,
    price: 1900, // 19€ HT
    stripePriceId: 'price_1SxUCgErzua3Kw4jvyEPABEV',
  },
  {
    id: 'email-2000',
    type: 'email',
    name: 'Pack Email 2000',
    description: '2 000 emails supplémentaires',
    quantity: 2000,
    price: 3900, // 39€ HT
    stripePriceId: 'price_1SxUDFErzua3Kw4j4Gskl0Bb',
    popular: true,
  },
]

// ===== PACKS IA =====

export const AI_PACKS: Pack[] = [
  {
    id: 'ia-mini',
    type: 'ai',
    name: 'Pack IA Mini',
    description: '25 réponses IA',
    quantity: 25,
    price: 1900, // 19€ HT
    stripePriceId: 'price_1SxV2ZErzua3Kw4jLsYUd2iz',
  },
  {
    id: 'ia-maxi',
    type: 'ai',
    name: 'Pack IA Maxi',
    description: '75 réponses IA',
    quantity: 75,
    price: 3900, // 39€ HT
    stripePriceId: 'price_1SxV3WErzua3Kw4jC7gCSmbv',
    popular: true,
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
  return (cents / 100).toFixed(2).replace('.', ',') + ' €'
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

// ===== PLAN LABELS (pour affichage) =====

export const PLAN_LABELS: Record<PlanId, string> = {
  bronze: 'Pack Bronze (Gratuit)',
  argent: 'Pack Argent',
  or: 'Pack Or',
  platinum: 'Pack Platinum',
}

// ===== ORDERED PLANS (pour affichage dans l'ordre) =====

export const ORDERED_PLAN_IDS: PlanId[] = ['bronze', 'argent', 'or', 'platinum']
