import { NextRequest, NextResponse } from 'next/server'
import { 
  signAdminSession, 
  getAdminCookieName, 
  getAdminCookieOptions 
} from '@/lib/internal/admin-cookie'
import { IS_PRODUCTION, IS_RUNTIME_PRODUCTION } from '@/lib/env'
import { timingSafeEqual } from 'crypto'

// En dev: fallback autorisé. En prod: doit être défini explicitement.
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN || 
  (IS_PRODUCTION ? '' : 'super-admin-secret')

// ============ P0.1: Rate limiting ============
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 5 // 5 tentatives/min/IP

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true // allowed
  }
  
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

// ============ P0.1: Constant-time token comparison ============
function safeTokenCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    const maxLen = Math.max(a.length, b.length)
    const bufA = Buffer.alloc(maxLen, 0)
    const bufB = Buffer.alloc(maxLen, 0)
    Buffer.from(a).copy(bufA)
    Buffer.from(b).copy(bufB)
    return a.length === b.length && timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/**
 * POST /internal/api/auth
 * Authentification super-admin
 * 
 * Body: { token: string }
 * 
 * Si token valide:
 *   - Set cookie signé HMAC (HttpOnly, Secure en prod)
 *   - Return { ok: true }
 * 
 * Si token invalide:
 *   - Return 401 { ok: false, error: string }
 */
export async function POST(request: NextRequest) {
  try {
    // P0.1: Rate limiting
    const ip = getClientIp(request)
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Trop de tentatives. Réessayez dans 1 minute.' },
        { status: 429 }
      )
    }

    // Fail-fast runtime only (pas au build)
    if (IS_RUNTIME_PRODUCTION && !INTERNAL_ADMIN_TOKEN) {
      return NextResponse.json(
        { ok: false, error: 'Missing INTERNAL_ADMIN_TOKEN. Set it in production environment and redeploy.' }, 
        { status: 500 }
      )
    }

    // Fail-fast en dev si token vide (config manquante)
    if (!INTERNAL_ADMIN_TOKEN) {
      console.error('[Internal Auth] INTERNAL_ADMIN_TOKEN not configured')
      return NextResponse.json(
        { ok: false, error: 'Configuration error: missing INTERNAL_ADMIN_TOKEN' }, 
        { status: 500 }
      )
    }

    const body = await request.json()
    const { token } = body

    console.log('[Internal Auth] Login attempt, token provided:', !!token)

    if (!token) {
      return NextResponse.json({ ok: false, error: 'Token requis' }, { status: 400 })
    }

    // P0.1: Constant-time comparison (remplace plain !==)
    if (!safeTokenCompare(token, INTERNAL_ADMIN_TOKEN)) {
      console.log('[Internal Auth] Token mismatch')
      return NextResponse.json({ ok: false, error: 'Token invalide' }, { status: 401 })
    }

    console.log('[Internal Auth] Token valid, creating signed session cookie')

    // Créer le token signé HMAC
    const signedToken = signAdminSession()
    
    // Créer la réponse avec le cookie signé
    const response = NextResponse.json({ ok: true })
    
    response.cookies.set(
      getAdminCookieName(),
      signedToken,
      getAdminCookieOptions()
    )

    // Supprimer l'ancien cookie admin_ok s'il existe (migration)
    response.cookies.delete('admin_ok')

    console.log('[Internal Auth] Signed cookie set successfully')

    return response
  } catch (err) {
    console.error('[Internal Auth] Error:', err)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * DELETE /internal/api/auth
 * Logout super-admin
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  
  // Supprimer le nouveau cookie signé
  response.cookies.delete(getAdminCookieName())
  
  // Supprimer aussi l'ancien cookie (migration)
  response.cookies.delete('admin_ok')
  
  console.log('[Internal Auth] Logged out, cookies deleted')
  
  return response
}
