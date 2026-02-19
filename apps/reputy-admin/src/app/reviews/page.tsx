'use client'

import { useState, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { useReviews, useReplyReview, useUpdateReviewStatus, Review } from '@/lib/reviews'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Star,
  Search,
  Filter,
  MessageSquare,
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Globe,
  ChevronLeft,
  ChevronRight,
  Loader2,
  XCircle,
} from 'lucide-react'
import { cn, formatDate, getInitials } from '@/lib/utils'
import { AiReplyAssistant } from '@/components/ai/AiReplyAssistant'
import { WebsiteWidgetManager } from '@/components/embed'

const PAGE_SIZE = 20

export default function ReviewsPage() {
  const { currentLocation } = useAppStore()
  
  // Filters state
  const [filterRating, setFilterRating] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'pending' | 'replied' | 'ignored' | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  
  // Dialog state
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [responseText, setResponseText] = useState('')
  const [selectedTone, setSelectedTone] = useState<string>('professional')
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)

  // API hooks
  const { data, loading, error, refetch } = useReviews(
    {
      status: filterStatus,
      rating: filterRating !== 'all' ? parseInt(filterRating) : undefined,
      search: searchQuery || undefined,
    },
    {
      sort: 'reviewed_at',
      order: 'desc',
      limit: PAGE_SIZE,
      offset: currentPage * PAGE_SIZE,
    }
  )

  const { submitReply, loading: submittingReply, error: replyError } = useReplyReview()
  const { updateStatus, loading: updatingStatus } = useUpdateReviewStatus()

  const reviews = data?.reviews || []
  const totalReviews = data?.total || 0
  const hasMore = data?.hasMore || false
  const totalPages = Math.ceil(totalReviews / PAGE_SIZE)

  // Count pending reviews
  const pendingCount = useMemo(() => {
    return reviews.filter(r => r.status === 'pending').length
  }, [reviews])

  // Handle filter changes - reset to first page
  const handleFilterChange = useCallback((type: 'rating' | 'status' | 'search', value: string) => {
    setCurrentPage(0)
    if (type === 'rating') setFilterRating(value)
    if (type === 'status') setFilterStatus(value as 'pending' | 'replied' | 'ignored' | 'all')
    if (type === 'search') setSearchQuery(value)
  }, [])

  // AI suggestion handler
  const handleSelectAiSuggestion = useCallback((text: string) => {
    setResponseText(text)
  }, [])

  // Send response handler
  const handleSendResponse = useCallback(async () => {
    if (!selectedReview || !responseText.trim()) return

    const result = await submitReply(selectedReview.id, responseText)
    if (result) {
      setSelectedReview(null)
      setResponseText('')
      refetch()
    }
  }, [selectedReview, responseText, submitReply, refetch])

  // Ignore review handler
  const handleIgnoreReview = useCallback(async () => {
    if (!selectedReview) return

    const result = await updateStatus(selectedReview.id, 'ignored')
    if (result) {
      setSelectedReview(null)
      refetch()
    }
  }, [selectedReview, updateStatus, refetch])

  // Convert Review to legacy format for AiReplyAssistant
  const selectedReviewForAi = selectedReview ? {
    id: selectedReview.id,
    locationId: 'current',
    platform: selectedReview.provider as 'google' | 'doctolib' | 'facebook',
    rating: selectedReview.rating,
    author: selectedReview.authorName,
    date: selectedReview.reviewedAt,
    content: selectedReview.comment || '',
    responded: selectedReview.status === 'replied',
    responseText: selectedReview.replyText || undefined,
    responseDate: selectedReview.replySentAt || undefined,
    tags: selectedReview.tags,
    sentiment: selectedReview.sentiment || undefined,
  } : null

  // Convert reviews for widget manager
  const reviewsForWidget = reviews.map((r) => ({
    id: r.id,
    author: r.authorName,
    rating: r.rating,
    content: r.comment || '',
    date: r.reviewedAt,
    source: 'google' as const,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Avis</h1>
          <p className="text-muted-foreground mt-1">
            Gérez et répondez aux avis de vos clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterStatus === 'pending' ? (
            <Badge variant="secondary" className="px-3 py-1.5">
              {totalReviews} à traiter
            </Badge>
          ) : (
            <Badge variant="secondary" className="px-3 py-1.5">
              {totalReviews} avis au total
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWidgetManagerOpen(true)}
            className="gap-1"
          >
            <Globe className="h-4 w-4" />
            Widget site
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par auteur ou contenu..."
                value={searchQuery}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterRating} onValueChange={(v) => handleFilterChange('rating', v)}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <Star className="h-4 w-4 mr-2 text-amber-500" />
                  <SelectValue placeholder="Note" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes notes</SelectItem>
                  <SelectItem value="5">5 étoiles</SelectItem>
                  <SelectItem value="4">4 étoiles</SelectItem>
                  <SelectItem value="3">3 étoiles</SelectItem>
                  <SelectItem value="2">2 étoiles</SelectItem>
                  <SelectItem value="1">1 étoile</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => handleFilterChange('status', v)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les avis</SelectItem>
                  <SelectItem value="pending">Non répondus</SelectItem>
                  <SelectItem value="replied">Répondus</SelectItem>
                  <SelectItem value="ignored">Ignorés</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="font-semibold text-foreground">Erreur de chargement</h3>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reviews List */}
      {!loading && !error && (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-foreground">Aucun avis trouvé</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Modifiez vos filtres ou attendez de nouveaux avis.
                </p>
              </CardContent>
            </Card>
          ) : (
            reviews.map((review) => (
              <Card
                key={review.id}
                className={cn(
                  'hover:shadow-card-hover transition-shadow cursor-pointer',
                  review.status === 'pending' && 'border-l-4 border-l-primary'
                )}
                onClick={() => setSelectedReview(review)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(review.authorName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {review.authorName}
                            </span>
                            {review.provider === 'google' && (
                              <Badge variant="google" className="text-[10px]">
                                Google
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={cn(
                                    'h-4 w-4',
                                    star <= review.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-gray-300'
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(review.reviewedAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {review.status === 'replied' ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Répondu
                            </Badge>
                          ) : review.status === 'ignored' ? (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <XCircle className="h-3 w-3" />
                              Ignoré
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              En attente
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-foreground leading-relaxed">
                        {review.comment || <em className="text-muted-foreground">Pas de commentaire</em>}
                      </p>
                      {review.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {review.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {review.status === 'replied' && review.replyText && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg border-l-2 border-primary">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Votre réponse {review.replySentAt && `• ${formatDate(review.replySentAt)}`}
                            {review.replyStatus === 'sent' && review.provider === 'google' && ' • ✓ Publiée sur Google'}
                            {review.replyStatus === 'queued' && ' • En attente d\'envoi'}
                            {review.replyStatus === 'failed' && ' • Échec d\'envoi'}
                          </p>
                          <p className="text-sm text-foreground">
                            {review.replyText}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage + 1} sur {totalPages} ({totalReviews} avis)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={!hasMore}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Response Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Répondre à l&apos;avis
              {currentLocation?.healthMode && (
                <Badge variant="warning" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Mode Santé actif
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4">
              {/* Original Review */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(selectedReview.authorName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedReview.authorName}</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            'h-3 w-3',
                            star <= selectedReview.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-gray-300'
                          )}
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">
                        • {formatDate(selectedReview.reviewedAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm">{selectedReview.comment || 'Pas de commentaire'}</p>
              </div>

              {/* Health Mode Warning */}
              {currentLocation?.healthMode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>⚠️ Rappel Mode Santé :</strong> Ne jamais évoquer
                  d&apos;informations médicales, de diagnostic ou de soins dans votre
                  réponse. Proposez plutôt un contact privé.
                </div>
              )}

              {/* Reply Error */}
              {replyError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <strong>Erreur :</strong> {replyError}
                </div>
              )}

              {/* Already replied or in queue */}
              {selectedReview.replyStatus === 'queued' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <strong>ℹ️ Info :</strong> Une réponse est déjà en attente d&apos;envoi.
                </div>
              )}

              {selectedReview.status !== 'replied' && selectedReview.replyStatus !== 'queued' && (
                <>
                  {/* Tone Selector + AI Button */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Ton :</span>
                      <div className="flex gap-1">
                        {['professional', 'warm', 'short'].map((tone) => (
                          <Button
                            key={tone}
                            variant={selectedTone === tone ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedTone(tone)}
                          >
                            {tone === 'professional' && 'Professionnel'}
                            {tone === 'warm' && 'Chaleureux'}
                            {tone === 'short' && 'Court'}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Bouton Assistant IA */}
                    {selectedReviewForAi && (
                      <div className="ml-auto">
                        <AiReplyAssistant
                          review={selectedReviewForAi}
                          healthMode={currentLocation?.healthMode ?? false}
                          onSelectSuggestion={handleSelectAiSuggestion}
                        />
                      </div>
                    )}
                  </div>

                  {/* Response Textarea */}
                  <textarea
                    className="w-full min-h-[150px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Écrivez votre réponse..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    disabled={submittingReply}
                  />
                </>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                {selectedReview.status === 'pending' && selectedReview.replyStatus !== 'queued' && (
                  <Button 
                    variant="ghost" 
                    onClick={handleIgnoreReview}
                    disabled={updatingStatus}
                    className="text-muted-foreground"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Ignorer
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedReview(null)}>
                  Fermer
                </Button>
                {selectedReview.status !== 'replied' && selectedReview.replyStatus !== 'queued' && (
                  <Button
                    onClick={handleSendResponse}
                    disabled={!responseText.trim() || submittingReply}
                    className="gap-1"
                  >
                    {submittingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Publier la réponse
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Widget Manager Modal */}
      {currentLocation && (
        <WebsiteWidgetManager
          locationId={currentLocation.id}
          locationName={currentLocation.name}
          open={widgetManagerOpen}
          onOpenChange={setWidgetManagerOpen}
          availableReviews={reviewsForWidget}
        />
      )}
    </div>
  )
}
