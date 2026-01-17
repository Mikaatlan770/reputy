'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Org, UsageEntry, TelemetryEntry } from '@/lib/internal/fetch-internal'
import { updateOrg, addCredits, changeStatus, refreshClient } from '@/lib/internal/actions'
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
  CreditCard,
  Edit2,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Stethoscope,
  Store,
  Utensils,
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
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  
  // Credits modal
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [creditsSms, setCreditsSms] = useState(0)
  const [creditsEmail, setCreditsEmail] = useState(0)
  const [creditsReason, setCreditsReason] = useState('')
  const [creditsLoading, setCreditsLoading] = useState(false)
  
  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<'active' | 'suspended' | 'cancelled'>(org.status)
  const [statusLoading, setStatusLoading] = useState(false)
  
  // Feedback states
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      reason: creditsReason,
    })

    if (result.ok) {
      setCreditsOpen(false)
      setCreditsSms(0)
      setCreditsEmail(0)
      setCreditsReason('')
      setSuccess(`Crédits ajoutés: ${creditsSms} SMS, ${creditsEmail} emails`)
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
          <TabsTrigger value="commercial">Commercial</TabsTrigger>
          <TabsTrigger value="quotas">Quotas & Crédits</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-400">Usage 7 jours</CardTitle>
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

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-400">Usage 30 jours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-white">{usage.days30.sms}</p>
                    <p className="text-xs text-slate-500">SMS</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{usage.days30.email}</p>
                    <p className="text-xs text-slate-500">Emails</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-400">Facturation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn(
                  'text-2xl font-bold',
                  org.negotiated?.enabled ? 'text-amber-400' : 'text-white'
                )}>
                  {formatPrice(effectivePrice)}
                </p>
                <p className="text-xs text-slate-500">
                  /{org.plan.billingCycle === 'monthly' ? 'mois' : 'an'}
                  {org.negotiated?.enabled && ' (négocié)'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-sm text-slate-400">Informations générales</CardTitle>
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

        {/* Commercial Tab */}
        <TabsContent value="commercial" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base">Plan & Tarification</CardTitle>
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
              <CardTitle className="text-base flex items-center gap-2">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  SMS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Quota mensuel</span>
                  {editMode ? (
                    <Input
                      type="number"
                      value={editSmsIncluded}
                      onChange={(e) => setEditSmsIncluded(parseInt(e.target.value) || 0)}
                      className="w-24 bg-slate-700 border-slate-600"
                    />
                  ) : (
                    <span className="text-white font-bold">{org.quotas.smsIncluded}</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Crédits extra</span>
                  <span className="text-amber-400 font-bold">{org.balances.smsExtra}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                  <span className="text-slate-300">Total disponible</span>
                  <span className="text-white font-bold text-lg">{org.quotas.smsIncluded + org.balances.smsExtra}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Emails
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Quota mensuel</span>
                  {editMode ? (
                    <Input
                      type="number"
                      value={editEmailIncluded}
                      onChange={(e) => setEditEmailIncluded(parseInt(e.target.value) || 0)}
                      className="w-24 bg-slate-700 border-slate-600"
                    />
                  ) : (
                    <span className="text-white font-bold">{org.quotas.emailIncluded}</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Crédits extra</span>
                  <span className="text-amber-400 font-bold">{org.balances.emailExtra}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                  <span className="text-slate-300">Total disponible</span>
                  <span className="text-white font-bold text-lg">{org.quotas.emailIncluded + org.balances.emailExtra}</span>
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
                  Ces crédits s&apos;ajoutent aux quotas mensuels et sont conservés (rollover).
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddCredits} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <div>
                  <label className="text-sm text-slate-400">Raison (optionnel)</label>
                  <Input
                    value={creditsReason}
                    onChange={(e) => setCreditsReason(e.target.value)}
                    placeholder="Ex: Geste commercial"
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreditsOpen(false)} className="border-slate-600">
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={creditsLoading || (creditsSms === 0 && creditsEmail === 0)}
                    className="bg-amber-500 hover:bg-amber-600"
                  >
                    {creditsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ajouter'}
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
              <CardTitle className="text-base">Options activées</CardTitle>
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
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base">Historique d&apos;usage</CardTitle>
            </CardHeader>
            <CardContent>
              {recentUsage.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Aucun usage enregistré</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {recentUsage.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 p-2 rounded bg-slate-700/30">
                      {entry.type === 'sms' ? (
                        <MessageSquare className="h-4 w-4 text-blue-400" />
                      ) : (
                        <Mail className="h-4 w-4 text-orange-400" />
                      )}
                      <span className="text-white">{entry.qty} {entry.type.toUpperCase()}</span>
                      <span className="text-slate-500 text-xs ml-auto">{formatDate(entry.ts)}</span>
                      {entry.meta?.reason && (
                        <Badge variant="outline" className="text-xs">{entry.meta.reason as string}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telemetry Tab */}
        <TabsContent value="telemetry" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base">Logs & Erreurs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTelemetry.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Aucun log enregistré</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {recentTelemetry.map((entry) => (
                    <div key={entry.id} className={cn(
                      'p-2 rounded text-sm',
                      entry.level === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                      entry.level === 'warn' ? 'bg-amber-500/10 border border-amber-500/20' :
                      'bg-slate-700/30'
                    )}>
                      <div className="flex items-center gap-2">
                        {entry.level === 'error' && <AlertCircle className="h-4 w-4 text-red-400" />}
                        {entry.level === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                        <span className="text-xs text-slate-500">{entry.source}</span>
                        {entry.code && <Badge variant="outline" className="text-xs">{entry.code}</Badge>}
                        <span className="text-xs text-slate-500 ml-auto">{formatDate(entry.ts)}</span>
                      </div>
                      <p className="text-white mt-1">{entry.message}</p>
                      {entry.stack && (
                        <pre className="text-xs text-slate-400 mt-2 overflow-x-auto">{entry.stack}</pre>
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
              <CardTitle className="text-base">Actions sur le compte</CardTitle>
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
