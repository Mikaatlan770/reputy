import { NextRequest, NextResponse } from 'next/server'
import { 
  signAdminSession, 
  getAdminCookieName, 
  getAdminCookieOptions 
} from '@/lib/internal/admin-cookie'

// ============ FAIL-FAST: Secret requis en production ============
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (IS_PRODUCTION && !process.env.INTERNAL_ADMIN_TOKEN) {
  console.error('[AUTH][FATAL] INTERNAL_ADMIN_TOKEN is not defined in production!')
}

// En dev: fallback autorisé. En prod: doit être défini explicitement.
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN || 
  (IS_PRODUCTION ? '' : 'super-admin-secret')

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
    // Fail-fast si secret non configuré en production
    if (!INTERNAL_ADMIN_TOKEN) {
      console.error('[Internal Auth] INTERNAL_ADMIN_TOKEN not configured in production')
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

    // Log pour debug (ne pas logger le vrai token en prod!)
    if (!IS_PRODUCTION) {
      console.log('[Internal Auth] Expected token starts with:', INTERNAL_ADMIN_TOKEN.substring(0, 5) + '...')
      console.log('[Internal Auth] Received token starts with:', token.substring(0, 5) + '...')
    }

    // Vérifier le token admin
    if (token !== INTERNAL_ADMIN_TOKEN) {
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
