'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/lib/store'
import { useAuth, useIsClient } from '@/lib/auth'
import { parseBackendError, isErrorResponse } from '@/lib/error-messages'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  QrCode,
  Nfc,
  MessageSquare,
  Mail,
  Stethoscope,
  Download,
  Plus,
  ExternalLink,
  Copy,
  TrendingUp,
  Eye,
  Star,
  Info,
  CheckCircle,
  Globe,
  MousePointer,
  Settings,
  Trash2,
  Loader2,
  AlertCircle,
  Smartphone,
  Clock,
} from 'lucide-react'
import { formatNumber, formatPercent } from '@/lib/utils'
import { SmsPreview } from '@/components/sms/SmsPreview'
import { EmailPreview } from '@/components/email/EmailPreview'
import { WebsiteWidgetManager } from '@/components/embed'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'

interface Shortlink {
  code: string
  type: 'qr' | 'nfc'
  label: string
  targetUrl: string
  shortUrl: string
  clicks: number
  createdAt: string
  lastClickedAt: string | null
}

interface ShortlinkStats {
  totalQr: number
  totalNfc: number
  totalClicks: number
}

export default function CollectPage() {
  const { currentLocation } = useAppStore()
  const { loading: authLoading, clientOrg } = useAuth()
  const isClient = useIsClient()
  
  // Shortlinks state
  const [shortlinks, setShortlinks] = useState<Shortlink[]>([])
  const [stats, setStats] = useState<ShortlinkStats>({ totalQr: 0, totalNfc: 0, totalClicks: 0 })
  const [loadingShortlinks, setLoadingShortlinks] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<'qr' | 'nfc'>('qr')
  const [newLabel, setNewLabel] = useState('')
  const [newTargetUrl, setNewTargetUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [newShortlink, setNewShortlink] = useState<Shortlink | null>(null)
  const [copied, setCopied] = useState(false)
  
  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Shortlink | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Other UI state
  const [smsValid, setSmsValid] = useState(true)
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)
  const [embedStats, setEmbedStats] = useState({ impressions: 0, clicks: 0 })
  
  // NFC instructions dialog
  const [nfcInstructionsOpen, setNfcInstructionsOpen] = useState(false)
  const [selectedShortlink, setSelectedShortlink] = useState<Shortlink | null>(null)

  // Get auth token from localStorage
  const getAuthToken = useCallback(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('reputy_client_token')
  }, [])

  // Fetch shortlinks from API
  const fetchShortlinks = useCallback(async () => {
    const token = getAuthToken()
    if (!token) return
    
    setLoadingShortlinks(true)
    setError(null)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/shortlinks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const data = await response.json()
      
      if (isErrorResponse(data)) {
        const errorDisplay = parseBackendError(data)
        setError(errorDisplay.message)
        return
      }
      
      setShortlinks(data.shortlinks || [])
      setStats(data.stats || { totalQr: 0, totalNfc: 0, totalClicks: 0 })
    } catch {
      setError('Impossible de charger les shortlinks')
    } finally {
      setLoadingShortlinks(false)
    }
  }, [getAuthToken])

  // Create shortlink
  const handleCreate = async () => {
    const token = getAuthToken()
    if (!token) return
    
    if (!newTargetUrl) {
      setError('URL de destination requise')
      return
    }
    
    setCreating(true)
    setError(null)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/shortlinks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: createType,
          targetUrl: newTargetUrl,
          label: newLabel || `${createType === 'qr' ? 'QR Code' : 'Tag NFC'} - ${new Date().toLocaleDateString('fr-FR')}`
        })
      })
      
      const data = await response.json()
      
      if (isErrorResponse(data)) {
        const errorDisplay = parseBackendError(data)
        setError(errorDisplay.message)
        return
      }
      
      setNewShortlink(data.shortlink)
      fetchShortlinks()
    } catch {
      setError('Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  // Delete shortlink
  const handleDelete = async () => {
    if (!deleteTarget) return
    
    const token = getAuthToken()
    if (!token) return
    
    setDeleting(true)
    
    try {
      await fetch(`${BACKEND_URL}/client/shortlinks/${deleteTarget.code}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      fetchShortlinks()
      setDeleteTarget(null)
    } catch {
      setError('Impossible de supprimer le shortlink')
    } finally {
      setDeleting(false)
    }
  }

  // Download QR code
  const downloadQr = useCallback((code: string, format: 'png' | 'svg' = 'png') => {
    const token = getAuthToken()
    if (!token) return
    
    fetch(`${BACKEND_URL}/client/shortlinks/${code}/qr?format=${format}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `qr-${code}.${format}`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => {
        setError('Erreur lors du téléchargement du QR code')
      })
  }, [getAuthToken])

  // Copy URL to clipboard
  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Close create dialog
  const closeCreateDialog = () => {
    setCreateOpen(false)
    setNewLabel('')
    setNewTargetUrl('')
    setNewShortlink(null)
    setCopied(false)
  }

  // Open create dialog with type - pre-fill with Google Review URL if available
  const openCreateDialog = (type: 'qr' | 'nfc') => {
    setCreateType(type)
    const googleReviewUrl = (clientOrg as any)?.options?.googleReviewUrl || ''
    setNewTargetUrl(googleReviewUrl)
    setCreateOpen(true)
  }

  // Initial load
  useEffect(() => {
    if (!authLoading && isClient) {
      fetchShortlinks()
    }
  }, [authLoading, isClient, fetchShortlinks])

  // Filter shortlinks by type
  const qrLinks = shortlinks.filter(s => s.type === 'qr')
  const nfcLinks = shortlinks.filter(s => s.type === 'nfc')
  
  // Get first shortlink for SMS/Email template
  const primaryShortlink = shortlinks[0]

  // Channel stats for display
  const channelStats = {
    qr: { clicks: stats.totalClicks, reviewsGenerated: qrLinks.length, conversionRate: qrLinks.length > 0 ? 0.15 : 0 },
    nfc: { clicks: 0, reviewsGenerated: nfcLinks.length, conversionRate: nfcLinks.length > 0 ? 0.12 : 0 },
    sms: { sent: 0, clicks: 0, reviewsGenerated: 0, conversionRate: 0 },
    email: { sent: 0, clicks: 0, reviewsGenerated: 0, conversionRate: 0 },
    doctolib: { clicks: 0, reviewsGenerated: 0, conversionRate: 0 },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Collecte d&apos;avis</h1>
        <p className="text-muted-foreground mt-1">
          Configurez vos canaux de collecte pour obtenir plus d&apos;avis
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">
            ✕
          </Button>
        </div>
      )}

      {/* Channel Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { type: 'qr', icon: QrCode, label: 'QR Code', color: 'text-blue-600', count: qrLinks.length },
          { type: 'nfc', icon: Nfc, label: 'NFC', color: 'text-purple-600', count: nfcLinks.length },
          { type: 'sms', icon: MessageSquare, label: 'SMS', color: 'text-green-600', count: 0 },
          { type: 'email', icon: Mail, label: 'Email', color: 'text-orange-600', count: 0 },
          { type: 'doctolib', icon: Stethoscope, label: 'Doctolib', color: 'text-cyan-600', count: 0 },
        ].map((channel) => {
          const stat = channelStats[channel.type as keyof typeof channelStats]
          return (
            <Card key={channel.type}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${channel.color}`}>
                    <channel.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{channel.label}</p>
                    <p className="text-lg font-bold">
                      {channel.count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stat?.clicks || 0} clics
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Widget & Badge Section */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-purple-500/5">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Widget & Badge pour votre site</h3>
                <p className="text-sm text-muted-foreground">
                  Affichez vos avis directement sur votre site web
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <strong>{embedStats.impressions}</strong> vues (7j)
                  </span>
                  <span className="flex items-center gap-1">
                    <MousePointer className="h-4 w-4 text-muted-foreground" />
                    <strong>{embedStats.clicks}</strong> clics (7j)
                  </span>
                </div>
              </div>
              <Button onClick={() => setWidgetManagerOpen(true)} className="gap-2">
                <Settings className="h-4 w-4" />
                Configurer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="qr" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="qr" className="gap-1">
            <QrCode className="h-4 w-4" /> QR
          </TabsTrigger>
          <TabsTrigger value="nfc" className="gap-1">
            <Nfc className="h-4 w-4" /> NFC
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1">
            <MessageSquare className="h-4 w-4" /> SMS
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1">
            <Mail className="h-4 w-4" /> Email
          </TabsTrigger>
          <TabsTrigger value="doctolib" className="gap-1">
            <Stethoscope className="h-4 w-4" /> Doctolib
          </TabsTrigger>
        </TabsList>

        {/* QR Code Tab - REAL DATA */}
        <TabsContent value="qr">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Vos QR Codes</CardTitle>
                  <CardDescription>
                    QR codes pointant vers votre page de collecte
                  </CardDescription>
                </div>
                <Button onClick={() => openCreateDialog('qr')} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Nouveau QR
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingShortlinks ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : qrLinks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <QrCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun QR code créé</p>
                    <Button onClick={() => openCreateDialog('qr')} variant="outline" className="mt-4">
                      Créer votre premier QR code
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {qrLinks.map((link) => (
                      <div
                        key={link.code}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <QrCode className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{link.label}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {link.shortUrl}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">{link.clicks} clics</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(link.createdAt).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => downloadQr(link.code, 'png')} title="Télécharger PNG">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => copyUrl(link.shortUrl)} title="Copier l'URL">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => setDeleteTarget(link)} title="Supprimer">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance QR Code</CardTitle>
                <CardDescription>Statistiques de vos QR codes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'QR codes actifs', value: qrLinks.length, icon: QrCode },
                    { label: 'Total scans', value: stats.totalClicks, icon: Eye },
                    { label: 'Clics moyen/QR', value: qrLinks.length > 0 ? Math.round(stats.totalClicks / qrLinks.length) : 0, icon: TrendingUp },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <stat.icon className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm">{stat.label}</span>
                      </div>
                      <span className="font-semibold">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* NFC Tab - REAL DATA */}
        <TabsContent value="nfc">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tags NFC</CardTitle>
                <CardDescription>Gérez vos tags NFC de collecte</CardDescription>
              </div>
              <Button onClick={() => openCreateDialog('nfc')} className="gap-1">
                <Plus className="h-4 w-4" />
                Nouveau tag
              </Button>
            </CardHeader>
            <CardContent>
              {loadingShortlinks ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : nfcLinks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Nfc className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Aucun tag NFC configuré</p>
                  <Button onClick={() => openCreateDialog('nfc')} variant="outline" className="mt-4">
                    Créer votre premier lien NFC
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {nfcLinks.map((link) => (
                    <div
                      key={link.code}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Nfc className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium">{link.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {link.shortUrl}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{link.clicks} scans</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(link.createdAt).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <Badge variant="success">Actif</Badge>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setSelectedShortlink(link)
                              setNfcInstructionsOpen(true)
                            }}
                            title="Instructions NFC"
                          >
                            <Smartphone className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => copyUrl(link.shortUrl)} title="Copier l'URL">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600" onClick={() => setDeleteTarget(link)} title="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Tab - REAL DATA */}
        <TabsContent value="sms">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Aperçu SMS avec validation */}
            <SmsPreview
              shortUrl={primaryShortlink?.shortUrl || 'rpt.ly/votre-lien'}
              phoneNumber={currentLocation?.name ? `Client de ${currentLocation.name}` : undefined}
              onValidationChange={setSmsValid}
              readOnly={false}
              showDefault={true}
            />

            {/* Configuration et stats */}
            <div className="space-y-6">
              {/* Explication du lien de collecte */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    Qu&apos;est-ce que le lien de collecte ?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Le <strong>lien de collecte</strong> est une URL courte unique générée pour votre établissement. 
                    Quand un patient clique dessus, il accède à une page lui permettant de laisser un avis sur Google.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ <strong>Unique à votre établissement</strong> - les avis sont automatiquement rattachés à vous</li>
                    <li>✓ <strong>Court et simple</strong> - facile à retenir et à partager</li>
                    <li>✓ <strong>Tracking intégré</strong> - suivez les clics et conversions</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Lien court */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Votre lien de collecte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input 
                      value={primaryShortlink?.shortUrl || 'Créez un QR code pour obtenir un lien'} 
                      readOnly 
                      className="font-mono" 
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      disabled={!primaryShortlink}
                      onClick={() => primaryShortlink && copyUrl(primaryShortlink.shortUrl)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {!primaryShortlink && (
                    <p className="text-xs text-amber-600">
                      ⚠️ Créez d&apos;abord un QR code dans l&apos;onglet QR pour obtenir un lien de collecte
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Performance */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Performance SMS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: 'SMS envoyés', value: channelStats.sms?.sent || 0 },
                      { label: 'Clics', value: channelStats.sms?.clicks || 0 },
                      { label: 'Avis générés', value: channelStats.sms?.reviewsGenerated || 0 },
                      { label: 'Taux conversion', value: formatPercent(channelStats.sms?.conversionRate || 0) },
                    ].map((stat) => (
                      <div key={stat.label} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{stat.label}</span>
                        <span className="font-semibold">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Info encodage */}
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Info className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-amber-900">
                        Personnalisation du message
                      </h4>
                      <p className="text-sm text-amber-800">
                        Vous pouvez modifier le message SMS directement dans l&apos;aperçu à gauche. 
                        Respectez la limite de <strong>160 caractères</strong>.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Email Tab - EDITABLE */}
        <TabsContent value="email">
          <EmailPreview 
            cabinetName={(clientOrg as any)?.name || 'notre cabinet'}
            shortUrl={primaryShortlink?.shortUrl}
          />
        </TabsContent>

        {/* Doctolib Tab */}
        <TabsContent value="doctolib">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-cyan-600" />
                Canal Doctolib
              </CardTitle>
              <CardDescription>
                Collectez des avis après les consultations via Doctolib
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                <p className="text-sm text-cyan-800">
                  <strong>Note :</strong> Ce canal utilise vos QR codes / liens créés ci-dessus.
                  Affichez-les en salle d&apos;attente ou communiquez-les post-consultation.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">QR Code Post-Consultation</p>
                  {qrLinks.length > 0 ? (
                    <>
                      <div className="w-32 h-32 bg-white rounded-lg mx-auto flex items-center justify-center border">
                        <QrCode className="h-20 w-20 text-cyan-600" />
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full mt-3 gap-1"
                        onClick={() => downloadQr(qrLinks[0].code, 'png')}
                      >
                        <Download className="h-4 w-4" />
                        Télécharger
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">Créez un QR code dans l&apos;onglet QR</p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">Instructions pour le cabinet</p>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>• Affichez le QR en salle d&apos;attente</li>
                    <li>• Proposez-le après chaque consultation</li>
                    <li>• Intégrez le lien dans vos SMS de rappel</li>
                  </ul>
                  {primaryShortlink && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">Lien direct</p>
                      <div className="flex gap-2">
                        <Input value={primaryShortlink.shortUrl} readOnly className="text-xs" />
                        <Button variant="outline" size="icon" onClick={() => copyUrl(primaryShortlink.shortUrl)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => !newShortlink && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newShortlink 
                ? `✅ ${createType === 'qr' ? 'QR Code' : 'Lien NFC'} créé !`
                : `Nouveau ${createType === 'qr' ? 'QR Code' : 'lien NFC'}`}
            </DialogTitle>
            <DialogDescription>
              {newShortlink 
                ? 'Votre lien court est prêt à utiliser.'
                : 'Configurez votre nouveau lien court.'}
            </DialogDescription>
          </DialogHeader>

          {!newShortlink ? (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Nom (optionnel)</label>
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Ex: Comptoir accueil, Salle d'attente..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">URL de destination *</label>
                  <Input
                    type="url"
                    value={newTargetUrl}
                    onChange={(e) => setNewTargetUrl(e.target.value)}
                    placeholder="https://g.page/r/votre-lien/review"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {newTargetUrl && (clientOrg as any)?.options?.googleReviewUrl === newTargetUrl
                      ? '✅ Pré-rempli avec votre URL Google Review'
                      : "L'URL vers laquelle les utilisateurs seront redirigés"}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreateDialog}>
                  Annuler
                </Button>
                <Button onClick={handleCreate} disabled={creating || !newTargetUrl}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Créer
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="bg-slate-900 text-white rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-1">URL courte</p>
                  <p className="font-mono text-lg text-amber-300 break-all">
                    {newShortlink.shortUrl}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    className="flex-1"
                    variant={copied ? 'default' : 'outline'}
                    onClick={() => copyUrl(newShortlink.shortUrl)}
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copier l&apos;URL
                      </>
                    )}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={newShortlink.shortUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Tester
                    </a>
                  </Button>
                </div>
                
                {createType === 'qr' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground text-center">
                      Téléchargez votre QR code :
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" onClick={() => downloadQr(newShortlink.code, 'png')}>
                        <Download className="h-4 w-4 mr-2" />
                        PNG
                      </Button>
                      <Button variant="outline" onClick={() => downloadQr(newShortlink.code, 'svg')}>
                        <Download className="h-4 w-4 mr-2" />
                        SVG
                      </Button>
                    </div>
                  </div>
                )}
                
                {createType === 'nfc' && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm font-medium text-purple-900 mb-2">Instructions NFC</p>
                    <ol className="text-sm text-purple-800 space-y-1 list-decimal list-inside">
                      <li>Téléchargez NFC Tools (iOS/Android)</li>
                      <li>Choisissez &quot;Écrire&quot; → &quot;Ajouter un enregistrement&quot;</li>
                      <li>Sélectionnez &quot;URL&quot;</li>
                      <li>Collez : <code className="bg-purple-100 px-1 rounded">{newShortlink.shortUrl}</code></li>
                      <li>Approchez votre tag NFC et écrivez</li>
                    </ol>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog}>
                  Fermer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce shortlink ?</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Le lien &quot;{deleteTarget?.label}&quot; ne fonctionnera plus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NFC Instructions Dialog */}
      <Dialog open={nfcInstructionsOpen} onOpenChange={setNfcInstructionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment programmer votre tag NFC</DialogTitle>
            <DialogDescription>
              Suivez ces étapes pour configurer votre tag NFC
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm font-medium text-purple-900 mb-2">URL à programmer</p>
              <code className="text-sm bg-purple-100 px-2 py-1 rounded block break-all">
                {selectedShortlink?.shortUrl}
              </code>
            </div>
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Téléchargez l&apos;app <strong>NFC Tools</strong> (gratuite sur iOS/Android)</li>
              <li>Ouvrez l&apos;app et allez dans &quot;Écrire&quot;</li>
              <li>Appuyez sur &quot;Ajouter un enregistrement&quot;</li>
              <li>Sélectionnez &quot;URL/URI&quot;</li>
              <li>Collez l&apos;URL ci-dessus</li>
              <li>Appuyez sur &quot;Écrire&quot; et approchez votre tag NFC</li>
            </ol>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => selectedShortlink && copyUrl(selectedShortlink.shortUrl)}>
              <Copy className="h-4 w-4 mr-2" />
              Copier l&apos;URL
            </Button>
            <Button onClick={() => setNfcInstructionsOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Widget Manager Modal */}
      {currentLocation && (
        <WebsiteWidgetManager
          locationId={currentLocation.id}
          locationName={currentLocation.name}
          open={widgetManagerOpen}
          onOpenChange={setWidgetManagerOpen}
        />
      )}
    </div>
  )
}
