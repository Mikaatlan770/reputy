'use client'

import { useState, useEffect } from 'react'
import { getSecureToken } from '@/lib/auth/secure-token'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
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
  MapPin,
} from 'lucide-react'
import { IS_IOS_CAPACITOR } from '@/lib/constants'
import { WebsiteWidgetManager } from '@/components/embed'
import { AddressAutocomplete } from '@/components/address-autocomplete'
import { useConfigureCompetitors } from '@/lib/competitors/use-competitors'
import type { PlaceGeometry } from '@/lib/competitors/use-competitors'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'

// Plan display labels — maps backend plan slugs to user-friendly names
const planLabels: Record<string, string> = {
  health_bronze: 'Bronze',
  health_basic: 'Bronze',   // Legacy alias
  health_argent: 'Argent',
  health_platinum: 'Platinum',
  // Legacy aliases / rétro-compat
  health_or: 'Platinum',    // Ancien "Or" → Platinum
  health_silver: 'Argent',
  health_gold: 'Platinum',  // Ancien "Gold" → Platinum
  starter: 'Bronze',
  pro: 'Argent',
  free: 'Gratuit',
}

function getPlanLabel(plan?: string): string {
  if (!plan) return 'Gratuit'
  return planLabels[plan] || plan.charAt(0).toUpperCase() + plan.slice(1)
}

// Token auth via secure-token (clé correcte: reputy_client_token_prod)
const getAuthToken = async () => {
  return await getSecureToken()
}

interface GoogleOAuthCallbacks {
  setConnecting: (v: boolean) => void
  setError: (msg: string | null) => void
  refreshStatus: () => Promise<void>
}

async function performGoogleOAuth(token: string, callbacks: GoogleOAuthCallbacks) {
  callbacks.setConnecting(true)
  callbacks.setError(null)

  try {
    const response = await fetch(`${BACKEND_URL}/client/google/auth-url`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json()

    if (!data.ok || !data.authUrl) {
      callbacks.setError(data.message || 'Impossible de générer le lien Google')
      callbacks.setConnecting(false)
      return
    }

    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      data.authUrl,
      'google_oauth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    )

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'GOOGLE_OAUTH_CALLBACK') return
      window.removeEventListener('message', handleMessage)

      const { code, error: oauthError } = event.data as { code: string; state: string; error: string }

      if (oauthError) {
        callbacks.setError(`Erreur Google: ${oauthError}`)
        callbacks.setConnecting(false)
        return
      }

      if (code) {
        try {
          const callbackResponse = await fetch(`${BACKEND_URL}/client/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ code, state: event.data.state }),
          })
          const callbackData = await callbackResponse.json()
          if (callbackData.ok) {
            await callbacks.refreshStatus()
          } else {
            callbacks.setError(callbackData.message || 'Erreur lors de la connexion')
          }
        } catch (callbackErr) {
          console.error('Google callback error:', callbackErr)
          callbacks.setError('Erreur lors de la connexion à Google')
        }
      }
      callbacks.setConnecting(false)
    }

    window.addEventListener('message', handleMessage)

    const urlParams = new URLSearchParams(window.location.search)
    const googleCode = urlParams.get('google_code')
    if (googleCode) {
      handleMessage({ data: { type: 'GOOGLE_OAUTH_CALLBACK', code: googleCode, state: urlParams.get('google_state') || '' }, origin: new URL(BACKEND_URL).origin } as MessageEvent)
      window.history.replaceState({}, '', window.location.pathname)
    }

    const checkPopup = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(checkPopup)
          setTimeout(() => {
            window.removeEventListener('message', handleMessage)
            callbacks.setConnecting(false)
            callbacks.refreshStatus()
          }, 2000)
        }
      } catch {
        // Cross-Origin-Opener-Policy may block popup.closed
      }
    }, 1000)

    setTimeout(() => {
      clearInterval(checkPopup)
      window.removeEventListener('message', handleMessage)
      callbacks.setConnecting(false)
    }, 120000)
  } catch (err) {
    console.error('Google connect error:', err)
    callbacks.setError('Erreur de connexion à Google')
    callbacks.setConnecting(false)
  }
}

export default function SettingsPage() {
  const { currentLocation, orgSettings, setCurrentLocation } = useAppStore()
  const { clientOrg } = useAuth()
  const credits = clientOrg?.creditsComputed
  
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

  // État pour les informations d'établissement (adresse + GPS)
  const [establishmentName, setEstablishmentName] = useState('')
  const [establishmentAddress, setEstablishmentAddress] = useState('')
  const [establishmentLat, setEstablishmentLat] = useState<number | null>(null)
  const [establishmentLng, setEstablishmentLng] = useState<number | null>(null)
  const [establishmentPlaceId, setEstablishmentPlaceId] = useState<string | null>(null)
  const [savingEstablishment, setSavingEstablishment] = useState(false)
  const [establishmentSaveSuccess, setEstablishmentSaveSuccess] = useState(false)
  const { configure: configureCompetitors } = useConfigureCompetitors()

  // État pour Google Business Profile
  const [googleStatus, setGoogleStatus] = useState<{
    configured: boolean
    google: {
      connected: boolean
      accountId?: string | null
      locationId?: string | null
      locationName?: string | null
      connectedAt?: string | null
      lastSyncAt?: string | null
      syncStatus?: string
    }
  } | null>(null)
  const [googleLoading, setGoogleLoading] = useState(true)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleSyncResult, setGoogleSyncResult] = useState<string | null>(null)

  // Charger les settings au montage
  useEffect(() => {
    fetchSettings()
    fetchReviewRouting()
    fetchGoogleStatus()
  }, [])

  // Sync establishment info from store (currentLocation or clientOrg)
  useEffect(() => {
    if (currentLocation) {
      setEstablishmentName(currentLocation.name || '')
      setEstablishmentAddress(currentLocation.address || '')
      setEstablishmentLat(currentLocation.lat ?? null)
      setEstablishmentLng(currentLocation.lng ?? null)
    }
  }, [currentLocation])

  const fetchSettings = async () => {
    const token = await getAuthToken()
    if (!token) {
      setLoadingSettings(false)
      return
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` },
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
    const token = await getAuthToken()
    if (!token) return
    
    setSaving(true)
    setSaveSuccess(false)
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
    const token = await getAuthToken()
    if (!token) {
      setLoadingRouting(false)
      return
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings/review-routing`, {
        headers: { Authorization: `Bearer ${token}` },
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
    const token = await getAuthToken()
    if (!token) return
    
    setSavingRouting(true)
    setRoutingSaveSuccess(false)
    try {
      const response = await fetch(`${BACKEND_URL}/api/settings/review-routing`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  // ===== Google Business Profile Functions =====

  const fetchGoogleStatus = async () => {
    const token = await getAuthToken()
    if (!token) {
      setGoogleLoading(false)
      return
    }

    try {
      const response = await fetch(`${BACKEND_URL}/client/google/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setGoogleStatus({ configured: data.configured, google: data.google })
      }
    } catch (err) {
      console.error('Failed to load Google status:', err)
    } finally {
      setGoogleLoading(false)
    }
  }

  const connectGoogle = async () => {
    const token = await getAuthToken()
    if (!token) return
    await performGoogleOAuth(token, {
      setConnecting: setGoogleConnecting,
      setError: setGoogleError,
      refreshStatus: fetchGoogleStatus,
    })
  }

  const disconnectGoogle = async () => {
    const token = await getAuthToken()
    if (!token) return

    if (!confirm('Voulez-vous vraiment déconnecter Google Business ? Les avis déjà importés seront conservés.')) {
      return
    }

    try {
      const response = await fetch(`${BACKEND_URL}/client/google/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        setGoogleStatus({ configured: googleStatus?.configured || false, google: { connected: false } })
        setGoogleSyncResult(null)
      }
    } catch (err) {
      console.error('Google disconnect error:', err)
    }
  }

  const handleSaveEstablishment = async () => {
    if (!establishmentLat || !establishmentLng) return
    setSavingEstablishment(true)
    setEstablishmentSaveSuccess(false)
    try {
      const result = await configureCompetitors({
        lat: establishmentLat,
        lng: establishmentLng,
        address: establishmentAddress,
        googlePlaceId: establishmentPlaceId || undefined,
      })
      if (result) {
        setEstablishmentSaveSuccess(true)
        setTimeout(() => setEstablishmentSaveSuccess(false), 3000)
        if (currentLocation) {
          setCurrentLocation({
            ...currentLocation,
            address: establishmentAddress,
            lat: establishmentLat,
            lng: establishmentLng,
          })
        }
      }
    } catch (err) {
      console.error('Failed to save establishment info:', err)
    } finally {
      setSavingEstablishment(false)
    }
  }

  const syncGoogleReviews = async () => {
    const token = await getAuthToken()
    if (!token) return

    setGoogleSyncing(true)
    setGoogleError(null)
    setGoogleSyncResult(null)

    try {
      const response = await fetch(`${BACKEND_URL}/client/google/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      
      if (data.ok) {
        setGoogleSyncResult(`${data.sync.imported} nouveaux avis importés (${data.sync.skipped} déjà existants)`)
        // Refresh status to update lastSyncAt
        await fetchGoogleStatus()
      } else {
        setGoogleError(data.message || 'Erreur de synchronisation')
      }
    } catch (err) {
      console.error('Google sync error:', err)
      setGoogleError('Erreur de synchronisation')
    } finally {
      setGoogleSyncing(false)
    }
  }


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
                <p className="text-sm font-medium">Nom du cabinet</p>
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
                <p className="text-sm font-medium">Lien Google Review</p>
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

        <ReviewRoutingCard
          reviewRouting={reviewRouting}
          loadingRouting={loadingRouting}
          savingRouting={savingRouting}
          routingSaveSuccess={routingSaveSuccess}
          onRoutingChange={setReviewRouting}
          onSave={saveReviewRouting}
        />

        <GoogleBusinessCard
          googleLoading={googleLoading}
          googleStatus={googleStatus}
          googleConnecting={googleConnecting}
          googleSyncing={googleSyncing}
          googleError={googleError}
          googleSyncResult={googleSyncResult}
          onConnect={connectGoogle}
          onDisconnect={disconnectGoogle}
          onSync={syncGoogleReviews}
        />

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
              <p className="text-sm font-medium">Nom</p>
              <Input
                value={establishmentName}
                onChange={(e) => setEstablishmentName(e.target.value)}
                className="mt-1"
                placeholder="Nom de l'établissement"
              />
            </div>
            <div>
              <p className="text-sm font-medium">Adresse</p>
              <AddressAutocomplete
                value={establishmentAddress}
                onSelect={(place: PlaceGeometry) => {
                  setEstablishmentAddress(place.address)
                  setEstablishmentLat(place.lat)
                  setEstablishmentLng(place.lng)
                  setEstablishmentPlaceId(place.placeId)
                }}
                onInputChange={(val) => setEstablishmentAddress(val)}
                placeholder="Rechercher l'adresse de votre établissement..."
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Saisissez l&apos;adresse pour activer la détection automatique des coordonnées GPS
              </p>
            </div>

            {/* GPS coordinates display */}
            {establishmentLat && establishmentLng && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <MapPin className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="text-sm text-green-700">
                  <span className="font-medium">Coordonnées GPS détectées :</span>{' '}
                  {establishmentLat.toFixed(6)}, {establishmentLng.toFixed(6)}
                </div>
              </div>
            )}

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
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSaveEstablishment}
                disabled={savingEstablishment || (!establishmentLat && !establishmentLng)}
                className="gap-2"
              >
                {savingEstablishment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Enregistrer
              </Button>
              {establishmentSaveSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Adresse et coordonnées enregistrées !
                </span>
              )}
              {!establishmentLat && !establishmentLng && establishmentAddress && (
                <span className="text-xs text-amber-600">
                  Sélectionnez une adresse dans la liste pour détecter les coordonnées GPS
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Assistant IA */}
        {(credits?.subscription?.aiTotal ?? 0) > 0 && (
          <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-purple-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                Assistant IA de réponse
                <Badge className="bg-violet-600 ml-2">Actif</Badge>
              </CardTitle>
              <CardDescription>
                Générez des suggestions de réponse intelligentes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-violet-100/50 rounded-lg border border-violet-200">
                <CheckCircle className="h-5 w-5 text-violet-600" />
                <div>
                  <p className="font-medium text-violet-900">Assistant IA activé</p>
                  <p className="text-xs text-violet-700">
                    Générez des suggestions de réponse personnalisées
                  </p>
                </div>
              </div>

              {/* Quota IA réel */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <Zap className="h-4 w-4 text-violet-600" />
                    Suggestions IA ce mois
                  </span>
                  <span className="font-medium">
                    {credits?.subscription?.aiUsed ?? 0} / {credits?.subscription?.aiTotal ?? 0}
                  </span>
                </div>
                <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all"
                    style={{ width: `${(credits?.subscription?.aiTotal ?? 0) > 0 ? Math.min(100, Math.round(((credits?.subscription?.aiUsed ?? 0) / (credits?.subscription?.aiTotal ?? 1)) * 100)) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Réinitialisation en fin de période
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
            </CardContent>
          </Card>
        )}

        {/* Plan & Quotas — données réelles */}
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
                  Plan {getPlanLabel(clientOrg?.plan?.code || orgSettings?.plan)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(clientOrg?.plan?.code || orgSettings?.plan) ? 'Abonnement actif' : 'Gratuit'}
                </p>
              </div>
              <Badge variant="default">Actif</Badge>
            </div>

            {credits?.subscription ? (
              <>
                {/* SMS */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>SMS envoyés</span>
                    <span className="font-medium">
                      {credits?.subscription?.smsUsed ?? 0} / {credits?.subscription?.smsTotal ?? 0}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(credits?.subscription?.smsTotal ?? 0) > 0 ? Math.min(100, Math.round(((credits?.subscription?.smsUsed ?? 0) / credits?.subscription?.smsTotal) * 100)) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Emails envoyés</span>
                    <span className="font-medium">
                      {credits?.subscription?.emailUsed ?? 0} / {credits?.subscription?.emailTotal ?? 0}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(credits?.subscription?.emailTotal ?? 0) > 0 ? Math.min(100, Math.round(((credits?.subscription?.emailUsed ?? 0) / credits?.subscription?.emailTotal) * 100)) : 0}%` }}
                    />
                  </div>
                </div>

                {/* IA (si inclus) */}
                {(credits?.subscription?.aiTotal ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Suggestions IA</span>
                      <span className="font-medium">
                        {credits?.subscription?.aiUsed ?? 0} / {credits?.subscription?.aiTotal ?? 0}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all"
                        style={{ width: `${(credits?.subscription?.aiTotal ?? 0) > 0 ? Math.min(100, Math.round(((credits?.subscription?.aiUsed ?? 0) / (credits?.subscription?.aiTotal ?? 1)) * 100)) : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Chargement des quotas...</p>
            )}

            {IS_IOS_CAPACITOR ? (
              <p className="text-sm text-center text-muted-foreground">
                Gérez votre abonnement sur{' '}
                <span className="font-medium text-foreground">admin.reputyapp.com</span>
              </p>
            ) : (
              <Button variant="outline" className="w-full" asChild>
                <a href="/billing">Gérer l&apos;abonnement</a>
              </Button>
            )}
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
              <p className="text-sm font-medium">Couleur principale</p>
              <div className="flex gap-2 mt-1">
                <Input type="color" className="w-16 h-10 p-1" defaultValue="#3B82F6" />
                <Input value="#3B82F6" className="flex-1" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Slogan</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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

function GoogleBusinessCard({
  googleLoading,
  googleStatus,
  googleConnecting,
  googleSyncing,
  googleError,
  googleSyncResult,
  onConnect,
  onDisconnect,
  onSync,
}: {
  googleLoading: boolean
  googleStatus: any
  googleConnecting: boolean
  googleSyncing: boolean
  googleError: string | null
  googleSyncResult: string | null
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
}) {
  return (
    <Card className="border-blue-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-5 w-5 text-blue-600" />
          Google Business Profile
        </CardTitle>
        <CardDescription>
          Connectez votre fiche Google pour synchroniser et répondre aux avis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleLoading && <GoogleLoadingState />}
        {!googleLoading && googleStatus?.google?.connected && (
          <GoogleConnectedState
            googleStatus={googleStatus}
            googleSyncing={googleSyncing}
            googleSyncResult={googleSyncResult}
            onSync={onSync}
            onDisconnect={onDisconnect}
          />
        )}
        {!googleLoading && !googleStatus?.google?.connected && (
          <GoogleDisconnectedState
            googleStatus={googleStatus}
            googleConnecting={googleConnecting}
            onConnect={onConnect}
          />
        )}

        {googleError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{googleError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GoogleLoadingState() {
  return (
    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      <p className="text-sm text-muted-foreground">Chargement...</p>
    </div>
  )
}

function GoogleConnectedState({
  googleStatus,
  googleSyncing,
  googleSyncResult,
  onSync,
  onDisconnect,
}: {
  googleStatus: any
  googleSyncing: boolean
  googleSyncResult: string | null
  onSync: () => void
  onDisconnect: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
        <CheckCircle className="h-5 w-5 text-green-600" />
        <div className="flex-1">
          <p className="font-medium text-green-800">Connecté</p>
          <p className="text-xs text-green-700">
            {googleStatus.google.locationName || 'Établissement Google'}
          </p>
          {googleStatus.google.lastSyncAt && (
            <p className="text-xs text-green-600 mt-0.5">
              Dernière synchro : {new Date(googleStatus.google.lastSyncAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
          Actif
        </Badge>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSync} disabled={googleSyncing} className="flex-1 gap-2">
          {googleSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {googleSyncing ? 'Synchronisation...' : 'Synchroniser les avis'}
        </Button>
        <Button
          variant="outline"
          onClick={onDisconnect}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          Déconnecter
        </Button>
      </div>

      {googleSyncResult && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">{googleSyncResult}</p>
        </div>
      )}
    </>
  )
}

function GoogleDisconnectedState({
  googleStatus,
  googleConnecting,
  onConnect,
}: {
  googleStatus: any
  googleConnecting: boolean
  onConnect: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <div>
          <p className="font-medium text-gray-800">Non connecté</p>
          <p className="text-xs text-muted-foreground">
            Connectez votre compte Google pour importer vos avis automatiquement
          </p>
        </div>
      </div>

      {googleStatus?.configured ? (
        <Button
          onClick={onConnect}
          disabled={googleConnecting}
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
        >
          {googleConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {googleConnecting ? 'Connexion en cours...' : 'Connecter Google Business'}
        </Button>
      ) : (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">
            <strong>Configuration requise :</strong> Google Business Profile n&apos;est pas encore configuré sur le serveur. Contactez le support pour activer cette fonctionnalité.
          </p>
        </div>
      )}

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-medium">La connexion Google permet de :</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Importer automatiquement vos avis Google</li>
              <li>Répondre aux avis directement depuis Reputy</li>
              <li>Suivre vos statistiques en temps réel</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewRoutingCard({
  reviewRouting,
  loadingRouting,
  savingRouting,
  routingSaveSuccess,
  onRoutingChange,
  onSave,
}: {
  reviewRouting: { enabled: boolean; threshold: number; publicTarget: 'DOCTOLIB' | 'GOOGLE' }
  loadingRouting: boolean
  savingRouting: boolean
  routingSaveSuccess: boolean
  onRoutingChange: (routing: { enabled: boolean; threshold: number; publicTarget: 'DOCTOLIB' | 'GOOGLE' }) => void
  onSave: () => void
}) {
  const targetLabel = reviewRouting.publicTarget === 'GOOGLE' ? 'Google' : 'Doctolib'
  return (
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
            onClick={() => onRoutingChange({ ...reviewRouting, enabled: !reviewRouting.enabled })}
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Seuil minimum</p>
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
                  onChange={(e) => onRoutingChange({ ...reviewRouting, threshold: Number.parseInt(e.target.value) })}
                  disabled={loadingRouting}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-xs text-muted-foreground">5★</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Les patients avec {reviewRouting.threshold}★ ou plus seront redirigés vers un avis public
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Plateforme cible</p>
              <div className="flex gap-3">
                {(['DOCTOLIB', 'GOOGLE'] as const).map((target) => (
                  <button
                    key={target}
                    onClick={() => onRoutingChange({ ...reviewRouting, publicTarget: target })}
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

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Comportement actuel</p>
                  <ul className="text-xs space-y-1">
                    <li>• Note ≥ {reviewRouting.threshold}★ → Redirection vers {targetLabel}</li>
                    <li>• Note &lt; {reviewRouting.threshold}★ → Feedback interne uniquement</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={onSave}
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
  )
}
