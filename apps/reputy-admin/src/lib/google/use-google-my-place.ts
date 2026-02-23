'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { authedFetch } from '@/lib/auth/authed-fetch'
import { BACKEND_URL } from '@/lib/constants'

export interface GoogleReview {
  author: string
  rating: number
  text: string
  publishTime: string
  relativeTime: string
}

export interface GooglePlaceData {
  ok: boolean
  configured: boolean
  message?: string
  placeId?: string
  name?: string
  address?: string
  phone?: string
  website?: string
  rating?: number
  totalReviews?: number
  reviews?: GoogleReview[]
  cachedAt?: string
}

let cachedData: GooglePlaceData | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min in-memory cache

/**
 * Shared hook to fetch the client's Google Place data (rating, reviews, etc.)
 * Uses an in-memory cache to avoid redundant API calls across pages.
 */
export function useGoogleMyPlace() {
  const [data, setData] = useState<GooglePlaceData | null>(cachedData)
  const [loading, setLoading] = useState(!cachedData)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  const fetchData = useCallback(async (force = false) => {
    if (!force && cachedData && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      setData(cachedData)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await authedFetch(`${BACKEND_URL}/client/google/my-place`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const json: GooglePlaceData = await res.json()
      cachedData = json
      cacheTimestamp = Date.now()
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchData()
    }
  }, [fetchData])

  return { data, loading, error, refetch: () => fetchData(true) }
}
