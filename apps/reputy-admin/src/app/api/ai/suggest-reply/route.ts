import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ===== API PROXY → Backend /client/ai/suggest-reply =====

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      reviewContent,
      tone = 'professional',
      instructions,
      healthMode = false,
    } = body

    // Validation minimale côté proxy (le backend re-valide)
    if (!reviewContent || typeof reviewContent !== 'string') {
      return NextResponse.json(
        { error: 'reviewContent requis', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    // Forward Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Non authentifié', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    // Map frontend fields → backend fields
    const backendPayload = {
      reviewText: reviewContent, // mapping: reviewContent → reviewText
      tone,
      instructions,
      healthMode,
    }

    const backendResponse = await fetch(`${BACKEND_URL}/client/ai/suggest-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      cache: 'no-store',
      body: JSON.stringify(backendPayload),
    })

    const data = await backendResponse.json()

    // Handle backend errors — map to frontend error codes
    if (!backendResponse.ok) {
      let code = data.error || 'UNKNOWN_ERROR'
      if (data.error === 'AI_QUOTA_EXCEEDED') {
        code = 'QUOTA_EXCEEDED'
      }
      if (data.errorCategory === 'AUTH_REQUIRED' || backendResponse.status === 401) {
        code = 'AUTH_REQUIRED'
      }

      return NextResponse.json(
        {
          error: data.message || data.error || 'Erreur backend',
          code,
        },
        { status: backendResponse.status }
      )
    }

    // Map backend success response → frontend expected shape
    // Backend: { ok, draft, sensitive, requireApproval, remainingAi }
    // Frontend expects: { suggestions: [{ id, tone, text }], quotaRemaining }
    const suggestionId = crypto.randomUUID()

    return NextResponse.json({
      suggestions: [
        {
          id: suggestionId,
          tone: tone || 'professional',
          text: data.draft || '',
        },
      ],
      quotaRemaining: data.remainingAi ?? null,
      sensitive: data.sensitive ?? false,
      requireApproval: data.requireApproval ?? true,
    })
  } catch (error) {
    console.error('[AI Proxy] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la communication avec le service IA.', code: 'PROXY_ERROR' },
      { status: 500 }
    )
  }
}

// ===== GET QUOTA STATUS =====
// Kept for backward compatibility
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json(
      { aiEnabled: false, error: 'Non authentifié' },
      { status: 401 }
    )
  }

  // Real quota is checked on POST by the backend
  return NextResponse.json({
    aiEnabled: true,
    plan: 'unknown',
    quota: null,
  })
}
