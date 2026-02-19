'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { competitors as manualCompetitors } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { useReviewStats, useReviewAnalytics } from '@/lib/reviews/use-reviews'
import { useCompetitors, useConfigureCompetitors, type CompetitorEntry } from '@/lib/competitors/use-competitors'
import type { AutoCompetitor, EstablishmentType, HealthSpecialty, Competitor } from '@/types'
import { CompetitorDetailDrawer, getCompetitorTypeLabel } from '@/components/competitor-detail-drawer'
import {
  Plus,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  ExternalLink,
  Settings2,
  RefreshCw,
  Pin,
  PinOff,
  Eye,
  EyeOff,
  Lightbulb,
  AlertCircle,
  Info,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from 'recharts'

// Labels français pour les types
// Commerce et Restaurant masqués tant que Reputy Food / Business ne sont pas prêts
const typeLabels: Partial<Record<EstablishmentType, string>> = {
  health: 'Professionnel de santé',
  // commerce: 'Commerce',       // Masqué — Reputy Business à venir
  // restaurant: 'Restaurant',   // Masqué — Reputy Food à venir
}

const specialtyLabels: Record<HealthSpecialty, string> = {
  // Médecine générale
  generaliste: 'Médecin généraliste',
  // Dentaire
  dentiste: 'Dentiste',
  centre_dentaire: 'Centre dentaire',
  centre_medico_dentaire: 'Centre médico-dentaire',
  orthodontiste: 'Orthodontiste',
  // Ophtalmologie
  ophtalmologue: 'Ophtalmologue',
  centre_ophtalmologique: 'Centre ophtalmologique',
  // Centre médical
  centre_medical: 'Centre médical',
  // Spécialistes
  dermatologue: 'Dermatologue',
  kinesitherapeute: 'Kinésithérapeute',
  pharmacien: 'Pharmacien',
  cardiologue: 'Cardiologue',
  pediatre: 'Pédiatre',
  gynecologue: 'Gynécologue',
  osteopathe: 'Ostéopathe',
  orl: 'ORL',
  radiologue: 'Radiologue',
  allergologue: 'Allergologue',
  rhumatologue: 'Rhumatologue',
  neurologue: 'Neurologue',
  urologue: 'Urologue',
  gastro_enterologue: 'Gastro-entérologue',
  pneumologue: 'Pneumologue',
  endocrinologue: 'Endocrinologue',
  psychiatre: 'Psychiatre',
  psychologue: 'Psychologue',
  // Chirurgie
  chirurgien: 'Chirurgien',
  anesthesiste: 'Anesthésiste',
  stomatologue: 'Stomatologue',
  // Paramédical
  sage_femme: 'Sage-femme',
  infirmier: 'Infirmier(e)',
  podologue: 'Podologue',
  orthophoniste: 'Orthophoniste',
  dieteticien: 'Diététicien(ne)',
  chiropracteur: 'Chiropracteur',
  medecin_du_sport: 'Médecin du sport',
  // Médecines complémentaires
  acupuncteur: 'Acupuncteur',
  naturopathe: 'Naturopathe',
  sophrologue: 'Sophrologue',
  // Structures
  clinique: 'Clinique',
  laboratoire: 'Laboratoire d\'analyses',
  // Vétérinaire
  veterinaire: 'Vétérinaire',
}

export default function CompetitorsPage() {
  const { currentLocation, setCurrentLocation } = useAppStore()

  // ===== Vraies stats depuis le backend =====
  const { stats, loading: statsLoading, error: statsError } = useReviewStats('30d')
  const { series: analyticsSeries, loading: analyticsLoading } = useReviewAnalytics('90d', 'month')

  // Données établissement actif (réel depuis /client/reviews/stats)
const currentEstablishmentData = {
    rating: stats?.avgRatingAllTime ?? 0,
    reviewsCount: stats?.totalAllTime ?? 0,
    reviewsLast30d: stats?.totalPeriod ?? 0,
    responseRate: stats?.responseRatePeriod ?? 0,
    reviewsDeltaPct: stats?.reviewsDeltaPct ?? null,
  }

  // État pour les paramètres de recherche auto
  const [establishmentType, setEstablishmentType] = useState<EstablishmentType>(
    currentLocation?.establishmentType || 'health'
  )
  const [specialty, setSpecialty] = useState<HealthSpecialty | ''>(
    currentLocation?.specialty || 'generaliste'
  )
  const [radius, setRadius] = useState<1 | 2 | 5>(
    establishmentType === 'health' ? 2 : 1
  )

  // ===== Hook pour sauvegarder la spécialité vers le backend =====
  const { configure: configureCompetitors, loading: savingSpecialty } = useConfigureCompetitors()
  const [specialtySaved, setSpecialtySaved] = useState(false)
  const specialtySaveTimeout = useRef<NodeJS.Timeout | null>(null)

  // Auto-save specialty quand elle change
  const handleSpecialtyChange = useCallback(async (newSpecialty: HealthSpecialty | '') => {
    setSpecialty(newSpecialty)

    // Sauvegarder vers le backend (specialty-only — le backend garde les lat/lng existants)
    try {
      const result = await configureCompetitors({
        specialty: newSpecialty || undefined,
        // Envoyer lat/lng si disponibles (requis si pas encore configurés côté backend)
        ...(currentLocation?.lat && currentLocation?.lng ? {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
        } : {}),
      })
      if (result) {
        setSpecialtySaved(true)
        if (specialtySaveTimeout.current) clearTimeout(specialtySaveTimeout.current)
        specialtySaveTimeout.current = setTimeout(() => setSpecialtySaved(false), 2000)
        // Mettre à jour le store pour que le reste de l'app ait la bonne spécialité
        if (currentLocation) {
          setCurrentLocation({
            ...currentLocation,
            specialty: (newSpecialty || undefined) as typeof currentLocation.specialty,
          })
        }
      }
    } catch (err) {
      console.error('Failed to save specialty:', err)
    }
  }, [currentLocation, configureCompetitors, setCurrentLocation])

  // ===== Vrais concurrents depuis le backend (Google Places) =====
  const radiusM = (radius * 1000) as 1000 | 2000 | 5000
  const {
    buckets: realBuckets,
    stats: realBucketStats,
    loading: competitorsLoading,
    error: competitorsError,
    configured: isConfigured,
    placesApiConfigured,
    updatedAt: competitorsUpdatedAt,
    isEstimated30d,
    refetch: refetchCompetitors,
  } = useCompetitors(radiusM)

  // Données réelles disponibles pour le bucket sélectionné
  const currentBucketData = realBuckets[radiusM] ?? []
  const hasRealData = currentBucketData.length > 0

  // État pour les concurrents auto (mock fallback si pas de données réelles)
  const [autoCompetitors, setAutoCompetitors] = useState<AutoCompetitor[]>([])
  const [autoStats, setAutoStats] = useState<{
    avgRating: number
    avgReviews: number
    totalCompetitors: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [disclaimer, setDisclaimer] = useState('')
  const [showAuto, setShowAuto] = useState(true)
  const [hiddenAutoIds, setHiddenAutoIds] = useState<Set<string>>(new Set())
  const [pinnedAutoIds, setPinnedAutoIds] = useState<Set<string>>(new Set())

  // ===== Drawer détails concurrent =====
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [selectedCompetitorName, setSelectedCompetitorName] = useState<string>('')

  // Concurrents manuels filtrés par location
  const filteredManualCompetitors = manualCompetitors.filter(
    (c) => !currentLocation || c.locationId === currentLocation.id
  )

  // Mise à jour des paramètres quand la location change
  useEffect(() => {
    if (currentLocation) {
      setEstablishmentType(currentLocation.establishmentType || 'health')
      setSpecialty(currentLocation.specialty || 'generaliste')
      setRadius(currentLocation.establishmentType === 'health' ? 2 : 1)
    }
  }, [currentLocation])

  // Charger mock uniquement si pas de données réelles
  const loadAutoCompetitors = useCallback(async () => {
    if (hasRealData) return // Skip mock if real data available
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        type: establishmentType,
        radius: radius.toString(),
      })
      if (establishmentType === 'health' && specialty) {
        params.set('specialty', specialty)
      }

      const response = await fetch(`/api/competitors/auto?${params}`)
      const data = await response.json()

      setAutoCompetitors(data.competitors)
      setAutoStats(data.stats)
      setDisclaimer(data.disclaimer)
    } catch (error) {
      console.error('Erreur chargement concurrents auto:', error)
    } finally {
      setIsLoading(false)
    }
  }, [establishmentType, specialty, radius, hasRealData])

  // Charger mock au montage si pas de données réelles
  useEffect(() => {
    if (!hasRealData && !competitorsLoading) {
    loadAutoCompetitors()
    }
  }, [hasRealData, competitorsLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Épingler un concurrent auto (devient "manuel")
  const togglePin = (id: string) => {
    setPinnedAutoIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Masquer un concurrent auto
  const toggleHide = (id: string) => {
    setHiddenAutoIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Filtrer les concurrents auto visibles (mock fallback)
  const visibleAutoCompetitors = autoCompetitors.filter(
    (c) => !hiddenAutoIds.has(c.id)
  )

  // Transformer les données réelles en format compatible avec la table
  const realCompetitorsList: (CompetitorEntry & { isAuto: true; isReal: true })[] =
    currentBucketData
      .filter((c) => !hiddenAutoIds.has(c.id))
      .map((c) => ({ ...c, isAuto: true as const, isReal: true as const }))

  // Combiner tous les concurrents pour la table
  // Priorité : données réelles > mock
  const allCompetitors = hasRealData
    ? [
        ...filteredManualCompetitors.map((c) => ({ ...c, isAuto: false as const, isReal: false as const })),
        ...(showAuto ? realCompetitorsList : []),
      ]
    : [
        ...filteredManualCompetitors.map((c) => ({ ...c, isAuto: false as const, isReal: false as const })),
        ...(showAuto ? visibleAutoCompetitors.map((c) => ({ ...c, isReal: false as const })) : []),
      ]

  allCompetitors.sort((a, b) => {
    // Épinglés en premier
    const aPinned = pinnedAutoIds.has(a.id) || !a.isAuto
    const bPinned = pinnedAutoIds.has(b.id) || !b.isAuto
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
  })

  // Stats agrégées — utiliser données réelles si dispo, sinon mock
  const activeAutoStats = hasRealData
    ? realBucketStats[radiusM]
    : autoStats

  // Données pour le graphique comparatif
  const topCompetitors = hasRealData
    ? realCompetitorsList.slice(0, 3)
    : visibleAutoCompetitors.slice(0, 3)

  const comparisonData = [
    {
      name: 'Vous',
      avis: currentEstablishmentData.reviewsCount,
      fill: '#3B82F6',
    },
    ...(activeAutoStats
      ? [
          {
            name: `Moy. locale (${radius}km)`,
            avis: activeAutoStats.avgReviews,
            fill: '#94A3B8',
          },
        ]
      : []),
    ...topCompetitors.slice(0, 3).map((c, i) => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + '...' : c.name,
      avis: c.reviewsCount,
      fill: ['#10B981', '#F59E0B', '#EF4444'][i],
    })),
  ]

  // Générer insight automatique (basé sur vraies stats + concurrents)
  const generateInsight = (): string => {
    const myRating = currentEstablishmentData.rating
    const myReviews = currentEstablishmentData.reviewsCount
    const responseRate = currentEstablishmentData.responseRate
    const last30d = currentEstablishmentData.reviewsLast30d

    // Insight basé sur les vraies stats d'abord
    if (stats && !activeAutoStats) {
      // Pas encore de concurrents chargés, insight basé sur ses propres stats
      if (myRating === 0 && myReviews === 0) {
        return 'Aucun avis détecté. Lancez une campagne de collecte pour démarrer.'
      }
      if (myRating < 4.2) {
        return `Votre note (${myRating.toFixed(1)}) est proche d'un seuil critique. Répondez en priorité aux avis 1–3★ pour remonter rapidement.`
      }
      if (responseRate < 80) {
        return `Votre taux de réponse (${Math.round(responseRate)}%) est perfectible. Objectif : répondre à 100% des avis négatifs sous 24–48h.`
      }
      if (last30d === 0) {
        return 'Aucun nouvel avis sur 30 jours. Activez une campagne SMS/email post-consultation pour relancer la collecte.'
      }
      return `Bonne dynamique : ${myRating.toFixed(1)}★ avec ${myReviews} avis au total et ${Math.round(responseRate)}% de taux de réponse. Continuez !`
    }

    // Insight comparatif avec les concurrents
    if (!activeAutoStats || allCompetitors.filter(c => c.isAuto).length === 0) {
      return ''
    }

    const avgRating = activeAutoStats.avgRating
    const avgReviews = activeAutoStats.avgReviews
    const parts: string[] = []

    if (myRating > avgRating) {
      parts.push(
        `Votre note (${myRating.toFixed(1)}) est supérieure à la moyenne locale (${avgRating})`
      )
    } else if (myRating < avgRating) {
      parts.push(
        `Votre note (${myRating.toFixed(1)}) est inférieure à la moyenne locale (${avgRating})`
      )
    } else {
      parts.push(`Votre note est dans la moyenne locale (${avgRating})`)
    }

    if (myReviews > avgReviews) {
      parts.push(`et vous avez plus d'avis que la moyenne.`)
    } else if (myReviews < avgReviews) {
      parts.push(
        `mais vous avez moins d'avis que la moyenne dans un rayon de ${radius} km.`
      )
    } else {
      parts.push(`avec un volume d'avis comparable.`)
    }

    return parts.join(' ')
  }

  // Évolution des avis (réel depuis /client/reviews/analytics)
  const monthLabels: Record<string, string> = {
    '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
    '05': 'Mai', '06': 'Juin', '07': 'Juil', '08': 'Août',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
  }

  const evolutionData = analyticsSeries.length > 0
    ? (() => {
        let cumul = (stats?.totalAllTime ?? 0) - analyticsSeries.reduce((acc, p) => acc + p.reviews, 0)
        return analyticsSeries.map((p) => {
          cumul += p.reviews
          const monthKey = p.period.split('-')[1] // "2026-01" → "01"
          return {
            month: monthLabels[monthKey] || p.period,
            vous: cumul,
            local: null as number | null,
          }
        })
      })()
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Concurrence</h1>
          <p className="text-muted-foreground mt-1">
            Surveillez vos concurrents et comparez vos performances
          </p>
        </div>
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          Ajouter un concurrent
        </Button>
      </div>

      {/* Erreur stats */}
      {statsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Impossible de charger vos statistiques</p>
          <p className="text-red-500 mt-1">{statsError}</p>
        </div>
      )}

      {/* Section Paramètres Concurrence Auto */}
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-medium">
              Concurrence locale (automatique)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            {/* Type d'établissement */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted-foreground font-medium">
                Type d&apos;établissement
              </label>
              <select
                value={establishmentType}
                onChange={(e) => {
                  const newType = e.target.value as EstablishmentType
                  setEstablishmentType(newType)
                  // Reset radius selon le type
                  setRadius(newType === 'health' ? 2 : 1)
                  if (newType !== 'health') {
                    setSpecialty('')
                  }
                }}
                className="h-10 px-3 rounded-lg border border-input bg-background text-sm min-w-[180px]"
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Spécialité (si santé) */}
            {establishmentType === 'health' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground font-medium">
                  Spécialité
                  {savingSpecialty && (
                    <span className="ml-2 text-xs text-blue-500 animate-pulse">Sauvegarde...</span>
                  )}
                  {specialtySaved && !savingSpecialty && (
                    <span className="ml-2 text-xs text-green-600">✓ Enregistré</span>
                  )}
                </label>
                <select
                  value={specialty}
                  onChange={(e) => handleSpecialtyChange(e.target.value as HealthSpecialty)}
                  disabled={savingSpecialty}
                  className="h-10 px-3 rounded-lg border border-input bg-background text-sm min-w-[180px]"
                >
                  {Object.entries(specialtyLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Rayon géographique */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted-foreground font-medium">
                Rayon
              </label>
              <div className="flex gap-1">
                {([1, 2, 5] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                      radius === r
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-foreground'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>

            {/* Bouton Mettre à jour */}
            <Button
              onClick={hasRealData ? refetchCompetitors : loadAutoCompetitors}
              disabled={isLoading || competitorsLoading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading || competitorsLoading ? 'animate-spin' : ''}`}
              />
              Mettre à jour
            </Button>

            {/* Toggle affichage auto */}
            <Button
              variant="outline"
              onClick={() => setShowAuto(!showAuto)}
              className="gap-2"
            >
              {showAuto ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Masquer auto
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Afficher auto
                </>
              )}
            </Button>
          </div>

          {/* Disclaimer */}
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              {hasRealData ? (
                <>
                  Données mises à jour hebdomadairement via Google Places.
                  {competitorsUpdatedAt && ` Dernière maj : ${new Date(competitorsUpdatedAt).toLocaleDateString('fr-FR')}.`}
                  {isEstimated30d
                    ? ' Les "Avis 30j" sont estimés à partir des snapshots hebdomadaires.'
                    : ' Les "Avis 30j" nécessitent 4 semaines de données (badge "estimé" affiché sinon).'}
                </>
              ) : (
                disclaimer || 'Les concurrents affichés sont des données de démonstration. La connexion Google Places (données réelles) sera disponible prochainement.'
              )}
            </span>
          </div>
          {competitorsError && (
            <div className="mt-2 text-xs text-red-500">
              Erreur chargement concurrents : {competitorsError}
            </div>
          )}

          {/* CTA : Configurer l'adresse si org non configurée */}
          {!isConfigured && !competitorsLoading && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50/50 p-4">
              <MapPin className="h-5 w-5 text-orange-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-foreground">Coordonnées GPS non configurées</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pour afficher vos vrais concurrents via Google Places, configurez l&apos;adresse de votre établissement dans les paramètres.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-orange-600 border-orange-300 hover:bg-orange-100 flex-shrink-0"
                onClick={() => window.location.href = '/settings'}
              >
                <Settings2 className="h-4 w-4 mr-1" />
                Configurer
              </Button>
            </div>
          )}

          {/* CTA : Activer Google Places si pas de données réelles mais org configurée */}
          {isConfigured && !hasRealData && !competitorsLoading && placesApiConfigured && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
              <MapPin className="h-5 w-5 text-blue-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-foreground">Aucune donnée Google Places</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vos coordonnées sont configurées. Les données de concurrence seront récupérées automatiquement lors du prochain cycle hebdomadaire.
                </p>
              </div>
              <Badge variant="outline" className="text-blue-600 border-blue-300">
                En attente
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table Comparatif */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Comparatif</CardTitle>
            {activeAutoStats && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  {activeAutoStats.totalCompetitors} concurrent
                  {activeAutoStats.totalCompetitors > 1 ? 's' : ''} détecté
                  {activeAutoStats.totalCompetitors > 1 ? 's' : ''}
                </span>
                <span>
                  Note moy.: <strong>{activeAutoStats.avgRating}</strong>
                </span>
                {hasRealData && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-300">
                    Google Places
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(isLoading || competitorsLoading) ? (
            // Skeleton loader
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : allCompetitors.length === 0 && filteredManualCompetitors.length === 0 ? (
            // Empty state
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-foreground mb-2">
                Aucune concurrence détectée
              </h3>
              <p className="text-sm text-muted-foreground">
                Essayez d&apos;élargir le rayon de recherche ou ajoutez des
                concurrents manuellement.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Établissement
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Note
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Total avis
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Avis 30j
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Tendance
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Distance
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Source
                    </th>
                    <th className="text-right py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Your establishment */}
                  {currentLocation && (
                    <tr className="border-b bg-primary/5">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold">V</span>
                          </div>
                          <div>
                            <p className="font-medium">
                              Vous ({currentLocation.name})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {currentLocation.address}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-4 px-4">
                        {statsLoading ? (
                          <Skeleton className="h-5 w-12 mx-auto" />
                        ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          <span className="font-bold">
                              {currentEstablishmentData.rating.toFixed(1)}
                          </span>
                        </div>
                        )}
                      </td>
                      <td className="text-center py-4 px-4 font-medium">
                        {statsLoading ? (
                          <Skeleton className="h-5 w-10 mx-auto" />
                        ) : (
                          currentEstablishmentData.reviewsCount
                        )}
                      </td>
                      <td className="text-center py-4 px-4">
                        {statsLoading ? (
                          <Skeleton className="h-5 w-8 mx-auto" />
                        ) : (
                          currentEstablishmentData.reviewsLast30d
                        )}
                      </td>
                      <td className="text-center py-4 px-4">
                        {currentEstablishmentData.reviewsDeltaPct !== null ? (
                          <Badge
                            variant={
                              currentEstablishmentData.reviewsDeltaPct > 0
                                ? 'success'
                                : currentEstablishmentData.reviewsDeltaPct < 0
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="gap-1"
                          >
                            {currentEstablishmentData.reviewsDeltaPct > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                            ) : currentEstablishmentData.reviewsDeltaPct < 0 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {currentEstablishmentData.reviewsDeltaPct > 0 ? '+' : ''}
                            {Math.round(currentEstablishmentData.reviewsDeltaPct)}%
                        </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="text-center py-4 px-4">-</td>
                      <td className="text-center py-4 px-4">
                        <Badge variant="default">Vous</Badge>
                      </td>
                      <td className="text-right py-4 px-4"></td>
                    </tr>
                  )}
                  {/* Competitors */}
                  {allCompetitors.map((competitor) => {
                    const isAuto = competitor.isAuto
                    const isReal = 'isReal' in competitor && competitor.isReal
                    const isPinned = pinnedAutoIds.has(competitor.id)

                    // Compute 30d reviews and trend based on data source
                    let reviewsLast30d: number | null = null
                    let trend: 'up' | 'stable' | 'down' = 'stable'

                    if (isReal && 'estimated30d' in competitor) {
                      // Real data from Google Places snapshots
                      reviewsLast30d = (competitor as CompetitorEntry).estimated30d
                      if (reviewsLast30d !== null) {
                        trend = reviewsLast30d > 0 ? 'up' : reviewsLast30d < 0 ? 'down' : 'stable'
                      }
                    } else if ('trend' in competitor) {
                      // Mock AutoCompetitor
                      trend = (competitor as AutoCompetitor).trend
                      reviewsLast30d = (competitor as AutoCompetitor).reviewsLast30d
                    } else if ('trend30d' in competitor) {
                      // Manual Competitor
                      const t30d = (competitor as unknown as { trend30d: number }).trend30d
                      trend = t30d >= 0 ? 'up' : 'down'
                      reviewsLast30d = t30d
                    }

                    return (
                      <tr
                        key={competitor.id}
                        className={`border-b hover:bg-muted/50 ${
                          isPinned ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div
                            className={`flex items-center gap-3 ${isReal ? 'cursor-pointer group' : ''}`}
                            onClick={() => {
                              if (isReal && 'placeId' in competitor && competitor.placeId) {
                                setSelectedPlaceId(competitor.placeId)
                                setSelectedCompetitorName(competitor.name)
                              }
                            }}
                          >
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                                isReal ? 'bg-green-50 group-hover:bg-green-100' : isAuto ? 'bg-slate-100' : 'bg-muted'
                              }`}
                            >
                              <MapPin
                                className={`h-5 w-5 ${
                                  isReal
                                    ? 'text-green-500'
                                    : isAuto
                                    ? 'text-slate-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className={`font-medium ${isReal ? 'group-hover:text-primary' : ''}`}>
                                  {competitor.name}
                                </p>
                                {isPinned && (
                                  <Pin className="h-3 w-3 text-amber-500" />
                                )}
                                {isReal && (
                                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {isReal && 'types' in competitor && competitor.types?.length > 0
                                  ? `${getCompetitorTypeLabel(competitor.types)}${competitor.distanceKm ? ` · ${competitor.distanceKm} km` : ''}`
                                  : competitor.distanceKm ? `${competitor.distanceKm} km` : '-'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span className="font-medium">
                              {competitor.rating ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="text-center py-4 px-4">
                          {competitor.reviewsCount}
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {reviewsLast30d !== null ? reviewsLast30d : '—'}
                            {isReal && reviewsLast30d !== null && !isEstimated30d && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300 ml-1">
                                estimé
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-center py-4 px-4">
                          {reviewsLast30d !== null ? (
                          <Badge
                            variant={
                              trend === 'up'
                                ? 'success'
                                : trend === 'down'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="gap-1"
                          >
                            {trend === 'up' ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : trend === 'down' ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {trend === 'up'
                              ? '+'
                              : trend === 'down'
                              ? '-'
                              : ''}
                            {Math.abs(
                              typeof reviewsLast30d === 'number'
                                ? reviewsLast30d
                                : 0
                            )}
                          </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>
                        <td className="text-center py-4 px-4 text-muted-foreground">
                          {competitor.distanceKm} km
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-center gap-1">
                          <Badge
                            variant={isAuto ? 'outline' : 'secondary'}
                            className={isAuto ? 'text-slate-500' : ''}
                          >
                            {isAuto ? 'Auto' : 'Manuel'}
                          </Badge>
                            {isReal ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-300">
                                Google
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">
                                Démo
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-4 px-4">
                          <div className="flex items-center justify-end gap-1">
                            {isAuto && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => togglePin(competitor.id)}
                                  title={
                                    isPinned ? 'Désépingler' : 'Épingler'
                                  }
                                >
                                  {isPinned ? (
                                    <PinOff className="h-4 w-4 text-amber-500" />
                                  ) : (
                                    <Pin className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleHide(competitor.id)}
                                  title="Masquer"
                                >
                                  <EyeOff className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {isReal && 'placeId' in competitor && competitor.placeId ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedPlaceId(competitor.placeId)
                                  setSelectedCompetitorName(competitor.name)
                                }}
                                title="Voir les détails"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            ) : (
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Graphiques et Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Graphique Avis cumulés */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Avis cumulés vs concurrence locale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avis" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Évolution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Évolution des avis (cumulés — 90 jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-[250px] flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Skeleton className="h-[200px] w-full rounded-lg" />
                </div>
              </div>
            ) : evolutionData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                Pas encore de données d&apos;évolution
              </div>
            ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="vous"
                    stroke="#3B82F6"
                    strokeWidth={2}
                      name="Vous (cumulés)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insight automatique */}
      {(stats || activeAutoStats) && generateInsight() && (
        <Card className="bg-blue-50/50 border-blue-100">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Lightbulb className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-1">
                  Insight automatique
                </h4>
                <p className="text-sm text-muted-foreground">
                  {generateInsight()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drawer détails concurrent (Google Places) */}
      <CompetitorDetailDrawer
        placeId={selectedPlaceId}
        competitorName={selectedCompetitorName}
        onClose={() => {
          setSelectedPlaceId(null)
          setSelectedCompetitorName('')
        }}
      />
    </div>
  )
}
