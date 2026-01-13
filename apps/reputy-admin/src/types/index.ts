// ===== TYPES REPUTY ADMIN =====

// Type d'établissement pour la recherche de concurrence
export type EstablishmentType = 'health' | 'commerce' | 'restaurant'

// Spécialités médicales
export type HealthSpecialty = 
  | 'generaliste'
  | 'dentiste'
  | 'dermatologue'
  | 'ophtalmologue'
  | 'kinesitherapeute'
  | 'pharmacien'
  | 'cardiologue'
  | 'pediatre'
  | 'gynecologue'
  | 'osteopathe'

export interface Location {
  id: string
  name: string
  address: string
  city: string
  country: string
  googleConnected: boolean
  googleSessionValid: boolean
  reviewLink: string
  healthMode: boolean
  logo?: string
  createdAt: string
  // Infos pour concurrence auto
  establishmentType?: EstablishmentType
  specialty?: HealthSpecialty
  lat?: number
  lng?: number
}

export interface Review {
  id: string
  locationId: string
  platform: 'google' | 'facebook' | 'tripadvisor'
  rating: number
  author: string
  authorAvatar?: string
  date: string
  content: string
  responded: boolean
  responseText?: string
  responseDate?: string
  tags: string[]
  sentiment?: 'positive' | 'neutral' | 'negative'
  assignedTo?: string
}

export interface Campaign {
  id: string
  locationId: string
  name: string
  channel: 'sms' | 'email'
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'paused'
  scheduledAt?: string
  sent: number
  clicks: number
  reviewsGenerated: number
  conversionRate: number
  createdAt: string
  template?: string
}

export interface Competitor {
  id: string
  locationId: string
  name: string
  placeId: string
  rating: number
  reviewsCount: number
  trend30d: number
  distanceKm: number
  address?: string
  isAuto?: boolean
  isPinned?: boolean
}

// Concurrent automatique (étendu)
export interface AutoCompetitor {
  id: string
  name: string
  category: EstablishmentType
  specialty?: HealthSpecialty
  distanceKm: number
  rating: number
  reviewsCount: number
  reviewsLast30d: number
  responseRate?: number
  trend: 'up' | 'stable' | 'down'
  isAuto: true
  address?: string
  placeId?: string
}

// Paramètres de recherche concurrence auto
export interface AutoCompetitorParams {
  type: EstablishmentType
  specialty?: HealthSpecialty
  radius: 1 | 2 | 5
}

export interface Thread {
  id: string
  locationId: string
  type: 'support' | 'message'
  subject: string
  status: 'open' | 'pending' | 'closed'
  priority: 'low' | 'medium' | 'high'
  lastMessageAt: string
  messages: ThreadMessage[]
  assignedTo?: string
}

export interface ThreadMessage {
  id: string
  threadId: string
  author: string
  authorType: 'user' | 'team'
  content: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'staff'
  avatar?: string
  locationIds: string[]
}

export interface NfcTag {
  id: string
  locationId: string
  name: string
  shortUrl: string
  scans: number
  conversions: number
  createdAt: string
  active: boolean
}

export interface CollectChannel {
  id: string
  type: 'qr' | 'nfc' | 'sms' | 'email' | 'doctolib'
  locationId: string
  sent: number
  clicks: number
  reviewsGenerated: number
  conversionRate: number
}

export interface KpiData {
  averageRating: number
  totalReviews: number
  reviews30Days: number
  unrepliedReviews: number
  responseRate: number
  avgResponseTime: number // en heures
}

export interface AnalyticsData {
  period: string
  reviews: number
  rating: number
}

export interface StarDistribution {
  stars: number
  count: number
  percentage: number
}

export interface ResponseTemplate {
  id: string
  name: string
  tone: 'professional' | 'warm' | 'short'
  healthMode: boolean
  content: string
}

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: string
  target: string
  createdAt: string
}

// ===== TYPES IA =====

// Tons disponibles pour l'IA
export type AiTone = 'professional' | 'warm' | 'short' | 'empathetic'

// Suggestion de réponse générée par l'IA
export interface AiSuggestion {
  id: string
  tone: AiTone
  text: string
  tokensUsed?: number
}

// Paramètres de requête IA
export interface AiSuggestRequest {
  reviewId: string
  reviewContent: string
  reviewRating: number
  tone: AiTone
  instructions?: string
  healthMode: boolean
}

// Réponse de l'API IA
export interface AiSuggestResponse {
  suggestions: AiSuggestion[]
  tokensUsed: number
  quotaRemaining: number
}

// Quota IA mensuel
export interface AiQuota {
  monthlyLimit: number
  usedThisMonth: number
  resetDate: string
}

// Paramètres organisation (pour l'abonnement)
export interface OrgSettings {
  id: string
  name: string
  plan: 'free' | 'starter' | 'pro' | 'enterprise'
  aiEnabled: boolean
  aiQuota: AiQuota
  healthModeDefault: boolean
  createdAt: string
}

// Labels français pour les tons
export const toneLabels: Record<AiTone, string> = {
  professional: 'Professionnel',
  warm: 'Chaleureux',
  short: 'Court',
  empathetic: 'Empathique',
}

// ===== TYPES FACTURATION =====

// Plan d'abonnement
export interface Plan {
  id: string
  name: string
  price: number // En euros HT
  currency: string
  interval: 'month' | 'year'
  features: string[]
  smsQuota: number
  emailQuota: number
  aiQuota: number
  stripePriceId?: string
}

// Pack complémentaire
export interface Pack {
  id: string
  name: string
  type: 'sms' | 'email' | 'ai'
  quantity: number
  price: number
  stripePriceId?: string
}

// Abonnement actif
export interface Subscription {
  id: string
  organizationId: string
  planId: string
  status: 'active' | 'past_due' | 'cancelled' | 'trialing'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  cancelledAt?: string
  stripeSubscriptionId?: string
}

// Paiement
export interface Payment {
  id: string
  organizationId: string
  organizationName?: string
  amount: number
  currency: string
  type: 'subscription' | 'pack_sms' | 'pack_email' | 'pack_ai'
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  method: 'sepa' | 'card'
  date: string
  invoiceId?: string
  stripePaymentIntentId?: string
  failureReason?: string
}

// Facture
export interface Invoice {
  id: string
  organizationId: string
  number: string
  date: string
  dueDate: string
  status: 'draft' | 'paid' | 'void' | 'uncollectible'
  // Informations client
  customerName: string
  customerAddress: string
  customerCity: string
  customerPostalCode: string
  customerCountry: string
  customerVat?: string
  // Lignes de facture
  lines: InvoiceLine[]
  // Montants
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currency: string
  // Paiement
  paidAt?: string
  paymentId?: string
  // PDF
  pdfUrl?: string
}

export interface InvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

// Paramètres de facturation
export interface BillingSettings {
  companyName: string
  address: string
  city: string
  postalCode: string
  country: string
  vatNumber?: string
  billingEmail: string
}

// Mandat SEPA
export interface SepaMandate {
  id: string
  organizationId: string
  status: 'pending' | 'active' | 'revoked' | 'failed'
  debtorName: string
  debtorIban: string
  mandateReference: string
  signatureDate: string
  activatedAt?: string
  revokedAt?: string
}

// ===== TYPES SÉCURITÉ =====

export interface SecurityEvent {
  id: string
  type: string
  timestamp: string
  userId?: string
  email?: string
  ip?: string
  userAgent?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  details?: Record<string, unknown>
}

export interface RateLimitStatus {
  allowed: boolean
  remainingAttempts: number
  blockedUntil?: string
}

