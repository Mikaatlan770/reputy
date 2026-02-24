'use client'

import { useEffect } from 'react'
import { useCompetitorDetails, type PlaceDetails } from '@/lib/competitors/use-competitors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  X,
  Star,
  MapPin,
  Phone,
  Globe,
  Clock,
  ExternalLink,
  MessageSquare,
  Loader2,
} from 'lucide-react'

// ============ Types Google → Labels FR ============

const googleTypeLabels: Record<string, string> = {
  // ── Santé ──
  dentist: 'Dentiste',
  doctor: 'Médecin',
  hospital: 'Hôpital / Clinique',
  pharmacy: 'Pharmacie',
  physiotherapist: 'Kinésithérapeute',
  veterinary_care: 'Vétérinaire',
  health: 'Santé',
  medical_lab: 'Laboratoire d\'analyses',
  // ── Commerce & Restauration ──
  store: 'Commerce',
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  bakery: 'Boulangerie',
  supermarket: 'Supermarché',
  grocery_store: 'Épicerie',
  shopping_mall: 'Centre commercial',
  clothing_store: 'Magasin de vêtements',
  jewelry_store: 'Bijouterie',
  // ── Beauté / Bien-être ──
  beauty_salon: 'Institut de beauté',
  hair_salon: 'Salon de coiffure',
  hair_care: 'Soins capillaires',
  spa: 'Spa',
  nail_salon: 'Salon de manucure',
  // ── Services / Éducation / Lieux ──
  university: 'Université',
  school: 'École',
  secondary_school: 'Collège / Lycée',
  primary_school: 'École primaire',
  bank: 'Banque',
  post_office: 'Bureau de poste',
  gas_station: 'Station-service',
  parking: 'Parking',
  gym: 'Salle de sport',
  park: 'Parc',
  museum: 'Musée',
  library: 'Bibliothèque',
  // ── Types génériques Google ──
  point_of_interest: 'Lieu d\'intérêt',
  establishment: 'Établissement',
  local_government_office: 'Administration',
  city_hall: 'Mairie',
  fire_station: 'Caserne de pompiers',
  police: 'Commissariat',
  church: 'Église',
  mosque: 'Mosquée',
  synagogue: 'Synagogue',
  cemetery: 'Cimetière',
  drugstore: 'Parapharmacie',
}

export function getCompetitorTypeLabel(types: string[]): string {
  for (const t of types) {
    if (googleTypeLabels[t]) return googleTypeLabels[t]
  }
  return ''
}

// ============ Star Rating Component ============

function StarRating({ rating }: { rating: number }) {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars.push(
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
      )
    } else if (i - 0.5 <= rating) {
      stars.push(
        <Star key={i} className="h-4 w-4 fill-amber-400/50 text-amber-400" />
      )
    } else {
      stars.push(
        <Star key={i} className="h-4 w-4 text-gray-200" />
      )
    }
  }
  return <div className="flex items-center gap-0.5">{stars}</div>
}

// ============ Review Item ============

function ReviewItem({ review }: { review: PlaceDetails['reviews'][0] }) {
  return (
    <div className="border-b last:border-0 pb-3 last:pb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{review.author}</span>
        <span className="text-xs text-muted-foreground">
          {review.relativePublishTimeDescription || ''}
        </span>
      </div>
      <div className="flex items-center gap-1 mb-1.5">
        <StarRating rating={review.rating} />
        <span className="text-xs text-muted-foreground ml-1">{review.rating}/5</span>
      </div>
      {review.text && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {review.text.length > 200
            ? review.text.slice(0, 200) + '...'
            : review.text}
        </p>
      )}
    </div>
  )
}

// ============ Opening Hours ============

function OpeningHours({ hours }: { hours: Record<string, unknown> | null }) {
  if (!hours) return null

  // Google Places API (New) returns regularOpeningHours with weekdayDescriptions
  const descriptions = (hours as { weekdayDescriptions?: string[] }).weekdayDescriptions
  if (!descriptions || descriptions.length === 0) return null

  return (
    <div className="space-y-1">
      {descriptions.map((desc) => (
        <p key={desc} className="text-sm text-muted-foreground">{desc}</p>
      ))}
    </div>
  )
}

// ============ Main Drawer Component ============

interface CompetitorDetailDrawerProps {
  placeId: string | null
  competitorName?: string
  onClose: () => void
}

export function CompetitorDetailDrawer({
  placeId,
  competitorName,
  onClose,
}: CompetitorDetailDrawerProps) {
  const { details, loading, error, fetchDetails, reset } = useCompetitorDetails()

  // Fetch details when placeId changes
  useEffect(() => {
    if (placeId) {
      fetchDetails(placeId)
    } else {
      reset()
    }
  }, [placeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (placeId) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [placeId, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (placeId) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [placeId])

  if (!placeId) return null

  const d = details

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-2xl border-l overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {d?.name || competitorName || 'Détails concurrent'}
            </h2>
            {d && d.types.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {getCompetitorTypeLabel(d.types)}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-2 flex-shrink-0">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Loading */}
          {loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Chargement des détails...</span>
              </div>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-medium">Erreur</p>
              <p className="mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => placeId && fetchDetails(placeId)}
                className="mt-2"
              >
                Réessayer
              </Button>
            </div>
          )}

          {/* Details loaded */}
          {d && !loading && (
            <>
              {/* Rating & Reviews Count */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <StarRating rating={d.rating || 0} />
                  <span className="text-lg font-bold">{d.rating?.toFixed(1) || '—'}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {d.userRatingsTotal} avis au total
                </span>
              </div>

              {/* Contact Info */}
              <div className="space-y-3">
                {/* Address */}
                {d.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground hover:text-primary hover:underline"
                    >
                      {d.address}
                    </a>
                  </div>
                )}

                {/* Phone */}
                {d.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a
                      href={`tel:${d.phone}`}
                      className="text-sm text-foreground hover:text-primary hover:underline"
                    >
                      {d.phone}
                    </a>
                  </div>
                )}

                {/* Website */}
                {d.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a
                      href={d.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate max-w-[280px]"
                    >
                      {d.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                    <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  </div>
                )}
              </div>

              {/* Google Maps link */}
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${d.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                <MapPin className="h-4 w-4" />
                Voir sur Google Maps
                <ExternalLink className="h-3 w-3" />
              </a>

              {/* Types / Tags */}
              {d.types.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Catégories Google</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {d.types.slice(0, 8).map((type) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {googleTypeLabels[type] || type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Opening Hours */}
              {d.openingHours && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Horaires d&apos;ouverture
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <OpeningHours hours={d.openingHours} />
                  </div>
                </div>
              )}

              {/* Reviews */}
              {d.reviews && d.reviews.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    Derniers avis Google ({d.reviews.length})
                  </h3>
                  <div className="space-y-3">
                    {d.reviews.map((review) => (
                      <ReviewItem key={review.time ?? review.authorUrl} review={review} />
                    ))}
                  </div>
                </div>
              )}

              {/* Fetched at */}
              {d.fetchedAt && (
                <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                  Données récupérées le {new Date(d.fetchedAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
