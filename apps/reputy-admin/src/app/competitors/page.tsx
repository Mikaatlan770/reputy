'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { competitors as manualCompetitors } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import type { AutoCompetitor, EstablishmentType, HealthSpecialty, Competitor } from '@/types'
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
const typeLabels: Record<EstablishmentType, string> = {
  health: 'Professionnel de santé',
  commerce: 'Commerce',
  restaurant: 'Restaurant',
}

const specialtyLabels: Record<HealthSpecialty, string> = {
  generaliste: 'Médecin généraliste',
  dentiste: 'Dentiste',
  dermatologue: 'Dermatologue',
  ophtalmologue: 'Ophtalmologue',
  kinesitherapeute: 'Kinésithérapeute',
  pharmacien: 'Pharmacien',
  cardiologue: 'Cardiologue',
  pediatre: 'Pédiatre',
  gynecologue: 'Gynécologue',
  osteopathe: 'Ostéopathe',
}

// Données établissement actif (mock)
const currentEstablishmentData = {
  rating: 4.3,
  reviewsCount: 156,
  reviewsLast30d: 12,
  responseRate: 87,
}

export default function CompetitorsPage() {
  const { currentLocation } = useAppStore()

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

  // État pour les concurrents auto
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

  // Fonction pour charger les concurrents auto
  const loadAutoCompetitors = useCallback(async () => {
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
  }, [establishmentType, specialty, radius])

  // Charger au montage
  useEffect(() => {
    loadAutoCompetitors()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filtrer les concurrents auto visibles
  const visibleAutoCompetitors = autoCompetitors.filter(
    (c) => !hiddenAutoIds.has(c.id)
  )

  // Combiner tous les concurrents pour la table
  const allCompetitors = [
    ...filteredManualCompetitors.map((c) => ({ ...c, isAuto: false as const })),
    ...(showAuto ? visibleAutoCompetitors : []),
  ].sort((a, b) => {
    // Épinglés en premier
    const aPinned = pinnedAutoIds.has(a.id) || !a.isAuto
    const bPinned = pinnedAutoIds.has(b.id) || !b.isAuto
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return a.distanceKm - b.distanceKm
  })

  // Données pour le graphique comparatif
  const comparisonData = [
    {
      name: 'Vous',
      avis: currentEstablishmentData.reviewsCount,
      fill: '#3B82F6',
    },
    ...(autoStats
      ? [
          {
            name: `Moy. locale (${radius}km)`,
            avis: autoStats.avgReviews,
            fill: '#94A3B8',
          },
        ]
      : []),
    ...visibleAutoCompetitors.slice(0, 3).map((c, i) => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + '...' : c.name,
      avis: c.reviewsCount,
      fill: ['#10B981', '#F59E0B', '#EF4444'][i],
    })),
  ]

  // Générer insight automatique
  const generateInsight = (): string => {
    if (!autoStats || visibleAutoCompetitors.length === 0) {
      return ''
    }

    const myRating = currentEstablishmentData.rating
    const myReviews = currentEstablishmentData.reviewsCount
    const avgRating = autoStats.avgRating
    const avgReviews = autoStats.avgReviews

    const parts: string[] = []

    if (myRating > avgRating) {
      parts.push(
        `Votre note (${myRating}) est supérieure à la moyenne locale (${avgRating})`
      )
    } else if (myRating < avgRating) {
      parts.push(
        `Votre note (${myRating}) est inférieure à la moyenne locale (${avgRating})`
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

  // Mock evolution data
  const evolutionData = [
    { month: 'Oct', vous: 130, local: 95 },
    { month: 'Nov', vous: 140, local: 102 },
    { month: 'Déc', vous: 148, local: 108 },
    { month: 'Jan', vous: 156, local: 115 },
  ]

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
                </label>
                <select
                  value={specialty}
                  onChange={(e) =>
                    setSpecialty(e.target.value as HealthSpecialty)
                  }
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
              onClick={loadAutoCompetitors}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
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
          {disclaimer && (
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{disclaimer}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table Comparatif */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Comparatif</CardTitle>
            {autoStats && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  {autoStats.totalCompetitors} concurrent
                  {autoStats.totalCompetitors > 1 ? 's' : ''} détecté
                  {autoStats.totalCompetitors > 1 ? 's' : ''}
                </span>
                <span>
                  Note moy.: <strong>{autoStats.avgRating}</strong>
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
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
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          <span className="font-bold">
                            {currentEstablishmentData.rating}
                          </span>
                        </div>
                      </td>
                      <td className="text-center py-4 px-4 font-medium">
                        {currentEstablishmentData.reviewsCount}
                      </td>
                      <td className="text-center py-4 px-4">
                        {currentEstablishmentData.reviewsLast30d}
                      </td>
                      <td className="text-center py-4 px-4">
                        <Badge variant="success" className="gap-1">
                          <TrendingUp className="h-3 w-3" />
                          +12
                        </Badge>
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
                    const isPinned = pinnedAutoIds.has(competitor.id)
                    const trend =
                      'trend' in competitor
                        ? competitor.trend
                        : competitor.trend30d >= 0
                        ? 'up'
                        : 'down'
                    const reviewsLast30d =
                      'reviewsLast30d' in competitor
                        ? competitor.reviewsLast30d
                        : competitor.trend30d

                    return (
                      <tr
                        key={competitor.id}
                        className={`border-b hover:bg-muted/50 ${
                          isPinned ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                isAuto ? 'bg-slate-100' : 'bg-muted'
                              }`}
                            >
                              <MapPin
                                className={`h-5 w-5 ${
                                  isAuto
                                    ? 'text-slate-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{competitor.name}</p>
                                {isPinned && (
                                  <Pin className="h-3 w-3 text-amber-500" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {competitor.address || '-'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span className="font-medium">
                              {competitor.rating}
                            </span>
                          </div>
                        </td>
                        <td className="text-center py-4 px-4">
                          {competitor.reviewsCount}
                        </td>
                        <td className="text-center py-4 px-4">
                          {reviewsLast30d}
                        </td>
                        <td className="text-center py-4 px-4">
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
                        </td>
                        <td className="text-center py-4 px-4 text-muted-foreground">
                          {competitor.distanceKm} km
                        </td>
                        <td className="text-center py-4 px-4">
                          <Badge
                            variant={isAuto ? 'outline' : 'secondary'}
                            className={isAuto ? 'text-slate-500' : ''}
                          >
                            {isAuto ? 'Auto' : 'Manuel'}
                          </Badge>
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
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
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
              Évolution des avis (cumulés)
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                    name="Vous"
                  />
                  <Line
                    type="monotone"
                    dataKey="local"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    name={`Moy. locale (${radius}km)`}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insight automatique */}
      {autoStats && generateInsight() && (
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
    </div>
  )
}
