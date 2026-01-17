import { NextRequest, NextResponse } from 'next/server'

// En mode dev, fallback sur un token par défaut si non configuré
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN || 'super-admin-secret'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    console.log('[Internal Auth] Login attempt, token provided:', !!token)

    if (!token) {
      return NextResponse.json({ error: 'Token requis' }, { status: 400 })
    }

    // Log pour debug (ne pas logger le vrai token en prod!)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Internal Auth] Expected token starts with:', INTERNAL_ADMIN_TOKEN.substring(0, 5) + '...')
      console.log('[Internal Auth] Received token starts with:', token.substring(0, 5) + '...')
    }

    if (token !== INTERNAL_ADMIN_TOKEN) {
      console.log('[Internal Auth] Token mismatch')
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    }

    console.log('[Internal Auth] Token valid, setting cookie')

    // Token valide - set httpOnly cookie
    const response = NextResponse.json({ ok: true })
    
    response.cookies.set('admin_ok', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 heures
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[Internal Auth] Error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE() {
  // Logout - supprime le cookie
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('admin_ok')
  return response
}
