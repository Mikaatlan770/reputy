'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Star,
  RefreshCw,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WebsiteWidgetManager } from '@/components/embed'

interface PatientInfo {
  name: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

interface Feedback {
  requestId: string
  createdAt: string
  rating: number
  comment: string
  channel: 'sms' | 'email'
  patient: PatientInfo
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'dev-token'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRatingColor(rating: number): string {
  if (rating >= 4) return 'text-green-600 bg-green-100'
  if (rating >= 3) return 'text-amber-600 bg-amber-100'
  return 'text-red-600 bg-red-100'
}

function getRatingLabel(rating: number): string {
  if (rating === 5) return 'Excellent'
  if (rating === 4) return 'Très bien'
  if (rating === 3) return 'Moyen'
  if (rating === 2) return 'Décevant'
  return 'Mauvais'
}

export default function FeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)

  const fetchFeedbacks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${BACKEND_URL}/api/feedbacks`, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setFeedbacks(data.feedbacks || [])
    } catch (err) {
      console.error('Fetch error:', err)
      setError('Impossible de charger les feedbacks. Vérifiez que le backend est lancé.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeedbacks()
  }, [])

  // Stats
  const stats = {
    total: feedbacks.length,
    positive: feedbacks.filter((f) => f.rating >= 4).length,
    neutral: feedbacks.filter((f) => f.rating === 3).length,
    negative: feedbacks.filter((f) => f.rating <= 2).length,
    avgRating:
      feedbacks.length > 0
        ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
        : '0',
    withComment: feedbacks.filter((f) => f.comment).length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedbacks Patients</h1>
          <p className="text-muted-foreground mt-1">
            Retours collectés via l'extension Doctolib
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchFeedbacks} disabled={loading} variant="outline" className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Actualiser
          </Button>
          <Button
            variant="default"
            onClick={() => setWidgetManagerOpen(true)}
            className="gap-1"
          >
            <Globe className="h-4 w-4" />
            Widget site
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Note moyenne</p>
                <p className="text-2xl font-bold">{stats.avgRating}/5</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Positifs (4-5★)</p>
                <p className="text-2xl font-bold">{stats.positive}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Négatifs (1-2★)</p>
                <p className="text-2xl font-bold">{stats.negative}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-4" />
            <p className="text-muted-foreground">Chargement des feedbacks...</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && feedbacks.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground">Aucun feedback reçu</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Les retours patients apparaîtront ici une fois collectés.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Feedbacks List */}
      {!loading && !error && feedbacks.length > 0 && (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <Card
              key={feedback.requestId}
              className={cn(
                'hover:shadow-md transition-shadow',
                feedback.rating <= 2 && 'border-l-4 border-l-red-500',
                feedback.rating >= 4 && 'border-l-4 border-l-green-500'
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback
                      className={cn(
                        'text-sm font-medium',
                        feedback.rating >= 4
                          ? 'bg-green-100 text-green-700'
                          : feedback.rating <= 2
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {getInitials(feedback.patient.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {feedback.patient.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn('text-xs', getRatingColor(feedback.rating))}
                          >
                            {getRatingLabel(feedback.rating)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(feedback.createdAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            {feedback.channel === 'sms' ? (
                              <Phone className="h-3 w-3" />
                            ) : (
                              <Mail className="h-3 w-3" />
                            )}
                            {feedback.channel.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              'h-5 w-5',
                              star <= feedback.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-gray-200'
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    {feedback.comment ? (
                      <p className="mt-3 text-sm text-foreground leading-relaxed bg-muted/50 p-3 rounded-lg">
                        "{feedback.comment}"
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground italic">
                        Aucun commentaire
                      </p>
                    )}
                    {/* Contact info */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      {feedback.patient.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {feedback.patient.phone}
                        </span>
                      )}
                      {feedback.patient.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {feedback.patient.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Widget Manager Modal */}
      <WebsiteWidgetManager
        locationId="loc-1"
        locationName="Cabinet Dr. Atlan Michael"
        open={widgetManagerOpen}
        onOpenChange={setWidgetManagerOpen}
        availableReviews={feedbacks.map((f) => ({
          id: f.requestId,
          author: f.patient.name,
          rating: f.rating,
          content: f.comment,
          date: f.createdAt,
          source: 'reputy' as const,
        }))}
      />
    </div>
  )
}
