'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth, useClientOrg } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Star,
  RefreshCw,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  AlertCircle,
  Globe,
} from 'lucide-react'
import { cn, getInitials, formatDateTime } from '@/lib/utils'
import { WebsiteWidgetManager } from '@/components/embed'
import { useGoogleMyPlace } from '@/lib/google/use-google-my-place'

interface PatientInfo {
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

interface Feedback {
  requestId: string
  createdAt: string
  rating: number
  comment?: string
  channel?: 'sms' | 'email'
  patient?: PatientInfo
}

// Helper to safely get patient name
function getPatientName(patient?: PatientInfo): string {
  if (!patient) return 'Patient anonyme'
  if (patient.name) return patient.name
  if (patient.firstName || patient.lastName) {
    return [patient.firstName, patient.lastName].filter(Boolean).join(' ')
  }
  return 'Patient anonyme'
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'

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

function computeCombinedAvg(
  googleRating: number | null,
  googleCount: number,
  feedbackAvg: number,
  feedbackCount: number
): string {
  if (googleRating !== null && googleCount > 0 && feedbackCount > 0) {
    const weighted = (googleRating * googleCount + feedbackAvg * feedbackCount) / (googleCount + feedbackCount)
    return weighted.toFixed(1)
  }
  if (googleRating !== null && googleCount > 0) return googleRating.toFixed(1)
  return feedbackAvg > 0 ? feedbackAvg.toFixed(1) : '0'
}

export default function FeedbacksPage() {
  const { getClientToken } = useAuth()
  const clientOrg = useClientOrg()
  const { data: googleData } = useGoogleMyPlace()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)

  const fetchFeedbacks = useCallback(async () => {
    const token = getClientToken()
    if (!token) {
      setError('Session expirée. Reconnectez-vous.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${BACKEND_URL}/api/feedbacks`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expirée. Reconnectez-vous.')
          return
        }
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
  }, [getClientToken])

  useEffect(() => {
    fetchFeedbacks()
  }, [fetchFeedbacks])

  // Stats computed from real data
  const feedbackAvg = feedbacks.length > 0
    ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
    : 0

  const googleRating = googleData?.configured ? (googleData.rating ?? null) : null
  const googleCount = googleData?.configured ? (googleData.totalReviews ?? 0) : 0
  const combinedAvg = computeCombinedAvg(googleRating, googleCount, feedbackAvg, feedbacks.length)

  const stats = {
    total: feedbacks.length,
    positive: feedbacks.filter((f) => f.rating >= 4).length,
    neutral: feedbacks.filter((f) => f.rating === 3).length,
    negative: feedbacks.filter((f) => f.rating <= 2).length,
    avgRating: combinedAvg,
    feedbackOnlyAvg: feedbackAvg > 0 ? feedbackAvg.toFixed(1) : '—',
    withComment: feedbacks.filter((f) => f.comment).length,
  }

  // Org info for the widget manager
  const orgId = clientOrg?.id || 'default'
  const orgName = clientOrg?.name || 'Mon établissement'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedbacks Patients</h1>
          <p className="text-muted-foreground mt-1">
            Retours collectés via l&apos;extension Doctolib
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
                {loading ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                <p className="text-2xl font-bold">{stats.total}</p>
                )}
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
                <p className="text-xs text-muted-foreground">Satisfaction globale</p>
                {loading ? (
                  <Skeleton className="h-8 w-14 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold">{stats.avgRating}/5</p>
                    {googleRating != null && feedbacks.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Google {googleRating.toFixed(1)} + feedbacks {stats.feedbackOnlyAvg}
                      </p>
                    )}
                  </>
                )}
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
                {loading ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                <p className="text-2xl font-bold">{stats.positive}</p>
                )}
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
                {loading ? (
                  <Skeleton className="h-8 w-10 mt-1" />
                ) : (
                <p className="text-2xl font-bold">{stats.negative}</p>
                )}
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
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchFeedbacks} className="ml-auto">
                Réessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-11 w-11 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, j) => (
                      <Skeleton key={j} className="h-5 w-5" />
                    ))}
                  </div>
                </div>
          </CardContent>
        </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && feedbacks.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-foreground">Aucun feedback reçu</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Les retours patients apparaîtront ici une fois collectés via l&apos;extension Doctolib.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Feedbacks List */}
      {!loading && !error && feedbacks.length > 0 && (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <FeedbackCard key={feedback.requestId} feedback={feedback} />
          ))}
        </div>
      )}

      {/* Widget Manager Modal */}
      <WebsiteWidgetManager
        locationId={orgId}
        locationName={orgName}
        open={widgetManagerOpen}
        onOpenChange={setWidgetManagerOpen}
        availableReviews={feedbacks.map((f) => ({
          id: f.requestId,
          author: getPatientName(f.patient),
          rating: f.rating,
          content: f.comment || '',
          date: f.createdAt,
          source: 'reputy' as const,
        }))}
      />
    </div>
  )
}

function FeedbackCard({ feedback }: { feedback: Feedback }) {
  return (
    <Card
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
              {getInitials(getPatientName(feedback.patient))}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {getPatientName(feedback.patient)}
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
                    {formatDateTime(feedback.createdAt)}
                  </span>
                  {feedback.channel && (
                    <span className="flex items-center gap-1">
                      {feedback.channel === 'sms' ? (
                        <Phone className="h-3 w-3" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {feedback.channel.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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
                &ldquo;{feedback.comment}&rdquo;
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground italic">
                Aucun commentaire
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              {feedback.patient?.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {feedback.patient.phone}
                </span>
              )}
              {feedback.patient?.email && (
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
  )
}
