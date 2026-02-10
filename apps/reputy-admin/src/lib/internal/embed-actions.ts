import 'server-only'

import { getEmbedConfigByPublicKey } from '@/lib/embed/store'
import {
  googleReviewToEmbedItem,
  filterAndSortReviews,
  selectManualReviews,
  calculateStats,
} from '@/lib/embed/utils'
import type { EmbedReviewItem, EmbedItemsResponse } from '@/lib/embed/types'
import { reviews as mockGoogleReviews, locations } from '@/lib/mock-data'
import { fetchReputyFeedbackItems } from '@/lib/server/fetch-feedbacks'

/**
 * Fetches all embed widget data for a given publicKey.
 * Returns null if config not found (→ 404).
 *
 * Server-only — no token ever reaches the client.
 */
export async function fetchEmbedItems(publicKey: string): Promise<EmbedItemsResponse | null> {
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
    config: {
      showStars: config.displayOptions.showStars,
      showDate: config.displayOptions.showDate,
      showSource: config.displayOptions.showSource,
      accentColor: config.displayOptions.accentColor,
      theme: config.displayOptions.theme,
    },
  }
}
