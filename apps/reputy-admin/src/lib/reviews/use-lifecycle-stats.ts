'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import type { StatsPeriod } from './use-reviews'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ============ TYPES ============

export interface LifecycleStats {
  period: { since: string; days: number }
  sent: number
  feedbackReceived: number
  publicRedirected: number
  /** publicRedirected / sent × 100 — 0 if sent = 0, rounded to 1 decimal */
  conversionRate: number
}

// ============ HOOK ============

/**
 * Hook to fetch lifecycle KPIs (sent, feedback, redirect, conversion) for the current org.
 * Accepts the same period format as useReviewStats ('7d' | '30d' | '90d' | '365d').
 */
export function useLifecycleStats(period: StatsPeriod = '30d') {
  const { getClientToken } = useAuth()
  const [data, setData] = useState<LifecycleStats | null>(null)
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
      const response = await fetch(
        `${BACKEND_URL}/client/lifecycle-stats?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.error || json.message || 'API Error')
      }

      setData({
        period: json.period,
        sent: json.sent,
        feedbackReceived: json.feedbackReceived,
        publicRedirected: json.publicRedirected,
        conversionRate: json.conversionRate,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [getClientToken, period])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { data, loading, error, refetch: fetchStats }
}
