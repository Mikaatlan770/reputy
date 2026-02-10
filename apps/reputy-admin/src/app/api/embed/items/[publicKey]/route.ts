// ===== API: /api/embed/items/[publicKey] =====
// GET: Retourne les avis à afficher sur le widget (anonymisés)
// Server-only — aucun token exposé au client

import { NextRequest, NextResponse } from 'next/server'
import { fetchEmbedItems } from '@/lib/internal/embed-actions'

interface RouteContext {
  params: Promise<{ publicKey: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { publicKey } = await context.params

    // Input validation
    if (!publicKey || publicKey.length < 3 || publicKey.length > 64) {
      return NextResponse.json(
        { error: 'publicKey invalide' },
        { status: 400 }
      )
    }

    const data = await fetchEmbedItems(publicKey)

    if (!data) {
      return NextResponse.json(
        { error: 'Configuration non trouvée' },
        { status: 404 }
      )
    }

    // Headers CORS pour le widget externe
    return NextResponse.json(data, {
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
