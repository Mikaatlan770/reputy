import 'server-only'

import { reputyFeedbackToEmbedItem } from '@/lib/embed/utils'
import type { EmbedReviewItem } from '@/lib/embed/types'
import { fetchInternal } from '@/lib/internal/fetch-internal'

interface BackendFeedback {
  id: string
  requestDbId: string
  rating: number
  comment?: string
  source?: string
  createdAt: string
}

/**
 * Fetches Reputy feedbacks from the backend, mapped to EmbedReviewItem[].
 *
 * Server-only — uses INTERNAL_ADMIN_TOKEN via fetchInternal (never in client bundle).
 * Calls /internal/admin/feedbacks (P5: replaces legacy /api/feedbacks).
 */
export async function fetchReputyFeedbackItems(): Promise<EmbedReviewItem[]> {
  try {
    const result = await fetchInternal<{ feedbacks: BackendFeedback[] }>(
      '/internal/admin/feedbacks'
    )
    if (!result.ok || !result.data) return []

    // Map backend feedback shape to ReputyFeedback-compatible objects
    return (result.data.feedbacks || []).map((f) =>
      reputyFeedbackToEmbedItem({
        requestId: f.requestDbId || f.id,
        rating: f.rating,
        comment: f.comment,
        createdAt: f.createdAt,
        patient: { name: 'Patient' }, // backend feedbacks don't carry patient names
      })
    )
  } catch (err) {
    console.warn('[server] Failed to fetch Reputy feedbacks:', err)
    return []
  }
}
