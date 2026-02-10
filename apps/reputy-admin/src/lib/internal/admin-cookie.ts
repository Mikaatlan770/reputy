/**
 * P0.3 - Admin Cookie Signing Utilities
 * 
 * Utilise HMAC-SHA256 pour signer les cookies admin.
 * Format: base64url(payload) + "." + base64url(hmac)
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { IS_PRODUCTION, IS_RUNTIME_PRODUCTION } from '@/lib/env'

// ============ CONFIGURATION ============

const COOKIE_NAME = 'reputy_admin'
const SESSION_DURATION_HOURS = 12
const TOKEN_VERSION = 1

// En dev: fallback autorisé. En prod: doit être défini explicitement.
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || 
  (IS_PRODUCTION ? '' : 'dev-admin-cookie-secret')

// ============ FAIL-FAST (lazy, runtime-only) ============

/** Vérifie que le secret est configuré. Appelé au premier usage, pas au build. */
function assertSecretConfigured(): void {
  if (IS_RUNTIME_PRODUCTION && !process.env.ADMIN_COOKIE_SECRET) {
    throw new Error(
      '[ADMIN-COOKIE] Missing ADMIN_COOKIE_SECRET at runtime. ' +
      'Set ADMIN_COOKIE_SECRET in the production environment and redeploy.'
    )
  }
}

// ============ TYPES ============

export interface AdminSessionPayload {
  v: number      // version
  role: string   // "super-admin"
  exp: number    // expiration timestamp (ms)
  iat: number    // issued at timestamp (ms)
}

export interface VerifyResult {
  ok: boolean
  payload?: AdminSessionPayload
  error?: string
}

// ============ BASE64URL HELPERS ============

function base64urlEncode(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return buffer.toString('base64url')
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8')
}

// ============ HMAC FUNCTIONS ============

function computeHmac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

/**
 * Compare deux buffers en temps constant (timing-safe)
 */
function safeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false
  }
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ============ PUBLIC API ============

/**
 * Crée un token signé pour la session admin
 * @throws Error si ADMIN_COOKIE_SECRET n'est pas configuré
 */
export function signAdminSession(): string {
  assertSecretConfigured()
  if (!ADMIN_COOKIE_SECRET) {
    throw new Error('Cannot sign session: ADMIN_COOKIE_SECRET not configured')
  }
  
  const now = Date.now()
  const payload: AdminSessionPayload = {
    v: TOKEN_VERSION,
    role: 'super-admin',
    iat: now,
    exp: now + (SESSION_DURATION_HOURS * 60 * 60 * 1000), // 12h en ms
  }

  const payloadJson = JSON.stringify(payload)
  const payloadB64 = base64urlEncode(payloadJson)
  const hmac = computeHmac(payloadB64, ADMIN_COOKIE_SECRET)
  const hmacB64 = base64urlEncode(hmac)

  return `${payloadB64}.${hmacB64}`
}

/**
 * Vérifie et décode un token signé
 */
export function verifyAdminSession(token: string): VerifyResult {
  assertSecretConfigured()
  if (!ADMIN_COOKIE_SECRET) {
    return { ok: false, error: 'ADMIN_COOKIE_SECRET not configured' }
  }
  
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Token manquant' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { ok: false, error: 'Format token invalide' }
  }

  const [payloadB64, hmacB64] = parts

  // Vérifier la signature HMAC (timing-safe)
  const expectedHmac = computeHmac(payloadB64, ADMIN_COOKIE_SECRET)
  let providedHmac: Buffer
  try {
    providedHmac = Buffer.from(hmacB64, 'base64url')
  } catch {
    return { ok: false, error: 'Signature invalide (decode)' }
  }

  if (!safeCompare(expectedHmac, providedHmac)) {
    return { ok: false, error: 'Signature invalide' }
  }

  // Décoder le payload
  let payload: AdminSessionPayload
  try {
    const payloadJson = base64urlDecode(payloadB64)
    payload = JSON.parse(payloadJson)
  } catch {
    return { ok: false, error: 'Payload invalide' }
  }

  // Vérifier la version
  if (payload.v !== TOKEN_VERSION) {
    return { ok: false, error: 'Version token obsolète' }
  }

  // Vérifier le rôle
  if (payload.role !== 'super-admin') {
    return { ok: false, error: 'Rôle invalide' }
  }

  // Vérifier l'expiration
  if (Date.now() > payload.exp) {
    return { ok: false, error: 'Token expiré' }
  }

  return { ok: true, payload }
}

/**
 * Nom du cookie admin
 */
export function getAdminCookieName(): string {
  return COOKIE_NAME
}

/**
 * Options du cookie pour set-cookie
 */
export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION_HOURS * 60 * 60, // en secondes
    path: '/',
  }
}
