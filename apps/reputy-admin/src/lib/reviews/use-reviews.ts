'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ============ TYPES ============

export interface Review {
  id: string
  orgId: string
  provider: string
  providerLocationId: string | null
  providerReviewId: string | null
  authorName: string
  rating: number
  comment: string | null
  reviewedAt: string
  status: 'pending' | 'replied' | 'ignored'
  replyText: string | null
  replyStatus: 'none' | 'draft' | 'queued' | 'sent' | 'failed'
  replySentAt: string | null
  replyError: string | null
  tags: string[]
  sentiment: 'positive' | 'neutral' | 'negative' | null
  createdAt: string
  updatedAt: string
}

// Period type for stats
export type StatsPeriod = '7d' | '30d' | '90d' | '365d'

// Star distribution item
export interface StarDistributionItem {
  stars: number
  count: number
  percentage: number
}

// Advanced review stats (Phase 1B)
export interface ReviewStatsAdvanced {
  period: StatsPeriod

  // All-time stats
  totalAllTime: number
  avgRatingAllTime: number

  // Current period stats
  totalPeriod: number
  avgRatingPeriod: number
  pendingCount: number
  repliedCountPeriod: number
  responseRatePeriod: number
  avgResponseTimeHours: number | null

  // Deltas vs previous period (null if not calculable)
  reviewsDeltaPct: number | null
  avgRatingDelta: number | null
  responseRateDeltaPct: number | null

  // Star distribution for current period
  starDistributionPeriod: StarDistributionItem[]

  // Advanced breakdowns (PR-A analytics — optional for backward compat)
  providerBreakdownPeriod?: { provider: string; count: number; percentage: number }[]
  sentimentBreakdownPeriod?: { sentiment: string; count: number; percentage: number }[]
  responseTimeDistributionPeriod?: { bucket: string; count: number; percentage: number }[]
  responseTimeNoReplyCount?: number
  tagBreakdownPeriod?: { tag: string; count: number; percentage: number }[]

  // Legacy fields (backward compatibility)
  total: number
  avgRating: number
  repliedCount: number
  ignoredCount: number
  responseRate: number
  reviews30Days: number
  starDistribution: StarDistributionItem[]
}

// Legacy interface (kept for backward compatibility)
export interface ReviewStats {
  total: number
  avgRating: number
  pendingCount: number
  repliedCount: number
  ignoredCount: number
  responseRate: number
  avgResponseTimeHours: number
  reviews30Days: number
  starDistribution: StarDistributionItem[]
}

export interface AnalyticsSeries {
  period: string
  reviews: number
  avgRating: number
}

export interface ReviewsListResult {
  reviews: Review[]
  total: number
  hasMore: boolean
}

export interface ReviewFilters {
  status?: 'pending' | 'replied' | 'ignored' | 'all'
  rating?: number
  search?: string
}

export interface ReviewPagination {
  sort?: 'reviewed_at' | 'rating' | 'created_at'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// ============ API FUNCTIONS ============

async function fetchApi<T>(
  endpoint: string, 
  token: string | null, 
  options: RequestInit = {}
): Promise<T> {
  if (!token) {
    throw new Error('Not authenticated')
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok || !data.ok) {
    throw new Error(data.error || data.message || 'API Error')
  }

  return data
}

// ============ HOOKS ============

/**
 * Hook to fetch paginated reviews list
 */
export function useReviews(
  filters: ReviewFilters = {},
  pagination: ReviewPagination = {}
) {
  const { getClientToken } = useAuth()
  const [data, setData] = useState<ReviewsListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    const token = getClientToken()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (filters.status && filters.status !== 'all') params.set('status', filters.status)
      if (filters.rating) params.set('rating', String(filters.rating))
      if (filters.search) params.set('search', filters.search)
      if (pagination.sort) params.set('sort', pagination.sort)
      if (pagination.order) params.set('order', pagination.order)
      if (pagination.limit) params.set('limit', String(pagination.limit))
      if (pagination.offset) params.set('offset', String(pagination.offset))

      const queryString = params.toString()
      const endpoint = `/client/reviews${queryString ? `?${queryString}` : ''}`

      const result = await fetchApi<{ reviews: Review[]; total: number; hasMore: boolean }>(
        endpoint,
        token
      )

      setData({
        reviews: result.reviews,
        total: result.total,
        hasMore: result.hasMore,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [getClientToken, filters.status, filters.rating, filters.search, pagination.sort, pagination.order, pagination.limit, pagination.offset])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  return { data, loading, error, refetch: fetchReviews }
}

/**
 * Hook to fetch review statistics (Phase 1B - with period support)
 * @param period - '7d', '30d', '90d', '365d' (default: '30d')
 */
export function useReviewStats(period: StatsPeriod = '30d') {
  const { getClientToken } = useAuth()
  const [stats, setStats] = useState<ReviewStatsAdvanced | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    const token = getClientToken()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await fetchApi<{ stats: ReviewStatsAdvanced }>(
        `/client/reviews/stats?period=${period}`,
        token
      )
      setStats(result.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [getClientToken, period])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}

/**
 * Hook to fetch review analytics (time series)
 */
export function useReviewAnalytics(period: StatsPeriod = '30d', groupBy: 'day' | 'week' | 'month' = 'day') {
  const { getClientToken } = useAuth()
  const [series, setSeries] = useState<AnalyticsSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async () => {
    const token = getClientToken()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await fetchApi<{ analytics: { series: AnalyticsSeries[] } }>(
        `/client/reviews/analytics?period=${period}&groupBy=${groupBy}`,
        token
      )
      setSeries(result.analytics.series)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [getClientToken, period, groupBy])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  return { series, loading, error, refetch: fetchAnalytics }
}

/**
 * Hook to submit a reply to a review
 */
export function useReplyReview() {
  const { getClientToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitReply = useCallback(async (reviewId: string, replyText: string): Promise<Review | null> => {
    const token = getClientToken()
    if (!token) {
      setError('Not authenticated')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result = await fetchApi<{ review: Review }>(
        `/client/reviews/${reviewId}/reply`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ replyText }),
        }
      )
      return result.review
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [getClientToken])

  return { submitReply, loading, error }
}

/**
 * Hook to update review status
 */
export function useUpdateReviewStatus() {
  const { getClientToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateStatus = useCallback(async (
    reviewId: string, 
    status: 'pending' | 'replied' | 'ignored'
  ): Promise<Review | null> => {
    const token = getClientToken()
    if (!token) {
      setError('Not authenticated')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result = await fetchApi<{ review: Review }>(
        `/client/reviews/${reviewId}/status`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ status }),
        }
      )
      return result.review
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [getClientToken])

  return { updateStatus, loading, error }
}

// ============ KPI DATA ADAPTER ============

/**
 * Convert ReviewStatsAdvanced to KpiData format used by dashboard (Phase 1B)
 */
export function statsToKpiData(stats: ReviewStatsAdvanced | null): {
  // Period info
  period: StatsPeriod
  // Current period values
  averageRating: number
  totalReviews: number
  totalPeriod: number
  unrepliedReviews: number
  responseRate: number
  avgResponseTime: number | null
  // Deltas (null if not calculable)
  reviewsDeltaPct: number | null
  avgRatingDelta: number | null
  responseRateDeltaPct: number | null
  // Star distribution
  starDistribution: StarDistributionItem[]
} {
  if (!stats) {
    return {
      period: '30d',
      averageRating: 0,
      totalReviews: 0,
      totalPeriod: 0,
      unrepliedReviews: 0,
      responseRate: 0,
      avgResponseTime: null,
      reviewsDeltaPct: null,
      avgRatingDelta: null,
      responseRateDeltaPct: null,
      starDistribution: [
        { stars: 5, count: 0, percentage: 0 },
        { stars: 4, count: 0, percentage: 0 },
        { stars: 3, count: 0, percentage: 0 },
        { stars: 2, count: 0, percentage: 0 },
        { stars: 1, count: 0, percentage: 0 },
      ],
    }
  }

  return {
    period: stats.period,
    averageRating: stats.avgRatingPeriod,
    totalReviews: stats.totalAllTime,
    totalPeriod: stats.totalPeriod,
    unrepliedReviews: stats.pendingCount,
    responseRate: stats.responseRatePeriod,
    avgResponseTime: stats.avgResponseTimeHours,
    reviewsDeltaPct: stats.reviewsDeltaPct,
    avgRatingDelta: stats.avgRatingDelta,
    responseRateDeltaPct: stats.responseRateDeltaPct,
    starDistribution: stats.starDistributionPeriod,
  }
}
