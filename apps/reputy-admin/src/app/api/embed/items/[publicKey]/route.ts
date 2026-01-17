// ===== API: /api/embed/items/[publicKey] =====
// GET: Retourne les avis à afficher sur le widget (anonymisés)

import { NextRequest, NextResponse } from 'next/server'
import { getEmbedConfigByPublicKey } from '@/lib/embed/store'
import { 
  googleReviewToEmbedItem,
  reputyFeedbackToEmbedItem,
  filterAndSortReviews,
  selectManualReviews,
  calculateStats,
} from '@/lib/embed/utils'
import type { EmbedReviewItem, EmbedItemsResponse } from '@/lib/embed/types'
import { reviews as mockGoogleReviews, locations } from '@/lib/mock-data'

// URL du backend Reputy (feedbacks internes)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'dev-token'

interface RouteContext {
  params: Promise<{ publicKey: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { publicKey } = await context.params
    
    // Récupérer la config
    const config = await getEmbedConfigByPublicKey(publicKey)
    
    if (!config) {
      return NextResponse.json(
        { error: 'Configuration non trouvée' },
        { status: 404 }
      )
    }
    
    // Récupérer les avis Google (mock)
    const googleItems: EmbedReviewItem[] = mockGoogleReviews
      .filter(r => r.locationId === config.locationId)
      .map(googleReviewToEmbedItem)
    
    // Récupérer les feedbacks Reputy (depuis le backend)
    let reputyItems: EmbedReviewItem[] = []
    try {
      const feedbackRes = await fetch(`${BACKEND_URL}/api/feedbacks`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
        cache: 'no-store',
      })
      if (feedbackRes.ok) {
        const data = await feedbackRes.json()
        reputyItems = (data.feedbacks || []).map(reputyFeedbackToEmbedItem)
      }
    } catch (err) {
      console.warn('[API] Impossible de charger les feedbacks Reputy:', err)
    }
    
    // Combiner les sources
    const allItems = [...googleItems, ...reputyItems]
    
    // Appliquer le mode de sélection
    let selectedItems: EmbedReviewItem[]
    
    if (config.mode === 'MANUAL') {
      selectedItems = selectManualReviews(allItems, config.manualSelectedReviewIds)
    } else {
      selectedItems = filterAndSortReviews(allItems, config)
    }
    
    // Calculer les stats
    const stats = calculateStats(selectedItems)
    
    // Récupérer le nom de l'établissement
    const location = locations.find(l => l.id === config.locationId)
    const locationName = location?.name || 'Établissement'
    
    // Construire la réponse
    const response: EmbedItemsResponse = {
      items: selectedItems,
      locationName,
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
    
    // Headers CORS pour le widget externe
    return NextResponse.json(response, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=300', // Cache 5 min
      },
    })
  } catch (error) {
    console.error('[API] embed/items error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
