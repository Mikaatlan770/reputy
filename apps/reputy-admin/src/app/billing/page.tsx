'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSecureToken } from '@/lib/auth/secure-token'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CreditCard,
  Receipt,
  Package,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Mail,
  Sparkles,
  Zap,
  Crown,
  Check,
  QrCode,
  Wifi,
  Loader2,
  AlertCircle,
  RefreshCw,
  ShoppingCart,
  Bot,
  Download,
  FileText,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================
// Types
// ============================================================

interface BillingQuota {
  included: number
  used: number
  remaining: number
}

interface BillingStatus {
  plan: string
  planLabel: string
  planName?: string
  // Price info from effectiveBilling
  priceCatalogCents?: number
  priceEffectiveCents?: number
  priceFormatted?: string
  // Discount info
  hasDiscount?: boolean
  discount?: {
    type: string | null
    value: number | null
    label: string | null
  }
  couponInfo?: {
    id: string
    label: string
    description: string
  } | null
  // Access state
  accessState: string
  accessStateLabel: string
  isRestricted: boolean
  warningMessage: string | null
  blockMessage: string | null
  periodStart: string | null
  periodEnd: string | null
  periodEndFormatted?: string
  trialEnd: string | null
  pastDueSince: string | null
  daysPastDue: number | null
  provider: string
  hasPaymentMethod: boolean
  quotas: {
    sms: BillingQuota & { packsBalance?: number; totalAvailable?: number }
    email: BillingQuota & { packsBalance?: number; totalAvailable?: number }
    ai: BillingQuota & { packsBalance?: number; totalAvailable?: number }
    qr: BillingQuota
    nfc: BillingQuota
  }
}

// ============================================================
// Constants
// ============================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787'

const PLANS = {
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
    popular: false,
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
    popular: false,
  },
}

const formatPriceHT = (cents: number) => {
  if (cents === 0) return 'Gratuit'
  return `${(cents / 100).toFixed(0)}€ HT`
}

// Packs disponibles à l'achat (one-time) — V2
const PACKS = [
  { id: 'sms-200', name: 'Pack SMS 200', description: '200 SMS', credits: 200, price: 2900, icon: MessageSquare, color: 'text-blue-500', category: 'sms' },
  { id: 'email-1000', name: 'Pack Email 1000', description: '1 000 emails', credits: 1000, price: 1900, icon: Mail, color: 'text-orange-500', category: 'email' },
  { id: 'ia-50', name: 'Pack IA 50', description: '50 réponses IA', credits: 50, price: 2900, icon: Bot, color: 'text-violet-500', category: 'ia' },
  { id: 'qr', name: 'QR Code', description: '1 QR code (1000 scans)', credits: 1, price: 500, icon: QrCode, color: 'text-teal-500', category: 'qr' },
  { id: 'qr-nfc', name: 'QR + NFC Tag', description: '1 QR + 1 NFC (1000 scans chacun)', credits: 1, price: 1500, icon: Wifi, color: 'text-cyan-500', category: 'nfc' },
]

type CartItem = {
  packId: string
  quantity: number
}

// ============================================================
// API Functions
// ============================================================

async function fetchBillingStatus(): Promise<BillingStatus> {
  const token = await getSecureToken()
  if (!token) throw new Error('Non authentifié')

  const response = await fetch(`${API_BASE_URL}/client/billing/status`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur inconnue' }))
    throw new Error(error.message || `Erreur ${response.status}`)
  }

  const data = await response.json()
  return data.billing
}

async function createCheckoutSession(planId: string): Promise<{ url: string }> {
  const token = await getSecureToken()
  if (!token) throw new Error('Non authentifié')

  const response = await fetch(`${API_BASE_URL}/client/billing/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ planId, provider: 'stripe' }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur inconnue' }))
    throw new Error(error.message || `Erreur ${response.status}`)
  }

  return response.json()
}

async function createPortalSession(): Promise<{ url: string }> {
  const token = await getSecureToken()
  if (!token) throw new Error('Non authentifié')

  const response = await fetch(`${API_BASE_URL}/client/billing/portal`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur inconnue' }))
    throw new Error(error.message || `Erreur ${response.status}`)
  }

  return response.json()
}

async function createPackCheckoutSession(packId: string): Promise<{ url: string }> {
  const token = await getSecureToken()
  if (!token) throw new Error('Non authentifié')

  const response = await fetch(`${API_BASE_URL}/client/billing/pack/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur inconnue' }))
    throw new Error(error.message || `Erreur ${response.status}`)
  }

  return response.json()
}

// ===== Invoice types =====

interface StripeInvoice {
  id: string
  number: string | null
  date: string
  periodStart: string | null
  periodEnd: string | null
  status: string
  amountDue: number
  amountPaid: number
  currency: string
  description: string
  pdfUrl: string | null
  hostedUrl: string | null
  lines: Array<{
    description: string
    quantity: number
    unitAmount: number
    amount: number
  }>
  subtotal: number
  tax: number
  total: number
}

async function fetchInvoices(): Promise<StripeInvoice[]> {
  const token = await getSecureToken()
  if (!token) throw new Error('Non authentifié')

  const response = await fetch(`${API_BASE_URL}/client/billing/invoices`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur inconnue' }))
    throw new Error(error.message || `Erreur ${response.status}`)
  }

  const data = await response.json()
  return data.invoices
}

async function createMultiPackCheckoutSession(items: CartItem[]): Promise<{ url: string }> {
  const token = await getSecureToken()
  if (!token) throw new Error('Non authentifié')

  const response = await fetch(`${API_BASE_URL}/client/billing/pack/multi-checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur inconnue' }))
    throw new Error(error.message || `Erreur ${response.status}`)
  }

  return response.json()
}

// ============================================================
// Component
// ============================================================

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [packCheckoutLoading, setPackCheckoutLoading] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartCheckoutLoading, setCartCheckoutLoading] = useState(false)
  const [invoices, setInvoices] = useState<StripeInvoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)

  // Load billing status
  const loadBilling = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchBillingStatus()
      setBilling(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load invoices
  const loadInvoices = useCallback(async () => {
    try {
      setInvoicesLoading(true)
      setInvoicesError(null)
      const data = await fetchInvoices()
      setInvoices(data)
    } catch (err) {
      setInvoicesError(err instanceof Error ? err.message : 'Erreur de chargement des factures')
    } finally {
      setInvoicesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBilling()
    loadInvoices()
  }, [loadBilling, loadInvoices])

  // Handle checkout
  const handleCheckout = async (planId: string) => {
    try {
      setCheckoutLoading(true)
      const { url } = await createCheckoutSession(planId)
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du paiement')
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Handle portal
  const handlePortal = async () => {
    try {
      setPortalLoading(true)
      const { url } = await createPortalSession()
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'accès au portail')
    } finally {
      setPortalLoading(false)
    }
  }

  // Handle pack checkout
  const handlePackCheckout = async (packId: string) => {
    try {
      setPackCheckoutLoading(packId)
      const { url } = await createPackCheckoutSession(packId)
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'achat du pack')
    } finally {
      setPackCheckoutLoading(null)
    }
  }

  // Cart functions
  const updateCartQuantity = (packId: string, delta: number) => {
    setCart(prev => {
      const current = prev[packId] || 0
      const newQty = Math.max(0, current + delta)
      if (newQty === 0) {
        const { [packId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [packId]: newQty }
    })
  }

  const getCartTotal = () => {
    return Object.entries(cart).reduce((total, [packId, qty]) => {
      const pack = PACKS.find(p => p.id === packId)
      return total + (pack ? pack.price * qty : 0)
    }, 0)
  }

  const getCartItemCount = () => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  }

  const handleCartCheckout = async () => {
    const items = Object.entries(cart)
      .filter(([_, qty]) => qty > 0)
      .map(([packId, quantity]) => ({ packId, quantity }))
    
    if (items.length === 0) {
      setError('Votre panier est vide')
      return
    }

    try {
      setCartCheckoutLoading(true)
      const { url } = await createMultiPackCheckoutSession(items)
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du paiement')
    } finally {
      setCartCheckoutLoading(false)
    }
  }

  // Quota percentage
  const quotaPercent = (used: number, limit: number) => {
    if (limit <= 0) return 0
    return Math.min(100, Math.round((used / limit) * 100))
  }

  // Get status badge variant
  const getStatusVariant = (state: string) => {
    switch (state) {
      case 'active':
      case 'trial':
        return 'success'
      case 'past_due':
        return 'warning'
      case 'read_only':
      case 'suspended':
      case 'cancelled':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !billing) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturation</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Erreur de chargement</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={loadBilling}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Réessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!billing) return null

  // Normalize plan code to match PLANS keys
  const normalizePlanCode = (code: string): 'bronze' | 'argent' | 'platinum' => {
    if (code.includes('platinum') || code.includes('or') || code.includes('gold')) return 'platinum'
    if (code.includes('argent') || code.includes('silver')) return 'argent'
    return 'bronze'
  }
  
  const normalizedPlan = normalizePlanCode(billing.plan)
  const currentPlan = PLANS[normalizedPlan] || PLANS.bronze
  const isActive = billing.accessState === 'active' || billing.accessState === 'trial'
  const isPastDue = billing.accessState === 'past_due'
  const isReadOnly = billing.isRestricted

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Facturation</h1>
        <p className="text-muted-foreground mt-1">
          Gérez votre abonnement et vos crédits
        </p>
      </div>

      {/* Error toast */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setError(null)}>
            ×
          </Button>
        </div>
      )}

      {/* Warning/Block messages */}
      {billing.warningMessage && !isReadOnly && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Attention</p>
            <p className="text-sm text-yellow-700 mt-1">{billing.warningMessage}</p>
            {billing.daysPastDue !== null && (
              <p className="text-sm text-yellow-700 mt-1">
                Délai avant restriction : <strong>{7 - billing.daysPastDue} jour(s)</strong>
              </p>
            )}
            <Button size="sm" variant="default" className="mt-2 bg-yellow-600 hover:bg-yellow-700" onClick={handlePortal}>
              {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mettre à jour le paiement'}
            </Button>
          </div>
        </div>
      )}

      {isReadOnly && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Compte restreint</p>
            <p className="text-sm text-red-700 mt-1">
              {billing.blockMessage || 'Votre compte est en lecture seule. Régularisez votre situation pour retrouver l\'accès complet.'}
            </p>
            <Button size="sm" variant="destructive" className="mt-2" onClick={handlePortal}>
              {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Régulariser ma situation'}
            </Button>
          </div>
        </div>
      )}

      {/* Plan actuel + Quotas */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Plan actuel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Plan actuel
                </CardTitle>
                <CardDescription>
                  Votre abonnement Reputy
                </CardDescription>
              </div>
              <Badge variant={getStatusVariant(billing.accessState) as "success" | "destructive" | "secondary" | "default" | "outline"} className="gap-1">
                {isActive ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {billing.accessStateLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{billing.planLabel || billing.planName}</span>
                  {currentPlan?.popular && (
                    <Badge className="bg-primary">Populaire</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1">{currentPlan?.description || 'Votre abonnement Reputy'}</p>
                
                {/* Prix effectif (avec remise si applicable) */}
                <div className="mt-3">
                  {billing.hasDiscount && billing.priceCatalogCents && billing.priceEffectiveCents ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg text-muted-foreground line-through">
                        {formatPriceHT(billing.priceCatalogCents)}
                      </span>
                      <span className="text-2xl font-bold text-green-600">
                        {formatPriceHT(billing.priceEffectiveCents)}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">/mois</span>
                      {billing.discount?.label && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          {billing.discount.label}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-2xl font-bold">
                      {billing.priceEffectiveCents !== undefined 
                        ? formatPriceHT(billing.priceEffectiveCents)
                        : formatPriceHT(currentPlan?.priceMonthly || 0)}
                      {(billing.priceEffectiveCents || currentPlan?.priceMonthly || 0) > 0 && (
                        <span className="text-sm font-normal text-muted-foreground">/mois</span>
                      )}
                    </p>
                  )}
                </div>
                
                {/* Info coupon */}
                {billing.couponInfo && (
                  <p className="text-sm text-green-600 mt-1">
                    ✨ {billing.couponInfo.description}
                  </p>
                )}
              </div>
              <div className="text-right">
                {billing.periodEnd && (
                  <>
                    <p className="text-sm text-muted-foreground">Prochain renouvellement</p>
                    <p className="font-medium">
                      {billing.periodEndFormatted || new Date(billing.periodEnd).toLocaleDateString('fr-FR')}
                    </p>
                  </>
                )}
                {billing.trialEnd && billing.accessState === 'trial' && (
                  <>
                    <p className="text-sm text-muted-foreground">Fin de l&apos;essai</p>
                    <p className="font-medium">
                      {new Date(billing.trialEnd).toLocaleDateString('fr-FR')}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button onClick={() => setChangePlanOpen(true)}>
                Changer de plan
              </Button>
              {billing.hasPaymentMethod && (
                <Button variant="outline" onClick={handlePortal} disabled={portalLoading}>
                  {portalLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Portail Stripe
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Résumé quotas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quotas du mois
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* SMS */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                  SMS
                </span>
                <span className="font-medium">
                  {billing.quotas.sms.used} / {billing.quotas.sms.included}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${quotaPercent(billing.quotas.sms.used, billing.quotas.sms.included)}%` }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4 text-orange-600" />
                  Emails
                </span>
                <span className="font-medium">
                  {billing.quotas.email.used} / {billing.quotas.email.included}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all"
                  style={{ width: `${quotaPercent(billing.quotas.email.used, billing.quotas.email.included)}%` }}
                />
              </div>
            </div>

            {/* IA */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  Crédits IA
                </span>
                <span className="font-medium">
                  {billing.quotas.ai.used} / {billing.quotas.ai.included}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${quotaPercent(billing.quotas.ai.used, billing.quotas.ai.included)}%` }}
                />
              </div>
            </div>

            {/* QR */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <QrCode className="h-4 w-4 text-blue-600" />
                  QR Codes
                </span>
                <span className="font-medium">
                  {billing.quotas.qr.used} / {billing.quotas.qr.included}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${quotaPercent(billing.quotas.qr.used, billing.quotas.qr.included)}%` }}
                />
              </div>
            </div>

            {/* NFC */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <Wifi className="h-4 w-4 text-cyan-600" />
                  Tags NFC
                </span>
                <span className="font-medium">
                  {billing.quotas.nfc.used} / {billing.quotas.nfc.included}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all"
                  style={{ width: `${quotaPercent(billing.quotas.nfc.used, billing.quotas.nfc.included)}%` }}
                />
              </div>
            </div>

            {billing.periodEnd && (
              <p className="text-xs text-muted-foreground pt-2">
                Réinitialisation le {new Date(billing.periodEnd).toLocaleDateString('fr-FR')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section Acheter des packs avec Panier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Acheter des crédits supplémentaires
          </CardTitle>
          <CardDescription>
            Sélectionnez les packs dont vous avez besoin et réglez en une seule fois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Grille de tous les packs avec sélecteur de quantité */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PACKS.map((pack) => {
              const qty = cart[pack.id] || 0
              const Icon = pack.icon
              return (
                <div
                  key={pack.id}
                  className={cn(
                    'relative p-4 rounded-xl border-2 transition-all',
                    qty > 0 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn('p-1.5 rounded-lg bg-muted', pack.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h4 className="font-semibold text-sm">{pack.name}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{pack.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{formatPriceHT(pack.price)}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateCartQuantity(pack.id, -1)}
                        disabled={qty === 0}
                      >
                        <span className="text-lg">−</span>
                      </Button>
                      <span className="w-8 text-center font-semibold">{qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateCartQuantity(pack.id, 1)}
                      >
                        <span className="text-lg">+</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Résumé du panier */}
          {getCartItemCount() > 0 && (
            <div className="mt-6 p-4 bg-muted/50 rounded-xl border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold">Votre panier</h4>
                  <p className="text-sm text-muted-foreground">
                    {getCartItemCount()} article{getCartItemCount() > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{formatPriceHT(getCartTotal())}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="flex-1"
                  onClick={handleCartCheckout}
                  disabled={cartCheckoutLoading}
                >
                  {cartCheckoutLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Payer {formatPriceHT(getCartTotal())}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCart({})}
                  disabled={cartCheckoutLoading}
                >
                  Vider le panier
                </Button>
              </div>
            </div>
          )}

          {(normalizedPlan === 'argent' || normalizedPlan === 'platinum') && (
            <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Votre plan {normalizedPlan === 'argent' ? 'Argent' : 'Platinum'} inclut déjà {normalizedPlan === 'argent' ? '100' : '200'} réponses IA/mois.
              Les packs IA s'ajoutent à ce quota.
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
            💡 Les crédits des packs n'expirent jamais et sont consommés après votre quota mensuel.
          </p>
        </CardContent>
      </Card>

      {/* Historique des factures */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Historique des factures
              </CardTitle>
              <CardDescription>
                Retrouvez et téléchargez toutes vos factures
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={loadInvoices}
              disabled={invoicesLoading}
            >
              <RefreshCw className={cn("h-4 w-4", invoicesLoading && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesLoading && invoices.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : invoicesError ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground mb-3">{invoicesError}</p>
              <Button size="sm" variant="outline" onClick={loadInvoices}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Réessayer
              </Button>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune facture pour le moment
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vos factures apparaîtront ici après votre premier paiement
              </p>
            </div>
          ) : (
            <div className="space-y-0 divide-y">
              {invoices.map((invoice) => {
                const date = new Date(invoice.date).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })
                const amount = invoice.total >= 0
                  ? `${(invoice.total / 100).toFixed(2)} €`
                  : `-${(Math.abs(invoice.total) / 100).toFixed(2)} €`

                return (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-muted flex-shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {invoice.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{date}</span>
                          {invoice.number && (
                            <>
                              <span>•</span>
                              <span>{invoice.number}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <div className="text-right">
                        <p className="font-semibold text-sm">{amount}</p>
                        <Badge
                          variant={invoice.status === 'paid' ? 'success' : 'secondary'}
                          className="text-[10px] px-1.5"
                        >
                          {invoice.status === 'paid' ? 'Payée' : invoice.status === 'open' ? 'En attente' : invoice.status}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {invoice.pdfUrl && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            asChild
                          >
                            <a
                              href={invoice.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Télécharger le PDF"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {invoice.hostedUrl && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            asChild
                          >
                            <a
                              href={invoice.hostedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Voir la facture en ligne"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {invoices.length > 0 && billing?.hasPaymentMethod && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                💡 Vous pouvez aussi accéder à toutes vos factures depuis le{' '}
                <button
                  className="text-primary underline hover:no-underline"
                  onClick={handlePortal}
                  disabled={portalLoading}
                >
                  portail Stripe
                </button>
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Changer de plan */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Changer de plan</DialogTitle>
            <DialogDescription>
              Choisissez le plan adapté à vos besoins. Le changement prendra effet au prochain cycle de facturation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4">
            {Object.values(PLANS).map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'relative p-4 rounded-xl border-2 transition-all',
                  plan.id === normalizedPlan
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                  plan.popular && 'ring-2 ring-primary ring-offset-2'
                )}
              >
                {plan.popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                    Populaire
                  </Badge>
                )}
                <h3 className="font-semibold text-lg">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                <p className="text-2xl font-bold mt-3">
                  {formatPriceHT(plan.priceMonthly)}
                  {plan.priceMonthly > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">/mois</span>
                  )}
                </p>
                <ul className="mt-4 space-y-2">
                  {plan.features.slice(0, 6).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full mt-4"
                  variant={plan.id === normalizedPlan ? 'outline' : 'default'}
                  disabled={plan.id === normalizedPlan || checkoutLoading || plan.id === 'bronze'}
                  onClick={() => handleCheckout(plan.id)}
                >
                  {checkoutLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : plan.id === normalizedPlan ? (
                    'Plan actuel'
                  ) : plan.id === 'bronze' ? (
                    'Plan gratuit'
                  ) : (
                    'Sélectionner'
                  )}
                </Button>
              </div>
            ))}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>
              Paiement sécurisé par <CreditCard className="h-4 w-4 inline mx-1" /> Stripe
            </p>
            <p className="mt-1">
              Prélèvement SEPA disponible prochainement
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
