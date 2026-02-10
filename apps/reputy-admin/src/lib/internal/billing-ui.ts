// ============================================================
// BillingUI — Type UI unique pour le pricing
// ============================================================
// Isole l'UI de toutes les formes backend billing via un type
// normalisé + mappers purs.
// Zéro logique métier dans le JSX.
//
// Sources acceptées :
//   1) EffectiveBilling    — backend centralisé (coupon Stripe)
//   2) BillingComputed     — Org.billingComputed (backoffice admin)
//   3) ClientBillingHybrid — ClientOrg.billingComputed (dashboard client,
//      type hybride contenant à la fois legacy + effective fields)
//
// Règles métier :
//   - hasDiscount = priceEffective < priceCatalog (vérité prix)
//   - isNegotiated = tag d'affichage, PAS une condition de discount
//   - discountPercent : entier (20 = 20%), uniquement si type percent
//     (backend confirmé : stripe-coupons.js value=10 → 10%, value=500 → centimes)
// ============================================================

import type { EffectiveBilling } from './actions'
import type { Org } from './fetch-internal'

// ---- Sous-types exportés (pour les tests) ----
export type BillingComputed = NonNullable<Org['billingComputed']>

/** Types d'entrée acceptés par toBillingUI (admin) */
export type BillingInput = EffectiveBilling | BillingComputed

/**
 * Type hybride issu de ClientOrg.billingComputed (auth-context.tsx).
 * Contient à la fois les champs legacy (priceBaseCents) et effective
 * (priceCatalogCents?), ce qui en fait un 3ème shape distinct.
 */
export interface ClientBillingHybrid {
  periodStart?: string
  periodEnd?: string
  periodEndFormatted?: string
  // Legacy pricing (always present)
  priceBaseCents: number
  priceMonthlyFinalCents: number
  discountPercent?: number
  isNegotiated?: boolean
  currency?: string
  // Effective billing (optional overlay)
  priceCatalogCents?: number
  priceEffectiveCents?: number
  hasDiscount?: boolean
  discount?: {
    type: string | null
    value: number | null
    label: string | null
  } | null
  // Prorata
  isProrata?: boolean
  ratio?: number
}

// ---- Type UI unique ----
export interface BillingUI {
  /** Prix catalogue (sans réduction), en centimes */
  priceCatalogCents: number
  /** Prix effectif (après réduction), en centimes */
  priceEffectiveCents: number
  /** Y a-t-il une réduction active ?
   *  Vérité = prix effectif < prix catalogue. Point final. */
  hasDiscount: boolean
  /** Libellé structuré de la réduction (ex: "-20%", "-10 €"), null si aucun */
  discountLabel: string | null
  /** Pourcentage de réduction affiché (entier, ex: 20 pour 20%), null si pas percent */
  discountPercent: number | null
  /** Le prix est-il issu d'une négociation manuelle ? (tag, pas condition) */
  isNegotiated: boolean
  /** Prorata en cours ? */
  isProrata: boolean
  /** Ratio prorata (1.0 si pas de prorata) */
  ratio: number
  /** Début de la période de facturation */
  periodStart: string | null
  /** Fin de la période de facturation */
  periodEnd: string | null
}

// ---- Type guards ----

function isEffectiveBilling(input: BillingInput): input is EffectiveBilling {
  // EffectiveBilling a priceCatalogCents required (number) + planCode
  return 'priceCatalogCents' in input && 'planCode' in input
}

// ---- Mapper admin (EffectiveBilling | BillingComputed) ----

/**
 * Convertit une source billing admin en BillingUI.
 * Fonction pure, sans effet de bord, testable unitairement.
 */
export function toBillingUI(input: BillingInput): BillingUI {
  if (isEffectiveBilling(input)) {
    return mapEffectiveBilling(input)
  }

  // billingComputed (admin)
  return mapBillingComputed(input)
}

// ---- Mapper client (ClientBillingHybrid) ----

/**
 * Convertit le billing hybride du dashboard client en BillingUI.
 * Le type hybride peut avoir les champs effective OU seulement legacy.
 * On priorise effective quand disponible.
 */
export function toBillingUIFromClient(input: ClientBillingHybrid): BillingUI {
  // Prioriser les champs effective (overlay) s'ils existent
  const priceCatalogCents = input.priceCatalogCents ?? input.priceBaseCents
  const priceEffectiveCents = input.priceEffectiveCents ?? input.priceMonthlyFinalCents

  const hasDiscount = priceEffectiveCents < priceCatalogCents

  // discountPercent : depuis discount.type === 'percent' ou legacy discountPercent
  const discountPercent =
    input.discount?.type === 'percent' && typeof input.discount.value === 'number'
      ? input.discount.value
      : (input.discountPercent ?? null)

  // discountLabel : depuis discount.label (effective) ou null
  const discountLabel = input.discount?.label ?? null

  return {
    priceCatalogCents,
    priceEffectiveCents,
    hasDiscount,
    discountLabel,
    discountPercent,
    isNegotiated: input.isNegotiated ?? false,
    isProrata: input.isProrata ?? false,
    ratio: input.ratio ?? 1,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
  }
}

// ---- Mappers internes ----

function mapEffectiveBilling(input: EffectiveBilling): BillingUI {
  const priceCatalogCents = input.priceCatalogCents
  const priceEffectiveCents = input.priceEffectiveCents

  const hasDiscount = priceEffectiveCents < priceCatalogCents

  const discountPercent =
    input.discount?.type === 'percent' && typeof input.discount.value === 'number'
      ? input.discount.value
      : null

  return {
    priceCatalogCents,
    priceEffectiveCents,
    hasDiscount,
    discountLabel: input.discount?.label ?? null,
    discountPercent,
    isNegotiated: false,
    isProrata: false,
    ratio: 1,
    periodStart: input.billingPeriod?.periodStart ?? null,
    periodEnd: input.billingPeriod?.periodEnd ?? null,
  }
}

function mapBillingComputed(input: BillingComputed): BillingUI {
  const priceCatalogCents = input.priceBaseCents
  const priceEffectiveCents = input.priceMonthlyFinalCents

  const hasDiscount = priceEffectiveCents < priceCatalogCents

  return {
    priceCatalogCents,
    priceEffectiveCents,
    hasDiscount,
    discountLabel: null,
    discountPercent: input.discountPercent,
    isNegotiated: input.isNegotiated,
    isProrata: input.isProrata,
    ratio: input.ratio,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  }
}

// ---- Helper d'affichage ----

/** Prix ajusté au prorata si applicable */
export function displayPrice(b: BillingUI, base: number): number {
  return b.isProrata ? Math.round(base * b.ratio) : base
}
