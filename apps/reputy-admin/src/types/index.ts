// ===== TYPES REPUTY ADMIN =====

// Type d'établissement pour la recherche de concurrence
export type EstablishmentType = 'health' | 'commerce' | 'restaurant'

// Spécialités médicales
export type HealthSpecialty = 
  // Médecine générale
  | 'generaliste'
  // Dentaire
  | 'dentiste'
  | 'centre_dentaire'
  | 'centre_medico_dentaire'
  | 'orthodontiste'
  // Ophtalmologie
  | 'ophtalmologue'
  | 'centre_ophtalmologique'
  // Centre médical
  | 'centre_medical'
  // Spécialistes
  | 'dermatologue'
  | 'kinesitherapeute'
  | 'pharmacien'
  | 'cardiologue'
  | 'pediatre'
  | 'gynecologue'
  | 'osteopathe'
  | 'orl'
  | 'radiologue'
  | 'allergologue'
  | 'rhumatologue'
  | 'neurologue'
  | 'urologue'
  | 'gastro_enterologue'
  | 'pneumologue'
  | 'endocrinologue'
  | 'psychiatre'
  | 'psychologue'
  // Chirurgie
  | 'chirurgien'
  | 'anesthesiste'
  | 'stomatologue'
  // Paramédical
  | 'sage_femme'
  | 'infirmier'
  | 'podologue'
  | 'orthophoniste'
  | 'dieteticien'
  | 'chiropracteur'
  | 'medecin_du_sport'
  // Médecines complémentaires
  | 'acupuncteur'
  | 'naturopathe'
  | 'sophrologue'
  // Structures
  | 'clinique'
  | 'laboratoire'
  // Vétérinaire
  | 'veterinaire'

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
  platform: 'google' | 'facebook' | 'tripadvisor' | 'doctolib'
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
  orgId: string
  name: string
  type: 'review' | 'marketing'
  channel: 'sms' | 'email'
  status: 'draft' | 'scheduled' | 'active' | 'sending' | 'completed' | 'paused'
  template?: string
  subject?: string
  scheduledAt?: string
  startedAt?: string
  completedAt?: string
  spamThreshold: number
  totalRecipients: number
  totalSent: number
  totalClicks: number
  totalReviews: number
  createdAt: string
  updatedAt: string
  // Legacy compat (mapped from totalSent, totalClicks, totalReviews)
  sent?: number
  clicks?: number
  reviewsGenerated?: number
  conversionRate?: number
  // Kept for backward compat
  locationId?: string
}

export interface Contact {
  id: string
  orgId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  source: 'manual' | 'import_csv' | 'import_excel' | 'review_request' | 'sync'
  tags: string[]
  reviewSolicitationsNoReply: number
  hasLeftReview: boolean
  lastSolicitedAt: string | null
  lastReviewAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ContactCounts {
  total: number
  manual: number
  import_csv: number
  import_excel: number
  review_request: number
  sync: number
  withEmail: number
  withPhone: number
}

export interface CampaignStats {
  total: number
  eligible: number
  sent: number
  clicked: number
  reviewed: number
  failed: number
  excludedSpam: number
  excludedReviewed: number
  clickRate: number
  conversionRate: number
}

export interface ImportResult {
  imported: number
  duplicates: number
  invalid: number
  total: number
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

export type UserCivility = 'Dr' | 'M' | 'Mme'

export interface User {
  id: string
  civility: UserCivility
  firstName: string
  lastName: string
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

// ===== TYPES MULTI-ÉTABLISSEMENT (PR-8c) =====

export type MembershipRole = 'owner' | 'admin' | 'agent'
export type MembershipStatus = 'active' | 'pending' | 'revoked'

/** Permissions granulaires par membership */
export interface MembershipPermissions {
  reviews: boolean
  stats: boolean
  campaigns: boolean
  billing: boolean
  team: boolean
  settings: boolean
  ai: boolean
}

/** Membership retourné par GET /client/memberships */
export interface Membership {
  id: string
  orgId: string
  orgName: string
  orgStatus: string
  orgVertical: string
  orgPlan: Record<string, unknown>
  role: MembershipRole
  status: MembershipStatus
  permissions?: MembershipPermissions
  acceptedAt: string | null
}

/** Type léger pour topbar org-picker + /locations (pas le type Location mock) */
export interface OrgSummary {
  orgId: string
  orgName: string
  orgStatus: string
  orgVertical: string
  role: MembershipRole
}

/** Membre d'équipe retourné par GET /client/team */
export interface TeamMember {
  membershipId: string
  userId: string
  email: string
  name: string | null
  role: MembershipRole
  status: MembershipStatus
  permissions?: MembershipPermissions
  invitedAt: string | null
  acceptedAt: string | null
  revokedAt: string | null
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

