import 'server-only'

import { getEmbedConfigByPublicKey } from '@/lib/embed/store'
import {
  googleReviewToEmbedItem,
  filterAndSortReviews,
  selectManualReviews,
  calculateStats,
} from '@/lib/embed/utils'
import type { EmbedReviewItem, EmbedDisplayOptions } from '@/lib/embed/types'
import { reviews as mockGoogleReviews, locations } from '@/lib/mock-data'
import { fetchReputyFeedbackItems } from '@/lib/server/fetch-feedbacks'

export interface ReviewsPageData {
  items: EmbedReviewItem[]
  locationName: string
  averageRating: number
  totalCount: number
  config: EmbedDisplayOptions
}

/**
 * Fetches all reviews data for a given publicKey (SSR page).
 * Returns null if config not found (→ notFound()).
 *
 * Server-only — no token ever reaches the client.
 */
export async function fetchReviewsByPublicKey(publicKey: string): Promise<ReviewsPageData | null> {
  if (!publicKey || typeof publicKey !== 'string') return null

  const config = await getEmbedConfigByPublicKey(publicKey)
  if (!config) return null

  // Google reviews (mock)
  const googleItems: EmbedReviewItem[] = mockGoogleReviews
    .filter(r => r.locationId === config.locationId)
    .map(googleReviewToEmbedItem)

  // Reputy feedbacks (server-only fetch)
  const reputyItems = await fetchReputyFeedbackItems()

  // Combine & filter
  const allItems = [...googleItems, ...reputyItems]

  const selectedItems = config.mode === 'MANUAL'
    ? selectManualReviews(allItems, config.manualSelectedReviewIds)
    : filterAndSortReviews(allItems, config)

  const stats = calculateStats(selectedItems)
  const location = locations.find(l => l.id === config.locationId)

  return {
    items: selectedItems,
    locationName: location?.name || 'Établissement',
    averageRating: stats.average,
    totalCount: stats.total,
    config: config.displayOptions,
  }
}

/**
 * Generates SEO metadata for a reviews page.
 */
export async function getReviewsMetadata(publicKey: string) {
  const config = await getEmbedConfigByPublicKey(publicKey)
  if (!config) return { title: 'Avis non trouvés' }

  const location = locations.find(l => l.id === config.locationId)
  const locationName = location?.name || 'Établissement'

  return {
    title: `Avis clients - ${locationName}`,
    description: `Découvrez les avis clients de ${locationName}. Notes et témoignages vérifiés.`,
    openGraph: {
      title: `Avis clients - ${locationName}`,
      description: `Découvrez les avis clients de ${locationName}`,
      type: 'website' as const,
    },
  }
}
