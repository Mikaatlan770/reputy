import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============ P0.3: ADMIN COOKIE VERIFICATION (HARDENED) ============
// Note: On ne peut pas importer crypto dans le middleware Edge Runtime
// Donc on réimplémente la vérification ici avec Web Crypto API

const COOKIE_NAME = 'reputy_admin'
const TOKEN_VERSION = 1
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// ============ FAIL-FAST: Secret requis en production ============
if (IS_PRODUCTION && !process.env.ADMIN_COOKIE_SECRET) {
  console.error('[MIDDLEWARE][FATAL] ADMIN_COOKIE_SECRET is not defined in production!')
}

// En dev: fallback autorisé. En prod: doit être défini explicitement.
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || 
  (IS_PRODUCTION ? '' : 'dev-admin-cookie-secret')

// ============ HELPERS ============

/**
 * Convertit base64url en base64 standard avec padding
 * atob() ne gère pas base64url nativement
 */
function base64UrlToBase64(str: string): string {
  // Remplacer caractères base64url → base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Ajouter padding si nécessaire (base64 doit être multiple de 4)
  const pad = base64.length % 4
  if (pad) {
    base64 += '='.repeat(4 - pad)
  }
  return base64
}

/**
 * Comparaison constant-time pour éviter les timing attacks
 * Compatible Edge Runtime (pas de crypto.timingSafeEqual)
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Même si les longueurs diffèrent, on fait une comparaison
    // pour éviter de leak l'info sur la longueur
    const maxLen = Math.max(a.length, b.length)
    a = a.padEnd(maxLen, '\0')
    b = b.padEnd(maxLen, '\0')
  }
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Vérifie le token admin signé (version Edge Runtime compatible)
 */
async function verifyAdminToken(token: string): Promise<boolean> {
  // Fail-fast si secret non configuré en production
  if (!ADMIN_COOKIE_SECRET) {
    console.error('[Middleware] Cannot verify token: ADMIN_COOKIE_SECRET not configured')
    return false
  }

  if (!token || typeof token !== 'string') {
    return false
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return false
  }

  const [payloadB64, hmacB64] = parts

  try {
    // Calculer le HMAC attendu avec Web Crypto API
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(ADMIN_COOKIE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payloadB64)
    )
    
    // Convertir en base64url (sans padding)
    const expectedHmacB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    // Comparaison constant-time pour éviter timing attacks
    if (!constantTimeCompare(expectedHmacB64, hmacB64)) {
      return false
    }

    // Décoder le payload avec gestion correcte du base64url
    const payloadJson = atob(base64UrlToBase64(payloadB64))
    const payload = JSON.parse(payloadJson)

    // Vérifier version
    if (payload.v !== TOKEN_VERSION) {
      return false
    }

    // Vérifier rôle
    if (payload.role !== 'super-admin') {
      return false
    }

    // Vérifier expiration
    if (Date.now() > payload.exp) {
      return false
    }

    return true
  } catch (err) {
    console.error('[Middleware] Token verification error:', err)
    return false
  }
}

/**
 * Middleware pour protéger les routes /internal/*
 * 
 * - Vérifie le cookie signé HMAC (reputy_admin)
 * - Redirige vers /internal/login si invalide/expiré
 * - Laisse passer les autres routes (mode CLIENT, pages publiques)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Ne s'applique qu'aux routes /internal/*
  if (!pathname.startsWith('/internal')) {
    return NextResponse.next()
  }

  // Laisser passer /internal/login et /internal/api/* (routes d'authentification)
  if (pathname === '/internal/login' || pathname.startsWith('/internal/api/')) {
    return NextResponse.next()
  }

  // Fail-fast si secret non configuré en production
  if (!ADMIN_COOKIE_SECRET) {
    console.error('[Middleware] Access denied: ADMIN_COOKIE_SECRET not configured in production')
    const loginUrl = new URL('/internal/login', request.url)
    loginUrl.searchParams.set('error', 'config')
    return NextResponse.redirect(loginUrl)
  }

  // Récupérer le cookie signé
  const adminCookie = request.cookies.get(COOKIE_NAME)
  
  // Vérifier le token
  const isValid = adminCookie ? await verifyAdminToken(adminCookie.value) : false

  if (!isValid) {
    // Log pour debug
    if (!IS_PRODUCTION) {
      console.log('[Middleware] Admin cookie invalid or missing, redirecting to login')
    }
    
    // Rediriger vers login
    const loginUrl = new URL('/internal/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    
    const response = NextResponse.redirect(loginUrl)
    
    // Supprimer les cookies invalides
    response.cookies.delete(COOKIE_NAME)
    response.cookies.delete('admin_ok') // Legacy cleanup
    
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/internal/:path*'],
}
