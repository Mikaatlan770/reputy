// ===== API: /api/embed/config =====
// GET: Récupère la config embed pour un établissement
// POST: Met à jour la config

import { NextRequest, NextResponse } from 'next/server'
import { 
  getOrCreateEmbedConfig, 
  updateEmbedConfig 
} from '@/lib/embed/store'
import type { EmbedConfigPatch } from '@/lib/embed/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    
    if (!locationId) {
      return NextResponse.json(
        { error: 'locationId requis' },
        { status: 400 }
      )
    }
    
    const config = await getOrCreateEmbedConfig(locationId)
    
    return NextResponse.json(config)
  } catch (error) {
    console.error('[API] embed/config GET error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, patch } = body as { locationId: string; patch: EmbedConfigPatch }
    
    if (!locationId) {
      return NextResponse.json(
        { error: 'locationId requis' },
        { status: 400 }
      )
    }
    
    // Validation des règles
    if (patch.autoRules) {
      if (patch.autoRules.minRating !== undefined) {
        if (patch.autoRules.minRating < 1 || patch.autoRules.minRating > 5) {
          return NextResponse.json(
            { error: 'minRating doit être entre 1 et 5' },
            { status: 400 }
          )
        }
      }
      if (patch.autoRules.maxItems !== undefined) {
        if (patch.autoRules.maxItems < 1 || patch.autoRules.maxItems > 20) {
          return NextResponse.json(
            { error: 'maxItems doit être entre 1 et 20' },
            { status: 400 }
          )
        }
      }
    }
    
    const config = await updateEmbedConfig(locationId, patch)
    
    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('[API] embed/config POST error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
