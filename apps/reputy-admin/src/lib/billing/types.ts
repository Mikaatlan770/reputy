/**
 * Types pour le système de facturation Reputy
 */

// ===== PLANS =====

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise'

export interface Plan {
  id: PlanId
  name: string
  description: string
  priceMonthly: number // en centimes
  priceYearly: number // en centimes (avec réduction)
  stripePriceIdMonthly?: string
  stripePriceIdYearly?: string
  features: string[]
  quotas: {
    sms: number
    email: number
    ai: number
    locations: number
    users: number
  }
  popular?: boolean
}

// ===== PACKS (achats ponctuels) =====

export type PackType = 'sms' | 'email' | 'ai'

export interface Pack {
  id: string
  type: PackType
  name: string
  description: string
  quantity: number
  price: number // en centimes
  stripePriceId?: string
  popular?: boolean
}

// ===== ABONNEMENT =====

export type SubscriptionStatus = 
  | 'active' 
  | 'past_due' 
  | 'canceled' 
  | 'unpaid' 
  | 'trialing'
  | 'incomplete'
  | 'cancel_requested'

export interface Subscription {
  id: string
  orgId: string
  planId: PlanId
  status: SubscriptionStatus
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  createdAt: string
  updatedAt: string
  // Préavis / résiliation interne
  cancelRequestedAt?: string
  cancelEffectiveAt?: string
  providerEnded?: boolean
}

// ===== PAIEMENTS =====

export type PaymentStatus = 'succeeded' | 'pending' | 'failed' | 'refunded'
export type PaymentType = 'subscription' | 'pack'

export interface Payment {
  id: string
  orgId: string
  stripePaymentIntentId?: string
  stripeInvoiceId?: string
  type: PaymentType
  description: string
  amount: number // en centimes
  currency: string
  status: PaymentStatus
  createdAt: string
  invoiceId?: string
}

// ===== FACTURES =====

export interface InvoiceLine {
  description: string
  quantity: number
  unitPrice: number // en centimes
  total: number // en centimes
}

export interface Invoice {
  id: string
  orgId: string
  number: string // ex: "RPTY-2026-0001"
  status: 'draft' | 'paid' | 'void'
  date: string
  dueDate: string
  // Infos client
  customerName: string
  customerAddress: string
  customerCity: string
  customerCountry: string
  customerVatNumber?: string
  // Lignes
  lines: InvoiceLine[]
  // Totaux
  subtotal: number // HT en centimes
  vatRate: number // ex: 20 pour 20%
  vatAmount: number // en centimes
  total: number // TTC en centimes
  // Stripe
  stripeInvoiceId?: string
  stripeInvoiceUrl?: string
  // PDF
  pdfUrl?: string
  createdAt: string
}

// ===== INFOS FACTURATION ORG =====

export interface BillingInfo {
  companyName?: string
  address?: string
  city?: string
  postalCode?: string
  country: string
  vatNumber?: string
  email: string
}

// ===== QUOTAS ORGANISATION =====

export interface OrgQuotas {
  sms: { limit: number; used: number; resetDate: string }
  email: { limit: number; used: number; resetDate: string }
  ai: { limit: number; used: number; resetDate: string }
}

// ===== WEBHOOK EVENTS =====

export type StripeWebhookEvent = 
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'

// ===== Événements génériques normalisés =====

export type GenericEventType =
  | 'checkout.session.completed'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.deleted'

export interface GenericWebhookEvent {
  id: string
  type: GenericEventType
  created: number
  customerId?: string
  subscriptionId?: string
  invoiceId?: string
  paymentIntentId?: string
  mode?: 'subscription' | 'payment'
  metadata?: Record<string, string>
  subscription?: Subscription
}


