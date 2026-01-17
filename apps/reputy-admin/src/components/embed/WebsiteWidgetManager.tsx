'use client'

import { useState, useEffect } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Code,
  Settings,
  BarChart3,
  Layers,
  Copy,
  Check,
  Star,
  Eye,
  MousePointer,
  Percent,
  RefreshCw,
  Globe,
  Smartphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { 
  EmbedConfigPublic, 
  EmbedMode, 
  EmbedSort,
  EmbedStats 
} from '@/lib/embed/types'
import { generateWidgetCode, generateBadgeCode } from '@/lib/embed/utils'

interface WebsiteWidgetManagerProps {
  locationId: string
  locationName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  // Pour le mode manuel: liste des avis disponibles
  availableReviews?: Array<{
    id: string
    author: string
    rating: number
    content: string
    date: string
    source: 'google' | 'reputy'
  }>
}

const API_BASE = typeof window !== 'undefined' ? window.location.origin : ''

export function WebsiteWidgetManager({
  locationId,
  locationName = 'Mon établissement',
  open,
  onOpenChange,
  availableReviews = [],
}: WebsiteWidgetManagerProps) {
  const [config, setConfig] = useState<EmbedConfigPublic | null>(null)
  const [stats7d, setStats7d] = useState<EmbedStats | null>(null)
  const [stats30d, setStats30d] = useState<EmbedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<'widget' | 'badge' | null>(null)

  // Charger la config
  useEffect(() => {
    if (open && locationId) {
      loadConfig()
      loadStats()
    }
  }, [open, locationId])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/embed/config?locationId=${locationId}`)
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
      }
    } catch (err) {
      console.error('Erreur chargement config:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const [res7d, res30d] = await Promise.all([
        fetch(`/api/embed/stats?locationId=${locationId}&period=7d`),
        fetch(`/api/embed/stats?locationId=${locationId}&period=30d`),
      ])
      if (res7d.ok) setStats7d(await res7d.json())
      if (res30d.ok) setStats30d(await res30d.json())
    } catch (err) {
      console.error('Erreur chargement stats:', err)
    }
  }

  const saveConfig = async (patch: Partial<EmbedConfigPublic>) => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/embed/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, patch }),
      })
      if (res.ok) {
        const data = await res.json()
        setConfig(data.config)
      }
    } catch (err) {
      console.error('Erreur sauvegarde:', err)
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = async (text: string, type: 'widget' | 'badge') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Erreur copie:', err)
    }
  }

  const toggleReviewSelection = async (reviewId: string) => {
    if (!config) return
    const isSelected = config.manualSelectedReviewIds.includes(reviewId)
    const newIds = isSelected
      ? config.manualSelectedReviewIds.filter(id => id !== reviewId)
      : [...config.manualSelectedReviewIds, reviewId]
    await saveConfig({ manualSelectedReviewIds: newIds } as any)
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Widget & Badge pour votre site
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Chargement...</p>
          </div>
        ) : !config ? (
          <div className="py-12 text-center text-muted-foreground">
            Erreur de chargement
          </div>
        ) : (
          <Tabs defaultValue="widget" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="widget" className="gap-1">
                <Layers className="h-4 w-4" />
                Widget
              </TabsTrigger>
              <TabsTrigger value="options" className="gap-1">
                <Settings className="h-4 w-4" />
                Options
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-1">
                <Code className="h-4 w-4" />
                Code
              </TabsTrigger>
              <TabsTrigger value="stats" className="gap-1">
                <BarChart3 className="h-4 w-4" />
                Stats
              </TabsTrigger>
            </TabsList>

            {/* Onglet Widget - Mode de sélection */}
            <TabsContent value="widget" className="flex-1 overflow-y-auto space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Mode de sélection</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <Card
                      className={cn(
                        'cursor-pointer transition-all',
                        config.mode === 'AUTO' && 'ring-2 ring-primary'
                      )}
                      onClick={() => saveConfig({ mode: 'AUTO' } as any)}
                    >
                      <CardContent className="p-4">
                        <div className="font-medium flex items-center gap-2">
                          <input
                            type="radio"
                            checked={config.mode === 'AUTO'}
                            readOnly
                            className="text-primary"
                          />
                          AUTO (recommandé)
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Affiche automatiquement les meilleurs avis selon vos critères
                        </p>
                      </CardContent>
                    </Card>
                    <Card
                      className={cn(
                        'cursor-pointer transition-all',
                        config.mode === 'MANUAL' && 'ring-2 ring-primary'
                      )}
                      onClick={() => saveConfig({ mode: 'MANUAL' } as any)}
                    >
                      <CardContent className="p-4">
                        <div className="font-medium flex items-center gap-2">
                          <input
                            type="radio"
                            checked={config.mode === 'MANUAL'}
                            readOnly
                            className="text-primary"
                          />
                          MANUEL
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Choisissez exactement quels avis afficher
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Règles AUTO */}
                {config.mode === 'AUTO' && (
                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium">Règles automatiques</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Note minimum</label>
                        <Select
                          value={config.autoRules.minRating.toString()}
                          onValueChange={(v) => saveConfig({ 
                            autoRules: { ...config.autoRules, minRating: parseInt(v) } 
                          } as any)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 étoiles uniquement</SelectItem>
                            <SelectItem value="4">4+ étoiles</SelectItem>
                            <SelectItem value="3">3+ étoiles</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Tri</label>
                        <Select
                          value={config.autoRules.sort}
                          onValueChange={(v) => saveConfig({ 
                            autoRules: { ...config.autoRules, sort: v as EmbedSort } 
                          } as any)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RECENT">Plus récents</SelectItem>
                            <SelectItem value="BEST">Meilleurs d'abord</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Nombre max d'avis</label>
                        <Select
                          value={config.autoRules.maxItems.toString()}
                          onValueChange={(v) => saveConfig({ 
                            autoRules: { ...config.autoRules, maxItems: parseInt(v) } 
                          } as any)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 avis</SelectItem>
                            <SelectItem value="10">10 avis</SelectItem>
                            <SelectItem value="15">15 avis</SelectItem>
                            <SelectItem value="20">20 avis</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="requireText"
                          checked={config.autoRules.requireText}
                          onChange={(e) => saveConfig({ 
                            autoRules: { ...config.autoRules, requireText: e.target.checked } 
                          } as any)}
                          className="rounded"
                        />
                        <label htmlFor="requireText" className="text-sm">
                          Exiger un commentaire
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sélection MANUELLE */}
                {config.mode === 'MANUAL' && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Sélectionnez les avis à afficher</h4>
                    <p className="text-xs text-muted-foreground">
                      {config.manualSelectedReviewIds.length} avis sélectionné(s)
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2">
                      {availableReviews.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucun avis disponible. Gérez les avis depuis la page Avis ou Feedbacks.
                        </p>
                      ) : (
                        availableReviews.map((review) => (
                          <div
                            key={review.id}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                              config.manualSelectedReviewIds.includes(review.id)
                                ? 'bg-primary/10 border border-primary/30'
                                : 'bg-muted/50 hover:bg-muted'
                            )}
                            onClick={() => toggleReviewSelection(review.id)}
                          >
                            <input
                              type="checkbox"
                              checked={config.manualSelectedReviewIds.includes(review.id)}
                              readOnly
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{review.author}</span>
                                <div className="flex">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className={cn(
                                        'h-3 w-3',
                                        s <= review.rating
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-gray-300'
                                      )}
                                    />
                                  ))}
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                  {review.source === 'google' ? 'Google' : 'Reputy'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {review.content || 'Aucun commentaire'}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Onglet Options */}
            <TabsContent value="options" className="flex-1 overflow-y-auto space-y-4 mt-4">
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>🔒 Anonymisation activée</strong> - Les noms complets sont toujours 
                    convertis en initiales (ex: "S. D." pour Sophie Durand) pour protéger 
                    la vie privée des clients.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.displayOptions.showStars}
                      onChange={(e) => saveConfig({ 
                        displayOptions: { ...config.displayOptions, showStars: e.target.checked } 
                      } as any)}
                      className="rounded"
                    />
                    <span>Afficher les étoiles</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.displayOptions.showDate}
                      onChange={(e) => saveConfig({ 
                        displayOptions: { ...config.displayOptions, showDate: e.target.checked } 
                      } as any)}
                      className="rounded"
                    />
                    <span>Afficher la date</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.displayOptions.showSource}
                      onChange={(e) => saveConfig({ 
                        displayOptions: { ...config.displayOptions, showSource: e.target.checked } 
                      } as any)}
                      className="rounded"
                    />
                    <span>Afficher la source (Google / Reputy)</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.trackingEnabled}
                      onChange={(e) => saveConfig({ trackingEnabled: e.target.checked } as any)}
                      className="rounded"
                    />
                    <span>Activer le tracking (impressions/clics)</span>
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* Onglet Code */}
            <TabsContent value="code" className="flex-1 overflow-y-auto space-y-6 mt-4">
              {/* Widget */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Code Widget (liste d'avis)</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(
                      generateWidgetCode(config.publicKey, API_BASE),
                      'widget'
                    )}
                    className="gap-1"
                  >
                    {copied === 'widget' ? (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copier
                      </>
                    )}
                  </Button>
                </div>
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto">
                  {generateWidgetCode(config.publicKey, API_BASE)}
                </pre>
              </div>

              {/* Badge */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Code Badge (score compact)</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(
                      generateBadgeCode(config.publicKey, API_BASE),
                      'badge'
                    )}
                    className="gap-1"
                  >
                    {copied === 'badge' ? (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copier
                      </>
                    )}
                  </Button>
                </div>
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto">
                  {generateBadgeCode(config.publicKey, API_BASE)}
                </pre>
              </div>

              {/* Guide d'installation */}
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">📚 Guide d'installation</h4>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p><strong>WordPress:</strong> Collez le code dans un bloc HTML ou dans le fichier footer.php de votre thème.</p>
                  <p><strong>Wix:</strong> Ajoutez un élément "Embed" et collez le code.</p>
                  <p><strong>Shopify:</strong> Collez le code dans theme.liquid avant &lt;/body&gt;.</p>
                </div>
              </div>
            </TabsContent>

            {/* Onglet Stats */}
            <TabsContent value="stats" className="flex-1 overflow-y-auto space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Eye className="h-6 w-6 mx-auto text-blue-500 mb-2" />
                    <p className="text-2xl font-bold">{stats7d?.impressions || 0}</p>
                    <p className="text-xs text-muted-foreground">Impressions (7j)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <MousePointer className="h-6 w-6 mx-auto text-green-500 mb-2" />
                    <p className="text-2xl font-bold">{stats7d?.clicks || 0}</p>
                    <p className="text-xs text-muted-foreground">Clics (7j)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Percent className="h-6 w-6 mx-auto text-purple-500 mb-2" />
                    <p className="text-2xl font-bold">{stats7d?.ctr || 0}%</p>
                    <p className="text-xs text-muted-foreground">CTR (7j)</p>
                  </CardContent>
                </Card>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">30 derniers jours</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-semibold">{stats30d?.impressions || 0}</p>
                    <p className="text-xs text-muted-foreground">Impressions</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{stats30d?.clicks || 0}</p>
                    <p className="text-xs text-muted-foreground">Clics</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{stats30d?.ctr || 0}%</p>
                    <p className="text-xs text-muted-foreground">CTR</p>
                  </div>
                </div>
              </div>

              <Button variant="outline" onClick={loadStats} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Actualiser les stats
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {saving && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
