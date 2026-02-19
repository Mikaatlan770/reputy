'use client'

import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { authedFetch } from '@/lib/auth/authed-fetch'
import { BACKEND_URL } from '@/lib/constants'
import { formatDate, formatPercent, getStatusColor } from '@/lib/utils'
import type { Campaign, Contact, ContactCounts } from '@/types'
import {
  Plus,
  MessageSquare,
  Mail,
  TrendingUp,
  Send,
  Star,
  Users,
  Upload,
  RefreshCw,
  Trash2,
  Search,
  UserPlus,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

// ============================================================
// Campaigns Page — Onglets Campagnes + Contacts
// ============================================================

export default function CampaignsPage() {
  const [activeTab, setActiveTab] = useState('campaigns')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Campagnes</h1>
        <p className="text-muted-foreground mt-1">
          Créez des campagnes de collecte d&apos;avis et gérez votre base de contacts
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-2">
            <Send className="h-4 w-4" />
            Campagnes
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" />
            Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <CampaignsTab />
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// CAMPAIGNS TAB
// ============================================================

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewCampaign, setShowNewCampaign] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await authedFetch(`${BACKEND_URL}/client/campaigns`)
      if (!res.ok) throw new Error('Erreur de chargement')
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const totalSent = campaigns.reduce((s, c) => s + (c.totalSent || 0), 0)
  const totalReviews = campaigns.reduce((s, c) => s + (c.totalReviews || 0), 0)
  const totalClicks = campaigns.reduce((s, c) => s + (c.totalClicks || 0), 0)
  const activeCount = campaigns.filter(c => c.status === 'active' || c.status === 'sending').length
  const avgConversion = totalSent > 0 ? (totalReviews / totalSent) * 100 : 0

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Stats KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Campagnes actives', value: activeCount, icon: Send, color: 'text-blue-600 bg-blue-100' },
          { label: 'Messages envoyés', value: totalSent, icon: MessageSquare, color: 'text-green-600 bg-green-100' },
          { label: 'Avis générés', value: totalReviews, icon: Star, color: 'text-yellow-600 bg-yellow-100' },
          { label: 'Taux conversion', value: formatPercent(avgConversion), icon: TrendingUp, color: 'text-purple-600 bg-purple-100' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Campaigns List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Toutes les campagnes</CardTitle>
          <Button className="gap-1" onClick={() => setShowNewCampaign(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle campagne
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="text-center py-12">
                <Send className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold">Aucune campagne</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Créez votre première campagne pour collecter plus d&apos;avis
                </p>
                <Button className="mt-4 gap-1" onClick={() => setShowNewCampaign(true)}>
                  <Plus className="h-4 w-4" />
                  Créer une campagne
                </Button>
              </div>
            ) : (
              campaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} onRefresh={fetchCampaigns} />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* New Campaign Dialog */}
      <NewCampaignDialog
        open={showNewCampaign}
        onOpenChange={setShowNewCampaign}
        onCreated={fetchCampaigns}
      />
    </div>
  )
}

function CampaignRow({ campaign, onRefresh }: { campaign: Campaign; onRefresh: () => void }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Supprimer cette campagne ?')) return
    setDeleting(true)
    try {
      await authedFetch(`${BACKEND_URL}/client/campaigns/${campaign.id}`, { method: 'DELETE' })
      onRefresh()
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  const statusLabels: Record<string, string> = {
    active: 'Active',
    sending: 'Envoi en cours',
    scheduled: 'Programmée',
    completed: 'Terminée',
    draft: 'Brouillon',
    paused: 'En pause',
  }

  const sent = campaign.totalSent || 0
  const clicks = campaign.totalClicks || 0
  const reviews = campaign.totalReviews || 0
  const conv = sent > 0 ? (reviews / sent) * 100 : 0

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${campaign.channel === 'sms' ? 'bg-green-100' : 'bg-orange-100'}`}>
          {campaign.channel === 'sms' ? (
            <MessageSquare className="h-5 w-5 text-green-600" />
          ) : (
            <Mail className="h-5 w-5 text-orange-600" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{campaign.name}</p>
            {campaign.type === 'review' && (
              <Badge variant="outline" className="text-xs">Avis</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Créée le {formatDate(campaign.createdAt)}
            {campaign.scheduledAt && ` • Programmée le ${formatDate(campaign.scheduledAt)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 text-center">
          <div>
            <p className="text-sm font-medium">{sent}</p>
            <p className="text-xs text-muted-foreground">Envoyés</p>
          </div>
          <div>
            <p className="text-sm font-medium">{clicks}</p>
            <p className="text-xs text-muted-foreground">Clics</p>
          </div>
          <div>
            <p className="text-sm font-medium">{reviews}</p>
            <p className="text-xs text-muted-foreground">Avis</p>
          </div>
          <div>
            <p className="text-sm font-medium">{formatPercent(conv)}</p>
            <p className="text-xs text-muted-foreground">Conv.</p>
          </div>
        </div>
        <Badge className={getStatusColor(campaign.status)}>
          {statusLabels[campaign.status] || campaign.status}
        </Badge>
        {(campaign.status === 'draft' || campaign.status === 'paused') && (
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// NEW CAMPAIGN DIALOG (3 étapes)
// ============================================================

function NewCampaignDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [step, setStep] = useState(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<'sms' | 'email'>('email')
  const [campaignType, setCampaignType] = useState<'review' | 'marketing'>('review')

  // Step 2
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)

  // Step 3
  const [template, setTemplate] = useState('')
  const [subject, setSubject] = useState('')
  const [spamThreshold, setSpamThreshold] = useState(3)

  // Default templates
  const defaultTemplates = useMemo(() => ({
    review_email: `Bonjour {prenom},\n\nNous espérons que votre visite s'est bien passée.\nVotre avis compte beaucoup pour nous : il aide d'autres patients à nous trouver et nous permet de continuer à nous améliorer.\n\n👉 Cliquez ici pour laisser votre avis : {lien_avis}\n\nMerci pour votre confiance !\n\nCordialement,\nL'équipe`,
    review_sms: `Bonjour {prenom}, votre avis compte ! Laissez un avis ici : {lien_avis} — Merci !`,
    marketing_email: `Bonjour {prenom},\n\nNous avons le plaisir de vous informer...\n\nCordialement,\nL'équipe`,
    marketing_sms: `Bonjour {prenom}, ...`,
  }), [])

  // Load contacts when opening step 2
  useEffect(() => {
    if (step === 2 && contacts.length === 0) {
      loadContacts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Set default template when channel/type changes
  useEffect(() => {
    const key = `${campaignType}_${channel}` as keyof typeof defaultTemplates
    setTemplate(defaultTemplates[key] || '')
    if (channel === 'email' && !subject) {
      setSubject(campaignType === 'review' ? 'Votre avis nous intéresse !' : 'Information importante')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, campaignType])

  const loadContacts = async () => {
    setContactsLoading(true)
    try {
      const filter = channel === 'sms' ? '&hasPhone=1' : '&hasEmail=1'
      const res = await authedFetch(`${BACKEND_URL}/client/contacts?limit=500${filter}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.contacts || [])
      }
    } catch {
      // ignore
    } finally {
      setContactsLoading(false)
    }
  }

  const toggleContact = (id: string) => {
    const next = new Set(selectedContacts)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedContacts(next)
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(contacts.map(c => c.id)))
    }
    setSelectAll(!selectAll)
  }

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      // Step 1: Create campaign
      const res = await authedFetch(`${BACKEND_URL}/client/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type: campaignType,
          channel,
          template,
          subject: channel === 'email' ? subject : undefined,
          spamThreshold,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.message || 'Erreur création')
      }
      const { campaign } = await res.json()

      // Step 2: Add recipients
      if (selectedContacts.size > 0) {
        await authedFetch(`${BACKEND_URL}/client/campaigns/${campaign.id}/recipients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactIds: [...selectedContacts],
          }),
        })
      } else if (selectAll) {
        await authedFetch(`${BACKEND_URL}/client/campaigns/${campaign.id}/recipients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sendAll: true }),
        })
      }

      // Reset & close
      setStep(1)
      setName('')
      setTemplate('')
      setSubject('')
      setSelectedContacts(new Set())
      setSelectAll(false)
      onOpenChange(false)
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setCreating(false)
    }
  }

  const previewText = template
    .replace(/\{prenom\}/g, 'Jean')
    .replace(/\{nom\}/g, 'Dupont')
    .replace(/\{lien_avis\}/g, 'https://reputy.fr/r/abc123')

  const smsLength = template.length
  const smsSegments = Math.ceil(smsLength / 160) || 1

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setStep(1) } onOpenChange(v) }}>
      <DialogContent className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && 'Nouvelle campagne — Informations'}
            {step === 2 && 'Nouvelle campagne — Destinataires'}
            {step === 3 && 'Nouvelle campagne — Message'}
          </DialogTitle>
          <DialogDescription>
            Étape {step}/3
          </DialogDescription>
        </DialogHeader>

        {/* STEP INDICATOR */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* STEP 1: Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nom de la campagne</label>
              <Input
                placeholder="Ex: Campagne avis Février 2026"
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Type de campagne</label>
              <Select value={campaignType} onValueChange={(v: 'review' | 'marketing') => setCampaignType(v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">Collecte d&apos;avis</SelectItem>
                  <SelectItem value="marketing">Marketing / Information</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Canal d&apos;envoi</label>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setChannel('email')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    channel === 'email' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <Mail className={`h-6 w-6 mx-auto mb-2 ${channel === 'email' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-xs text-muted-foreground mt-1">Personnalisable, détaillé</p>
                </button>
                <button
                  onClick={() => setChannel('sms')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    channel === 'sms' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <MessageSquare className={`h-6 w-6 mx-auto mb-2 ${channel === 'sms' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-medium">SMS</p>
                  <p className="text-xs text-muted-foreground mt-1">Direct, haut taux d&apos;ouverture</p>
                </button>
              </div>
            </div>

            {campaignType === 'review' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span className="font-medium">Protection anti-spam</span>
                </div>
                <p className="mt-1 text-xs">
                  Les contacts ayant été sollicités {spamThreshold} fois sans laisser d&apos;avis seront automatiquement exclus.
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Recipients */}
        {step === 2 && (
          <div className="space-y-4">
            {contactsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Chargement des contacts...</span>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="font-medium">Aucun contact avec {channel === 'sms' ? 'téléphone' : 'email'}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Importez des contacts depuis l&apos;onglet Contacts d&apos;abord.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {selectedContacts.size} / {contacts.length} contact(s) sélectionné(s)
                  </p>
                  <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                    {selectAll ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </Button>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {contacts.map(contact => (
                    <label
                      key={contact.id}
                      className={`flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer ${
                        selectedContacts.has(contact.id) ? 'bg-primary/5' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {contact.firstName || contact.lastName
                            ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                            : contact.email || contact.phone || 'Sans nom'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {channel === 'email' ? contact.email : contact.phone}
                        </p>
                      </div>
                      {contact.hasLeftReview && (
                        <Badge variant="outline" className="text-xs text-green-600">A laissé un avis</Badge>
                      )}
                      {contact.reviewSolicitationsNoReply >= spamThreshold && (
                        <Badge variant="outline" className="text-xs text-red-600">Seuil anti-spam</Badge>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3: Message */}
        {step === 3 && (
          <div className="space-y-4">
            {channel === 'email' && (
              <div>
                <label className="text-sm font-medium">Objet de l&apos;email</label>
                <Input
                  placeholder="Votre avis nous intéresse !"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Message</label>
                <span className="text-xs text-muted-foreground">
                  Variables : {'{prenom}'}, {'{nom}'}, {'{lien_avis}'}
                </span>
              </div>
              <Textarea
                rows={channel === 'sms' ? 4 : 8}
                value={template}
                onChange={e => setTemplate(e.target.value)}
                placeholder="Composez votre message..."
                className="font-mono text-sm"
              />
              {channel === 'sms' && (
                <p className="text-xs text-muted-foreground mt-1">
                  {smsLength} caractères • {smsSegments} segment{smsSegments > 1 ? 's' : ''} SMS
                  {smsSegments > 1 && (
                    <span className="text-amber-600 ml-1">(chaque segment = 1 crédit SMS)</span>
                  )}
                </p>
              )}
            </div>

            {/* Preview */}
            <div>
              <label className="text-sm font-medium mb-1 block">Aperçu</label>
              <div className={`p-4 rounded-lg border ${channel === 'sms' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                {channel === 'email' && subject && (
                  <p className="text-sm font-semibold mb-2">{subject}</p>
                )}
                <p className="text-sm whitespace-pre-wrap">{previewText}</p>
              </div>
            </div>

            {campaignType === 'review' && (
              <div>
                <label className="text-sm font-medium">Seuil anti-spam (sollicitations max sans réponse)</label>
                <Select value={String(spamThreshold)} onValueChange={v => setSpamThreshold(Number(v))}>
                  <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={String(n)}>{n} fois</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Précédent
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && (!name.trim() || name.length < 2)}
              >
                Suivant
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={creating || !template.trim()}>
                {creating ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Création...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-1" /> Créer la campagne</>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// CONTACTS TAB
// ============================================================

function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [counts, setCounts] = useState<ContactCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showAddManual, setShowAddManual] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchContacts = useCallback(async (searchTerm?: string) => {
    try {
      setLoading(true)
      setError(null)
      const q = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''
      const res = await authedFetch(`${BACKEND_URL}/client/contacts?limit=100${q}`)
      if (!res.ok) throw new Error('Erreur de chargement')
      const data = await res.json()
      setContacts(data.contacts || [])
      setCounts(data.counts || null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const handleSearch = () => { fetchContacts(search) }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await authedFetch(`${BACKEND_URL}/client/contacts/sync`, { method: 'POST' })
      const data = await res.json()
      setSuccessMsg(data.message || 'Synchronisation terminée')
      fetchContacts()
      setTimeout(() => setSuccessMsg(null), 5000)
    } catch {
      setError('Erreur de synchronisation')
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce contact ?')) return
    try {
      await authedFetch(`${BACKEND_URL}/client/contacts/${id}`, { method: 'DELETE' })
      fetchContacts(search)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Contacts Stats */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{counts.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <Mail className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avec email</p>
                  <p className="text-xl font-bold">{counts.withEmail}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <MessageSquare className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avec téléphone</p>
                  <p className="text-xl font-bold">{counts.withPhone}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-100">
                  <FileSpreadsheet className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Importés</p>
                  <p className="text-xl font-bold">{(counts.import_csv || 0) + (counts.import_excel || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Base de contacts</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Synchroniser
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1">
              <Upload className="h-4 w-4" />
              Importer CSV
            </Button>
            <Button size="sm" onClick={() => setShowAddManual(true)} className="gap-1">
              <UserPlus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, email, téléphone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={handleSearch}>Rechercher</Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold">Aucun contact</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Importez un fichier CSV ou synchronisez depuis vos envois précédents
              </p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={() => setShowImport(true)} className="gap-1">
                  <Upload className="h-4 w-4" />
                  Importer CSV
                </Button>
                <Button variant="outline" onClick={handleSync} className="gap-1">
                  <RefreshCw className="h-4 w-4" />
                  Synchroniser
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 overflow-x-auto">
              <div className="min-w-[900px]">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                <div className="col-span-3">Nom</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Téléphone</div>
                <div className="col-span-2">Source</div>
                <div className="col-span-1">Avis</div>
                <div className="col-span-1"></div>
              </div>
              {contacts.map(contact => (
                <div
                  key={contact.id}
                  className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-muted/50 rounded-lg hover:bg-muted items-center text-sm"
                >
                  <div className="col-span-3 font-medium truncate">
                    {contact.firstName || contact.lastName
                      ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                      : '—'}
                  </div>
                  <div className="col-span-3 text-muted-foreground truncate">{contact.email || '—'}</div>
                  <div className="col-span-2 text-muted-foreground truncate">{contact.phone || '—'}</div>
                  <div className="col-span-2">
                    <Badge variant="outline" className="text-xs">
                      {sourceLabels[contact.source] || contact.source}
                    </Badge>
                  </div>
                  <div className="col-span-1">
                    {contact.hasLeftReview ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : contact.reviewSolicitationsNoReply > 0 ? (
                      <span className="text-xs text-muted-foreground">{contact.reviewSolicitationsNoReply}x</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(contact.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <ImportCSVDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={(msg) => {
          setSuccessMsg(msg)
          fetchContacts()
          setTimeout(() => setSuccessMsg(null), 5000)
        }}
      />

      {/* Add Manual Dialog */}
      <AddContactDialog
        open={showAddManual}
        onOpenChange={setShowAddManual}
        onAdded={() => fetchContacts()}
      />
    </div>
  )
}

const sourceLabels: Record<string, string> = {
  manual: 'Manuel',
  import_csv: 'CSV',
  import_excel: 'Excel',
  review_request: 'Demande avis',
  sync: 'Synchro',
}

// ============================================================
// IMPORT CSV DIALOG
// ============================================================

function ImportCSVDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (msg: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError(null)
    setPreview(null)

    // Parse CSV preview
    try {
      const text = await f.text()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) {
        setError('Le fichier doit contenir au moins 2 lignes (en-tête + données)')
        return
      }
      const headers = parseCSVLine(lines[0])
      const rows = lines.slice(1, 6).map(l => parseCSVLine(l)) // preview 5 rows
      setPreview({ headers, rows })
    } catch {
      setError('Erreur de lecture du fichier')
    }
  }

  const handleImport = async () => {
    if (!file || !preview) return
    setImporting(true)
    setError(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())

      // Map columns
      const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'))
      const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('téléphone') || h.includes('mobile'))
      const firstNameIdx = headers.findIndex(h => h.includes('prenom') || h.includes('prénom') || h.includes('first'))
      const lastNameIdx = headers.findIndex(h => h.includes('nom') || h.includes('last') || h.includes('name'))

      if (emailIdx === -1 && phoneIdx === -1) {
        setError('Le fichier doit contenir une colonne "email" ou "téléphone"')
        setImporting(false)
        return
      }

      const contacts = lines.slice(1).map(line => {
        const cols = parseCSVLine(line)
        return {
          email: emailIdx >= 0 ? cols[emailIdx]?.trim() || undefined : undefined,
          phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || undefined : undefined,
          firstName: firstNameIdx >= 0 ? cols[firstNameIdx]?.trim() || undefined : undefined,
          lastName: lastNameIdx >= 0 ? cols[lastNameIdx]?.trim() || undefined : undefined,
        }
      }).filter(c => c.email || c.phone)

      if (contacts.length === 0) {
        setError('Aucun contact valide trouvé dans le fichier')
        setImporting(false)
        return
      }

      const source = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'import_excel' : 'import_csv'

      const res = await authedFetch(`${BACKEND_URL}/client/contacts/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts, source }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Erreur import')

      onImported(data.message || `${data.stats?.imported || 0} contact(s) importé(s)`)
      setFile(null)
      setPreview(null)
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setFile(null); setPreview(null); setError(null) } onOpenChange(v) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importer des contacts (CSV)</DialogTitle>
          <DialogDescription>
            Importez un fichier CSV avec les colonnes : prénom, nom, email, téléphone
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          {file ? (
            <p className="text-sm font-medium">{file.name} ({(file.size / 1024).toFixed(1)} Ko)</p>
          ) : (
            <>
              <p className="text-sm font-medium">Cliquez pour sélectionner un fichier</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, max 5000 contacts</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Preview */}
        {preview && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted p-2 text-xs font-medium">
              Aperçu ({preview.rows.length} première{preview.rows.length > 1 ? 's' : ''} ligne{preview.rows.length > 1 ? 's' : ''})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {preview.headers.map((h, i) => (
                      <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1 truncate max-w-[150px]">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <p className="font-medium mb-1">Format attendu :</p>
          <code className="block bg-white/50 p-2 rounded text-xs">
            prénom,nom,email,téléphone<br />
            Jean,Dupont,jean@email.com,0612345678
          </code>
          <p className="mt-1">Les doublons par email seront ignorés automatiquement.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleImport} disabled={importing || !file || !preview}>
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Import en cours...</>
            ) : (
              <><Upload className="h-4 w-4 mr-1" /> Importer</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// ADD CONTACT DIALOG
// ============================================================

function AddContactDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    setAdding(true)
    setError(null)
    try {
      const res = await authedFetch(`${BACKEND_URL}/client/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Erreur')
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      onOpenChange(false)
      onAdded()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un contact</DialogTitle>
          <DialogDescription>
            Email ou téléphone requis
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Prénom</label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Nom</label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" placeholder="jean@email.com" />
        </div>
        <div>
          <label className="text-sm font-medium">Téléphone</label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" placeholder="0612345678" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleAdd} disabled={adding || (!email && !phone)}>
            {adding ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Ajout...</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-1" /> Ajouter</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// CSV Parser helper
// ============================================================

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}
