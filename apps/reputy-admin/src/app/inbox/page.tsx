'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useReviews,
  useReviewStats,
  useReplyReview,
  useUpdateReviewStatus,
  type Review,
} from '@/lib/reviews/use-reviews'
import { formatDateTime, getInitials } from '@/lib/utils'
import {
  Star,
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  X,
  Loader2,
  EyeOff,
  RotateCcw,
  Inbox,
  ChevronDown,
} from 'lucide-react'

export default function InboxPage() {
  // ===== Real data from backend =====
  const { stats, loading: statsLoading } = useReviewStats('30d')
  const {
    data: reviewsData,
    loading: reviewsLoading,
    error: reviewsError,
    refetch: refetchReviews,
  } = useReviews({ status: 'pending' }, { sort: 'reviewed_at', order: 'desc', limit: 50 })

  const { submitReply, loading: replyLoading } = useReplyReview()
  const { updateStatus, loading: statusLoading } = useUpdateReviewStatus()

  // ===== Local state =====
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Pending reviews from backend
  const pendingReviews = reviewsData?.reviews ?? []

  // Stats
  const pendingCount = stats?.pendingCount ?? pendingReviews.length
  const repliedPeriod = stats?.repliedCountPeriod ?? 0
  const avgResponseTime = stats?.avgResponseTimeHours

  // ===== Handlers =====
  const handleReply = useCallback(
    async (reviewId: string) => {
      if (!replyText.trim()) return

      const result = await submitReply(reviewId, replyText.trim())
      if (result) {
        setReplyText('')
        setReplyingTo(null)
        setActionSuccess(`Réponse envoyée pour "${result.authorName}"`)
        setTimeout(() => setActionSuccess(null), 3000)
        refetchReviews()
      }
    },
    [replyText, submitReply, refetchReviews]
  )

  const handleIgnore = useCallback(
    async (reviewId: string, authorName: string) => {
      const result = await updateStatus(reviewId, 'ignored')
      if (result) {
        setActionSuccess(`Avis de "${authorName}" ignoré`)
        setTimeout(() => setActionSuccess(null), 3000)
        refetchReviews()
      }
    },
    [updateStatus, refetchReviews]
  )

  const handleStartReply = (reviewId: string) => {
    setReplyingTo(reviewId)
    setReplyText('')
  }

  const handleCancelReply = () => {
    setReplyingTo(null)
    setReplyText('')
  }

  const toggleExpand = (reviewId: string) => {
    setExpandedReviewId(expandedReviewId === reviewId ? null : reviewId)
  }

  // ===== Helpers =====
  const getSentimentBadge = (review: Review) => {
    if (review.sentiment === 'negative' || review.rating <= 2) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          Négatif
        </Badge>
      )
    }
    if (review.sentiment === 'positive' || review.rating >= 4) {
      return (
        <Badge variant="success" className="text-[10px]">
          Positif
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="text-[10px]">
        Neutre
      </Badge>
    )
  }

  const getUrgencyLabel = (review: Review) => {
    const daysSince = Math.floor(
      (Date.now() - new Date(review.reviewedAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSince > 7) return { label: `${daysSince}j`, variant: 'destructive' as const }
    if (daysSince > 3) return { label: `${daysSince}j`, variant: 'warning' as const }
    if (daysSince >= 1) return { label: `${daysSince}j`, variant: 'secondary' as const }
    return { label: "Aujourd'hui", variant: 'secondary' as const }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Réponses (Inbox)</h1>
          <p className="text-muted-foreground mt-1">
            Centralisez vos avis à traiter et répondez rapidement
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refetchReviews}
          disabled={reviewsLoading}
          className="gap-2"
        >
          <RotateCcw className={`h-4 w-4 ${reviewsLoading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Success toast */}
      {actionSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">À traiter</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{pendingCount}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Temps moyen de réponse</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">
                    {avgResponseTime != null
                      ? avgResponseTime < 24
                        ? `${Math.round(avgResponseTime)}h`
                        : `${Math.round(avgResponseTime / 24)}j`
                      : '—'}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Réponses (30j)</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{repliedPeriod}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error state */}
      {reviewsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Erreur de chargement</p>
          <p className="mt-1">{reviewsError}</p>
          <Button variant="outline" size="sm" onClick={refetchReviews} className="mt-2">
            Réessayer
          </Button>
        </div>
      )}

      {/* Inbox List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Avis en attente de réponse</CardTitle>
            {pendingReviews.length > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                {pendingReviews.length} avis
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading skeleton */}
          {reviewsLoading && pendingReviews.length === 0 ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                  <Skeleton className="h-9 w-24 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : pendingReviews.length === 0 && !reviewsError ? (
            /* Empty state */
            <div className="text-center py-12">
              <Inbox className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <h3 className="font-semibold text-foreground">Inbox vide !</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Tous les avis ont été traités. Revenez plus tard.
              </p>
            </div>
          ) : (
            /* Review list */
            <div className="space-y-3">
              {pendingReviews.map((review) => {
                const isExpanded = expandedReviewId === review.id
                const isReplying = replyingTo === review.id
                const urgency = getUrgencyLabel(review)

                return (
                  <div
                    key={review.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      review.rating <= 2
                        ? 'bg-red-50/50 border-red-200 hover:bg-red-50'
                        : review.rating === 3
                          ? 'bg-amber-50/50 border-amber-200 hover:bg-amber-50'
                          : 'bg-muted/50 border-transparent hover:bg-muted'
                    }`}
                  >
                    {/* Review header */}
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(review.authorName)}
                        </AvatarFallback>
                      </Avatar>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => toggleExpand(review.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="google" className="text-[10px]">
                            {review.provider === 'google' ? 'Google' : review.provider}
                          </Badge>
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-3 w-3 ${
                                  s <= review.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          {getSentimentBadge(review)}
                          <Badge variant={urgency.variant} className="text-[10px]">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {urgency.label}
                          </Badge>
                        </div>
                        <p className="font-medium mt-1">{review.authorName}</p>
                        <p
                          className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-2'}`}
                        >
                          {review.comment || (
                            <em className="text-muted-foreground/70">Aucun commentaire</em>
                          )}
                        </p>
                        {review.comment &&
                          review.comment.length > 120 &&
                          !isExpanded && (
                            <button className="text-xs text-primary mt-0.5 flex items-center gap-0.5">
                              <ChevronDown className="h-3 w-3" />
                              Voir plus
                            </button>
                          )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(review.reviewedAt)}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isReplying && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleStartReply(review.id)}
                              disabled={replyLoading || statusLoading}
                            >
                              Répondre
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleIgnore(review.id, review.authorName)}
                              disabled={replyLoading || statusLoading}
                              title="Ignorer cet avis"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <EyeOff className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Reply form */}
                    {isReplying && (
                      <div className="mt-4 ml-14 space-y-3">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={`Répondre à ${review.authorName}...`}
                          className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReply(review.id)}
                            disabled={!replyText.trim() || replyLoading}
                            className="gap-1.5"
                          >
                            {replyLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Envoyer
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelReply}
                            disabled={replyLoading}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Annuler
                          </Button>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {replyText.length} caractères
                          </span>
                        </div>
                        {review.provider === 'google' && (
                          <p className="text-xs text-blue-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            La réponse sera publiée automatiquement sur Google
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {review.tags && review.tags.length > 0 && (
                      <div className="mt-2 ml-14 flex flex-wrap gap-1">
                        {review.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
