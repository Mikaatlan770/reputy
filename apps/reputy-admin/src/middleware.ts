import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware pour protéger les routes /internal/*
 * Redirige vers /internal/login si le cookie admin_ok n'est pas présent
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Ne s'applique qu'aux routes /internal/*
  if (!pathname.startsWith('/internal')) {
    return NextResponse.next()
  }

  // Laisser passer /internal/login et /internal/api/* (routes d'authentification)
  if (pathname === '/internal/login' || pathname.startsWith('/internal/api/')) {
    return NextResponse.next()
  }

  // Vérifier le cookie admin_ok
  const adminCookie = request.cookies.get('admin_ok')
  
  if (!adminCookie || adminCookie.value !== '1') {
    // Rediriger vers login
    const loginUrl = new URL('/internal/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/internal/:path*'],
}
