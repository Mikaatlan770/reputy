'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { reviews as allReviews } from '@/lib/mock-data'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
} from 'lucide-react'
import { cn, formatDate, getInitials } from '@/lib/utils'
import type { Review } from '@/types'
import { AiReplyAssistant } from '@/components/ai/AiReplyAssistant'
import { WebsiteWidgetManager } from '@/components/embed'

export default function ReviewsPage() {
  const { currentLocation } = useAppStore()
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [filterRating, setFilterRating] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [responseText, setResponseText] = useState('')
  const [selectedTone, setSelectedTone] = useState<string>('professional')
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)

  // Filter reviews
  const reviews = allReviews
    .filter((r) => !currentLocation || r.locationId === currentLocation.id)
    .filter((r) => filterRating === 'all' || r.rating === parseInt(filterRating))
    .filter((r) => {
      if (filterStatus === 'all') return true
      if (filterStatus === 'replied') return r.responded
      if (filterStatus === 'unreplied') return !r.responded
      return true
    })
    .filter(
      (r) =>
        searchQuery === '' ||
        r.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Utiliser une suggestion IA
  const handleSelectAiSuggestion = (text: string) => {
    setResponseText(text)
  }

  const handleSendResponse = () => {
    // Mock: would send response
    console.log('Sending response:', responseText)
    setSelectedReview(null)
    setResponseText('')
  }

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
          <Badge variant="secondary" className="px-3 py-1.5">
            {reviews.filter((r) => !r.responded).length} non répondus
          </Badge>
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-[140px]">
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
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les avis</SelectItem>
                  <SelectItem value="unreplied">Non répondus</SelectItem>
                  <SelectItem value="replied">Répondus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
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
                !review.responded && 'border-l-4 border-l-primary'
              )}
              onClick={() => setSelectedReview(review)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(review.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {review.author}
                          </span>
                          <Badge variant="google" className="text-[10px]">
                            Google
                          </Badge>
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
                            {formatDate(review.date)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {review.responded ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Répondu
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
                      {review.content}
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
                    {review.responded && review.responseText && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg border-l-2 border-primary">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Votre réponse • {formatDate(review.responseDate!)}
                        </p>
                        <p className="text-sm text-foreground">
                          {review.responseText}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Response Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                      {getInitials(selectedReview.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedReview.author}</p>
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
                        • {formatDate(selectedReview.date)}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm">{selectedReview.content}</p>
              </div>

              {/* Health Mode Warning */}
              {currentLocation?.healthMode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>⚠️ Rappel Mode Santé :</strong> Ne jamais évoquer
                  d&apos;informations médicales, de diagnostic ou de soins dans votre
                  réponse. Proposez plutôt un contact privé.
                </div>
              )}

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
                <div className="ml-auto">
                  <AiReplyAssistant
                    review={selectedReview}
                    healthMode={currentLocation?.healthMode ?? false}
                    onSelectSuggestion={handleSelectAiSuggestion}
                  />
                </div>
              </div>

              {/* Response Textarea */}
              <textarea
                className="w-full min-h-[150px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Écrivez votre réponse..."
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedReview(null)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleSendResponse}
                  disabled={!responseText.trim()}
                  className="gap-1"
                >
                  <Send className="h-4 w-4" />
                  Publier la réponse
                </Button>
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
          availableReviews={reviews.map((r) => ({
            id: r.id,
            author: r.author,
            rating: r.rating,
            content: r.content,
            date: r.date,
            source: 'google' as const,
          }))}
        />
      )}
    </div>
  )
}
