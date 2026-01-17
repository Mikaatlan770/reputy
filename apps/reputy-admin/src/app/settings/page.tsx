'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import {
  Building2,
  Link2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Palette,
  FileText,
  CreditCard,
  Sparkles,
  Zap,
  Crown,
  Info,
  Star,
  ExternalLink,
  Save,
  Loader2,
  Globe,
  Code,
  Copy,
  Filter,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { WebsiteWidgetManager } from '@/components/embed'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'dev-token'

export default function SettingsPage() {
  const { currentLocation, orgSettings } = useAppStore()
  
  // État pour les settings Reputy
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [cabinetName, setCabinetName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)

  // État pour le routing des avis
  const [reviewRouting, setReviewRouting] = useState({
    enabled: true,
    threshold: 4,
    publicTarget: 'DOCTOLIB' as 'DOCTOLIB' | 'GOOGLE'
  })
  const [loadingRouting, setLoadingRouting] = useState(true)
  const [savingRouting, setSavingRouting] = useState(false)
  const [routingSaveSuccess, setRoutingSaveSuccess] = useState(false)

  // Charger les settings au montage
  useEffect(() => {
    fetchSettings()
    fetchReviewRouting()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      })
      if (response.ok) {
        const data = await response.json()
        setGoogleReviewUrl(data.googleReviewUrl || '')
        setCabinetName(data.cabinetName || '')
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoadingSettings(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setSaveSuccess(false)
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify({ googleReviewUrl, cabinetName }),
      })
      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const fetchReviewRouting = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings/review-routing`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      })
      if (response.ok) {
        const data = await response.json()
        setReviewRouting({
          enabled: data.enabled ?? true,
          threshold: data.threshold ?? 4,
          publicTarget: data.publicTarget || 'DOCTOLIB'
        })
      }
    } catch (err) {
      console.error('Failed to load review routing:', err)
    } finally {
      setLoadingRouting(false)
    }
  }

  const saveReviewRouting = async () => {
    setSavingRouting(true)
    setRoutingSaveSuccess(false)
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings/review-routing`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(reviewRouting),
      })
      if (response.ok) {
        setRoutingSaveSuccess(true)
        setTimeout(() => setRoutingSaveSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Failed to save review routing:', err)
    } finally {
      setSavingRouting(false)
    }
  }

  // Calcul du pourcentage de quota IA utilisé
  const aiQuotaPercent = orgSettings?.aiQuota
    ? Math.round((orgSettings.aiQuota.usedThisMonth / orgSettings.aiQuota.monthlyLimit) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-muted-foreground mt-1">
          Configurez votre compte et vos établissements
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Lien Google Review - NOUVEAU */}
        <Card className="lg:col-span-2 border-amber-200 bg-gradient-to-br from-amber-50/50 to-yellow-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Collecte d'avis Google
            </CardTitle>
            <CardDescription>
              Configurez le lien vers lequel vos patients satisfaits seront redirigés
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Nom du cabinet</label>
                <Input
                  value={cabinetName}
                  onChange={(e) => setCabinetName(e.target.value)}
                  placeholder="Ex: Cabinet Dr. Atlan"
                  className="mt-1"
                  disabled={loadingSettings}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Affiché sur la page de notation patient
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Lien Google Review</label>
                <Input
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/VOTRE_ID/review"
                  className="mt-1"
                  disabled={loadingSettings}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Les patients 4-5★ seront redirigés vers ce lien
                </p>
              </div>
            </div>

            {/* Info box */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Comment trouver votre lien Google Review ?</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Allez sur <a href="https://business.google.com" target="_blank" rel="noopener" className="underline">Google Business Profile</a></li>
                    <li>Cliquez sur &quot;Demander des avis&quot;</li>
                    <li>Copiez le lien qui apparaît</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button 
                onClick={saveSettings} 
                disabled={saving || loadingSettings}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Enregistrer
              </Button>
              {saveSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Enregistré !
                </span>
              )}
              {googleReviewUrl && (
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1 ml-auto"
                >
                  Tester le lien
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Review Routing - NOUVEAU */}
        <Card className="lg:col-span-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-5 w-5 text-blue-600" />
              Routing des avis
            </CardTitle>
            <CardDescription>
              Configurez le seuil pour rediriger les patients satisfaits vers les avis publics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Toggle activation */}
            <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
              <div>
                <p className="font-medium">Activer le routing</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {reviewRouting.enabled 
                    ? 'Les patients satisfaits seront invités à laisser un avis public'
                    : 'Tous les avis restent en feedback interne'}
                </p>
              </div>
              <button
                onClick={() => setReviewRouting({ ...reviewRouting, enabled: !reviewRouting.enabled })}
                disabled={loadingRouting}
                className="relative"
              >
                {reviewRouting.enabled ? (
                  <ToggleRight className="h-8 w-8 text-blue-600" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-gray-400" />
                )}
              </button>
            </div>

            {reviewRouting.enabled && (
              <>
                {/* Threshold slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Seuil minimum</label>
                    <span className="text-sm font-bold text-blue-600">
                      {reviewRouting.threshold}+ étoiles
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">1★</span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={reviewRouting.threshold}
                      onChange={(e) => setReviewRouting({ ...reviewRouting, threshold: parseInt(e.target.value) })}
                      disabled={loadingRouting}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-xs text-muted-foreground">5★</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Les patients avec {reviewRouting.threshold}★ ou plus seront redirigés vers un avis public
                  </p>
                </div>

                {/* Target selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plateforme cible</label>
                  <div className="flex gap-3">
                    {(['DOCTOLIB', 'GOOGLE'] as const).map((target) => (
                      <button
                        key={target}
                        onClick={() => setReviewRouting({ ...reviewRouting, publicTarget: target })}
                        disabled={loadingRouting}
                        className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                          reviewRouting.publicTarget === target
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <p className="font-medium">{target === 'DOCTOLIB' ? 'Doctolib' : 'Google'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {target === 'DOCTOLIB' ? 'Avis Doctolib (bientôt)' : 'Google Business'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-1">Comportement actuel</p>
                      <ul className="text-xs space-y-1">
                        <li>• Note ≥ {reviewRouting.threshold}★ → Redirection vers {reviewRouting.publicTarget === 'GOOGLE' ? 'Google' : 'Doctolib'}</li>
                        <li>• Note &lt; {reviewRouting.threshold}★ → Feedback interne uniquement</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button 
                onClick={saveReviewRouting} 
                disabled={savingRouting || loadingRouting}
                className="gap-2"
              >
                {savingRouting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Enregistrer le routing
              </Button>
              {routingSaveSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Enregistré !
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Google Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Connexion Google Business
            </CardTitle>
            <CardDescription>
              Connectez votre fiche Google pour synchroniser les avis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentLocation?.googleSessionValid ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">Connecté</p>
                  <p className="text-xs text-green-700">Session Google active</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">Session expirée</p>
                  <p className="text-xs text-amber-700">
                    Reconnectez-vous pour synchroniser les avis
                  </p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button className="flex-1 gap-1">
                <RefreshCw className="h-4 w-4" />
                {currentLocation?.googleSessionValid ? 'Actualiser' : 'Reconnecter'}
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium">Lien de collecte Google</label>
              <Input
                value={currentLocation?.reviewLink || ''}
                readOnly
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Establishment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Informations établissement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input value={currentLocation?.name || ''} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Adresse</label>
              <Input value={currentLocation?.address || ''} className="mt-1" />
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Mode Santé</p>
                <p className="text-xs text-muted-foreground">
                  Réponses adaptées au secteur médical
                </p>
              </div>
              <Badge variant={currentLocation?.healthMode ? 'success' : 'secondary'}>
                {currentLocation?.healthMode ? 'Activé' : 'Désactivé'}
              </Badge>
            </div>
            <Button>Enregistrer les modifications</Button>
          </CardContent>
        </Card>

        {/* Assistant IA - NOUVELLE SECTION */}
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-purple-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Assistant IA de réponse
              {orgSettings?.aiEnabled ? (
                <Badge className="bg-violet-600 ml-2">Actif</Badge>
              ) : (
                <Badge variant="secondary" className="ml-2">
                  <Crown className="h-3 w-3 mr-1 text-amber-500" />
                  Plan Pro
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Générez des suggestions de réponse intelligentes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orgSettings?.aiEnabled ? (
              <>
                {/* IA Activée */}
                <div className="flex items-center gap-3 p-4 bg-violet-100/50 rounded-lg border border-violet-200">
                  <CheckCircle className="h-5 w-5 text-violet-600" />
                  <div>
                    <p className="font-medium text-violet-900">Assistant IA activé</p>
                    <p className="text-xs text-violet-700">
                      Générez des suggestions de réponse personnalisées
                    </p>
                  </div>
                </div>

                {/* Quota IA */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Zap className="h-4 w-4 text-violet-600" />
                      Suggestions IA ce mois
                    </span>
                    <span className="font-medium">
                      {orgSettings.aiQuota.usedThisMonth} / {orgSettings.aiQuota.monthlyLimit}
                    </span>
                  </div>
                  <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${aiQuotaPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Réinitialisation le {new Date(orgSettings.aiQuota.resetDate).toLocaleDateString('fr-FR')}
                  </p>
                </div>

                {/* Info Mode Santé */}
                {currentLocation?.healthMode && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Mode Santé actif :</strong> Les suggestions IA respectent automatiquement
                      les règles déontologiques et n&apos;évoquent jamais d&apos;informations médicales.
                    </span>
                  </div>
                )}

                {/* Options */}
                <div className="pt-2">
                  <Button variant="outline" className="w-full">
                    Gérer les consignes par défaut
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* IA Non activée - Paywall */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    {[
                      'Générez 3 suggestions de réponse en 1 clic',
                      'Choisissez le ton : professionnel, chaleureux, court...',
                      'Mode Santé intégré (respect déontologie)',
                      '100 suggestions / mois incluses',
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-gradient-to-r from-violet-100 to-purple-100 rounded-xl border border-violet-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-violet-900">Plan Pro</span>
                      <Badge className="bg-violet-600">Recommandé</Badge>
                    </div>
                    <p className="text-xl font-bold text-violet-900">
                      59€<span className="text-sm font-normal text-violet-600">/mois HT</span>
                    </p>
                  </div>

                  <Button className="w-full gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                    <Crown className="h-4 w-4" />
                    Passer au Plan Pro
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Plan & Quotas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div>
                <p className="font-semibold text-primary">
                  Plan {orgSettings?.plan === 'pro' ? 'Pro' : orgSettings?.plan === 'starter' ? 'Starter' : 'Gratuit'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {orgSettings?.plan === 'pro' ? '59€/mois HT' : orgSettings?.plan === 'starter' ? '29€/mois HT' : 'Gratuit'}
                </p>
              </div>
              <Badge variant="default">Actif</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Avis traités</span>
                <span className="font-medium">1,523 / 2,000</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-primary rounded-full" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>SMS envoyés</span>
                <span className="font-medium">89 / 200</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-[44%] bg-green-500 rounded-full" />
              </div>
            </div>
            <Button variant="outline" className="w-full">
              Gérer l&apos;abonnement
            </Button>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Branding page collecte
            </CardTitle>
            <CardDescription>
              Personnalisez l&apos;apparence de votre page de collecte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Couleur principale</label>
              <div className="flex gap-2 mt-1">
                <Input type="color" className="w-16 h-10 p-1" defaultValue="#3B82F6" />
                <Input value="#3B82F6" className="flex-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Slogan</label>
              <Input
                placeholder="Votre avis compte pour nous !"
                className="mt-1"
              />
            </div>
            <Button variant="outline">Prévisualiser</Button>
          </CardContent>
        </Card>
      </div>

      {/* Widget & Badge */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Widget & Badge site web
          </CardTitle>
          <CardDescription>
            Affichez vos avis directement sur votre site web
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Code className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Widget Liste d'avis</p>
                  <p className="text-xs text-muted-foreground">
                    Carrousel ou liste complète
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Affichez vos meilleurs avis avec les étoiles et commentaires anonymisés.
              </p>
              <Button 
                variant="outline" 
                className="w-full gap-1"
                onClick={() => setWidgetManagerOpen(true)}
              >
                <Copy className="h-4 w-4" />
                Obtenir le code
              </Button>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Star className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Badge Score</p>
                  <p className="text-xs text-muted-foreground">
                    Note moyenne compacte
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Badge compact avec note moyenne et nombre d'avis.
              </p>
              <Button 
                variant="outline" 
                className="w-full gap-1"
                onClick={() => setWidgetManagerOpen(true)}
              >
                <Copy className="h-4 w-4" />
                Obtenir le code
              </Button>
            </div>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>SEO-friendly:</strong> Les avis sont intégrés en HTML pur (pas d'iframe), 
              lisibles par les moteurs de recherche. Une page publique est aussi générée automatiquement.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Response Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Templates de réponse
          </CardTitle>
          <CardDescription>
            Gérez vos modèles de réponse prédéfinis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {['Professionnel', 'Chaleureux', 'Court'].map((tone) => (
              <div key={tone} className="p-4 bg-muted/50 rounded-lg">
                <p className="font-medium mb-2">{tone}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {tone === 'Professionnel' &&
                    "Merci pour votre retour. Nous sommes ravis que votre expérience ait été positive..."}
                  {tone === 'Chaleureux' &&
                    "Un grand merci pour ce beau témoignage ! Votre satisfaction est notre plus belle récompense..."}
                  {tone === 'Court' && 'Merci pour votre avis !'}
                </p>
                <Button variant="ghost" size="sm" className="mt-2">
                  Modifier
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
