/**
 * P0.9 — Proxy route to download top-risk CSV from backend
 * This runs server-side so the admin token is never exposed to the browser.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { IS_PRODUCTION } from '@/lib/env'

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8787'
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN ||
  (IS_PRODUCTION ? '' : 'super-admin-secret')

// Input validation constants
const VALID_WINDOWS = ['24h', '7d', '30d']
const MAX_LIMIT = 200

export async function GET(request: NextRequest) {
  if (!INTERNAL_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Admin token not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)

  // Normalize window (whitelist, fallback safe)
  const rawWindow = searchParams.get('window') || '7d'
  const window = VALID_WINDOWS.includes(rawWindow) ? rawWindow : '7d'

  // Normalize limit (cap to MAX_LIMIT, fallback 50)
  const rawLimit = parseInt(searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(rawLimit || 50, 1), MAX_LIMIT)

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/email/admin/top-risk.csv?window=${window}&limit=${limit}`,
      {
        headers: {
          'x-admin-token': INTERNAL_ADMIN_TOKEN,
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend returned ${response.status}` },
        { status: response.status }
      )
    }

    const csv = await response.text()

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="top-risk-${window}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[CSV Proxy] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch CSV' }, { status: 500 })
  }
}
