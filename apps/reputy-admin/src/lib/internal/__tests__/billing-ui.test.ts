import { describe, it, expect } from 'vitest'
import {
  toBillingUI,
  toBillingUIFromClient,
  displayPrice,
  type BillingUI,
  type BillingComputed,
  type ClientBillingHybrid,
} from '../billing-ui'
import type { EffectiveBilling } from '../actions'

// ============================================================
// HELPERS — build valid test objects without `any`
// ============================================================

const ZERO_QUOTAS = { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 0, nfcIncluded: 0 }
const ZERO_CREDITS = { sms: 0, email: 0, ai: 0, qr: 0, nfc: 0 }
const ZERO_PACKS = { sms: 0, email: 0, ai: 0 }

function makeEffectiveBilling(overrides: Partial<EffectiveBilling> = {}): EffectiveBilling {
  return {
    planCode: 'health_platinum',
    planName: 'Pack Platinum',
    planTier: 2,
    priceCatalogCents: 9900,
    priceEffectiveCents: 9900,
    priceCatalogFormatted: '99 €',
    priceEffectiveFormatted: '99 €',
    stripeCouponId: null,
    discount: { type: null, value: null, label: null },
    couponInfo: null,
    hasDiscount: false,
    quotasCatalog: ZERO_QUOTAS,
    quotasEffective: ZERO_QUOTAS,
    bonusMonthly: ZERO_PACKS,
    monthlyRemaining: ZERO_CREDITS,
    monthlyUsed: ZERO_CREDITS,
    packsBalance: ZERO_PACKS,
    totalAvailableThisMonth: ZERO_CREDITS,
    billingPeriod: { periodStart: '2026-02-01', periodEnd: '2026-03-01' },
    periodEndFormatted: '1 mars 2026',
    ...overrides,
  }
}

function makeBillingComputed(overrides: Partial<BillingComputed> = {}): BillingComputed {
  return {
    periodStart: '2026-02-01',
    periodEnd: '2026-03-01',
    ratio: 1,
    isProrata: false,
    smsUsed: 0,
    smsAllocated: 100,
    smsRemaining: 100,
    emailUsed: 0,
    emailAllocated: 200,
    emailRemaining: 200,
    smsIncludedMonthly: 100,
    emailIncludedMonthly: 200,
    breakdown: {
      included: { sms: 100, email: 200 },
      gift: { sms: 0, email: 0 },
      pack: { sms: 0, email: 0 },
    },
    allocations: [],
    priceBaseCents: 9900,
    priceMonthlyFinalCents: 9900,
    priceThisPeriodCents: 9900,
    discountPercent: null,
    isNegotiated: false,
    currency: 'EUR',
    noRollover: false,
    ...overrides,
  }
}

function makeClientHybrid(overrides: Partial<ClientBillingHybrid> = {}): ClientBillingHybrid {
  return {
    periodStart: '2026-02-01',
    periodEnd: '2026-03-01',
    priceBaseCents: 9900,
    priceMonthlyFinalCents: 9900,
    ...overrides,
  }
}

// ============================================================
// TESTS — toBillingUI (EffectiveBilling)
// ============================================================

describe('toBillingUI — EffectiveBilling', () => {
  it('maps a full-price plan with no discount', () => {
    const input = makeEffectiveBilling()
    const result = toBillingUI(input)

    expect(result.priceCatalogCents).toBe(9900)
    expect(result.priceEffectiveCents).toBe(9900)
    expect(result.hasDiscount).toBe(false)
    expect(result.discountLabel).toBeNull()
    expect(result.discountPercent).toBeNull()
    expect(result.isNegotiated).toBe(false)
    expect(result.isProrata).toBe(false)
    expect(result.ratio).toBe(1)
    expect(result.periodStart).toBe('2026-02-01')
    expect(result.periodEnd).toBe('2026-03-01')
  })

  it('detects discount via price comparison (percent coupon)', () => {
    const input = makeEffectiveBilling({
      priceCatalogCents: 9900,
      priceEffectiveCents: 7920, // -20%
      stripeCouponId: 'DISC_20_PCT',
      discount: { type: 'percent', value: 20, label: '-20%' },
      hasDiscount: true,
    })
    const result = toBillingUI(input)

    expect(result.hasDiscount).toBe(true)
    expect(result.discountLabel).toBe('-20%')
    expect(result.discountPercent).toBe(20)
    expect(result.priceCatalogCents).toBe(9900)
    expect(result.priceEffectiveCents).toBe(7920)
  })

  it('detects discount via price comparison (fixed coupon)', () => {
    const input = makeEffectiveBilling({
      priceCatalogCents: 9900,
      priceEffectiveCents: 8900, // -10€
      stripeCouponId: 'DISC_10_EUR',
      discount: { type: 'fixed', value: 1000, label: '-10 €' },
      hasDiscount: true,
    })
    const result = toBillingUI(input)

    expect(result.hasDiscount).toBe(true)
    expect(result.discountLabel).toBe('-10 €')
    // discountPercent is null for fixed coupons (value is in cents, not %)
    expect(result.discountPercent).toBeNull()
  })

  it('returns hasDiscount=false when prices are equal even if backend says hasDiscount=true', () => {
    // Edge case: backend sets hasDiscount based on couponId presence,
    // but effective price equals catalog (e.g. 0€ plan with coupon)
    const input = makeEffectiveBilling({
      priceCatalogCents: 0,
      priceEffectiveCents: 0,
      hasDiscount: true,
      stripeCouponId: 'DISC_20_PCT',
    })
    const result = toBillingUI(input)

    expect(result.hasDiscount).toBe(false) // vérité prix
  })

  it('defaults isProrata to false and ratio to 1', () => {
    const result = toBillingUI(makeEffectiveBilling())
    expect(result.isProrata).toBe(false)
    expect(result.ratio).toBe(1)
  })
})

// ============================================================
// TESTS — toBillingUI (BillingComputed)
// ============================================================

describe('toBillingUI — BillingComputed', () => {
  it('maps a full-price plan with no discount', () => {
    const input = makeBillingComputed()
    const result = toBillingUI(input)

    expect(result.priceCatalogCents).toBe(9900)
    expect(result.priceEffectiveCents).toBe(9900)
    expect(result.hasDiscount).toBe(false)
    expect(result.discountLabel).toBeNull()
    expect(result.discountPercent).toBeNull()
    expect(result.isNegotiated).toBe(false)
    expect(result.isProrata).toBe(false)
    expect(result.ratio).toBe(1)
  })

  it('detects negotiated discount via price comparison', () => {
    const input = makeBillingComputed({
      priceBaseCents: 9900,
      priceMonthlyFinalCents: 7900,
      isNegotiated: true,
      discountPercent: 20,
    })
    const result = toBillingUI(input)

    expect(result.hasDiscount).toBe(true)
    expect(result.priceCatalogCents).toBe(9900)
    expect(result.priceEffectiveCents).toBe(7900)
    expect(result.isNegotiated).toBe(true)
    expect(result.discountPercent).toBe(20)
    expect(result.discountLabel).toBeNull() // billingComputed has no label
  })

  it('detects discount even if isNegotiated is false (price-driven)', () => {
    // Case: discountPercent exists but isNegotiated is false
    // hasDiscount should still be true because effective < catalog
    const input = makeBillingComputed({
      priceBaseCents: 9900,
      priceMonthlyFinalCents: 8900,
      isNegotiated: false,
      discountPercent: null,
    })
    const result = toBillingUI(input)

    expect(result.hasDiscount).toBe(true)
    expect(result.isNegotiated).toBe(false)
  })

  it('handles prorata correctly', () => {
    const input = makeBillingComputed({
      isProrata: true,
      ratio: 0.5,
    })
    const result = toBillingUI(input)

    expect(result.isProrata).toBe(true)
    expect(result.ratio).toBe(0.5)
  })
})

// ============================================================
// TESTS — toBillingUIFromClient (ClientBillingHybrid)
// ============================================================

describe('toBillingUIFromClient — ClientBillingHybrid', () => {
  it('uses effective fields when available', () => {
    const input = makeClientHybrid({
      priceBaseCents: 9900,
      priceMonthlyFinalCents: 9900,
      priceCatalogCents: 9900,
      priceEffectiveCents: 7920,
      hasDiscount: true,
      discount: { type: 'percent', value: 20, label: '-20%' },
    })
    const result = toBillingUIFromClient(input)

    expect(result.priceCatalogCents).toBe(9900)
    expect(result.priceEffectiveCents).toBe(7920)
    expect(result.hasDiscount).toBe(true)
    expect(result.discountLabel).toBe('-20%')
    expect(result.discountPercent).toBe(20)
  })

  it('falls back to legacy fields when effective fields are absent', () => {
    const input = makeClientHybrid({
      priceBaseCents: 9900,
      priceMonthlyFinalCents: 7900,
      isNegotiated: true,
      discountPercent: 20,
      // No priceCatalogCents / priceEffectiveCents
    })
    const result = toBillingUIFromClient(input)

    expect(result.priceCatalogCents).toBe(9900)
    expect(result.priceEffectiveCents).toBe(7900)
    expect(result.hasDiscount).toBe(true)
    expect(result.discountPercent).toBe(20)
    expect(result.isNegotiated).toBe(true)
  })

  it('handles no discount (all defaults)', () => {
    const input = makeClientHybrid()
    const result = toBillingUIFromClient(input)

    expect(result.hasDiscount).toBe(false)
    expect(result.discountLabel).toBeNull()
    expect(result.discountPercent).toBeNull()
    expect(result.isNegotiated).toBe(false)
    expect(result.isProrata).toBe(false)
    expect(result.ratio).toBe(1)
  })

  it('handles prorata with defaults', () => {
    const input = makeClientHybrid({ isProrata: true, ratio: 0.33 })
    const result = toBillingUIFromClient(input)

    expect(result.isProrata).toBe(true)
    expect(result.ratio).toBe(0.33)
  })
})

// ============================================================
// TESTS — displayPrice
// ============================================================

describe('displayPrice', () => {
  it('returns base price when not prorata', () => {
    const b: BillingUI = {
      priceCatalogCents: 9900,
      priceEffectiveCents: 9900,
      hasDiscount: false,
      discountLabel: null,
      discountPercent: null,
      isNegotiated: false,
      isProrata: false,
      ratio: 1,
      periodStart: null,
      periodEnd: null,
    }
    expect(displayPrice(b, 9900)).toBe(9900)
  })

  it('applies prorata ratio when isProrata=true', () => {
    const b: BillingUI = {
      priceCatalogCents: 9900,
      priceEffectiveCents: 9900,
      hasDiscount: false,
      discountLabel: null,
      discountPercent: null,
      isNegotiated: false,
      isProrata: true,
      ratio: 0.5,
      periodStart: null,
      periodEnd: null,
    }
    expect(displayPrice(b, 9900)).toBe(4950) // Math.round(9900 * 0.5)
  })

  it('rounds prorata price correctly', () => {
    const b: BillingUI = {
      priceCatalogCents: 9900,
      priceEffectiveCents: 9900,
      hasDiscount: false,
      discountLabel: null,
      discountPercent: null,
      isNegotiated: false,
      isProrata: true,
      ratio: 0.33,
      periodStart: null,
      periodEnd: null,
    }
    expect(displayPrice(b, 9900)).toBe(3267) // Math.round(9900 * 0.33)
  })
})
