'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Org, UsageEntry, TelemetryEntry } from '@/lib/internal/fetch-internal'
import { updateOrg, addCredits, changeStatus, refreshClient, resetPublicKey, getApiToken, rotateApiToken, assignPlan, applyCoupon, removeCoupon, getEffectiveBilling, EffectiveBilling } from '@/lib/internal/actions'
import { toBillingUI, displayPrice } from '@/lib/internal/billing-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Edit2,
  Key,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Stethoscope,
  Store,
  Utensils,
  Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientDetailProps {
  org: Org
  usage: {
    days7: { sms: number; email: number; total: number }
    days30: { sms: number; email: number; total: number }
  }
  recentUsage: UsageEntry[]
  recentTelemetry: TelemetryEntry[]
}

const verticalIcons = {
  health: Stethoscope,
  food: Utensils,
  business: Store,
}

const verticalLabels = {
  health: 'Santé',
  food: 'Restauration',
  business: 'Commerce',
}

const statusColors = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const statusLabels = {
  active: 'Actif',
  suspended: 'Suspendu',
  cancelled: 'Annulé',
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  // Use fixed format to avoid hydration mismatch between server and client
  const day = date.getDate()
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day} ${month} ${year} à ${hours}:${minutes}`
}

function formatPeriod(startStr: string, endStr: string): string {
  const start = new Date(startStr)
  const end = new Date(endStr)
  const startDay = start.getDate()
  const endDay = end.getDate()
  const month = start.toLocaleDateString('fr-FR', { month: 'long' })
  const year = start.getFullYear()
  
  // Same month
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startDay}–${endDay} ${month} ${year}`
  }
  
  // Different months
  const endMonth = end.toLocaleDateString('fr-FR', { month: 'long' })
  return `${startDay} ${month} – ${endDay} ${endMonth} ${year}`
}

export function ClientDetail({ org, usage, recentUsage, recentTelemetry }: ClientDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const VerticalIcon = verticalIcons[org.vertical]
  
  // Edit mode states
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState(org.name)
  const [editBasePriceCents, setEditBasePriceCents] = useState(org.plan.basePriceCents)
  const [editBillingCycle, setEditBillingCycle] = useState(org.plan.billingCycle)
  const [editNegotiatedEnabled, setEditNegotiatedEnabled] = useState(org.negotiated.enabled)
  const [editCustomPriceCents, setEditCustomPriceCents] = useState(org.negotiated.customPriceCents || 0)
  const [editDiscountPercent, setEditDiscountPercent] = useState(org.negotiated.discountPercent || 0)
  const [editNotes, setEditNotes] = useState(org.negotiated.notes || '')
  const [editContractRef, setEditContractRef] = useState(org.negotiated.contractRef || '')
  
  // Options
  const [editOptions, setEditOptions] = useState({
    reviewRouting: org.options.reviewRouting,
    widgetsSeo: org.options.widgetsSeo,
    multiLocations: org.options.multiLocations,
    prioritySupport: org.options.prioritySupport,
  })
  
  // Quotas
  const [editSmsIncluded, setEditSmsIncluded] = useState(org.quotas.smsIncluded)
  const [editEmailIncluded, setEditEmailIncluded] = useState(org.quotas.emailIncluded)
  const [editAiIncluded, setEditAiIncluded] = useState(org.quotas.aiIncluded || 0)
  
  // Credits modal
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [creditsSms, setCreditsSms] = useState(0)
  const [creditsEmail, setCreditsEmail] = useState(0)
  const [creditsAi, setCreditsAi] = useState(0)
  const [creditsSource, setCreditsSource] = useState<'gift' | 'pack'>('gift')
  const [creditsReason, setCreditsReason] = useState('')
  const [creditsLoading, setCreditsLoading] = useState(false)
  
  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<'active' | 'suspended' | 'cancelled'>(org.status)
  const [statusLoading, setStatusLoading] = useState(false)
  
  // PublicKey modal
  const [resetKeyOpen, setResetKeyOpen] = useState(false)
  const [resetKeyLoading, setResetKeyLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  
  // P1.3: API Token states
  const [apiTokenInfo, setApiTokenInfo] = useState<{
    apiTokenMasked: string
    apiTokenCreatedAt: string | null
    apiTokenLastRotatedAt: string | null
    previousTokenActive: boolean
    previousTokenMasked: string | null
    previousTokenExpiresAt: string | null
  } | null>(null)
  const [rotateTokenOpen, setRotateTokenOpen] = useState(false)
  const [rotateTokenLoading, setRotateTokenLoading] = useState(false)
  const [newApiToken, setNewApiToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  
  // Feedback states
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Plan & Coupon states
  const [assignPlanOpen, setAssignPlanOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'health_bronze' | 'health_argent' | 'health_platinum'>('health_argent')
  const [assignPlanLoading, setAssignPlanLoading] = useState(false)
  const [applyCouponOpen, setApplyCouponOpen] = useState(false)
  const [selectedCoupon, setSelectedCoupon] = useState<'FIXED_5' | 'FIXED_10' | 'FIXED_20' | 'PCT_10' | 'PCT_20'>('FIXED_10')
  const [applyCouponLoading, setApplyCouponLoading] = useState(false)
  const [removeCouponLoading, setRemoveCouponLoading] = useState(false)
  const [effectiveBillingData, setEffectiveBillingData] = useState<EffectiveBilling | null>(null)

  // P1.3: Load API Token info on mount
  useEffect(() => {
    loadApiTokenInfo()
  }, [org.id])

  // Load effective billing data on mount
  useEffect(() => {
    async function loadEffectiveBilling() {
      const result = await getEffectiveBilling(org.id)
      if (result.ok && result.effectiveBilling) {
        setEffectiveBillingData(result.effectiveBilling)
      }
    }
    loadEffectiveBilling()
  }, [org.id])

  function handleRefresh() {
    startTransition(() => {
      refreshClient(org.id)
      router.refresh()
    })
  }

  async function handleSave() {
    setError('')
    setSuccess('')
    
    const result = await updateOrg({
      orgId: org.id,
      name: editName,
      plan: {
        basePriceCents: editBasePriceCents,
        billingCycle: editBillingCycle,
      },
      negotiated: {
        enabled: editNegotiatedEnabled,
        customPriceCents: editNegotiatedEnabled ? editCustomPriceCents : null,
        discountPercent: editNegotiatedEnabled ? editDiscountPercent : null,
        notes: editNotes,
        contractRef: editContractRef || null,
      },
      options: editOptions,
      quotas: {
        smsIncluded: editSmsIncluded,
        emailIncluded: editEmailIncluded,
        aiIncluded: editAiIncluded,
      },
    })

    if (result.ok) {
      setSuccess('Modifications enregistrées')
      setEditMode(false)
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors de la sauvegarde')
    }
  }

  async function handleAddCredits(e: React.FormEvent) {
    e.preventDefault()
    setCreditsLoading(true)
    setError('')

    const result = await addCredits({
      orgId: org.id,
      sms: creditsSms,
      email: creditsEmail,
      ai: creditsAi,
      source: creditsSource,
      label: creditsReason || undefined,
    })

    if (result.ok) {
      setCreditsOpen(false)
      setCreditsSms(0)
      setCreditsEmail(0)
      setCreditsAi(0)
      setCreditsSource('gift')
      setCreditsReason('')
      const sourceLabel = creditsSource === 'gift' ? 'offerts' : 'vendus'
      const parts = []
      if (creditsSms > 0) parts.push(`${creditsSms} SMS`)
      if (creditsEmail > 0) parts.push(`${creditsEmail} emails`)
      if (creditsAi > 0) parts.push(`${creditsAi} IA`)
      setSuccess(`Crédits ${sourceLabel} ajoutés: ${parts.join(', ')} (expire fin de période)`)
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors de l\'ajout des crédits')
    }

    setCreditsLoading(false)
  }

  async function handleChangeStatus() {
    setStatusLoading(true)
    setError('')

    const result = await changeStatus({
      orgId: org.id,
      status: newStatus,
    })

    if (result.ok) {
      setStatusModalOpen(false)
      setSuccess(`Statut changé: ${statusLabels[result.previousStatus as keyof typeof statusLabels]} → ${statusLabels[newStatus]}`)
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors du changement de statut')
    }

    setStatusLoading(false)
  }

  async function handleCopyPublicKey() {
    try {
      await navigator.clipboard.writeText(org.publicKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError('Impossible de copier la clé')
    }
  }

  async function handleResetPublicKey() {
    setResetKeyLoading(true)
    setError('')

    const result = await resetPublicKey({ orgId: org.id })

    if (result.ok) {
      setResetKeyOpen(false)
      setSuccess(`Clé régénérée: ${result.newPublicKey}`)
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors de la régénération')
    }

    setResetKeyLoading(false)
  }

  // P1.3: Load API Token info
  async function loadApiTokenInfo() {
    const result = await getApiToken(org.id)
    if (result.ok && result.tokenInfo) {
      setApiTokenInfo(result.tokenInfo)
    }
  }

  // P1.3: Rotate API Token
  async function handleRotateApiToken() {
    setRotateTokenLoading(true)
    setError('')
    setNewApiToken(null)

    const result = await rotateApiToken(org.id)

    if (result.ok && result.newApiToken) {
      setNewApiToken(result.newApiToken)
      setSuccess(result.message || 'Token régénéré avec succès')
      loadApiTokenInfo() // Refresh token info
    } else {
      setError(result.error || 'Erreur lors de la rotation du token')
      setRotateTokenOpen(false)
    }

    setRotateTokenLoading(false)
  }

  // P1.3: Copy new token
  async function handleCopyNewToken() {
    if (!newApiToken) return
    try {
      await navigator.clipboard.writeText(newApiToken)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch (err) {
      setError('Impossible de copier le token')
    }
  }

  // P1.3: Close rotate dialog and clear new token
  function closeRotateDialog() {
    setRotateTokenOpen(false)
    setNewApiToken(null)
  }

  // Plan assignment
  async function handleAssignPlan() {
    setAssignPlanLoading(true)
    setError('')

    const result = await assignPlan({
      orgId: org.id,
      planCode: selectedPlan,
    })

    if (result.ok) {
      setAssignPlanOpen(false)
      setSuccess(result.message || `Plan ${selectedPlan} assigné`)
      if (result.effectiveBilling) {
        setEffectiveBillingData(result.effectiveBilling)
      }
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors de l\'assignation du plan')
    }

    setAssignPlanLoading(false)
  }

  // Apply coupon
  async function handleApplyCoupon() {
    setApplyCouponLoading(true)
    setError('')

    const result = await applyCoupon({
      orgId: org.id,
      couponKey: selectedCoupon,
    })

    if (result.ok) {
      setApplyCouponOpen(false)
      setSuccess(result.message || `Coupon ${selectedCoupon} appliqué`)
      if (result.effectiveBilling) {
        setEffectiveBillingData(result.effectiveBilling)
      }
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors de l\'application du coupon')
    }

    setApplyCouponLoading(false)
  }

  // Remove coupon
  async function handleRemoveCoupon() {
    setRemoveCouponLoading(true)
    setError('')

    const result = await removeCoupon({
      orgId: org.id,
    })

    if (result.ok) {
      setSuccess(result.message || 'Coupon retiré')
      if (result.effectiveBilling) {
        setEffectiveBillingData(result.effectiveBilling)
      }
      router.refresh()
    } else {
      setError(result.error || 'Erreur lors du retrait du coupon')
    }

    setRemoveCouponLoading(false)
  }

  const effectivePrice = org.negotiated?.enabled 
    ? (org.negotiated.customPriceCents || org.plan.basePriceCents)
    : org.plan.basePriceCents

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/internal/clients">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <VerticalIcon className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{org.name}</h1>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>{verticalLabels[org.vertical]}</span>
                <span>•</span>
                <span>{org.plan.code}</span>
              </div>
            </div>
            <Badge variant="outline" className={statusColors[org.status]}>
              {statusLabels[org.status]}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isPending}
          className="border-slate-700"
        >
          <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
        </Button>
        <Button
          variant={editMode ? 'default' : 'outline'}
          onClick={() => editMode ? handleSave() : setEditMode(true)}
          className={editMode ? 'bg-amber-500 hover:bg-amber-600' : 'border-slate-700'}
        >
          {editMode ? <><Save className="h-4 w-4 mr-2" /> Sauvegarder</> : <><Edit2 className="h-4 w-4 mr-2" /> Modifier</>}
        </Button>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="integration">Intégration</TabsTrigger>
          <TabsTrigger value="commercial">Commercial</TabsTrigger>
          <TabsTrigger value="quotas">Quotas & Crédits</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Billing Period Header */}
          {org.billingComputed && (
            <Card className="bg-gradient-to-r from-slate-800/80 to-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Période de facturation</p>
                    <p className="text-lg font-semibold text-white">
                      {formatPeriod(org.billingComputed.periodStart, org.billingComputed.periodEnd)}
                    </p>
                  </div>
                  {org.billingComputed.isProrata && (
                    <Badge className="bg-purple-500/20 text-purple-400">
                      Prorata {Math.round(org.billingComputed.ratio * 100)}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* NEW: Subscription vs Pack Credits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Subscription Credits (monthly, expiring) */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-400" />
                  Abonnement (mensuel)
                  <Badge className="bg-blue-500/20 text-blue-400 text-xs">Expire fin de mois</Badge>
                  {org.creditsComputed?.isProrata && (
                    <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                      Prorata {org.creditsComputed.ratioPercent}%
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-blue-400" />
                      <span className="text-xs text-slate-500">SMS</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                      {org.creditsComputed?.subscription.smsUsed || 0} <span className="text-slate-500 text-sm">/ {org.creditsComputed?.subscription.smsTotal || 0}</span>
                    </p>
                    <p className="text-xs text-green-400">
                      {org.creditsComputed?.subscription.smsRemaining || 0} restants
                    </p>
                    {org.creditsComputed?.isProrata && org.creditsComputed?.subscription.smsMonthlyBase !== org.creditsComputed?.subscription.smsIncludedMonthly && (
                      <p className="text-xs text-purple-400">
                        {org.creditsComputed.subscription.smsIncludedMonthly} inclus (base: {org.creditsComputed.subscription.smsMonthlyBase})
                      </p>
                    )}
                    {(org.creditsComputed?.subscription.smsGiftMonthly || 0) > 0 && (
                      <p className="text-xs text-amber-400">
                        + {org.creditsComputed?.subscription.smsGiftMonthly} offerts
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-orange-400" />
                      <span className="text-xs text-slate-500">Email</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                      {org.creditsComputed?.subscription.emailUsed || 0} <span className="text-slate-500 text-sm">/ {org.creditsComputed?.subscription.emailTotal || 0}</span>
                    </p>
                    <p className="text-xs text-green-400">
                      {org.creditsComputed?.subscription.emailRemaining || 0} restants
                    </p>
                    {org.creditsComputed?.isProrata && org.creditsComputed?.subscription.emailMonthlyBase !== org.creditsComputed?.subscription.emailIncludedMonthly && (
                      <p className="text-xs text-purple-400">
                        {org.creditsComputed.subscription.emailIncludedMonthly} inclus (base: {org.creditsComputed.subscription.emailMonthlyBase})
                      </p>
                    )}
                    {(org.creditsComputed?.subscription.emailGiftMonthly || 0) > 0 && (
                      <p className="text-xs text-amber-400">
                        + {org.creditsComputed?.subscription.emailGiftMonthly} offerts
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-xs text-slate-500">IA</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                      {org.creditsComputed?.subscription.aiUsed || 0} <span className="text-slate-500 text-sm">/ {org.creditsComputed?.subscription.aiTotal || 0}</span>
                    </p>
                    <p className="text-xs text-green-400">
                      {org.creditsComputed?.subscription.aiRemaining || 0} restants
                    </p>
                    {org.creditsComputed?.isProrata && org.creditsComputed?.subscription.aiMonthlyBase !== org.creditsComputed?.subscription.aiIncludedMonthly && (
                      <p className="text-xs text-purple-400">
                        {org.creditsComputed.subscription.aiIncludedMonthly} inclus (base: {org.creditsComputed.subscription.aiMonthlyBase})
                      </p>
                    )}
                    {(org.creditsComputed?.subscription.aiGiftMonthly || 0) > 0 && (
                      <p className="text-xs text-amber-400">
                        + {org.creditsComputed?.subscription.aiGiftMonthly} offerts
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs text-slate-500">QR</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                      {org.quotas?.qrIncluded || 0}
                    </p>
                    <p className="text-xs text-slate-400">inclus</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-teal-400" />
                      <span className="text-xs text-slate-500">NFC</span>
                    </div>
                    <p className="text-xl font-bold text-white">
                      {org.quotas?.nfcIncluded || 0}
                    </p>
                    <p className="text-xs text-slate-400">inclus</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pack Credits (persistent) */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium flex items-center gap-2">
                  <Plus className="h-4 w-4 text-emerald-400" />
                  Packs achetés
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Persistants</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-blue-400" />
                      <span className="text-xs text-slate-500">SMS</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-400">
                      {org.creditsComputed?.pack.smsRemaining || 0}
                    </p>
                    <p className="text-xs text-slate-500">restants</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-orange-400" />
                      <span className="text-xs text-slate-500">Email</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-400">
                      {org.creditsComputed?.pack.emailRemaining || 0}
                    </p>
                    <p className="text-xs text-slate-500">restants</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-xs text-slate-500">IA</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-400">
                      {org.creditsComputed?.pack.aiRemaining || 0}
                    </p>
                    <p className="text-xs text-slate-500">restants</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2 border-t border-slate-700 pt-2">
                  ℹ️ Les packs restent jusqu&apos;à consommation mais nécessitent un abonnement actif.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Total & Usage Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Remaining */}
            <Card className="bg-gradient-to-br from-slate-800/80 to-slate-700/50 border-slate-600">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">Total disponible</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-white">{org.creditsComputed?.total.smsRemaining || 0}</p>
                    <p className="text-xs text-slate-400">SMS</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{org.creditsComputed?.total.emailRemaining || 0}</p>
                    <p className="text-xs text-slate-400">Emails</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{org.creditsComputed?.total.aiRemaining || 0}</p>
                    <p className="text-xs text-slate-400">IA</p>
                  </div>
                </div>
                {!org.creditsComputed?.canSend && (
                  <div className="mt-2 flex items-center gap-2 text-amber-400 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    {org.creditsComputed?.subscriptionActive === false ? 'Abonnement inactif' : 'Crédits épuisés'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 7 days usage */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">Usage 7 jours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-white">{usage.days7.sms}</p>
                    <p className="text-xs text-slate-500">SMS</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{usage.days7.email}</p>
                    <p className="text-xs text-slate-500">Emails</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Card - Period based */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">Facturation période</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Pricing — source unique BillingUI */}
                {(() => {
                  const raw = effectiveBillingData || org.billingComputed
                  if (!raw) {
                    return (
                      <p className="text-2xl font-bold text-white">
                        {formatPrice(org.plan.basePriceCents)}
                      </p>
                    )
                  }

                  const b = toBillingUI(raw)
                  const catalog = displayPrice(b, b.priceCatalogCents)
                  const effective = displayPrice(b, b.priceEffectiveCents)

                  return (
                    <>
                      {b.hasDiscount ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 line-through text-sm">
                            {formatPrice(catalog)}
                          </span>
                          <span className="text-2xl font-bold text-emerald-400">
                            {formatPrice(effective)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-2xl font-bold text-white">
                          {formatPrice(effective)}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {b.hasDiscount && b.discountLabel && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                            {b.discountLabel}
                          </Badge>
                        )}
                        {b.hasDiscount && !b.discountLabel && b.discountPercent != null && (
                          <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
                            -{b.discountPercent}%
                          </Badge>
                        )}
                        {b.isProrata && (
                          <Badge className="bg-purple-500/20 text-purple-400 text-[10px]">
                            prorata
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">
                          {!b.isProrata && '/mois'}
                          {b.isNegotiated && !b.isProrata && !b.hasDiscount && ' (négocié)'}
                        </span>
                      </div>
                      {b.isProrata && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          Base mensuelle: {formatPrice(b.priceEffectiveCents)}/mois
                        </p>
                      )}
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-sm text-slate-300 font-medium">Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">ID</p>
                <p className="text-white font-mono">{org.id}</p>
              </div>
              <div>
                <p className="text-slate-500">Nom</p>
                {editMode ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-slate-700 border-slate-600 mt-1"
                  />
                ) : (
                  <p className="text-white">{org.name}</p>
                )}
              </div>
              <div>
                <p className="text-slate-500">Créé le</p>
                <p className="text-white">{formatDate(org.createdAt)}</p>
              </div>
              <div>
                <p className="text-slate-500">Modifié le</p>
                <p className="text-white">{formatDate(org.updatedAt)}</p>
              </div>
              <div>
                <p className="text-slate-500">Billing provider</p>
                <p className="text-white capitalize">{org.billing.provider}</p>
              </div>
              <div>
                <p className="text-slate-500">Stripe Customer ID</p>
                <p className="text-white font-mono text-xs">{org.billing.stripeCustomerId || '—'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integration Tab */}
        <TabsContent value="integration" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-400" />
                Clé publique (Public Key)
              </CardTitle>
              <CardDescription className="text-slate-400">
                Cette clé permet de relier l&apos;extension Reputy à ce client.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <code className="flex-1 px-4 py-3 bg-slate-900 rounded-lg font-mono text-amber-400 text-lg">
                  {org.publicKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPublicKey}
                  className="border-slate-600 hover:bg-slate-700"
                >
                  {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <div>
                  <p className="text-sm text-slate-300">Régénérer la clé</p>
                  <p className="text-xs text-slate-500">
                    L&apos;extension Chrome devra être mise à jour avec la nouvelle clé.
                  </p>
                </div>
                <Dialog open={resetKeyOpen} onOpenChange={setResetKeyOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Régénérer
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-400" />
                        Régénérer la clé publique ?
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Cette action est irréversible. La clé actuelle sera invalidée et l&apos;extension Chrome devra être reconfigurée.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-sm text-amber-300">
                        <strong>Important :</strong> Après la régénération, le client devra :
                      </p>
                      <ol className="mt-2 text-sm text-slate-300 list-decimal list-inside space-y-1">
                        <li>Ouvrir les options de l&apos;extension Chrome</li>
                        <li>Coller la nouvelle Public Key</li>
                        <li>Sauvegarder les paramètres</li>
                      </ol>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setResetKeyOpen(false)} className="border-slate-600">
                        Annuler
                      </Button>
                      <Button
                        onClick={handleResetPublicKey}
                        disabled={resetKeyLoading}
                        className="bg-amber-500 hover:bg-amber-600"
                      >
                        {resetKeyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmer'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* P1.3: API Token Card */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-emerald-400" />
                Token API (Extension)
              </CardTitle>
              <CardDescription className="text-slate-400">
                Ce token secret permet à l&apos;extension d&apos;authentifier les requêtes pour ce client.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {apiTokenInfo ? (
                <>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 px-4 py-3 bg-slate-900 rounded-lg font-mono text-emerald-400 text-lg">
                      {apiTokenInfo.apiTokenMasked}
                    </code>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                      Actif
                    </Badge>
                  </div>
                  
                  {apiTokenInfo.previousTokenActive && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-sm text-amber-300 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Ancien token encore valide jusqu&apos;au{' '}
                        {apiTokenInfo.previousTokenExpiresAt && formatDate(apiTokenInfo.previousTokenExpiresAt)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Token: {apiTokenInfo.previousTokenMasked}
                      </p>
                    </div>
                  )}
                  
                  <div className="text-xs text-slate-500 space-y-1">
                    {apiTokenInfo.apiTokenCreatedAt && (
                      <p>Créé le: {formatDate(apiTokenInfo.apiTokenCreatedAt)}</p>
                    )}
                    {apiTokenInfo.apiTokenLastRotatedAt && (
                      <p>Dernière rotation: {formatDate(apiTokenInfo.apiTokenLastRotatedAt)}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              )}
              
              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <div>
                  <p className="text-sm text-slate-300">Rotation du token</p>
                  <p className="text-xs text-slate-500">
                    L&apos;ancien token reste valide 24h après rotation.
                  </p>
                </div>
                <Dialog open={rotateTokenOpen} onOpenChange={(open) => open ? setRotateTokenOpen(true) : closeRotateDialog()}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Rotation
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        {newApiToken ? (
                          <><CheckCircle className="h-5 w-5 text-emerald-400" /> Nouveau token généré</>
                        ) : (
                          <><Key className="h-5 w-5 text-emerald-400" /> Rotation du token API</>
                        )}
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        {newApiToken 
                          ? "Copiez ce token maintenant, il ne sera plus affiché en clair."
                          : "Un nouveau token sera généré. L'ancien reste valide 24h."
                        }
                      </DialogDescription>
                    </DialogHeader>
                    
                    {newApiToken ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                          <p className="text-xs text-emerald-300 mb-2 font-medium">Nouveau token (à copier maintenant) :</p>
                          <code className="block px-3 py-2 bg-slate-900 rounded font-mono text-emerald-400 text-sm break-all">
                            {newApiToken}
                          </code>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleCopyNewToken} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
                            {tokenCopied ? (
                              <><CheckCircle className="h-4 w-4 mr-2" /> Copié !</>
                            ) : (
                              <><Copy className="h-4 w-4 mr-2" /> Copier le token</>
                            )}
                          </Button>
                          <Button variant="outline" onClick={closeRotateDialog} className="border-slate-600">
                            Fermer
                          </Button>
                        </div>
                        <p className="text-xs text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Ce token ne sera plus visible après fermeture de cette fenêtre.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg">
                          <p className="text-sm text-slate-300">
                            <strong>Important :</strong> Après la rotation, le client devra mettre à jour le token dans l&apos;extension Chrome.
                          </p>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={closeRotateDialog} className="border-slate-600">
                            Annuler
                          </Button>
                          <Button
                            onClick={handleRotateApiToken}
                            disabled={rotateTokenLoading}
                            className="bg-emerald-500 hover:bg-emerald-600"
                          >
                            {rotateTokenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Générer nouveau token'}
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Plug className="h-5 w-5 text-blue-400" />
                Instructions d&apos;intégration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">1</div>
                  <div>
                    <p className="text-white font-medium">Installer l&apos;extension Chrome</p>
                    <p className="text-sm text-slate-400">
                      Téléchargez et installez l&apos;extension Reputy depuis le Chrome Web Store.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">2</div>
                  <div>
                    <p className="text-white font-medium">Configurer la Public Key</p>
                    <p className="text-sm text-slate-400">
                      Ouvrez les options de l&apos;extension et collez la clé publique.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">3</div>
                  <div>
                    <p className="text-white font-medium">Configurer le Token API</p>
                    <p className="text-sm text-slate-400">
                      Générez un token API (section ci-dessus) et collez-le dans les options de l&apos;extension.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">4</div>
                  <div>
                    <p className="text-white font-medium">Commencer à collecter des avis</p>
                    <p className="text-sm text-slate-400">
                      L&apos;extension est prête ! Les demandes d&apos;avis seront automatiquement rattachées à ce compte.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commercial Tab */}
        <TabsContent value="commercial" className="space-y-4">
          {/* Plan Assignment Card */}
          <Card className="bg-slate-800/50 border-amber-500/30">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-400" />
                Assigner un Plan
              </CardTitle>
              <CardDescription className="text-slate-400">
                Mise à jour atomique : plan + prix + quotas + crédits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-500">Plan actuel</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={
                      org.plan.code.includes('platinum') || org.plan.code.includes('or') || org.plan.code.includes('gold') ? 'bg-purple-500/20 text-purple-400' :
                      org.plan.code.includes('argent') || org.plan.code.includes('silver') ? 'bg-slate-500/20 text-slate-300' :
                      'bg-orange-500/20 text-orange-400'
                    }>
                      {org.plan.code}
                    </Badge>
                    <span className="text-white">{formatPrice(org.plan.basePriceCents)}/mois</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Prix catalogue</label>
                  <p className="text-white mt-1">
                    {effectiveBillingData?.priceCatalogFormatted || formatPrice(org.plan.basePriceCents)}/mois
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <div>
                  <p className="text-sm text-slate-300">Changer de plan</p>
                  <p className="text-xs text-slate-500">Met à jour le prix et les quotas selon le catalogue</p>
                </div>
                <Dialog open={assignPlanOpen} onOpenChange={setAssignPlanOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-amber-500 hover:bg-amber-600">
                      <Edit2 className="h-4 w-4 mr-2" />
                      Assigner un plan
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-amber-400" />
                        Assigner un plan
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Cette action met à jour le plan, le prix, les quotas et reset les crédits mensuels.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-slate-400">Nouveau plan</label>
                        <Select value={selectedPlan} onValueChange={(v: typeof selectedPlan) => setSelectedPlan(v)}>
                          <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="health_bronze">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-orange-400"></span>
                                Bronze - Gratuit (0€)
                              </div>
                            </SelectItem>
                            <SelectItem value="health_argent">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-slate-400"></span>
                                Argent - 49€/mois
                              </div>
                            </SelectItem>
                            <SelectItem value="health_platinum">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-purple-400"></span>
                                Platinum - 99€/mois
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="p-3 bg-slate-700/50 rounded-lg text-sm">
                        <p className="text-slate-300 font-medium mb-2">Quotas du plan sélectionné :</p>
                        {selectedPlan === 'health_bronze' && (
                          <p className="text-slate-400">SMS: 0 | Email: 0 | IA: 0 | QR: 1 (200 scans)</p>
                        )}
                        {selectedPlan === 'health_argent' && (
                          <p className="text-slate-400">SMS: 200 | Email: 2000 | IA: 100 | QR: 3 | NFC: 1 (1000 scans)</p>
                        )}
                        {selectedPlan === 'health_platinum' && (
                          <p className="text-slate-400">SMS: 500 | Email: 4000 | IA: 200 | QR: 10 | NFC: 3 (1000 scans)</p>
                        )}
                      </div>

                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-sm text-amber-300">
                          ⚠️ Les crédits mensuels du nouveau plan s'appliqueront. Les usages déjà consommés ce mois sont conservés.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAssignPlanOpen(false)} className="border-slate-600">
                        Annuler
                      </Button>
                      <Button
                        onClick={handleAssignPlan}
                        disabled={assignPlanLoading}
                        className="bg-amber-500 hover:bg-amber-600"
                      >
                        {assignPlanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assigner ce plan'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* Coupon/Discount Card */}
          <Card className="bg-slate-800/50 border-emerald-500/30">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                Remise Stripe (Coupon)
              </CardTitle>
              <CardDescription className="text-slate-400">
                Appliquer ou retirer une remise sur l&apos;abonnement Stripe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current discount status */}
              <div className="p-4 rounded-lg border border-slate-700 bg-slate-700/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Remise actuelle</p>
                    {org.billing?.stripeCouponId ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          {org.billing.stripeCouponId}
                        </Badge>
                        <span className="text-emerald-400 font-medium">
                          {effectiveBillingData?.discount?.label || ''}
                        </span>
                      </div>
                    ) : (
                      <p className="text-slate-500 mt-1">Aucune remise appliquée</p>
                    )}
                  </div>
                  {org.billing?.stripeCouponId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveCoupon}
                      disabled={removeCouponLoading}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      {removeCouponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Retirer'}
                    </Button>
                  )}
                </div>

                {/* Price comparison */}
                {org.billing?.stripeCouponId && effectiveBillingData && (
                  <div className="mt-3 pt-3 border-t border-slate-600 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Prix catalogue:</span>
                      <span className="text-slate-300 line-through">{effectiveBillingData.priceCatalogFormatted}</span>
                      <span className="text-emerald-400">→</span>
                      <span className="text-emerald-400 font-bold">{effectiveBillingData.priceEffectiveFormatted}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Apply coupon button */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm text-slate-300">Appliquer une remise</p>
                  <p className="text-xs text-slate-500">Les coupons sont gérés via Stripe</p>
                </div>
                <Dialog open={applyCouponOpen} onOpenChange={setApplyCouponOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-500 hover:bg-emerald-600">
                      <Plus className="h-4 w-4 mr-2" />
                      Appliquer un coupon
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-emerald-400" />
                        Appliquer un coupon
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Sélectionnez un coupon de remise à appliquer sur l&apos;abonnement.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-slate-400">Coupon</label>
                        <Select value={selectedCoupon} onValueChange={(v: typeof selectedCoupon) => setSelectedCoupon(v)}>
                          <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="FIXED_5">-5€ (remise fixe)</SelectItem>
                            <SelectItem value="FIXED_10">-10€ (remise fixe)</SelectItem>
                            <SelectItem value="FIXED_20">-20€ (remise fixe)</SelectItem>
                            <SelectItem value="PCT_10">-10% (pourcentage)</SelectItem>
                            <SelectItem value="PCT_20">-20% (pourcentage)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm">
                        <p className="text-emerald-300">
                          💡 Le coupon sera appliqué sur la subscription Stripe du client.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setApplyCouponOpen(false)} className="border-slate-600">
                        Annuler
                      </Button>
                      <Button
                        onClick={handleApplyCoupon}
                        disabled={applyCouponLoading}
                        className="bg-emerald-500 hover:bg-emerald-600"
                      >
                        {applyCouponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Appliquer'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* Existing Plan & Tarification Card */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Détails du plan (legacy)</CardTitle>
              <CardDescription className="text-slate-400">
                Champs bruts stockés en base (utilisez &quot;Assigner un plan&quot; pour modifier)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-500">Code plan</label>
                  <p className="text-white">{org.plan.code}</p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Prix de base</label>
                  {editMode ? (
                    <Input
                      type="number"
                      value={editBasePriceCents / 100}
                      onChange={(e) => setEditBasePriceCents(Math.round(parseFloat(e.target.value) * 100))}
                      className="bg-slate-700 border-slate-600 mt-1"
                    />
                  ) : (
                    <p className="text-white">{formatPrice(org.plan.basePriceCents)}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-slate-500">Cycle</label>
                  {editMode ? (
                    <Select value={editBillingCycle} onValueChange={(v: 'monthly' | 'yearly') => setEditBillingCycle(v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="monthly">Mensuel</SelectItem>
                        <SelectItem value="yearly">Annuel</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-white capitalize">{org.plan.billingCycle === 'monthly' ? 'Mensuel' : 'Annuel'}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                Conditions négociées
                {org.negotiated.enabled && <Badge className="bg-amber-500/20 text-amber-400">Actif</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-400">Activer les conditions négociées</label>
                {editMode ? (
                  <Switch checked={editNegotiatedEnabled} onCheckedChange={setEditNegotiatedEnabled} />
                ) : (
                  <Badge variant="outline" className={org.negotiated.enabled ? 'text-green-400' : 'text-slate-500'}>
                    {org.negotiated.enabled ? 'Oui' : 'Non'}
                  </Badge>
                )}
              </div>

              {(editMode ? editNegotiatedEnabled : org.negotiated.enabled) && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                  <div>
                    <label className="text-sm text-slate-500">Prix custom (€)</label>
                    {editMode ? (
                      <Input
                        type="number"
                        value={editCustomPriceCents / 100}
                        onChange={(e) => setEditCustomPriceCents(Math.round(parseFloat(e.target.value) * 100))}
                        className="bg-slate-700 border-slate-600 mt-1"
                      />
                    ) : (
                      <p className="text-white">{org.negotiated.customPriceCents ? formatPrice(org.negotiated.customPriceCents) : '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Remise (%)</label>
                    {editMode ? (
                      <Input
                        type="number"
                        value={editDiscountPercent}
                        onChange={(e) => setEditDiscountPercent(parseInt(e.target.value) || 0)}
                        className="bg-slate-700 border-slate-600 mt-1"
                      />
                    ) : (
                      <p className="text-white">{org.negotiated.discountPercent ? `${org.negotiated.discountPercent}%` : '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Référence contrat</label>
                    {editMode ? (
                      <Input
                        value={editContractRef}
                        onChange={(e) => setEditContractRef(e.target.value)}
                        className="bg-slate-700 border-slate-600 mt-1"
                        placeholder="REF-2024-001"
                      />
                    ) : (
                      <p className="text-white font-mono">{org.negotiated.contractRef || '—'}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-slate-500">Notes internes</label>
                    {editMode ? (
                      <Input
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="bg-slate-700 border-slate-600 mt-1"
                        placeholder="Notes commerciales..."
                      />
                    ) : (
                      <p className="text-white">{org.negotiated.notes || '—'}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quotas Tab */}
        <TabsContent value="quotas" className="space-y-4">
          {/* Info: Credit Rules */}
          <Card className="bg-blue-900/20 border-blue-800/50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-400 font-medium">Règles des crédits</p>
                <ul className="text-sm text-slate-400 space-y-1 mt-1">
                  <li>• <strong className="text-slate-300">Abonnement (inclus + offerts)</strong>: expire à la fin de chaque mois</li>
                  <li>• <strong className="text-emerald-400">Packs achetés</strong>: persistent jusqu&apos;à consommation (mais nécessitent un abonnement actif)</li>
                  <li>• Débit: d&apos;abord les crédits abonnement, puis les packs</li>
                </ul>
                {org.billing?.periodEnd && (
                  <p className="text-sm text-slate-300 mt-2">
                    📅 Prochaine expiration abonnement: <strong>{new Date(org.billing.periodEnd).toLocaleDateString('fr-FR')}</strong>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Warning if subscription inactive */}
          {org.status !== 'active' && (
            <Card className="bg-red-900/30 border-red-800/50">
              <CardContent className="p-4 flex items-start gap-3">
                <Ban className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 font-medium">⚠️ Abonnement inactif - Tous les crédits sont perdus</p>
                  <p className="text-sm text-slate-400">
                    Lorsque l&apos;abonnement est suspendu ou annulé, tous les crédits (abonnement + packs) deviennent inutilisables et sont perdus.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subscription Credits Card */}
          <Card className="bg-slate-800/50 border-blue-500/30">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-400" />
                Crédits Abonnement
                <Badge className="bg-blue-500/20 text-blue-400 text-xs">Mensuels</Badge>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Expirent à la fin de chaque mois calendaire
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SMS Subscription */}
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-slate-300">SMS</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Inclus (mensuel)</span>
                      {editMode ? (
                        <Input
                          type="number"
                          value={editSmsIncluded}
                          onChange={(e) => setEditSmsIncluded(parseInt(e.target.value) || 0)}
                          className="w-20 h-6 bg-slate-700 border-slate-600 text-right text-sm"
                        />
                      ) : (
                        <span className="text-white">{org.creditsComputed?.subscription.smsIncludedMonthly || 0}</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-400">+ Offerts</span>
                      <span className="text-amber-400">{org.creditsComputed?.subscription.smsGiftMonthly || 0}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-600">
                      <span className="text-slate-300 font-medium">Total</span>
                      <span className="text-white font-bold">{org.creditsComputed?.subscription.smsTotal || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">Utilisé</span>
                      <span className="text-blue-400">{org.creditsComputed?.subscription.smsUsed || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-400 font-medium">Restant</span>
                      <span className="text-green-400 font-bold">{org.creditsComputed?.subscription.smsRemaining || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Email Subscription */}
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-orange-400" />
                    <span className="text-sm text-slate-300">Emails</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Inclus (mensuel)</span>
                      {editMode ? (
                        <Input
                          type="number"
                          value={editEmailIncluded}
                          onChange={(e) => setEditEmailIncluded(parseInt(e.target.value) || 0)}
                          className="w-20 h-6 bg-slate-700 border-slate-600 text-right text-sm"
                        />
                      ) : (
                        <span className="text-white">{org.creditsComputed?.subscription.emailIncludedMonthly || 0}</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-400">+ Offerts</span>
                      <span className="text-amber-400">{org.creditsComputed?.subscription.emailGiftMonthly || 0}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-600">
                      <span className="text-slate-300 font-medium">Total</span>
                      <span className="text-white font-bold">{org.creditsComputed?.subscription.emailTotal || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">Utilisé</span>
                      <span className="text-orange-400">{org.creditsComputed?.subscription.emailUsed || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-400 font-medium">Restant</span>
                      <span className="text-green-400 font-bold">{org.creditsComputed?.subscription.emailRemaining || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pack Wallet Card */}
          <Card className="bg-slate-800/50 border-emerald-500/30">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-400" />
                Packs Achetés
                <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Persistants</Badge>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Crédits qui restent jusqu&apos;à consommation (si abonnement actif)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-slate-300">SMS</span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-400">{org.creditsComputed?.pack.smsRemaining || 0}</p>
                  <p className="text-xs text-slate-500">disponibles</p>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-orange-400" />
                    <span className="text-sm text-slate-300">Emails</span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-400">{org.creditsComputed?.pack.emailRemaining || 0}</p>
                  <p className="text-xs text-slate-500">disponibles</p>
                </div>
              </div>
              <div className="mt-4 p-2 bg-slate-700/30 rounded text-xs text-slate-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-slate-500" />
                Les packs ne sont utilisables que si l&apos;abonnement est actif. En cas de résiliation, ils sont perdus.
              </div>
            </CardContent>
          </Card>

          {/* Summary by Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-400" />
                  SMS - Résumé
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Quota mensuel (base)</span>
                  {editMode ? (
                    <Input
                      type="number"
                      value={editSmsIncluded}
                      onChange={(e) => setEditSmsIncluded(parseInt(e.target.value) || 0)}
                      className="w-24 bg-slate-700 border-slate-600"
                    />
                  ) : (
                    <span className="text-white">{org.quotas.smsIncluded}</span>
                  )}
                </div>
                {org.billingComputed?.breakdown && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Inclus (période)</span>
                      <span className="text-white">{org.billingComputed.breakdown.included.sms}</span>
                    </div>
                    {org.billingComputed.breakdown.gift.sms > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-amber-400">+ Offerts</span>
                        <span className="text-amber-400">{org.billingComputed.breakdown.gift.sms}</span>
                      </div>
                    )}
                    {org.billingComputed.breakdown.pack.sms > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-emerald-400">+ Packs</span>
                        <span className="text-emerald-400">{org.billingComputed.breakdown.pack.sms}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                  <span className="text-slate-300">Total alloué</span>
                  <span className="text-white font-bold">{org.billingComputed?.smsAllocated || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Utilisé / Restant</span>
                  <span className="text-white">
                    <span className="text-blue-400">{org.billingComputed?.smsUsed || 0}</span>
                    {' / '}
                    <span className="font-bold">{org.billingComputed?.smsRemaining || 0}</span>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-orange-400" />
                  Emails - Résumé
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Quota mensuel (base)</span>
                  {editMode ? (
                    <Input
                      type="number"
                      value={editEmailIncluded}
                      onChange={(e) => setEditEmailIncluded(parseInt(e.target.value) || 0)}
                      className="w-24 bg-slate-700 border-slate-600"
                    />
                  ) : (
                    <span className="text-white">{org.quotas.emailIncluded}</span>
                  )}
                </div>
                {org.billingComputed?.breakdown && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Inclus (période)</span>
                      <span className="text-white">{org.billingComputed.breakdown.included.email}</span>
                    </div>
                    {org.billingComputed.breakdown.gift.email > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-amber-400">+ Offerts</span>
                        <span className="text-amber-400">{org.billingComputed.breakdown.gift.email}</span>
                      </div>
                    )}
                    {org.billingComputed.breakdown.pack.email > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-emerald-400">+ Packs</span>
                        <span className="text-emerald-400">{org.billingComputed.breakdown.pack.email}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                  <span className="text-slate-300">Total alloué</span>
                  <span className="text-white font-bold">{org.billingComputed?.emailAllocated || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Utilisé / Restant</span>
                  <span className="text-white">
                    <span className="text-orange-400">{org.billingComputed?.emailUsed || 0}</span>
                    {' / '}
                    <span className="font-bold">{org.billingComputed?.emailRemaining || 0}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Dialog open={creditsOpen} onOpenChange={setCreditsOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 gap-2">
                <Plus className="h-4 w-4" />
                Ajouter des crédits
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-800 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle>Ajouter des crédits</DialogTitle>
                <DialogDescription className="text-slate-400">
                  ⚠️ Ces crédits expirent à la fin de la période de facturation en cours.
                  {org.billingComputed?.periodEnd && (
                    <span className="text-red-400"> (Expiration: {new Date(org.billingComputed.periodEnd).toLocaleDateString('fr-FR')})</span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddCredits} className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400">Type de crédit</label>
                  <Select value={creditsSource} onValueChange={(v: 'gift' | 'pack') => setCreditsSource(v)}>
                    <SelectTrigger className="bg-slate-700 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="gift">🎁 Offert (geste commercial)</SelectItem>
                      <SelectItem value="pack">💰 Pack vendu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-slate-400">SMS</label>
                    <Input
                      type="number"
                      value={creditsSms}
                      onChange={(e) => setCreditsSms(parseInt(e.target.value) || 0)}
                      min={0}
                      className="bg-slate-700 border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Emails</label>
                    <Input
                      type="number"
                      value={creditsEmail}
                      onChange={(e) => setCreditsEmail(parseInt(e.target.value) || 0)}
                      min={0}
                      className="bg-slate-700 border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">IA</label>
                    <Input
                      type="number"
                      value={creditsAi}
                      onChange={(e) => setCreditsAi(parseInt(e.target.value) || 0)}
                      min={0}
                      className="bg-slate-700 border-slate-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-400">Label (optionnel)</label>
                  <Input
                    value={creditsReason}
                    onChange={(e) => setCreditsReason(e.target.value)}
                    placeholder={creditsSource === 'gift' ? "Ex: Geste commercial janvier" : "Ex: Pack 100 SMS"}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreditsOpen(false)} className="border-slate-600">
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={creditsLoading || (creditsSms === 0 && creditsEmail === 0 && creditsAi === 0)}
                    className={cn(
                      "gap-2",
                      creditsSource === 'gift' ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"
                    )}
                  >
                    {creditsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <>
                        <Plus className="h-4 w-4" />
                        {creditsSource === 'gift' ? 'Offrir' : 'Ajouter pack'}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Options Tab */}
        <TabsContent value="options" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Options activées</CardTitle>
              <CardDescription className="text-slate-400">
                Fonctionnalités supplémentaires pour ce client
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'reviewRouting', label: 'Routing des avis', desc: 'Redirection intelligente vers avis publics' },
                { key: 'widgetsSeo', label: 'Widgets SEO', desc: 'Widget et badge pour site web' },
                { key: 'multiLocations', label: 'Multi-établissements', desc: 'Gestion de plusieurs points de vente' },
                { key: 'prioritySupport', label: 'Support prioritaire', desc: 'Assistance premium' },
              ].map((option) => (
                <div key={option.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-white font-medium">{option.label}</p>
                    <p className="text-xs text-slate-500">{option.desc}</p>
                  </div>
                  {editMode ? (
                    <Switch
                      checked={editOptions[option.key as keyof typeof editOptions]}
                      onCheckedChange={(checked) => setEditOptions({ ...editOptions, [option.key]: checked })}
                    />
                  ) : (
                    <Badge variant="outline" className={org.options[option.key as keyof typeof org.options] ? 'text-green-400' : 'text-slate-500'}>
                      {org.options[option.key as keyof typeof org.options] ? 'Actif' : 'Inactif'}
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">SMS 7j</p>
                <p className="text-2xl font-bold text-blue-400">{usage.days7.sms}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Email 7j</p>
                <p className="text-2xl font-bold text-orange-400">{usage.days7.email}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">SMS 30j</p>
                <p className="text-2xl font-bold text-blue-400">{usage.days30.sms}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Email 30j</p>
                <p className="text-2xl font-bold text-orange-400">{usage.days30.email}</p>
              </CardContent>
            </Card>
          </div>
          
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Derniers envois</CardTitle>
              <CardDescription className="text-slate-400">
                Historique détaillé des SMS et emails envoyés
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentUsage.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Aucun envoi enregistré</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {recentUsage.map((entry) => {
                    const meta = entry.meta || {}
                    // Display priority: firstName+lastName > name > recipient (phone/email) > never anonymous
                    const firstName = (meta.patientFirstName as string || '').trim()
                    const lastName = (meta.patientLastName as string || '').trim()
                    const fullName = [firstName, lastName].filter(Boolean).join(' ')
                    const patientName = fullName
                      || (meta.patientName as string || '').trim()
                      || (meta.patientContact as string || '').trim()
                      || 'N/A'
                    const patientContact = (meta.patientContact as string || '').trim()
                    // Only show contact line if different from name (avoid duplication)
                    const showContact = patientContact && patientContact !== patientName
                    const status = meta.status as string || 'success'
                    const simulated = meta.simulated as boolean
                    const resend = meta.resend as boolean
                    const segments = meta.segments as number | null
                    const statusLabel = status === 'success' || status === 'sent' ? 'Envoyé' 
                      : status === 'queued' ? 'En attente'
                      : status === 'feedback_received' ? 'Feedback reçu'
                      : 'Échec'
                    const statusColor = status === 'success' || status === 'sent' ? 'text-green-400'
                      : status === 'queued' ? 'text-yellow-400'
                      : status === 'feedback_received' ? 'text-blue-400'
                      : 'text-red-400'
                    
                    return (
                      <div key={entry.id} className={cn(
                        'flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded border',
                        status === 'success' || status === 'sent' || status === 'queued' || status === 'feedback_received'
                          ? 'bg-slate-700/30 border-slate-600' 
                          : 'bg-red-500/10 border-red-500/20'
                      )}>
                        <div className="flex items-center gap-3 flex-1">
                          {entry.type === 'sms' ? (
                            <MessageSquare className="h-5 w-5 text-blue-400 flex-shrink-0" />
                          ) : (
                            <Mail className="h-5 w-5 text-orange-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-medium truncate">{patientName}</p>
                            {showContact && (
                              <p className="text-xs text-slate-500 truncate">{patientContact}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {simulated && (
                            <Badge variant="outline" className="text-xs text-slate-500">Simulé</Badge>
                          )}
                          {resend && (
                            <Badge variant="outline" className="text-xs text-amber-400">Renvoi</Badge>
                          )}
                          {entry.type === 'sms' && segments && segments > 1 && (
                            <Badge variant="outline" className="text-xs text-purple-400">
                              {segments} segment{segments > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {entry.type === 'sms' && entry.qty > 1 && (
                            <Badge variant="outline" className="text-xs text-purple-400">
                              ×{entry.qty} crédits
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn('text-xs', statusColor)}>
                            {statusLabel}
                          </Badge>
                          <span className="text-slate-500 text-xs whitespace-nowrap">{formatDate(entry.ts)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telemetry Tab */}
        <TabsContent value="telemetry" className="space-y-4">
          {/* Level counts */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Infos</p>
                <p className="text-2xl font-bold text-blue-400">
                  {recentTelemetry.filter(e => e.level === 'info').length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Warnings</p>
                <p className="text-2xl font-bold text-amber-400">
                  {recentTelemetry.filter(e => e.level === 'warn').length}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400">Erreurs</p>
                <p className="text-2xl font-bold text-red-400">
                  {recentTelemetry.filter(e => e.level === 'error').length}
                </p>
              </CardContent>
            </Card>
          </div>
          
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Logs & Événements</CardTitle>
              <CardDescription className="text-slate-400">
                Télémétrie détaillée depuis l&apos;extension et le backend
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTelemetry.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Aucun log enregistré</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {recentTelemetry.map((entry) => (
                    <div key={entry.id} className={cn(
                      'p-3 rounded text-sm border',
                      entry.level === 'error' ? 'bg-red-500/10 border-red-500/20' :
                      entry.level === 'warn' ? 'bg-amber-500/10 border-amber-500/20' :
                      'bg-slate-700/30 border-slate-600'
                    )}>
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.level === 'error' && <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                        {entry.level === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />}
                        {entry.level === 'info' && <CheckCircle className="h-4 w-4 text-blue-400 flex-shrink-0" />}
                        <Badge variant="outline" className={cn(
                          'text-xs',
                          entry.source === 'extension' ? 'text-purple-400' : 'text-slate-400'
                        )}>
                          {entry.source}
                        </Badge>
                        {entry.code && (
                          <Badge variant="outline" className="text-xs text-white font-mono">
                            {entry.code}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{formatDate(entry.ts)}</span>
                      </div>
                      <p className="text-white mt-2">{entry.message}</p>
                      {entry.stack && (
                        <pre className="text-xs text-slate-400 mt-2 overflow-x-auto bg-slate-800 p-2 rounded">{entry.stack}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Actions sur le compte</CardTitle>
              <CardDescription className="text-slate-400">
                Suspendre, réactiver ou annuler ce client
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-700">
                <div>
                  <p className="text-white font-medium">Statut actuel</p>
                  <Badge variant="outline" className={cn('mt-1', statusColors[org.status])}>
                    {statusLabels[org.status]}
                  </Badge>
                </div>
                <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-slate-600">
                      <Settings className="h-4 w-4 mr-2" />
                      Changer le statut
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle>Changer le statut</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Cette action affectera l&apos;accès du client à la plateforme.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select value={newStatus} onValueChange={(v: 'active' | 'suspended' | 'cancelled') => setNewStatus(v)}>
                        <SelectTrigger className="bg-slate-700 border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="active">
                            <div className="flex items-center gap-2">
                              <Play className="h-4 w-4 text-green-400" />
                              Actif
                            </div>
                          </SelectItem>
                          <SelectItem value="suspended">
                            <div className="flex items-center gap-2">
                              <Pause className="h-4 w-4 text-amber-400" />
                              Suspendu
                            </div>
                          </SelectItem>
                          <SelectItem value="cancelled">
                            <div className="flex items-center gap-2">
                              <Ban className="h-4 w-4 text-red-400" />
                              Annulé
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {newStatus === 'cancelled' && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                          <p className="text-sm text-red-400">
                            L&apos;annulation est définitive et supprimera l&apos;accès du client.
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setStatusModalOpen(false)} className="border-slate-600">
                        Annuler
                      </Button>
                      <Button
                        onClick={handleChangeStatus}
                        disabled={statusLoading || newStatus === org.status}
                        className={cn(
                          newStatus === 'cancelled' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
                        )}
                      >
                        {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmer'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
