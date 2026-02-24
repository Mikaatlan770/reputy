'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useGoogleMyPlace } from '@/lib/google/use-google-my-place'
import type { GoogleReview } from '@/lib/google/use-google-my-place'
import {
  Star,
  MapPin,
  Phone,
  Globe,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    const fill = Math.min(1, Math.max(0, rating - (i - 1)))
    stars.push(
      <div key={i} className="relative">
        <Star
          className={cn(
            size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5',
            'text-slate-300'
          )}
          fill="currentColor"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <Star
            className={cn(
              size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5',
              'text-amber-400'
            )}
            fill="currentColor"
          />
        </div>
      </div>
    )
  }
  return <div className="flex items-center gap-0.5">{stars}</div>
}

function ReviewCard({ review }: { review: GoogleReview }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = review.text && review.text.length > 150

  return (
    <div className="border-b border-border last:border-0 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{review.author}</p>
            <div className="flex items-center gap-2">
              <StarRating rating={review.rating} />
              <span className="text-xs text-muted-foreground">{review.relativeTime}</span>
            </div>
          </div>
        </div>
      </div>
      {review.text && (
        <p className={cn('text-sm text-muted-foreground mt-2 ml-10', !expanded && isLong && 'line-clamp-2')}>
          {review.text}
        </p>
      )}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:underline mt-1 ml-10"
        >
          {expanded ? 'Voir moins' : 'Voir plus'}
        </button>
      )}
    </div>
  )
}

export function GoogleMyPlace() {
  const { data, loading, error, refetch } = useGoogleMyPlace()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Impossible de charger votre fiche Google</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data?.configured) {
    return (
      <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2.5">
              <MapPin className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-foreground">Fiche Google non configurée</p>
              <p className="text-sm text-muted-foreground mt-1">
                {data?.message || 'Connectez votre fiche Google Business pour voir votre note et vos derniers avis ici.'}
              </p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <a href="/settings">Configurer</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const rating = data.rating ?? 0
  const totalReviews = data.totalReviews ?? 0
  const reviews = data.reviews ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Ma fiche Google
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rating hero */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-amber-50 dark:from-blue-950/30 dark:to-amber-950/30 border border-blue-100 dark:border-blue-900/50">
          <div className="text-center">
            <p className="text-4xl font-bold text-foreground">{rating.toFixed(1)}</p>
            <StarRating rating={rating} size="lg" />
          </div>
          <div className="border-l border-border pl-4">
            <p className="text-2xl font-semibold text-foreground">{totalReviews}</p>
            <p className="text-sm text-muted-foreground">avis Google</p>
          </div>
        </div>

        {/* Place info */}
        {(data.address || data.phone || data.website) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {data.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {data.address}
              </span>
            )}
            {data.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {data.phone}
              </span>
            )}
            {data.website && (
              <a
                href={data.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Globe className="h-3 w-3" />
                Site web
              </a>
            )}
          </div>
        )}

        {/* Latest reviews */}
        {reviews.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Derniers avis</p>
              <Badge variant="outline" className="text-[10px]">{reviews.length} plus récents</Badge>
            </div>
            <div className="divide-y divide-border">
              {reviews.map((review) => (
                <ReviewCard key={review.author ?? review.publishTime} review={review} />
              ))}
            </div>
          </div>
        )}

        {reviews.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun avis récent trouvé.
          </p>
        )}

        {/* Google link */}
        {data.placeId && (
          <div className="pt-2 border-t border-border">
            <a
              href={`https://search.google.com/local/reviews?placeid=${data.placeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Voir tous les avis sur Google
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
