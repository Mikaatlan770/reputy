// ===== API: /api/embed/stats =====
// GET: Retourne les statistiques du widget

import { NextRequest, NextResponse } from 'next/server'
import { getEmbedStats } from '@/lib/embed/store'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const period = searchParams.get('period') as '7d' | '30d' | null
    
    if (!locationId) {
      return NextResponse.json(
        { error: 'locationId requis' },
        { status: 400 }
      )
    }
    
    const validPeriod = period === '30d' ? '30d' : '7d'
    
    const stats = await getEmbedStats(locationId, validPeriod)
    
    return NextResponse.json({
      ...stats,
      period: validPeriod,
    })
  } catch (error) {
    console.error('[API] embed/stats error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
