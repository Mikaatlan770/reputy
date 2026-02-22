'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ============ TYPES ============

export interface CompetitorEntry {
  id: string
  placeId: string
  name: string
  // NOTE: address is NOT in snapshots — fetch via /client/competitors/:placeId/details
  rating: number | null
  reviewsCount: number
  estimated30d: number | null
  distanceM: number
  distanceKm: number
  types: string[]
  source: string
}

export interface CompetitorBuckets {
  1000: CompetitorEntry[]
  2000: CompetitorEntry[]
  5000: CompetitorEntry[]
}

export interface BucketStats {
  avgRating: number
  avgReviews: number
  totalCompetitors: number
}

export interface CompetitorsResponse {
  ok: boolean
  configured: boolean
  radius: number
  updatedAt: string | null
  isEstimated30d: boolean
  placesApiConfigured: boolean
  buckets: CompetitorBuckets
  stats: {
    1000: BucketStats | null
    2000: BucketStats | null
    5000: BucketStats | null
  }
  message?: string
}

export interface PlaceDetails {
  placeId: string
  name: string
  address: string
  phone: string | null
  website: string | null
  rating: number | null
  userRatingsTotal: number
  openingHours: Record<string, unknown> | null
  reviews: {
    author: string
    rating: number
    text: string
    publishTime: string | null
    relativePublishTimeDescription: string
  }[]
  types: string[]
  photos: string[]
  fetchedAt?: string
}

// ============ API HELPER ============

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
      Authorization: `Bearer ${token}`,
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
 * Hook to fetch competitors with server-side buckets
 * @param radiusM - 1000 | 2000 | 5000 (default 5000)
 */
export function useCompetitors(radiusM: 1000 | 2000 | 5000 = 5000) {
  const { getClientToken } = useAuth()
  const [data, setData] = useState<CompetitorsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCompetitors = useCallback(async () => {
    const token = getClientToken()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await fetchApi<CompetitorsResponse>(
        `/client/competitors?radius=${radiusM}`,
        token
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [getClientToken, radiusM])

  useEffect(() => {
    fetchCompetitors()
  }, [fetchCompetitors])

  return {
    data,
    loading,
    error,
    refetch: fetchCompetitors,
    // Convenience getters
    configured: data?.configured ?? false,
    placesApiConfigured: data?.placesApiConfigured ?? false,
    buckets: data?.buckets ?? { 1000: [], 2000: [], 5000: [] },
    stats: data?.stats ?? { 1000: null, 2000: null, 5000: null },
    updatedAt: data?.updatedAt ?? null,
    isEstimated30d: data?.isEstimated30d ?? false,
  }
}

/**
 * Hook to fetch competitor place details (lazy — triggered manually)
 */
export function useCompetitorDetails() {
  const { getClientToken } = useAuth()
  const [details, setDetails] = useState<PlaceDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetails = useCallback(
    async (placeId: string) => {
      const token = getClientToken()
      if (!token || !placeId) return

      setLoading(true)
      setError(null)

      try {
        const result = await fetchApi<{ details: PlaceDetails }>(
          `/client/competitors/${encodeURIComponent(placeId)}/details`,
          token
        )
        setDetails(result.details)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    },
    [getClientToken]
  )

  return {
    details,
    loading,
    error,
    fetchDetails,
    reset: () => {
      setDetails(null)
      setError(null)
    },
  }
}

/**
 * Hook to configure org coordinates + address
 */
export function useConfigureCompetitors() {
  const { getClientToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const configure = useCallback(
    async (params: {
      lat?: number
      lng?: number
      specialty?: string
      address?: string
      googlePlaceId?: string
    }) => {
      const token = getClientToken()
      if (!token) return null

      setLoading(true)
      setError(null)

      try {
        const result = await fetchApi<{
          ok: boolean
          org: {
            lat: number
            lng: number
            specialty: string | null
            address: string | null
            googlePlaceId: string | null
          }
        }>(
          '/client/competitors/configure',
          token,
          {
            method: 'POST',
            body: JSON.stringify(params),
          }
        )
        return result.org
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
        return null
      } finally {
        setLoading(false)
      }
    },
    [getClientToken]
  )

  return { configure, loading, error }
}

// ============ AUTOCOMPLETE HOOK ============

export interface PlaceSuggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

export interface PlaceGeometry {
  placeId: string
  lat: number
  lng: number
  address: string
  name: string
}

/**
 * Hook for Google Places Autocomplete (proxied via backend)
 */
/**
 * Hook to manually trigger a competitor sync via Google Places
 */
export function useSyncCompetitors() {
  const { getClientToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    placesFound: number
    placesStored: number
    searchMethod: string
    profile: string
  } | null>(null)

  const sync = useCallback(async () => {
    const token = getClientToken()
    if (!token) return null

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await fetchApi<{
        ok: boolean
        message: string
        placesFound: number
        placesStored: number
        searchMethod: string
        profile: string
      }>(
        '/client/competitors/sync',
        token,
        { method: 'POST' }
      )
      setResult({
        placesFound: data.placesFound,
        placesStored: data.placesStored,
        searchMethod: data.searchMethod,
        profile: data.profile,
      })
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      return null
    } finally {
      setLoading(false)
    }
  }, [getClientToken])

  return { sync, loading, error, result }
}

/**
 * Hook to add a competitor manually by Google Place ID
 */
export function useAddCompetitor() {
  const { getClientToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addCompetitor = useCallback(
    async (placeId: string, name?: string) => {
      const token = getClientToken()
      if (!token || !placeId) return null

      setLoading(true)
      setError(null)

      try {
        const data = await fetchApi<{
          ok: boolean
          message: string
          competitor: CompetitorEntry
        }>(
          '/client/competitors/add',
          token,
          {
            method: 'POST',
            body: JSON.stringify({ placeId, name }),
          }
        )
        return data
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
        return null
      } finally {
        setLoading(false)
      }
    },
    [getClientToken]
  )

  return { addCompetitor, loading, error }
}

export function usePlacesAutocomplete() {
  const { getClientToken } = useAuth()
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(
    async (input: string) => {
      const token = getClientToken()
      if (!token || input.length < 3) {
        setSuggestions([])
        return
      }

      setLoading(true)
      try {
        const result = await fetchApi<{ ok: boolean; suggestions: PlaceSuggestion[] }>(
          `/client/places/autocomplete?input=${encodeURIComponent(input)}`,
          token
        )
        setSuggestions(result.suggestions || [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    },
    [getClientToken]
  )

  const getGeometry = useCallback(
    async (placeId: string): Promise<PlaceGeometry | null> => {
      const token = getClientToken()
      if (!token || !placeId) return null

      try {
        const result = await fetchApi<{ ok: boolean; place: PlaceGeometry }>(
          `/client/places/${encodeURIComponent(placeId)}/geometry`,
          token
        )
        return result.place
      } catch {
        return null
      }
    },
    [getClientToken]
  )

  const clear = useCallback(() => {
    setSuggestions([])
  }, [])

  return { suggestions, loading, search, getGeometry, clear }
}
