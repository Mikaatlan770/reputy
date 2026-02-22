/**
 * Définition des plans et packs Reputy
 * 
 * Les prix sont en centimes HT pour éviter les erreurs de calcul
 * Version: 3.0.0 - Nouvelle grille tarifaire V2 (Bronze/Argent 49€/Platinum 99€)
 * Plan "Or" supprimé — clients existants remappés vers Platinum
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
      '1 QR code (200 scans)',
      'Possibilité d\'acheter des packs',
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
    priceMonthly: 4900, // 49€ HT
    features: [
      '200 SMS / mois',
      '2 000 emails / mois',
      '100 réponses IA / mois',
      '3 QR codes (1000 scans)',
      '1 Tag NFC (1000 scans)',
      'Module Doctolib',
      'Google Places hebdomadaire',
    ],
    quotas: {
      sms: 200,
      email: 2000,
      ai: 100,
      qr: 3,
      nfc: 1,
    },
    popular: true,
  },
  platinum: {
    id: 'platinum',
    name: 'Pack Platinum',
    description: 'Performance maximale',
    priceMonthly: 9900, // 99€ HT
    features: [
      '500 SMS / mois',
      '4 000 emails / mois',
      '200 réponses IA / mois',
      '10 QR codes (1000 scans)',
      '3 Tags NFC (1000 scans)',
      'Module Doctolib',
      'Google Places hebdomadaire',
      'Support prioritaire',
    ],
    quotas: {
      sms: 500,
      email: 4000,
      ai: 200,
      qr: 10,
      nfc: 3,
    },
  },
}

// ===== PACKS SMS =====

export const SMS_PACKS: Pack[] = [
  {
    id: 'sms-200',
    type: 'sms',
    name: 'Pack SMS 200',
    description: '200 SMS supplémentaires',
    quantity: 200,
    price: 2900, // 29€ HT
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
  },
]

// ===== PACKS IA =====

export const AI_PACKS: Pack[] = [
  {
    id: 'ia-50',
    type: 'ai',
    name: 'Pack IA 50',
    description: '50 réponses IA',
    quantity: 50,
    price: 2900, // 29€ HT
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
  platinum: 'Pack Platinum',
}

// ===== ORDERED PLANS (pour affichage dans l'ordre) =====

export const ORDERED_PLAN_IDS: PlanId[] = ['bronze', 'argent', 'platinum']
