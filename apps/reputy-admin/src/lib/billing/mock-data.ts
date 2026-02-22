/**
 * Données mock pour le système de facturation
 */

import type { 
  Subscription, 
  Payment, 
  Invoice, 
  BillingInfo, 
  OrgQuotas 
} from './types'

// ===== ABONNEMENT MOCK =====

export const mockSubscription: Subscription = {
  id: 'sub_mock_001',
  orgId: 'org-1',
  planId: 'platinum',
  status: 'active',
  stripeSubscriptionId: 'sub_1234567890',
  stripeCustomerId: 'cus_1234567890',
  currentPeriodStart: '2026-01-01',
  currentPeriodEnd: '2026-02-01',
  cancelAtPeriodEnd: false,
  createdAt: '2025-06-15',
  updatedAt: '2026-01-01',
}

// ===== INFOS FACTURATION MOCK =====

export const mockBillingInfo: BillingInfo = {
  companyName: 'Cabinet Dr. Atlan Michael',
  address: '15 Rue de la Santé',
  city: 'Paris',
  postalCode: '75013',
  country: 'France',
  vatNumber: 'FR12345678901',
  email: 'facturation@cabinet-atlan.fr',
}

// ===== QUOTAS MOCK =====

export const mockQuotas: OrgQuotas = {
  sms: {
    limit: 200,
    used: 45,
    resetDate: '2026-02-01',
  },
  email: {
    limit: 1000,
    used: 127,
    resetDate: '2026-02-01',
  },
  ai: {
    limit: 75,
    used: 12,
    resetDate: '2026-02-01',
  },
}

// ===== PAIEMENTS MOCK =====

export const mockPayments: Payment[] = [
  {
    id: 'pay_001',
    orgId: 'org-1',
    stripePaymentIntentId: 'pi_001',
    stripeInvoiceId: 'in_001',
    type: 'subscription',
    description: 'Pack Platinum - Janvier 2026',
    amount: 9900,
    currency: 'eur',
    status: 'succeeded',
    createdAt: '2026-01-01T10:00:00',
    invoiceId: 'inv_001',
  },
  {
    id: 'pay_002',
    orgId: 'org-1',
    stripePaymentIntentId: 'pi_002',
    type: 'pack',
    description: 'Pack SMS 150',
    amount: 2900,
    currency: 'eur',
    status: 'succeeded',
    createdAt: '2026-01-05T14:30:00',
    invoiceId: 'inv_002',
  },
  {
    id: 'pay_003',
    orgId: 'org-1',
    stripePaymentIntentId: 'pi_003',
    stripeInvoiceId: 'in_002',
    type: 'subscription',
    description: 'Pack Or - Décembre 2025',
    amount: 9900,
    currency: 'eur',
    status: 'succeeded',
    createdAt: '2025-12-01T10:00:00',
    invoiceId: 'inv_003',
  },
  {
    id: 'pay_004',
    orgId: 'org-1',
    stripePaymentIntentId: 'pi_004',
    type: 'pack',
    description: 'Pack IA Mini (25 réponses)',
    amount: 1900,
    currency: 'eur',
    status: 'succeeded',
    createdAt: '2025-11-20T09:15:00',
    invoiceId: 'inv_004',
  },
]

// ===== FACTURES MOCK =====

export const mockInvoices: Invoice[] = [
  {
    id: 'inv_001',
    orgId: 'org-1',
    number: 'RPTY-2026-0001',
    status: 'paid',
    date: '2026-01-01',
    dueDate: '2026-01-01',
    customerName: 'Cabinet Dr. Atlan Michael',
    customerAddress: '15 Rue de la Santé',
    customerCity: '75013 Paris, France',
    customerCountry: 'France',
    customerVatNumber: 'FR12345678901',
    lines: [
      {
        description: 'Pack Platinum Reputy - Janvier 2026',
        quantity: 1,
        unitPrice: 9900,
        total: 9900,
      },
    ],
    subtotal: 9900,
    vatRate: 20,
    vatAmount: 1980,
    total: 11880,
    stripeInvoiceId: 'in_001',
    createdAt: '2026-01-01T10:00:00',
  },
  {
    id: 'inv_002',
    orgId: 'org-1',
    number: 'RPTY-2026-0002',
    status: 'paid',
    date: '2026-01-05',
    dueDate: '2026-01-05',
    customerName: 'Cabinet Dr. Atlan Michael',
    customerAddress: '15 Rue de la Santé',
    customerCity: '75013 Paris, France',
    customerCountry: 'France',
    customerVatNumber: 'FR12345678901',
    lines: [
      {
        description: 'Pack SMS 150',
        quantity: 1,
        unitPrice: 2900,
        total: 2900,
      },
    ],
    subtotal: 2900,
    vatRate: 20,
    vatAmount: 580,
    total: 3480,
    createdAt: '2026-01-05T14:30:00',
  },
  {
    id: 'inv_003',
    orgId: 'org-1',
    number: 'RPTY-2025-0012',
    status: 'paid',
    date: '2025-12-01',
    dueDate: '2025-12-01',
    customerName: 'Cabinet Dr. Atlan Michael',
    customerAddress: '15 Rue de la Santé',
    customerCity: '75013 Paris, France',
    customerCountry: 'France',
    customerVatNumber: 'FR12345678901',
    lines: [
      {
        description: 'Pack Platinum Reputy - Décembre 2025',
        quantity: 1,
        unitPrice: 9900,
        total: 9900,
      },
    ],
    subtotal: 9900,
    vatRate: 20,
    vatAmount: 1980,
    total: 11880,
    stripeInvoiceId: 'in_002',
    createdAt: '2025-12-01T10:00:00',
  },
  {
    id: 'inv_004',
    orgId: 'org-1',
    number: 'RPTY-2025-0011',
    status: 'paid',
    date: '2025-11-20',
    dueDate: '2025-11-20',
    customerName: 'Cabinet Dr. Atlan Michael',
    customerAddress: '15 Rue de la Santé',
    customerCity: '75013 Paris, France',
    customerCountry: 'France',
    customerVatNumber: 'FR12345678901',
    lines: [
      {
        description: 'Pack IA Mini (25 réponses)',
        quantity: 1,
        unitPrice: 1900,
        total: 1900,
      },
    ],
    subtotal: 1900,
    vatRate: 20,
    vatAmount: 380,
    total: 2280,
    createdAt: '2025-11-20T09:15:00',
  },
]

// ===== HELPERS =====

export function getPaymentsForOrg(orgId: string): Payment[] {
  return mockPayments.filter(p => p.orgId === orgId)
}

export function getInvoicesForOrg(orgId: string): Invoice[] {
  return mockInvoices.filter(i => i.orgId === orgId)
}

export function getSubscriptionForOrg(orgId: string): Subscription | null {
  return mockSubscription.orgId === orgId ? mockSubscription : null
}





