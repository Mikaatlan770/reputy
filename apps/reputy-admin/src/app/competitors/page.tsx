'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { competitors as manualCompetitors } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { useReviewStats, useReviewAnalytics } from '@/lib/reviews/use-reviews'
import { useGoogleMyPlace } from '@/lib/google/use-google-my-place'
import { useCompetitors, useConfigureCompetitors, useSyncCompetitors, usePlacesAutocomplete, useAddCompetitor, type CompetitorEntry } from '@/lib/competitors/use-competitors'
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
  Search,
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

// Labels plats pour affichage (badges, etc.)
const specialtyLabels: Record<HealthSpecialty, string> = {
  // Médecins
  generaliste: 'Médecin généraliste',
  dermatologue: 'Dermatologue',
  cardiologue: 'Cardiologue',
  pediatre: 'Pédiatre',
  gynecologue: 'Gynécologue',
  ophtalmologue: 'Ophtalmologue',
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
  anesthesiste: 'Anesthésiste',
  medecin_du_sport: 'Médecin du sport',
  medecin_esthetique: 'Médecin esthétique',
  medecin_nutritionniste: 'Médecin nutritionniste',
  medecin_du_travail: 'Médecin du travail',
  geriarte: 'Gériatre',
  medecin_vasculaire: 'Médecin vasculaire (angiologue)',
  // Chirurgiens
  chirurgien: 'Chirurgien (général)',
  chirurgien_esthetique: 'Chirurgien esthétique / plasticien',
  chirurgien_orthopedique: 'Chirurgien orthopédique',
  chirurgien_cardiaque: 'Chirurgien cardiaque',
  chirurgien_digestif: 'Chirurgien digestif / viscéral',
  chirurgien_vasculaire: 'Chirurgien vasculaire',
  neurochirurgien: 'Neurochirurgien',
  chirurgien_maxillo_facial: 'Chirurgien maxillo-facial',
  chirurgien_urologue: 'Chirurgien urologue',
  stomatologue: 'Stomatologue',
  // Dentaire
  dentiste: 'Dentiste',
  centre_dentaire: 'Centre dentaire',
  centre_medico_dentaire: 'Centre médico-dentaire',
  orthodontiste: 'Orthodontiste',
  // Auxiliaires médicaux
  kinesitherapeute: 'Kinésithérapeute',
  osteopathe: 'Ostéopathe',
  sage_femme: 'Sage-femme',
  infirmier: 'Infirmier(e)',
  podologue: 'Podologue',
  orthophoniste: 'Orthophoniste',
  dieteticien: 'Diététicien(ne)',
  chiropracteur: 'Chiropracteur',
  psychologue: 'Psychologue',
  orthoptiste: 'Orthoptiste',
  ergotherapeute: 'Ergothérapeute',
  psychomotricien: 'Psychomotricien(ne)',
  // Médecines complémentaires
  acupuncteur: 'Acupuncteur',
  naturopathe: 'Naturopathe',
  sophrologue: 'Sophrologue',
  // Établissements
  centre_medical: 'Centre médical',
  centre_ophtalmologique: 'Centre ophtalmologique',
  clinique: 'Clinique',
  laboratoire: 'Laboratoire d\'analyses',
  pharmacien: 'Pharmacie',
  // Vétérinaire
  veterinaire: 'Vétérinaire',
}

// Spécialités organisées par catégories pour le sélecteur <select>
const specialtyCategories: { label: string; items: { value: HealthSpecialty; label: string }[] }[] = [
  {
    label: 'Médecin',
    items: [
      { value: 'generaliste', label: 'Médecin généraliste' },
      { value: 'dermatologue', label: 'Dermatologue' },
      { value: 'cardiologue', label: 'Cardiologue' },
      { value: 'pediatre', label: 'Pédiatre' },
      { value: 'gynecologue', label: 'Gynécologue' },
      { value: 'ophtalmologue', label: 'Ophtalmologue' },
      { value: 'orl', label: 'ORL' },
      { value: 'radiologue', label: 'Radiologue' },
      { value: 'allergologue', label: 'Allergologue' },
      { value: 'rhumatologue', label: 'Rhumatologue' },
      { value: 'neurologue', label: 'Neurologue' },
      { value: 'urologue', label: 'Urologue' },
      { value: 'gastro_enterologue', label: 'Gastro-entérologue' },
      { value: 'pneumologue', label: 'Pneumologue' },
      { value: 'endocrinologue', label: 'Endocrinologue' },
      { value: 'psychiatre', label: 'Psychiatre' },
      { value: 'anesthesiste', label: 'Anesthésiste' },
      { value: 'medecin_du_sport', label: 'Médecin du sport' },
      { value: 'medecin_esthetique', label: 'Médecin esthétique' },
      { value: 'medecin_nutritionniste', label: 'Médecin nutritionniste' },
      { value: 'medecin_du_travail', label: 'Médecin du travail' },
      { value: 'geriarte', label: 'Gériatre' },
      { value: 'medecin_vasculaire', label: 'Médecin vasculaire (angiologue)' },
    ],
  },
  {
    label: 'Chirurgien',
    items: [
      { value: 'chirurgien', label: 'Chirurgien (général)' },
      { value: 'chirurgien_esthetique', label: 'Chirurgien esthétique / plasticien' },
      { value: 'chirurgien_orthopedique', label: 'Chirurgien orthopédique' },
      { value: 'chirurgien_cardiaque', label: 'Chirurgien cardiaque' },
      { value: 'chirurgien_digestif', label: 'Chirurgien digestif / viscéral' },
      { value: 'chirurgien_vasculaire', label: 'Chirurgien vasculaire' },
      { value: 'neurochirurgien', label: 'Neurochirurgien' },
      { value: 'chirurgien_maxillo_facial', label: 'Chirurgien maxillo-facial' },
      { value: 'chirurgien_urologue', label: 'Chirurgien urologue' },
      { value: 'stomatologue', label: 'Stomatologue' },
    ],
  },
  {
    label: 'Dentaire',
    items: [
      { value: 'dentiste', label: 'Dentiste' },
      { value: 'centre_dentaire', label: 'Centre dentaire' },
      { value: 'centre_medico_dentaire', label: 'Centre médico-dentaire' },
      { value: 'orthodontiste', label: 'Orthodontiste' },
    ],
  },
  {
    label: 'Auxiliaire médical',
    items: [
      { value: 'kinesitherapeute', label: 'Kinésithérapeute' },
      { value: 'osteopathe', label: 'Ostéopathe' },
      { value: 'sage_femme', label: 'Sage-femme' },
      { value: 'infirmier', label: 'Infirmier(e)' },
      { value: 'podologue', label: 'Podologue' },
      { value: 'orthophoniste', label: 'Orthophoniste' },
      { value: 'dieteticien', label: 'Diététicien(ne)' },
      { value: 'chiropracteur', label: 'Chiropracteur' },
      { value: 'psychologue', label: 'Psychologue' },
      { value: 'orthoptiste', label: 'Orthoptiste' },
      { value: 'ergotherapeute', label: 'Ergothérapeute' },
      { value: 'psychomotricien', label: 'Psychomotricien(ne)' },
    ],
  },
  {
    label: 'Médecine complémentaire',
    items: [
      { value: 'acupuncteur', label: 'Acupuncteur' },
      { value: 'naturopathe', label: 'Naturopathe' },
      { value: 'sophrologue', label: 'Sophrologue' },
    ],
  },
  {
    label: 'Établissement',
    items: [
      { value: 'centre_medical', label: 'Centre médical' },
      { value: 'centre_ophtalmologique', label: 'Centre ophtalmologique' },
      { value: 'clinique', label: 'Clinique' },
      { value: 'laboratoire', label: 'Laboratoire d\'analyses' },
      { value: 'pharmacien', label: 'Pharmacie' },
    ],
  },
  {
    label: 'Vétérinaire',
    items: [
      { value: 'veterinaire', label: 'Vétérinaire' },
    ],
  },
]

// Helper : trouver la catégorie contenant une spécialité
function getCategoryForSpecialty(spec: HealthSpecialty | ''): string {
  if (!spec) return specialtyCategories[0].label
  for (const cat of specialtyCategories) {
    if (cat.items.some((item) => item.value === spec)) return cat.label
  }
  return specialtyCategories[0].label
}

// ============================================================
// MOCK DATA GENERATOR — fallback quand Google Places n'est pas actif
// Génère des concurrents de démo basés sur la spécialité sélectionnée
// ============================================================

const DEMO_ADDRESSES_PARIS = [
  '12 Rue de Rivoli, 75004 Paris',
  '45 Avenue des Champs-Élysées, 75008 Paris',
  '8 Boulevard Saint-Germain, 75005 Paris',
  '23 Rue du Faubourg Saint-Honoré, 75008 Paris',
  '67 Avenue Victor Hugo, 75016 Paris',
  '15 Rue de la Pompe, 75016 Paris',
  '33 Boulevard Haussmann, 75009 Paris',
  '5 Place de la République, 75003 Paris',
]

function generateDemoCompetitors(
  specialty: HealthSpecialty | '',
  radiusKm: number
): { competitors: AutoCompetitor[]; stats: { avgRating: number; avgReviews: number; totalCompetitors: number }; disclaimer: string } {
  const specLabel = specialty ? (specialtyLabels[specialty] || specialty) : 'Professionnel de santé'

  // Noms de démo par type de spécialité
  const nameTemplates: Record<string, string[]> = {
    dentiste: ['Cabinet Dentaire Sourire', 'Centre Dentaire République', 'Dr Bernard - Dentiste', 'Dentiste du Parc', 'Centre Dentaire Saint-Michel'],
    centre_dentaire: ['Centre Dentaire Opéra', 'Centre Dentaire Nation', 'Dentego Rivoli', 'Centre Dentaire Bastille', 'Centre Dentaire Montparnasse'],
    centre_medico_dentaire: ['Centre Médico-Dentaire Étoile', 'CMC Santé Paris', 'Centre Médical et Dentaire Victor Hugo', 'Pôle Santé République', 'Centre Médico-Dentaire Montmartre'],
    centre_ophtalmologique: ['Centre Ophtalmo Vision+', 'Point Vision Paris', 'Centre Ophtalmologique Étoile', 'Ophta Center Bastille', 'Centre de la Vue République'],
    ophtalmologue: ['Dr Dupont - Ophtalmologue', 'Cabinet Ophtalmo Saint-Lazare', 'Dr Laurent - Ophtalmologie', 'Cabinet de la Vue Paris', 'Dr Moreau - Spécialiste des Yeux'],
    generaliste: ['Cabinet du Dr Martin', 'Centre Médical République', 'Dr Dupont Médecine Générale', 'Cabinet Médical Bastille', 'Maison de Santé Paris Centre'],
    dermatologue: ['Dr Petit - Dermatologue', 'Centre Dermatologique Paris', 'Cabinet Dermatologie Opéra', 'Dr Roux - Dermatologue', 'Centre Dermo Paris'],
    cardiologue: ['Dr Lefevre - Cardiologue', 'Centre Cardiologique Paris', 'Cabinet Cardio Saint-Germain', 'Dr Laurent - Cardiologie', 'Institut du Cœur Paris'],
    kinesitherapeute: ['Cabinet Kiné Sport', 'Centre de Rééducation Paris', 'Kiné République', 'Cabinet Kinésithérapie Bastille', 'Paris Physio Center'],
    osteopathe: ['Cabinet Ostéo Paris', 'Ostéopathie Centre', 'Dr Blanc - Ostéopathe', 'Cabinet Ostéo Saint-Germain', 'Ostéo Paris Santé'],
    pharmacien: ['Pharmacie du Centre', 'Grande Pharmacie Paris', 'Pharmacie de la Gare', 'Pharmacie Bastille', 'Pharmacie Montparnasse'],
    chirurgien_esthetique: ['Clinique Esthétique Paris', 'Dr Beauté - Chirurgie Esthétique', 'Centre Esthétique Champs-Élysées', 'Institut Beauté Paris', 'Clinique du Triangle d\'Or'],
  }

  // Fallback générique pour spécialités sans template spécifique
  const defaultNames = [
    `Cabinet ${specLabel} Paris Centre`,
    `Centre Médical ${specLabel}`,
    `Dr Martin - ${specLabel}`,
    `Cabinet ${specLabel} Bastille`,
    `Pôle Santé ${specLabel} République`,
  ]

  const names = nameTemplates[specialty || ''] || defaultNames
  const count = Math.min(names.length, 5)

  const competitors: AutoCompetitor[] = names.slice(0, count).map((name, i) => {
    const baseDist = (i + 1) * (radiusKm / count) * 0.7 + Math.random() * 0.3
    const dist = Math.round(Math.min(baseDist, radiusKm) * 10) / 10
    const rating = Math.round((3.8 + Math.random() * 1.2) * 10) / 10
    const reviewsCount = Math.round(30 + Math.random() * 250)
    const reviewsLast30d = Math.round(Math.random() * 8)
    return {
      id: `demo-${specialty || 'gen'}-${i}`,
      name,
      category: 'health' as EstablishmentType,
      specialty: (specialty || 'generaliste') as HealthSpecialty,
      distanceKm: dist,
      rating,
      reviewsCount,
      reviewsLast30d,
      trend: getReviewTrend(reviewsLast30d),
      isAuto: true as const,
      address: DEMO_ADDRESSES_PARIS[i % DEMO_ADDRESSES_PARIS.length],
    }
  })

  const avgRating = Math.round((competitors.reduce((a, c) => a + c.rating, 0) / competitors.length) * 10) / 10
  const avgReviews = Math.round(competitors.reduce((a, c) => a + c.reviewsCount, 0) / competitors.length)

  return {
    competitors,
    stats: { avgRating, avgReviews, totalCompetitors: competitors.length },
    disclaimer: `🎭 Données de démonstration pour "${specLabel}" (rayon ${radiusKm} km). Activez Google Places pour obtenir vos vrais concurrents.`,
  }
}

// ============================================================
// EXTRACTED HELPERS & SUB-COMPONENTS
// ============================================================

function getOwnStatsInsight(
  myRating: number, myReviews: number, responseRate: number, last30d: number,
): string {
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

function getComparisonInsight(
  myRating: number, myReviews: number,
  avgRating: number, avgReviews: number,
  radius: number,
): string {
  let ratingPart: string
  if (myRating > avgRating) {
    ratingPart = `Votre note (${myRating.toFixed(1)}) est supérieure à la moyenne locale (${avgRating})`
  } else if (myRating < avgRating) {
    ratingPart = `Votre note (${myRating.toFixed(1)}) est inférieure à la moyenne locale (${avgRating})`
  } else {
    ratingPart = `Votre note est dans la moyenne locale (${avgRating})`
  }

  let reviewsPart: string
  if (myReviews > avgReviews) {
    reviewsPart = `et vous avez plus d'avis que la moyenne.`
  } else if (myReviews < avgReviews) {
    reviewsPart = `mais vous avez moins d'avis que la moyenne dans un rayon de ${radius} km.`
  } else {
    reviewsPart = `avec un volume d'avis comparable.`
  }

  return `${ratingPart} ${reviewsPart}`
}

function computeInsight(params: {
  myRating: number; myReviews: number; responseRate: number; last30d: number
  hasStats: boolean
  activeAutoStats: { avgRating: number; avgReviews: number; totalCompetitors: number } | null
  autoCompetitorCount: number; radius: number
}): string {
  const { myRating, myReviews, responseRate, last30d, hasStats, activeAutoStats, autoCompetitorCount, radius } = params
  if (hasStats && !activeAutoStats) {
    return getOwnStatsInsight(myRating, myReviews, responseRate, last30d)
  }
  if (!activeAutoStats || autoCompetitorCount === 0) return ''
  return getComparisonInsight(myRating, myReviews, activeAutoStats.avgRating, activeAutoStats.avgReviews, radius)
}

function getNumericTrend(value: number): 'up' | 'down' | 'stable' {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'stable'
}

function getReviewTrend(count: number): 'up' | 'stable' | 'down' {
  if (count > 3) return 'up'
  if (count > 0) return 'stable'
  return 'down'
}

function TrendBadge({ value, isPercentage = false }: { value: number | null; isPercentage?: boolean }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>
  const trend = getNumericTrend(value)
  const variantMap = { up: 'success', down: 'destructive', stable: 'secondary' } as const
  const Icon = { up: TrendingUp, down: TrendingDown, stable: Minus }[trend]
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  const label = isPercentage
    ? `${value > 0 ? '+' : ''}${Math.round(value)}%`
    : `${sign}${Math.abs(value)}`
  return (
    <Badge variant={variantMap[trend]} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

function computeCompetitorReviewData(
  competitor: Record<string, unknown>,
): { reviewsLast30d: number | null; trend: 'up' | 'stable' | 'down' } {
  if (competitor.isReal && 'estimated30d' in competitor) {
    const val = competitor.estimated30d as number | null
    if (val === null) return { reviewsLast30d: null, trend: 'stable' }
    return { reviewsLast30d: val, trend: getNumericTrend(val) }
  }
  if ('trend' in competitor && 'reviewsLast30d' in competitor) {
    return { trend: competitor.trend as 'up' | 'stable' | 'down', reviewsLast30d: competitor.reviewsLast30d as number }
  }
  if ('trend30d' in competitor) {
    const t30d = competitor.trend30d as number
    return { reviewsLast30d: t30d, trend: t30d >= 0 ? 'up' : 'down' }
  }
  return { reviewsLast30d: null, trend: 'stable' }
}

function getCompetitorSubtitle(competitor: Record<string, unknown>): string {
  if (competitor.isReal && Array.isArray(competitor.types) && competitor.types.length > 0) {
    const typeLabel = getCompetitorTypeLabel(competitor.types)
    return competitor.distanceKm ? `${typeLabel} · ${competitor.distanceKm} km` : typeLabel
  }
  if (typeof competitor.address === 'string' && competitor.address) return competitor.address
  return competitor.distanceKm ? `${competitor.distanceKm} km` : '-'
}

const monthLabels: Record<string, string> = {
  '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
  '05': 'Mai', '06': 'Juin', '07': 'Juil', '08': 'Août',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
}

function computeEstablishmentData(
  googleData: { configured?: boolean; rating?: number | null; totalReviews?: number | null } | null | undefined,
  stats: { avgRatingAllTime?: number; totalAllTime?: number; totalPeriod?: number; responseRatePeriod?: number; reviewsDeltaPct?: number | null } | null | undefined,
) {
  return {
    rating: googleData?.configured && googleData.rating != null
      ? googleData.rating
      : (stats?.avgRatingAllTime ?? 0),
    reviewsCount: googleData?.configured && googleData.totalReviews != null
      ? googleData.totalReviews
      : (stats?.totalAllTime ?? 0),
    reviewsLast30d: stats?.totalPeriod ?? 0,
    responseRate: stats?.responseRatePeriod ?? 0,
    reviewsDeltaPct: stats?.reviewsDeltaPct ?? null,
  }
}

function buildEvolutionData(
  analyticsSeries: { period: string; reviews: number }[],
  totalAllTime: number,
) {
  if (analyticsSeries.length === 0) return []
  let cumul = totalAllTime - analyticsSeries.reduce((acc, p) => acc + p.reviews, 0)
  return analyticsSeries.map((p) => {
    cumul += p.reviews
    const monthKey = p.period.split('-')[1]
    return {
      month: monthLabels[monthKey] || p.period,
      vous: cumul,
      local: null as number | null,
    }
  })
}

interface CompetitorRowData {
  id: string; name: string; rating?: number | null
  reviewsCount: number; distanceKm?: number | null; isAuto: boolean
  [key: string]: unknown
}

function CompetitorRow({
  competitor, isPinned, isEstimated30d, onTogglePin, onToggleHide, onSelectCompetitor,
}: {
  competitor: CompetitorRowData; isPinned: boolean; isEstimated30d: boolean
  onTogglePin: (id: string) => void; onToggleHide: (id: string) => void
  onSelectCompetitor: (placeId: string, name: string) => void
}) {
  const { isAuto } = competitor
  const isReal = !!competitor.isReal
  const { reviewsLast30d } = computeCompetitorReviewData(competitor)
  const placeId = competitor.placeId as string | undefined
  const subtitle = getCompetitorSubtitle(competitor)
  let sourceType: 'real' | 'auto' | 'manual'
  if (isReal) sourceType = 'real'
  else if (isAuto) sourceType = 'auto'
  else sourceType = 'manual'
  const iconBgMap: Record<string, string> = {
    real: 'bg-green-50 group-hover:bg-green-100', auto: 'bg-slate-100', manual: 'bg-muted',
  }
  const iconColorMap: Record<string, string> = {
    real: 'text-green-500', auto: 'text-slate-400', manual: 'text-muted-foreground',
  }

  return (
    <tr className={`border-b hover:bg-muted/50 ${isPinned ? 'bg-amber-50/50' : ''}`}>
      <td className="py-4 px-4">
        <div
          className={`flex items-center gap-3 ${isReal ? 'cursor-pointer group' : ''}`}
          onClick={() => { if (isReal && placeId) onSelectCompetitor(placeId, competitor.name) }}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${iconBgMap[sourceType]}`}>
            <MapPin className={`h-5 w-5 ${iconColorMap[sourceType]}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`font-medium ${isReal ? 'group-hover:text-primary' : ''}`}>
                {competitor.name}
              </p>
              {isPinned && <Pin className="h-3 w-3 text-amber-500" />}
              {isReal && (
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </td>
      <td className="text-center py-4 px-4">
        <div className="flex items-center justify-center gap-1">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <span className="font-medium">{competitor.rating ?? '—'}</span>
        </div>
      </td>
      <td className="text-center py-4 px-4">{competitor.reviewsCount}</td>
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
        <TrendBadge value={reviewsLast30d} />
      </td>
      <td className="text-center py-4 px-4 text-muted-foreground">{competitor.distanceKm} km</td>
      <td className="text-center py-4 px-4">
        <SourceBadges isAuto={isAuto} isReal={isReal} />
      </td>
      <td className="text-right py-4 px-4">
        <CompetitorRowActions
          id={competitor.id} name={competitor.name} isAuto={isAuto} isReal={isReal}
          isPinned={isPinned} placeId={placeId}
          onTogglePin={onTogglePin} onToggleHide={onToggleHide} onSelectCompetitor={onSelectCompetitor}
        />
      </td>
    </tr>
  )
}

function SourceBadges({ isAuto, isReal }: { isAuto: boolean; isReal: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1">
      <Badge variant={isAuto ? 'outline' : 'secondary'} className={isAuto ? 'text-slate-500' : ''}>
        {isAuto ? 'Auto' : 'Manuel'}
      </Badge>
      <Badge
        variant="outline"
        className={`text-[10px] px-1 py-0 ${isReal ? 'text-green-600 border-green-300' : 'text-amber-600 border-amber-300'}`}
      >
        {isReal ? 'Google' : 'Démo'}
      </Badge>
    </div>
  )
}

function CompetitorRowActions({
  id, name, isAuto, isReal, isPinned, placeId, onTogglePin, onToggleHide, onSelectCompetitor,
}: {
  id: string; name: string; isAuto: boolean; isReal: boolean; isPinned: boolean; placeId?: string
  onTogglePin: (id: string) => void; onToggleHide: (id: string) => void
  onSelectCompetitor: (placeId: string, name: string) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {isAuto && (
        <>
          <Button variant="ghost" size="sm" onClick={() => onTogglePin(id)} title={isPinned ? 'Désépingler' : 'Épingler'}>
            {isPinned ? <PinOff className="h-4 w-4 text-amber-500" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onToggleHide(id)} title="Masquer">
            <EyeOff className="h-4 w-4" />
          </Button>
        </>
      )}
      {isReal && placeId ? (
        <Button variant="ghost" size="sm" onClick={() => onSelectCompetitor(placeId, name)} title="Voir les détails">
          <ExternalLink className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="ghost" size="sm">
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function YourEstablishmentRow({ location, data, loading }: {
  location: { name: string; address: string }
  data: { rating: number; reviewsCount: number; reviewsLast30d: number; reviewsDeltaPct: number | null }
  loading: boolean
}) {
  return (
    <tr className="border-b bg-primary/5">
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">V</span>
          </div>
          <div>
            <p className="font-medium">Vous ({location.name})</p>
            <p className="text-xs text-muted-foreground">{location.address}</p>
          </div>
        </div>
      </td>
      <td className="text-center py-4 px-4">
        {loading ? (
          <Skeleton className="h-5 w-12 mx-auto" />
        ) : (
          <div className="flex items-center justify-center gap-1">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="font-bold">{data.rating.toFixed(1)}</span>
          </div>
        )}
      </td>
      <td className="text-center py-4 px-4 font-medium">
        {loading ? <Skeleton className="h-5 w-10 mx-auto" /> : data.reviewsCount}
      </td>
      <td className="text-center py-4 px-4">
        {loading ? <Skeleton className="h-5 w-8 mx-auto" /> : data.reviewsLast30d}
      </td>
      <td className="text-center py-4 px-4">
        <TrendBadge value={data.reviewsDeltaPct} isPercentage />
      </td>
      <td className="text-center py-4 px-4">-</td>
      <td className="text-center py-4 px-4">
        <Badge variant="default">Vous</Badge>
      </td>
      <td className="text-right py-4 px-4"></td>
    </tr>
  )
}

function DisclaimerSection({
  hasRealData, competitorsUpdatedAt, isEstimated30d, disclaimer,
  competitorsError, syncError, syncMessage,
}: {
  hasRealData: boolean; competitorsUpdatedAt?: string | null; isEstimated30d: boolean
  disclaimer: string; competitorsError?: string | null; syncError?: string | null; syncMessage: string | null
}) {
  return (
    <>
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
        <div className="mt-2 text-xs text-red-500">Erreur chargement concurrents : {competitorsError}</div>
      )}
      {syncError && (
        <div className="mt-2 text-xs text-red-500">Erreur synchronisation : {syncError}</div>
      )}
      {syncMessage && (
        <div className="mt-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 font-medium">{syncMessage}</div>
      )}
    </>
  )
}

function ConfigurationCTAs({
  isConfigured, competitorsLoading, hasRealData, placesApiConfigured,
}: {
  isConfigured: boolean; competitorsLoading: boolean; hasRealData: boolean; placesApiConfigured: boolean
}) {
  if (competitorsLoading) return null

  if (!isConfigured) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50/50 p-4">
        <MapPin className="h-5 w-5 text-orange-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-sm text-foreground">Coordonnées GPS non configurées</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pour afficher vos vrais concurrents via Google Places, configurez l&apos;adresse de votre établissement dans les paramètres.
          </p>
        </div>
        <Button
          variant="outline" size="sm"
          className="text-orange-600 border-orange-300 hover:bg-orange-100 flex-shrink-0"
          onClick={() => window.location.href = '/settings'}
        >
          <Settings2 className="h-4 w-4 mr-1" />
          Configurer
        </Button>
      </div>
    )
  }

  if (!hasRealData && placesApiConfigured) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <MapPin className="h-5 w-5 text-blue-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-sm text-foreground">Aucune donnée Google Places</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Vos coordonnées sont configurées. Les données de concurrence seront récupérées automatiquement lors du prochain cycle hebdomadaire.
          </p>
        </div>
        <Badge variant="outline" className="text-blue-600 border-blue-300">En attente</Badge>
      </div>
    )
  }

  return null
}

function AddCompetitorDialog({
  open, onOpenChange, searchInput, onSearchChange, searchLoading,
  suggestions, addingPlaceId, addCompetitorLoading, onAddCompetitor,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  searchInput: string; onSearchChange: (input: string) => void; searchLoading: boolean
  suggestions: { placeId: string; mainText: string; secondaryText: string }[]
  addingPlaceId: string | null; addCompetitorLoading: boolean
  onAddCompetitor: (placeId: string, name: string) => void
}) {
  const showEmpty = searchInput.length >= 3 && !searchLoading && suggestions.length === 0
  const showHint = searchInput.length < 3
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un concurrent</DialogTitle>
          <DialogDescription>
            Recherchez un établissement par nom ou adresse pour l&apos;ajouter à votre liste de concurrents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={searchInput} onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Nom ou adresse de l'établissement..."
              className="h-10 w-full pl-9 pr-3 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              autoFocus
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className="max-h-[250px] overflow-y-auto border rounded-lg divide-y">
              {suggestions.map((s) => (
                <button
                  key={s.placeId}
                  onClick={() => onAddCompetitor(s.placeId, s.mainText)}
                  disabled={addingPlaceId === s.placeId || addCompetitorLoading}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-3 disabled:opacity-50"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.mainText}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.secondaryText}</p>
                  </div>
                  {addingPlaceId === s.placeId ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  ) : (
                    <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
          {showEmpty && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Aucun résultat pour &quot;{searchInput}&quot;
            </div>
          )}
          {showHint && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Saisissez au moins 3 caractères pour lancer la recherche
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function toggleSetItem(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function sortCompetitors(
  a: { id: string; isAuto: boolean; distanceKm?: number },
  b: { id: string; isAuto: boolean; distanceKm?: number },
  pinnedIds: Set<string>,
): number {
  const aPinned = pinnedIds.has(a.id) || !a.isAuto
  const bPinned = pinnedIds.has(b.id) || !b.isAuto
  if (aPinned && !bPinned) return -1
  if (!aPinned && bPinned) return 1
  return (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
}

export default function CompetitorsPage() {
  const { currentLocation, setCurrentLocation } = useAppStore()

  // ===== Vraies stats depuis le backend =====
  const { stats, loading: statsLoading, error: statsError } = useReviewStats('30d')
  const { series: analyticsSeries, loading: analyticsLoading } = useReviewAnalytics('90d', 'month')
  const { data: googleData } = useGoogleMyPlace()

  const currentEstablishmentData = computeEstablishmentData(googleData, stats)

  // État pour les paramètres de recherche auto
  const [establishmentType, setEstablishmentType] = useState<EstablishmentType>(
    currentLocation?.establishmentType || 'health'
  )
  const [specialty, setSpecialty] = useState<HealthSpecialty | ''>(
    currentLocation?.specialty || 'generaliste'
  )
  const [selectedCategory, setSelectedCategory] = useState<string>(
    getCategoryForSpecialty(currentLocation?.specialty || 'generaliste')
  )
  const [specialtySearch, setSpecialtySearch] = useState('')
  const [radius, setRadius] = useState<1 | 2 | 5>(
    establishmentType === 'health' ? 2 : 1
  )

  // Spécialités filtrées par catégorie active + recherche texte
  const filteredSpecialties = useMemo(() => {
    const cat = specialtyCategories.find((c) => c.label === selectedCategory)
    if (!cat) return []
    if (!specialtySearch.trim()) return cat.items
    const q = specialtySearch.toLowerCase().trim()
    return cat.items.filter((item) => item.label.toLowerCase().includes(q))
  }, [selectedCategory, specialtySearch])

  // ===== Hook pour sauvegarder la spécialité vers le backend =====
  const { configure: configureCompetitors, loading: savingSpecialty } = useConfigureCompetitors()

  // ===== Hook pour forcer un sync Google Places =====
  const { sync: syncCompetitors, loading: syncing, error: syncError } = useSyncCompetitors()
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const syncMessageTimeout = useRef<NodeJS.Timeout | null>(null)
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

  // ===== Dialog "Ajouter un concurrent" =====
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addSearchInput, setAddSearchInput] = useState('')
  const { suggestions: addSuggestions, loading: addSearchLoading, search: searchPlaces, clear: clearSuggestions } = usePlacesAutocomplete()
  const { addCompetitor: addCompetitorApi, loading: addCompetitorLoading } = useAddCompetitor()
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null)
  const addSearchDebounce = useRef<NodeJS.Timeout | null>(null)

  const handleAddSearch = useCallback((input: string) => {
    setAddSearchInput(input)
    if (addSearchDebounce.current) clearTimeout(addSearchDebounce.current)
    if (input.length < 3) {
      clearSuggestions()
      return
    }
    addSearchDebounce.current = setTimeout(() => {
      searchPlaces(input)
    }, 300)
  }, [searchPlaces, clearSuggestions])

  const handleAddCompetitor = useCallback(async (placeId: string, name: string) => {
    setAddingPlaceId(placeId)
    try {
      // Call backend to add the competitor (fetches details from Google + persists)
      const result = await addCompetitorApi(placeId, name)
      if (result) {
        setSyncMessage(`✅ ${result.message}`)
        if (syncMessageTimeout.current) clearTimeout(syncMessageTimeout.current)
        syncMessageTimeout.current = setTimeout(() => setSyncMessage(null), 5000)
        // Refresh the competitors list
        refetchCompetitors()
      }
      setAddDialogOpen(false)
      setAddSearchInput('')
      clearSuggestions()
    } catch (err) {
      console.error('Failed to add competitor:', err)
    } finally {
      setAddingPlaceId(null)
    }
  }, [addCompetitorApi, clearSuggestions, refetchCompetitors])

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
      const spec = currentLocation.specialty || 'generaliste'
      setSpecialty(spec)
      setSelectedCategory(getCategoryForSpecialty(spec))
      setSpecialtySearch('')
      setRadius(currentLocation.establishmentType === 'health' ? 2 : 1)
    }
  }, [currentLocation])

  // Charger données de démonstration si pas de données réelles Google Places
  const loadAutoCompetitors = useCallback(() => {
    if (hasRealData) return // Skip demo if real data available
    setIsLoading(true)
    try {
      const demo = generateDemoCompetitors(specialty, radius)
      setAutoCompetitors(demo.competitors)
      setAutoStats(demo.stats)
      setDisclaimer(demo.disclaimer)
    } catch (error) {
      console.error('Erreur chargement concurrents démo:', error)
    } finally {
      setIsLoading(false)
    }
  }, [specialty, radius, hasRealData])

  // Charger démo au montage et quand la spécialité/rayon change
  useEffect(() => {
    if (!hasRealData && !competitorsLoading) {
      loadAutoCompetitors()
    }
  }, [hasRealData, competitorsLoading, loadAutoCompetitors])

  const togglePin = (id: string) => {
    setPinnedAutoIds((prev) => toggleSetItem(prev, id))
  }

  const toggleHide = (id: string) => {
    setHiddenAutoIds((prev) => toggleSetItem(prev, id))
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

  allCompetitors.sort((a, b) => sortCompetitors(a, b, pinnedAutoIds))

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

  const insightText = computeInsight({
    myRating: currentEstablishmentData.rating,
    myReviews: currentEstablishmentData.reviewsCount,
    responseRate: currentEstablishmentData.responseRate,
    last30d: currentEstablishmentData.reviewsLast30d,
    hasStats: !!stats,
    activeAutoStats,
    autoCompetitorCount: allCompetitors.filter(c => c.isAuto).length,
    radius,
  })

  const evolutionData = buildEvolutionData(analyticsSeries, stats?.totalAllTime ?? 0)

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
        <Button className="gap-1" onClick={() => setAddDialogOpen(true)}>
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
          <div className="space-y-4">
            {/* Ligne 1 : Type + Rayon + Actions */}
            <div className="flex flex-wrap items-end gap-4">
              {/* Type d'établissement */}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground font-medium">
                  Type d&apos;établissement
                </p>
                <select
                  value={establishmentType}
                  onChange={(e) => {
                    const newType = e.target.value as EstablishmentType
                    setEstablishmentType(newType)
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

              {/* Rayon géographique */}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground font-medium">
                  Rayon
                </p>
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

              <SyncAndToggleButtons
                isConfigured={isConfigured}
                placesApiConfigured={placesApiConfigured}
                syncing={syncing}
                competitorsLoading={competitorsLoading}
                isLoading={isLoading}
                hasRealData={hasRealData}
                showAuto={showAuto}
                onSync={async () => {
                  const result = await syncCompetitors()
                  if (result) {
                    setSyncMessage(`✅ ${result.placesStored} concurrent${result.placesStored > 1 ? 's' : ''} trouvé${result.placesStored > 1 ? 's' : ''} via Google Places`)
                    if (syncMessageTimeout.current) clearTimeout(syncMessageTimeout.current)
                    syncMessageTimeout.current = setTimeout(() => setSyncMessage(null), 5000)
                    refetchCompetitors()
                  }
                }}
                onRefresh={hasRealData ? refetchCompetitors : loadAutoCompetitors}
                onToggleAuto={() => setShowAuto(!showAuto)}
              />
            </div>

            {establishmentType === 'health' && (
              <SpecialtySelector
                specialty={specialty}
                savingSpecialty={savingSpecialty}
                specialtySaved={specialtySaved}
                selectedCategory={selectedCategory}
                onCategoryChange={(val) => { setSelectedCategory(val); setSpecialtySearch('') }}
                specialtySearch={specialtySearch}
                onSpecialtySearchChange={setSpecialtySearch}
                filteredSpecialties={filteredSpecialties}
                onSpecialtyChange={handleSpecialtyChange}
              />
            )}
          </div>

          <DisclaimerSection
            hasRealData={hasRealData}
            competitorsUpdatedAt={competitorsUpdatedAt}
            isEstimated30d={isEstimated30d}
            disclaimer={disclaimer}
            competitorsError={competitorsError}
            syncError={syncError}
            syncMessage={syncMessage}
          />
          <ConfigurationCTAs
            isConfigured={isConfigured}
            competitorsLoading={competitorsLoading}
            hasRealData={hasRealData}
            placesApiConfigured={placesApiConfigured}
          />
        </CardContent>
      </Card>

      <ComparativeTableCard
        activeAutoStats={activeAutoStats}
        hasRealData={hasRealData}
        loading={isLoading || competitorsLoading}
        empty={allCompetitors.length === 0 && filteredManualCompetitors.length === 0}
        allCompetitors={allCompetitors as CompetitorRowData[]}
        currentLocation={currentLocation}
        currentEstablishmentData={currentEstablishmentData}
        statsLoading={statsLoading}
        pinnedAutoIds={pinnedAutoIds}
        isEstimated30d={isEstimated30d}
        onTogglePin={togglePin}
        onToggleHide={toggleHide}
        onSelectCompetitor={(pid: string, name: string) => {
          setSelectedPlaceId(pid)
          setSelectedCompetitorName(name)
        }}
      />

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
            <EvolutionChartContent
              loading={analyticsLoading}
              evolutionData={evolutionData}
            />
          </CardContent>
        </Card>
      </div>

      {insightText && (
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
                  {insightText}
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

      <AddCompetitorDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        searchInput={addSearchInput}
        onSearchChange={handleAddSearch}
        searchLoading={addSearchLoading}
        suggestions={addSuggestions}
        addingPlaceId={addingPlaceId}
        addCompetitorLoading={addCompetitorLoading}
        onAddCompetitor={handleAddCompetitor}
      />
    </div>
  )
}

function SpecialtySelector({
  specialty,
  savingSpecialty,
  specialtySaved,
  selectedCategory,
  onCategoryChange,
  specialtySearch,
  onSpecialtySearchChange,
  filteredSpecialties,
  onSpecialtyChange,
}: {
  specialty: HealthSpecialty | ''
  savingSpecialty: boolean
  specialtySaved: boolean
  selectedCategory: string
  onCategoryChange: (val: string) => void
  specialtySearch: string
  onSpecialtySearchChange: (val: string) => void
  filteredSpecialties: { value: HealthSpecialty; label: string }[]
  onSpecialtyChange: (spec: HealthSpecialty) => void
}) {
  return (
    <div className="space-y-2.5 rounded-lg border border-input/50 bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground font-medium">
          Spécialité
        </p>
        {savingSpecialty && (
          <span className="text-xs text-blue-500 animate-pulse">Sauvegarde...</span>
        )}
        {specialtySaved && !savingSpecialty && (
          <span className="text-xs text-green-600">✓ Enregistré</span>
        )}
        {specialty && (
          <Badge variant="outline" className="text-xs ml-auto">
            {specialtyLabels[specialty] || specialty}
          </Badge>
        )}
      </div>

      <Tabs
        value={selectedCategory}
        onValueChange={onCategoryChange}
      >
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
          {specialtyCategories.map((cat) => (
            <TabsTrigger
              key={cat.label}
              value={cat.label}
              className="text-xs px-2.5 py-1.5 rounded-full border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-none border-input bg-background hover:bg-muted"
            >
              {cat.label}
              <span className="ml-1 text-[10px] opacity-60">
                ({cat.items.length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-[250px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={specialtySearch}
            onChange={(e) => onSpecialtySearchChange(e.target.value)}
            placeholder="Filtrer..."
            className="h-9 w-full pl-8 pr-3 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>
        <select
          value={specialty}
          onChange={(e) => onSpecialtyChange(e.target.value as HealthSpecialty)}
          disabled={savingSpecialty}
          className="h-9 px-3 rounded-lg border border-input bg-background text-sm min-w-[220px]"
        >
          {filteredSpecialties.length === 0 && (
            <option value="" disabled>Aucun résultat</option>
          )}
          {filteredSpecialties.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ComparativeTableCard({
  activeAutoStats,
  hasRealData,
  loading,
  empty,
  allCompetitors,
  currentLocation,
  currentEstablishmentData,
  statsLoading,
  pinnedAutoIds,
  isEstimated30d,
  onTogglePin,
  onToggleHide,
  onSelectCompetitor,
}: {
  activeAutoStats: { avgRating: number; avgReviews: number; totalCompetitors: number } | null
  hasRealData: boolean
  loading: boolean
  empty: boolean
  allCompetitors: CompetitorRowData[]
  currentLocation: { name: string; address: string } | null
  currentEstablishmentData: { rating: number; reviewsCount: number; reviewsLast30d: number; reviewsDeltaPct: number | null }
  statsLoading: boolean
  pinnedAutoIds: Set<string>
  isEstimated30d: boolean
  onTogglePin: (id: string) => void
  onToggleHide: (id: string) => void
  onSelectCompetitor: (placeId: string, name: string) => void
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparatif</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((k) => (
              <div key={k} className="flex items-center gap-4">
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
        </CardContent>
      </Card>
    )
  }

  if (empty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparatif</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    )
  }

  return (
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
              {currentLocation && (
                <YourEstablishmentRow
                  location={currentLocation}
                  data={currentEstablishmentData}
                  loading={statsLoading}
                />
              )}
              {allCompetitors.map((competitor) => (
                <CompetitorRow
                  key={competitor.id}
                  competitor={competitor}
                  isPinned={pinnedAutoIds.has(competitor.id)}
                  isEstimated30d={isEstimated30d}
                  onTogglePin={onTogglePin}
                  onToggleHide={onToggleHide}
                  onSelectCompetitor={onSelectCompetitor}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function EvolutionChartContent({
  loading,
  evolutionData,
}: {
  loading: boolean
  evolutionData: { month: string; vous: number; local: number | null }[]
}) {
  if (loading) {
    return (
      <div className="h-[250px] flex items-center justify-center">
        <div className="text-center space-y-2">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      </div>
    )
  }
  if (evolutionData.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
        Pas encore de données d&apos;évolution
      </div>
    )
  }
  return (
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
  )
}

function SyncAndToggleButtons({
  isConfigured,
  placesApiConfigured,
  syncing,
  competitorsLoading,
  isLoading,
  showAuto,
  onSync,
  onRefresh,
  onToggleAuto,
}: {
  isConfigured: boolean
  placesApiConfigured: boolean
  syncing: boolean
  competitorsLoading: boolean
  isLoading: boolean
  hasRealData: boolean
  showAuto: boolean
  onSync: () => void
  onRefresh: () => void
  onToggleAuto: () => void
}) {
  const syncButtonActive = isConfigured && placesApiConfigured

  return (
    <>
      {syncButtonActive ? (
        <Button onClick={onSync} disabled={syncing || competitorsLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sync en cours...' : 'Sync Google Places'}
        </Button>
      ) : (
        <Button onClick={onRefresh} disabled={isLoading || competitorsLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isLoading || competitorsLoading ? 'animate-spin' : ''}`} />
          Mettre à jour
        </Button>
      )}
      <Button variant="outline" onClick={onToggleAuto} className="gap-2">
        {showAuto ? (
          <><EyeOff className="h-4 w-4" />Masquer auto</>
        ) : (
          <><Eye className="h-4 w-4" />Afficher auto</>
        )}
      </Button>
    </>
  )
}
