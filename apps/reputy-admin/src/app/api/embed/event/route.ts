// ===== API: /api/embed/event =====
// POST: Enregistre un événement (impression ou clic)

import { NextRequest, NextResponse } from 'next/server'
import { recordEmbedEvent, getEmbedConfigByPublicKey } from '@/lib/embed/store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { publicKey, type, pageUrl, referrer } = body
    
    if (!publicKey || !type) {
      return NextResponse.json(
        { error: 'publicKey et type requis' },
        { status: 400 }
      )
    }
    
    if (type !== 'IMPRESSION' && type !== 'CLICK') {
      return NextResponse.json(
        { error: 'type doit être IMPRESSION ou CLICK' },
        { status: 400 }
      )
    }
    
    // Vérifier que la config existe
    const config = await getEmbedConfigByPublicKey(publicKey)
    if (!config) {
      return NextResponse.json(
        { error: 'Configuration non trouvée' },
        { status: 404 }
      )
    }
    
    // Récupérer le User-Agent
    const userAgent = request.headers.get('user-agent') || undefined
    
    // Enregistrer l'événement
    await recordEmbedEvent(publicKey, type, {
      pageUrl,
      referrer,
      userAgent,
    })
    
    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      }
    )
  } catch (error) {
    console.error('[API] embed/event error:', error)
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
