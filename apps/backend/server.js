// Backend Reputy - Extension Chrome Doctolib
//
// Priority labels used in comments:
//   P4 = purge historique git + force push + rotation secrets (opération humaine)
//   P5 = legacy auth (validateAuth, legacyAuth, kill-switch, instrumentation)
//
// Endpoints :
//  - GET  /health                      -> statut du serveur
//  - POST /api/send-review-request     -> crée une demande d'avis
//  - GET  /r/:id                       -> page de notation patient
//  - POST /r/:id                       -> soumettre un feedback
//  - GET  /api/feedbacks               -> liste des feedbacks (admin)
//  - GET  /api/settings                -> récupérer les settings
//  - POST /api/settings                -> sauvegarder les settings
//  - GET  /api/requests                -> liste des demandes (traçabilité)
//
// Internal Backoffice API (Super Admin):
//  - GET    /internal/orgs             -> liste des clients
//  - POST   /internal/orgs             -> créer un client
//  - GET    /internal/orgs/:orgId      -> détail client
//  - PUT    /internal/orgs/:orgId      -> modifier client
//  - POST   /internal/orgs/:orgId/credits  -> ajouter crédits
//  - POST   /internal/orgs/:orgId/status   -> changer statut
//  - GET    /internal/orgs/:orgId/usage    -> usage
//  - GET    /internal/orgs/:orgId/telemetry -> telemetry
//  - POST   /internal/orgs/:orgId/reset-public-key -> régénérer publicKey
//  - POST   /internal/orgs/:orgId/rotate-api-token -> rotation token API (P1.3)
//  - GET    /internal/orgs/:orgId/api-token        -> info token API masqué (P1.3)
//  - GET    /internal/admin/feedbacks              -> feedbacks admin (P5)
//  - GET    /internal/admin/legacy-auth-stats      -> stats legacy auth (P5)
//  - POST   /telemetry/extension       -> log depuis extension
//
// Public API (lecture seule, pas d'auth):
//  - GET    /public/org/by-key/:publicKey -> info org par publicKey
//
// Configuration via variables d'environnement :
//  - PORT                (défaut : 8787)
//  - CABINET_API_TOKEN   (token attendu par l'extension)
//  - REVIEWS_BASE_URL    (défaut : http://localhost:PORT)
//  - INTERNAL_ADMIN_TOKEN (token backoffice super admin)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomBytes, createHash, createHmac, timingSafeEqual } = require('crypto');
const bcrypt = require('bcryptjs');

// Load environment variables from .env file
require('dotenv').config();

// P1.4: Structured logging
const logger = require('./lib/logger');

// Storage bridge (SQLite or data.json based on USE_SQLITE env)
const storage = require('./lib/storage');

// Billing modules
const stripeBilling = require('./lib/billing/stripe');
const gocardlessBilling = require('./lib/billing/gocardless');
const webhookEventsRepo = require('./lib/billing/webhook-events.repo');
const dunning = require('./lib/billing/dunning');
const stateMachine = require('./lib/billing/state-machine');
const billingTemplates = require('./emails/billing-templates');
// New billing modules
const planCatalog = require('./lib/billing/plan-catalog');
const stripeCoupons = require('./lib/billing/stripe-coupons');
const periodRollover = require('./lib/billing/period-rollover');
const effectiveBilling = require('./lib/billing/effective-billing');

// ============ ENVIRONMENT ============
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ============ P0.2: GLOBAL ERROR HANDLERS & GRACEFUL SHUTDOWN ============

let isShuttingDown = false;

/**
 * P0.2: Graceful shutdown — called on fatal error, SIGTERM, or SIGINT.
 * Idempotent: only executes once even if called multiple times.
 * 
 * @param {string} reason - Why we're shutting down (e.g. 'uncaughtException', 'SIGTERM')
 * @param {Error|null} err - The error that caused the shutdown, if any
 */
function gracefulShutdown(reason, err = null) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const exitCode = (reason === 'SIGTERM' || reason === 'SIGINT') ? 0 : 1;

  console.error(`\n[REPUTY][SHUTDOWN] Graceful shutdown initiated: ${reason}`);
  if (err) {
    console.error(`[REPUTY][SHUTDOWN] Error: ${err.message}`);
  }

  // 1) Try to close the HTTP server (stop accepting new connections)
  //    `server` is declared later in this file — that's fine because
  //    gracefulShutdown is never called before server.listen().
  try {
    if (typeof server !== 'undefined' && server && server.close) {
      server.close(() => {
        console.error('[REPUTY][SHUTDOWN] HTTP server closed');
      });
    }
  } catch (e) {
    console.error('[REPUTY][SHUTDOWN] Error closing HTTP server:', e.message);
  }

  // 2) Try to close the database (best effort)
  try {
    const db = require('./lib/db');
    if (db && db.closeDb) {
      db.closeDb();
    }
  } catch (e) {
    console.error('[REPUTY][SHUTDOWN] Error closing DB:', e.message);
  }

  // 3) Force exit after timeout (in case server.close() hangs on open connections)
  const SHUTDOWN_TIMEOUT_MS = 5000;
  const forceExitTimer = setTimeout(() => {
    console.error(`[REPUTY][SHUTDOWN] Forced exit after ${SHUTDOWN_TIMEOUT_MS}ms timeout`);
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // Don't keep process alive just for this timer

  // 4) Attempt immediate exit (the timeout above is a safety net)
  setImmediate(() => {
    process.exit(exitCode);
  });
}

// --- uncaughtException: synchronous throw that wasn't caught ---
process.on('uncaughtException', (err) => {
  try {
    logger.logFatal('UNCAUGHT_EXCEPTION', `Uncaught exception: ${err.message}`, {
      error: err.message,
      stack: err.stack,
      type: 'uncaughtException',
    });
  } catch (_) {
    // Logger itself might be broken — fall back to raw stderr
    console.error('[FATAL] uncaughtException:', err);
  }
  gracefulShutdown('uncaughtException', err);
});

// --- unhandledRejection: Promise rejection without .catch() ---
process.on('unhandledRejection', (reason, promise) => {
  const errMessage = reason instanceof Error ? reason.message : String(reason);
  const errStack = reason instanceof Error ? reason.stack : undefined;

  try {
    logger.logFatal('UNHANDLED_REJECTION', `Unhandled promise rejection: ${errMessage}`, {
      error: errMessage,
      stack: errStack,
      type: 'unhandledRejection',
    });
  } catch (_) {
    console.error('[FATAL] unhandledRejection:', reason);
  }
  gracefulShutdown('unhandledRejection', reason instanceof Error ? reason : new Error(errMessage));
});

// --- SIGTERM: sent by PM2 / Docker / systemd for graceful stop ---
process.on('SIGTERM', () => {
  try {
    logger.logInfo('SIGTERM_RECEIVED', 'SIGTERM received, initiating graceful shutdown');
  } catch (_) {
    console.error('[REPUTY] SIGTERM received');
  }
  gracefulShutdown('SIGTERM');
});

// --- SIGINT: Ctrl+C in terminal ---
process.on('SIGINT', () => {
  try {
    logger.logInfo('SIGINT_RECEIVED', 'SIGINT received, initiating graceful shutdown');
  } catch (_) {
    console.error('[REPUTY] SIGINT received');
  }
  gracefulShutdown('SIGINT');
});

// ============ END P0.2 ============

// ============ KNOWN DEV FALLBACKS (forbidden in production) ============
const DEV_FALLBACKS = {
  CABINET_API_TOKEN: 'dev-token',
  INTERNAL_ADMIN_TOKEN: 'super-admin-secret',
  JWT_SECRET: 'reputy-mvp-secret-change-in-production',
  ADMIN_COOKIE_SECRET: 'dev-admin-cookie-secret'
};

// ============ SECRETS CONFIGURATION ============
const PORT = process.env.PORT || 8787;
const CABINET_API_TOKEN = process.env.CABINET_API_TOKEN || DEV_FALLBACKS.CABINET_API_TOKEN;
// P5: Legacy grace period token (optional — set during rotation window, remove after 24–48h)
const CABINET_API_TOKEN_OLD = process.env.CABINET_API_TOKEN_OLD || '';
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN || DEV_FALLBACKS.INTERNAL_ADMIN_TOKEN;
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || DEV_FALLBACKS.ADMIN_COOKIE_SECRET;
const REVIEWS_BASE_URL = process.env.REVIEWS_BASE_URL || `http://127.0.0.1:${PORT}`;
const VERSION = '0.7.0'; // SQLite migration

// P5: Pre-computed hashes — avoids SHA256 on every request (constant-time compare)
const CABINET_API_TOKEN_HASH = CABINET_API_TOKEN
  ? createHash('sha256').update(CABINET_API_TOKEN).digest('hex')
  : '';
const CABINET_API_TOKEN_OLD_HASH = CABINET_API_TOKEN_OLD
  ? createHash('sha256').update(CABINET_API_TOKEN_OLD).digest('hex')
  : '';

// P1.4: Set version in logger
logger.setVersion(VERSION);

// ============ AUTH CONFIG ============
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACKS.JWT_SECRET;
const SESSION_EXPIRY_DAYS = 7;
const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const BCRYPT_ROUNDS = 10;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3001')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// ============ P0.4: RATE LIMITING (Anti brute-force) ============
// Simple in-memory rate limiter, reset on restart
// In PROD: strict limits. In DEV: permissive.

const rateLimitStore = new Map(); // Legacy (for verification codes)

// P0.4: New rate limiter for auth endpoints
const authRateLimitStore = new Map(); // Map<string, { count: number, resetAt: number }>
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = IS_PRODUCTION ? 5 : 1000; // 5/min in prod, 1000 in dev
const AUTH_RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

/**
 * Get client IP from request (handles proxies)
 * Priority: x-forwarded-for > x-real-ip > socket.remoteAddress
 */
function getClientIp(req) {
  // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0]; // First IP is the client
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Check rate limit for a given key (route:ip)
 * @param {string} key - Unique key (e.g., "/auth/login:192.168.1.1")
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec?: number }}
 */
function checkRateLimit(key) {
  const now = Date.now();
  const entry = authRateLimitStore.get(key);
  
  // No entry or expired: create new
  if (!entry || now >= entry.resetAt) {
    authRateLimitStore.set(key, {
      count: 1,
      resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true, remaining: AUTH_RATE_LIMIT_MAX_ATTEMPTS - 1 };
  }
  
  // Entry exists and not expired
  entry.count++;
  
  if (entry.count > AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  
  return { allowed: true, remaining: AUTH_RATE_LIMIT_MAX_ATTEMPTS - entry.count };
}

/**
 * Apply rate limiting to a request
 * @returns {boolean} true if request should be blocked
 */
function applyAuthRateLimit(req, res, route) {
  // En dev, désactiver le rate limiting pour localhost
  if (!IS_PRODUCTION) {
    const ip = getClientIp(req);
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || ip === '::ffff:127.0.0.1') {
      return false; // Never block localhost in dev
    }
  }
  
  const ip = getClientIp(req);
  const key = `${route}:${ip}`;
  const result = checkRateLimit(key);
  
  if (!result.allowed) {
    // P1.4: Log rate limit blocked
    logger.logRateLimit(req, route, result.retryAfterSec);
    
    // Send 429 response
    res.setHeader('Retry-After', String(result.retryAfterSec));
    sendJson(res, 429, {
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Too many attempts. Try again later.',
      retryAfterSec: result.retryAfterSec
    });
    return true; // Blocked
  }
  
  return false; // Allowed
}

/**
 * Cleanup expired rate limit entries (runs periodically)
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of authRateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      authRateLimitStore.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0 && !IS_PRODUCTION) {
    console.log(`[RateLimit] Cleaned ${cleaned} expired entries. Store size: ${authRateLimitStore.size}`);
  }
}

// Start periodic cleanup
setInterval(cleanupRateLimitStore, AUTH_RATE_LIMIT_CLEANUP_INTERVAL_MS);

// Legacy rate limit constants (for verification codes)
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ============ P0.3: CORS + SECURITY HEADERS ============

/**
 * P0.3: Apply CORS headers based on ALLOWED_ORIGINS.
 * - No Origin header (curl / server-to-server): pass through, no CORS headers.
 * - Origin in ALLOWED_ORIGINS: set Allow-Origin to that origin.
 * - Origin present but NOT allowed: respond 403.
 * 
 * Uses statusCode + setHeader (not writeHead with object) to preserve
 * security headers already set by applySecurityHeaders().
 * 
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {'pass'|'preflight'|'blocked'}
 */
function applyCors(req, res) {
  const origin = req.headers.origin;

  // No Origin → server-to-server / curl → skip CORS headers
  if (!origin) return 'pass';

  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  if (!isAllowed) {
    if (IS_PRODUCTION) {
      logger.logError('CORS_BLOCKED', { origin, url: req.url, method: req.method });
    }
    // Use statusCode + setHeader to preserve security headers
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return 'blocked';
  }

  // Allowed origin → set CORS headers
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, x-admin-token, x-api-token, x-public-key, X-Internal-Admin-Token, X-Cabinet-Api-Token, X-Public-Key'
  );
  // Credentials: true — needed for admin-cookie cross-origin (reputy-admin ↔ backend)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24h preflight cache

  // Preflight → respond 204 immediately
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return 'preflight';
  }

  return 'pass';
}

/**
 * P0.3: Apply security headers to every response.
 * Safe for JSON APIs. HTML pages get a more permissive CSP for inline JS/CSS.
 * HSTS only in production.
 * 
 * @param {http.ServerResponse} res
 * @param {object} [options]
 * @param {boolean} [options.isHtml=false] - If true, use a more permissive CSP for HTML pages
 */
function applySecurityHeaders(res, { isHtml = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  if (isHtml) {
    // Permissive CSP for patient rating pages (inline JS/CSS)
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"
    );
  } else {
    // Strict CSP for API responses (JSON)
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    );
  }

  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
}

// ============ END P0.3 ============

// ============ P0.1: FAIL-FAST SECRETS VALIDATION ============
/**
 * Validates that all required secrets are properly configured in production.
 * In development mode, fallback values are accepted.
 * In production mode:
 *   - All secrets must be explicitly set via environment variables
 *   - Secrets must NOT equal their known dev fallback values
 * 
 * @throws {Error} If validation fails in production
 */
function validateProductionSecrets() {
  const requiredSecrets = [
    { name: 'INTERNAL_ADMIN_TOKEN', value: INTERNAL_ADMIN_TOKEN },
    { name: 'JWT_SECRET', value: JWT_SECRET },
    { name: 'CABINET_API_TOKEN', value: CABINET_API_TOKEN },
    { name: 'ADMIN_COOKIE_SECRET', value: ADMIN_COOKIE_SECRET }
  ];

  const errors = [];

  for (const secret of requiredSecrets) {
    const envValue = process.env[secret.name];
    const fallback = DEV_FALLBACKS[secret.name];

    if (IS_PRODUCTION) {
      // In production: secret must be defined and NOT equal to fallback
      if (!envValue) {
        errors.push(`❌ ${secret.name} is not defined (required in production)`);
      } else if (envValue === fallback) {
        errors.push(`❌ ${secret.name} is using dev fallback value "${fallback}" (forbidden in production)`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('\n' + '='.repeat(70));
    console.error('🚨 FATAL: PRODUCTION SECRETS VALIDATION FAILED');
    console.error('='.repeat(70));
    console.error('\nThe following issues were detected:\n');
    errors.forEach(e => console.error('  ' + e));
    console.error('\n📋 Required environment variables for production:');
    console.error('   - INTERNAL_ADMIN_TOKEN  (super-admin API token)');
    console.error('   - JWT_SECRET            (session signing secret)');
    console.error('   - CABINET_API_TOKEN     (extension API token)');
    console.error('   - ADMIN_COOKIE_SECRET   (admin cookie HMAC secret)');
    console.error('\n⚠️  These values must be:');
    console.error('   1. Explicitly set via environment variables');
    console.error('   2. Different from the known dev fallback values');
    console.error('\n' + '='.repeat(70) + '\n');
    
    throw new Error('Production secrets validation failed. Server cannot start.');
  }

  // Log success
  if (IS_PRODUCTION) {
    console.log('[REPUTY][SECURITY] ✅ All production secrets validated');
  } else {
    console.log(`[REPUTY][SECURITY] ⚠️  Running in ${NODE_ENV} mode with dev fallbacks allowed`);
  }
}

// ============ P0.3: ALLOWED_ORIGINS production guard ============
if (IS_PRODUCTION) {
  const rawOrigins = process.env.ALLOWED_ORIGINS;

  if (!rawOrigins || !rawOrigins.trim()) {
    throw new Error(
      '[CONFIG] ALLOWED_ORIGINS manquant en production — sinon CORS bloquera tout le frontend.\n' +
      '  Exemple: ALLOWED_ORIGINS=https://app.reputy.fr,https://admin.reputy.fr'
    );
  }

  const lowered = rawOrigins.toLowerCase();
  if (lowered.includes('localhost') || lowered.includes('127.0.0.1')) {
    console.warn('[CONFIG] ⚠️  ALLOWED_ORIGINS contient localhost/127.0.0.1 en production — vérifie que c\'est voulu.');
  }
}

// ============ ANTI-DOUBLON CONFIG ============
const DUPLICATE_WINDOW_HOURS = 24;        // Fenêtre anti-doublon (heures)
const REQUEST_EXPIRY_DAYS = 30;           // Expiration des requests (jours)
const MAX_SEND_COUNT = 3;                 // Nombre max de renvois autorisés

// Default settings (overridden by data.json)
const DEFAULT_SETTINGS = {
  googleReviewUrl: 'https://g.page/r/YOUR_GOOGLE_ID/review',
  cabinetName: 'Cabinet Médical',
  // Review routing config: détermine si les avis positifs sont redirigés vers avis public
  reviewRouting: {
    enabled: true,           // Si false, tout va en feedback interne
    threshold: 4,            // Note minimum pour rediriger vers avis public (1-5)
    publicTarget: 'DOCTOLIB' // Cible: 'DOCTOLIB', 'GOOGLE', etc.
  }
};

const DATA_FILE = path.join(__dirname, 'data.json');

// ============ MULTI-TENANT: DEFAULT QUOTAS PER PLAN ============
// ============================================================
// PLAN QUOTAS - Version 2.0 (Updated pricing grid)
// ============================================================
// Bronze = FREE (no Stripe), Argent/Or/Platinum = paid plans
// QR/NFC: scans per device (500 for paid, 50 for Bronze)

const PLAN_DEFAULTS = {
  // ──────────────────────────────────────────────────────────────
  // BRONZE - GRATUIT (pas de Stripe)
  // ──────────────────────────────────────────────────────────────
  // Accès ReputyBoard, réponses manuelles, 1 QR (50 scans)
  // Campagnes SMS/Email UNIQUEMENT via achat de packs
  health_bronze: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 50, nfcScans: 0 },
  food_bronze: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 50, nfcScans: 0 },
  business_bronze: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 50, nfcScans: 0 },
  // Alias pour rétrocompatibilité
  health_basic: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 50, nfcScans: 0 },
  food_basic: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 50, nfcScans: 0 },
  business_basic: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 50, nfcScans: 0 },

  // ──────────────────────────────────────────────────────────────
  // ARGENT - 59€ HT/mois
  // ──────────────────────────────────────────────────────────────
  // 100 SMS, 500 emails, Module Doctolib, 3 QR, 1 NFC
  health_argent: { smsIncluded: 100, emailIncluded: 500, aiIncluded: 0, qrIncluded: 3, nfcIncluded: 1, qrScans: 500, nfcScans: 500 },
  food_argent: { smsIncluded: 100, emailIncluded: 500, aiIncluded: 0, qrIncluded: 3, nfcIncluded: 1, qrScans: 500, nfcScans: 500 },
  business_argent: { smsIncluded: 100, emailIncluded: 500, aiIncluded: 0, qrIncluded: 3, nfcIncluded: 1, qrScans: 500, nfcScans: 500 },
  // Alias (silver = argent)
  health_silver: { smsIncluded: 100, emailIncluded: 500, aiIncluded: 0, qrIncluded: 3, nfcIncluded: 1, qrScans: 500, nfcScans: 500 },
  health_pro: { smsIncluded: 100, emailIncluded: 500, aiIncluded: 0, qrIncluded: 3, nfcIncluded: 1, qrScans: 500, nfcScans: 500 },

  // ──────────────────────────────────────────────────────────────
  // OR - 99€ HT/mois
  // ──────────────────────────────────────────────────────────────
  // 200 SMS, 1000 emails, 75 IA, Module Doctolib, 10 QR, 3 NFC
  health_or: { smsIncluded: 200, emailIncluded: 1000, aiIncluded: 75, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
  food_or: { smsIncluded: 200, emailIncluded: 1000, aiIncluded: 75, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
  business_or: { smsIncluded: 200, emailIncluded: 1000, aiIncluded: 75, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
  // Alias (gold = or)
  health_gold: { smsIncluded: 200, emailIncluded: 1000, aiIncluded: 75, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
  health_enterprise: { smsIncluded: 200, emailIncluded: 1000, aiIncluded: 75, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },

  // ──────────────────────────────────────────────────────────────
  // PLATINUM - 129€ HT/mois
  // ──────────────────────────────────────────────────────────────
  // 400 SMS, 2000 emails, 150 IA, Module Doctolib, 10 QR, 3 NFC
  health_platinum: { smsIncluded: 400, emailIncluded: 2000, aiIncluded: 150, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
  food_platinum: { smsIncluded: 400, emailIncluded: 2000, aiIncluded: 150, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
  business_platinum: { smsIncluded: 400, emailIncluded: 2000, aiIncluded: 150, qrIncluded: 10, nfcIncluded: 3, qrScans: 500, nfcScans: 500 },
};

// Plan tier mapping (for feature access checks)
const PLAN_TIERS = {
  bronze: 0,
  basic: 0, // alias
  argent: 1,
  silver: 1, // alias
  pro: 1, // alias
  or: 2,
  gold: 2, // alias
  enterprise: 2, // alias
  platinum: 3,
};

// Features available per tier
const TIER_FEATURES = {
  0: ['reputyboard', 'manual_replies', 'qr_basic'], // Bronze
  1: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib'], // Argent
  2: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib', 'ai', 'monthly_report'], // Or
  3: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib', 'ai', 'advanced_report', 'priority_support'], // Platinum
};

/**
 * Get plan tier from plan code
 * @param {string} planCode - e.g., 'health_argent', 'health_bronze'
 * @returns {number} - Tier level (0-3)
 */
function getPlanTier(planCode) {
  if (!planCode) return 0;
  const parts = planCode.split('_');
  const tier = parts[1] || 'basic';
  return PLAN_TIERS[tier] ?? 0;
}

/**
 * Check if a plan has a specific feature
 * @param {string} planCode - e.g., 'health_argent'
 * @param {string} feature - e.g., 'doctolib', 'ai'
 * @returns {boolean}
 */
function planHasFeature(planCode, feature) {
  const tier = getPlanTier(planCode);
  return TIER_FEATURES[tier]?.includes(feature) ?? false;
}

/**
 * Check if plan is a paid plan (requires Stripe)
 * @param {string} planCode 
 * @returns {boolean}
 */
function isPaidPlan(planCode) {
  return getPlanTier(planCode) >= 1;
}

// ============ PACK CATALOG (MVP) ============
// Packs are prorated when purchased mid-period
const PACK_CATALOG = {
  pack_sms_50: {
    code: 'pack_sms_50',
    name: 'Pack 50 SMS',
    smsMonthly: 50,
    emailMonthly: 0,
    priceMonthlyCents: 1500, // 15€
    currency: 'EUR'
  },
  pack_sms_100: {
    code: 'pack_sms_100',
    name: 'Pack 100 SMS',
    smsMonthly: 100,
    emailMonthly: 0,
    priceMonthlyCents: 2500, // 25€
    currency: 'EUR'
  },
  pack_sms_200: {
    code: 'pack_sms_200',
    name: 'Pack 200 SMS',
    smsMonthly: 200,
    emailMonthly: 0,
    priceMonthlyCents: 4000, // 40€
    currency: 'EUR'
  },
  pack_email_100: {
    code: 'pack_email_100',
    name: 'Pack 100 Emails',
    smsMonthly: 0,
    emailMonthly: 100,
    priceMonthlyCents: 500, // 5€
    currency: 'EUR'
  },
  pack_combo_50: {
    code: 'pack_combo_50',
    name: 'Pack Combo 50',
    smsMonthly: 50,
    emailMonthly: 50,
    priceMonthlyCents: 1800, // 18€
    currency: 'EUR'
  }
};

// ============ UTILITY FUNCTIONS ============
function nowISO() {
  return new Date().toISOString();
}

function generateId() {
  return randomBytes(12).toString('hex');
}

/**
 * Génère une Public Key unique pour une org
 * Format: pub_<16-24 caractères alphanumériques>
 * Non secrète, sert à rattacher extension/events à l'org
 */
function generatePublicKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 20; // Entre 16 et 24
  let result = 'pub_';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * P1.3: Génère un API Token sécurisé pour une org
 * Format: rpt_<32 bytes en base64url>
 * Ce token est SECRET et doit être communiqué au client via le backoffice
 */
function generateApiToken() {
  const bytes = randomBytes(32);
  const base64url = bytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `rpt_${base64url}`;
}

/**
 * P1.3: Masque un API Token pour l'affichage
 * Affiche: rpt_abcd...wxyz (8 premiers + 4 derniers caractères)
 */
function maskApiToken(token) {
  if (!token || token.length < 16) return '***';
  return `${token.substring(0, 12)}...${token.substring(token.length - 4)}`;
}

/**
 * S'assure qu'une org a une publicKey, sinon en génère une
 */
function ensureOrgHasPublicKey(org) {
  if (!org.publicKey) {
    org.publicKey = generatePublicKey();
  }
  return org;
}

/**
 * Trouve une org par sa publicKey
 */
function getOrgByPublicKey(data, publicKey) {
  return data.orgs.find(o => o.publicKey === publicKey);
}

/**
 * Ensures data.json has all required schema sections
 * Performs "soft migration" by adding missing keys with defaults
 */
function ensureSchema(data) {
  // Ensure base collections exist
  if (!data.requests) data.requests = {};
  if (!data.feedbacks) data.feedbacks = {};
  if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
  
  // Multi-tenant collections
  if (!data.orgs) data.orgs = [];
  if (!data.usageLedger) data.usageLedger = [];
  if (!data.telemetry) data.telemetry = [];
  
  // Auth collections (MVP onboarding) - MUST be arrays
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.emailVerifications)) data.emailVerifications = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  if (!Array.isArray(data.emailOutbox)) data.emailOutbox = []; // Debug: simulated emails
  
  // Ensure settings has reviewRouting
  if (!data.settings.reviewRouting) {
    data.settings.reviewRouting = DEFAULT_SETTINGS.reviewRouting;
  }
  
  // Migrate existing orgs to full schema
  data.orgs = data.orgs.map(org => ({
    id: org.id || generateId(),
    publicKey: org.publicKey || generatePublicKey(), // Auto-generate if missing
    name: org.name || 'Unknown',
    email: org.email || null, // Email principal du client
    vertical: org.vertical || 'health',
    status: org.status || 'active',
    createdAt: org.createdAt || nowISO(),
    updatedAt: org.updatedAt || nowISO(),
    billing: {
      provider: org.billing?.provider || 'none',
      stripeCustomerId: org.billing?.stripeCustomerId || null,
      gocardlessMandateId: org.billing?.gocardlessMandateId || null,
      ...org.billing
    },
    plan: {
      code: org.plan?.code || `${org.vertical || 'health'}_basic`,
      basePriceCents: org.plan?.basePriceCents || 4900,
      currency: org.plan?.currency || 'EUR',
      billingCycle: org.plan?.billingCycle || 'monthly',
      ...org.plan
    },
    negotiated: {
      enabled: org.negotiated?.enabled || false,
      customPriceCents: org.negotiated?.customPriceCents || null,
      discountPercent: org.negotiated?.discountPercent || null,
      notes: org.negotiated?.notes || '',
      contractRef: org.negotiated?.contractRef || null,
      ...org.negotiated
    },
    options: {
      reviewRouting: org.options?.reviewRouting ?? true,
      widgetsSeo: org.options?.widgetsSeo ?? false,
      multiLocations: org.options?.multiLocations ?? false,
      prioritySupport: org.options?.prioritySupport ?? false,
      custom: org.options?.custom || {},
      ...org.options
    },
    quotas: {
      smsIncluded: org.quotas?.smsIncluded ?? PLAN_DEFAULTS[org.plan?.code]?.smsIncluded ?? 50,
      emailIncluded: org.quotas?.emailIncluded ?? PLAN_DEFAULTS[org.plan?.code]?.emailIncluded ?? 50,
      aiIncluded: org.quotas?.aiIncluded ?? PLAN_DEFAULTS[org.plan?.code]?.aiIncluded ?? 20,
      qrIncluded: org.quotas?.qrIncluded ?? PLAN_DEFAULTS[org.plan?.code]?.qrIncluded ?? 1,
      nfcIncluded: org.quotas?.nfcIncluded ?? PLAN_DEFAULTS[org.plan?.code]?.nfcIncluded ?? 0,
      ...org.quotas
    },
    balances: {
      smsExtra: org.balances?.smsExtra ?? 0,
      emailExtra: org.balances?.emailExtra ?? 0,
      ...org.balances
    },
    // NEW: Preserve subscriptionCredits and packWallet if they exist
    ...(org.subscriptionCredits && { subscriptionCredits: org.subscriptionCredits }),
    ...(org.packWallet && { packWallet: org.packWallet }),
    ...(org._creditsMigrated && { _creditsMigrated: org._creditsMigrated }),
    ...(org._balancesMigrated && { _balancesMigrated: org._balancesMigrated }),
    // P1.3: API Token per-org (migration douce)
    apiToken: org.apiToken || generateApiToken(),
    apiTokenCreatedAt: org.apiTokenCreatedAt || nowISO(),
    apiTokenLastRotatedAt: org.apiTokenLastRotatedAt || null,
    apiTokenPrevious: org.apiTokenPrevious || null,
    apiTokenPreviousExpiresAt: org.apiTokenPreviousExpiresAt || null
  }));
  
  return data;
}

/**
 * Get org by ID or throw 404
 */
function getOrgOrThrow(data, orgId) {
  const org = data.orgs.find(o => o.id === orgId);
  if (!org) {
    const error = new Error('Org not found');
    error.status = 404;
    throw error;
  }
  return org;
}

// ============ BILLING & PERIOD HELPERS ============
// NOUVELLES RÈGLES:
// - subscriptionCredits (inclus + offerts): expire chaque mois calendaire
// - packWallet (packs achetés): persistant, pas d'expiration (mais nécessite abonnement actif)
// - Si statut != active => tous crédits perdus/inaccessibles

/**
 * Get start of month for a given date
 */
function getMonthStart(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get end of month for a given date (last day 23:59:59.999)
 */
function getMonthEnd(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get number of days in a month
 */
function getDaysInMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Calculate prorata ratio for a billing period
 */
function calculateProrataRatio(periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const daysInMonth = getDaysInMonth(start);
  const daysCovered = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(1, daysCovered / daysInMonth);
}

/**
 * Compute current period for an org (mois calendaire)
 */
function computePeriod(now, startedAt) {
  const nowDate = new Date(now);
  const startDate = new Date(startedAt);
  
  // Premier mois: prorata si pas 1er du mois
  if (nowDate.getFullYear() === startDate.getFullYear() && 
      nowDate.getMonth() === startDate.getMonth()) {
    const isFirstOfMonth = startDate.getDate() === 1;
    let periodStart;
    if (isFirstOfMonth) {
      periodStart = getMonthStart(startDate);
    } else {
      periodStart = new Date(startDate);
      periodStart.setHours(0, 0, 0, 0);
    }
    const periodEnd = getMonthEnd(startDate);
    const ratio = calculateProrataRatio(periodStart, periodEnd);
    return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), ratio };
  }
  
  // Mois suivants: mois calendaire complet
  const periodStart = getMonthStart(nowDate);
  const periodEnd = getMonthEnd(nowDate);
  return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), ratio: 1 };
}

/**
 * Initialize subscriptionCredits structure for an org
 * Applies prorata if the period doesn't start on the 1st of the month
 */
function initSubscriptionCredits(org, periodStart, periodEnd) {
  const smsMonthlyBase = org.quotas?.smsIncluded || 0;
  const emailMonthlyBase = org.quotas?.emailIncluded || 0;
  const aiMonthlyBase = org.quotas?.aiIncluded || 0;
  const qrMonthlyBase = org.quotas?.qrIncluded || 0;
  const nfcMonthlyBase = org.quotas?.nfcIncluded || 0;
  
  // Calculate prorata ratio
  const ratio = calculateProrataRatio(periodStart, periodEnd);
  const isProrata = ratio < 1;
  
  // Apply prorata to included credits
  const smsIncludedThisPeriod = isProrata ? Math.round(smsMonthlyBase * ratio) : smsMonthlyBase;
  const emailIncludedThisPeriod = isProrata ? Math.round(emailMonthlyBase * ratio) : emailMonthlyBase;
  const aiIncludedThisPeriod = isProrata ? Math.round(aiMonthlyBase * ratio) : aiMonthlyBase;
  // QR/NFC: No prorata (these are persistent limits, not monthly resets)
  const qrIncludedThisPeriod = qrMonthlyBase;
  const nfcIncludedThisPeriod = nfcMonthlyBase;
  
  if (isProrata) {
    logger.info(`[BILLING] Prorata applied: ratio=${(ratio * 100).toFixed(1)}%, SMS: ${smsMonthlyBase} → ${smsIncludedThisPeriod}, Email: ${emailMonthlyBase} → ${emailIncludedThisPeriod}, AI: ${aiMonthlyBase} → ${aiIncludedThisPeriod}`);
  }
  
  return {
    // Base monthly values (for reference)
    smsMonthlyBase,
    emailMonthlyBase,
    aiMonthlyBase,
    qrMonthlyBase,
    nfcMonthlyBase,
    // Prorated values for this period
    smsIncludedMonthly: smsIncludedThisPeriod,
    emailIncludedMonthly: emailIncludedThisPeriod,
    aiIncludedMonthly: aiIncludedThisPeriod,
    qrIncludedMonthly: qrIncludedThisPeriod,
    nfcIncludedMonthly: nfcIncludedThisPeriod,
    // Gift credits (always 0 at init, added via backoffice)
    smsGiftMonthly: 0,
    emailGiftMonthly: 0,
    aiGiftMonthly: 0,
    qrGiftMonthly: 0,
    nfcGiftMonthly: 0,
    // Usage tracking
    smsUsedThisPeriod: 0,
    emailUsedThisPeriod: 0,
    aiUsedThisPeriod: 0,
    qrUsedThisPeriod: 0,
    nfcUsedThisPeriod: 0,
    // Period info
    periodStart,
    periodEnd,
    // Prorata info
    ratio: Math.round(ratio * 1000) / 1000,
    isProrata
  };
}

/**
 * Initialize packWallet structure for an org
 */
function initPackWallet() {
  return {
    smsRemaining: 0,
    emailRemaining: 0,
    aiRemaining: 0,
    qrRemaining: 0,
    nfcRemaining: 0
  };
}

/**
 * Ensure org has proper billing structure (migration douce)
 */
function ensureOrgBilling(org) {
  const startedAt = org.billing?.startedAt || org.createdAt || nowISO();
  const period = computePeriod(new Date(), startedAt);
  
  org.billing = {
    // Preserve existing billing fields (stripeCouponId, stripeSubscriptionId, etc.)
    ...org.billing,
    // Ensure required fields exist with defaults
    provider: org.billing?.provider || 'none',
    stripeCustomerId: org.billing?.stripeCustomerId || null,
    gocardlessMandateId: org.billing?.gocardlessMandateId || null,
    startedAt,
    status: org.billing?.status || org.status || 'active',
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    anchor: org.billing?.anchor || 'calendar_month'
  };
  return org;
}

/**
 * Migrate org from old allocation system to new subscriptionCredits + packWallet
 * Also upgrades old subscriptionCredits structure if it lacks prorata fields
 */
function migrateOrgCredits(data, org) {
  // Check if structure needs upgrade (missing prorata fields or AI fields)
  const needsUpgrade = org.subscriptionCredits && 
    (org.subscriptionCredits.smsMonthlyBase === undefined || org.subscriptionCredits.aiMonthlyBase === undefined);
  
  // Skip if already migrated AND has current structure with AI
  if (org.subscriptionCredits && org.packWallet && org._creditsMigrated && !needsUpgrade) {
    return false;
  }
  
  // If upgrading existing structure, preserve usage data
  const existingUsage = org.subscriptionCredits ? {
    smsUsed: org.subscriptionCredits.smsUsedThisPeriod || 0,
    emailUsed: org.subscriptionCredits.emailUsedThisPeriod || 0,
    aiUsed: org.subscriptionCredits.aiUsedThisPeriod || 0,
    smsGift: org.subscriptionCredits.smsGiftMonthly || 0,
    emailGift: org.subscriptionCredits.emailGiftMonthly || 0,
    aiGift: org.subscriptionCredits.aiGiftMonthly || 0
  } : null;
  
  const period = computePeriod(new Date(), org.billing?.startedAt || org.createdAt);
  
  // Initialize new structures with prorata
  org.subscriptionCredits = initSubscriptionCredits(org, period.periodStart, period.periodEnd);
  
  // If upgrading, preserve existing usage and gifts
  if (existingUsage) {
    org.subscriptionCredits.smsUsedThisPeriod = existingUsage.smsUsed;
    org.subscriptionCredits.emailUsedThisPeriod = existingUsage.emailUsed;
    org.subscriptionCredits.aiUsedThisPeriod = existingUsage.aiUsed;
    org.subscriptionCredits.smsGiftMonthly = existingUsage.smsGift;
    org.subscriptionCredits.emailGiftMonthly = existingUsage.emailGift;
    org.subscriptionCredits.aiGiftMonthly = existingUsage.aiGift;
    console.log(`[BILLING] 🔄 Upgraded subscriptionCredits structure for org ${org.id} with prorata+AI fields`);
  }
  
  // Initialize packWallet if not exists
  if (!org.packWallet) {
    org.packWallet = initPackWallet();
  }
  
  // Migrate from old creditAllocations if they exist (first migration only)
  const allocations = (data.creditAllocations || []).filter(a => a.orgId === org.id);
  
  if (allocations.length > 0 && !existingUsage) {
    // Current period allocations
    const currentAllocations = allocations.filter(
      a => a.periodStart === period.periodStart && a.periodEnd === period.periodEnd
    );
    
    // Sum subscription credits (included + gift) for current period
    let smsGift = 0, emailGift = 0;
    let smsUsed = 0, emailUsed = 0;
    
    for (const alloc of currentAllocations) {
      if (alloc.source === 'gift') {
        smsGift += alloc.smsAllocated || 0;
        emailGift += alloc.emailAllocated || 0;
      }
      if (alloc.source === 'included' || alloc.source === 'gift') {
        smsUsed += alloc.smsUsed || 0;
        emailUsed += alloc.emailUsed || 0;
      }
    }
    
    org.subscriptionCredits.smsGiftMonthly = smsGift;
    org.subscriptionCredits.emailGiftMonthly = emailGift;
    org.subscriptionCredits.smsUsedThisPeriod = smsUsed;
    org.subscriptionCredits.emailUsedThisPeriod = emailUsed;
    
    // Migrate packs: sum all pack allocations (they persist)
    const packAllocations = allocations.filter(a => a.source === 'pack');
    let packSmsTotal = 0, packEmailTotal = 0;
    let packSmsUsed = 0, packEmailUsed = 0;
    
    for (const alloc of packAllocations) {
      packSmsTotal += alloc.smsAllocated || 0;
      packEmailTotal += alloc.emailAllocated || 0;
      packSmsUsed += alloc.smsUsed || 0;
      packEmailUsed += alloc.emailUsed || 0;
    }
    
    org.packWallet.smsRemaining = Math.max(0, packSmsTotal - packSmsUsed);
    org.packWallet.emailRemaining = Math.max(0, packEmailTotal - packEmailUsed);
    
    console.log(`[BILLING] 📦 Migrated org ${org.id}:`);
    console.log(`[BILLING]    Subscription: ${org.subscriptionCredits.smsIncludedMonthly}+${smsGift} SMS, ${org.subscriptionCredits.emailIncludedMonthly}+${emailGift} Email (used: ${smsUsed}/${emailUsed})`);
    console.log(`[BILLING]    PackWallet: ${org.packWallet.smsRemaining} SMS, ${org.packWallet.emailRemaining} Email`);
  }
  
  // Also migrate legacy balances.smsExtra/emailExtra to packWallet
  if ((org.balances?.smsExtra > 0 || org.balances?.emailExtra > 0) && !org._balancesMigrated) {
    org.packWallet.smsRemaining += org.balances?.smsExtra || 0;
    org.packWallet.emailRemaining += org.balances?.emailExtra || 0;
    org.balances = { smsExtra: 0, emailExtra: 0 };
    org._balancesMigrated = true;
  }
  
  org._creditsMigrated = true;
  return true;
}

/**
 * Ensure current period is correct and credits are properly initialized.
 * NEW SYSTEM: subscriptionCredits expire monthly, packWallet persists.
 * @param {object} data - loaded data
 * @param {object} org - org object
 * @param {boolean} save - whether to save data after changes
 * @param {Date|null} debugNow - optional: use this date instead of now (for testing)
 * @returns {{ changed: boolean, rotated: boolean, subscriptionReset: boolean }}
 */
function ensureCurrentPeriod(data, org, save = false, debugNow = null) {
  let changed = false;
  let rotated = false;
  let subscriptionReset = false;
  
  // Ensure billing structure
  org = ensureOrgBilling(org);
  
  // Migrate to new credit system if needed (force save on migration)
  const migrated = migrateOrgCredits(data, org);
  if (migrated) {
    changed = true;
    // Force save on migration to persist new structure
    const orgIndex = data.orgs.findIndex(o => o.id === org.id);
    if (orgIndex >= 0) {
      data.orgs[orgIndex] = org;
    }
    saveData(data);
  }
  
  const now = debugNow || new Date();
  const periodEnd = new Date(org.billing.periodEnd);
  
  // Debug logging
  if (debugNow) {
    console.log(`[BILLING][DEBUG] ensureCurrentPeriod called with debugNow=${debugNow.toISOString()}`);
    console.log(`[BILLING][DEBUG] Current periodEnd=${org.billing.periodEnd}, now > periodEnd? ${now > periodEnd}`);
  }
  
  // Check if we need to rotate to new period
  if (now > periodEnd) {
    const oldPeriod = { start: org.billing.periodStart, end: org.billing.periodEnd };
    const newPeriod = computePeriod(now, org.billing.startedAt);
    
    // Update billing period
    org.billing.periodStart = newPeriod.periodStart;
    org.billing.periodEnd = newPeriod.periodEnd;
    
    // RESET subscriptionCredits (expire les crédits abonnement)
    const oldSubRemaining = getSubscriptionRemaining(org);
    org.subscriptionCredits = initSubscriptionCredits(org, newPeriod.periodStart, newPeriod.periodEnd);
    
    changed = true;
    rotated = true;
    subscriptionReset = true;
    
    console.log(`[BILLING] 🔄 PERIOD ROTATED for org ${org.id}:`);
    console.log(`[BILLING]    Old: ${oldPeriod.start.substring(0,10)} → ${oldPeriod.end.substring(0,10)}`);
    console.log(`[BILLING]    New: ${newPeriod.periodStart.substring(0,10)} → ${newPeriod.periodEnd.substring(0,10)}`);
    console.log(`[BILLING]    ⚠️ Subscription credits expired: ${oldSubRemaining.sms} SMS, ${oldSubRemaining.email} Email`);
    console.log(`[BILLING]    ✅ PackWallet unchanged: ${org.packWallet?.smsRemaining || 0} SMS, ${org.packWallet?.emailRemaining || 0} Email`);
  }
  
  // Ensure subscriptionCredits exists
  if (!org.subscriptionCredits) {
    org.subscriptionCredits = initSubscriptionCredits(org, org.billing.periodStart, org.billing.periodEnd);
    changed = true;
  }
  
  // Ensure packWallet exists
  if (!org.packWallet) {
    org.packWallet = initPackWallet();
    changed = true;
  }
  
  if (changed && save) {
    // Update org in data
    const orgIndex = data.orgs.findIndex(o => o.id === org.id);
    if (orgIndex >= 0) {
      data.orgs[orgIndex] = org;
    }
    saveData(data);
  }
  
  return { changed, rotated, subscriptionReset };
}

/**
 * Get remaining subscription credits for an org
 */
function getSubscriptionRemaining(org) {
  const sub = org.subscriptionCredits || {};
  const smsTotal = (sub.smsIncludedMonthly || 0) + (sub.smsGiftMonthly || 0);
  const emailTotal = (sub.emailIncludedMonthly || 0) + (sub.emailGiftMonthly || 0);
  const aiTotal = (sub.aiIncludedMonthly || 0) + (sub.aiGiftMonthly || 0);
  const qrTotal = (sub.qrIncludedMonthly || 0) + (sub.qrGiftMonthly || 0);
  const nfcTotal = (sub.nfcIncludedMonthly || 0) + (sub.nfcGiftMonthly || 0);
  return {
    sms: Math.max(0, smsTotal - (sub.smsUsedThisPeriod || 0)),
    email: Math.max(0, emailTotal - (sub.emailUsedThisPeriod || 0)),
    ai: Math.max(0, aiTotal - (sub.aiUsedThisPeriod || 0)),
    qr: Math.max(0, qrTotal - (sub.qrUsedThisPeriod || 0)),
    nfc: Math.max(0, nfcTotal - (sub.nfcUsedThisPeriod || 0)),
    smsTotal,
    emailTotal,
    aiTotal,
    qrTotal,
    nfcTotal,
    smsUsed: sub.smsUsedThisPeriod || 0,
    emailUsed: sub.emailUsedThisPeriod || 0,
    aiUsed: sub.aiUsedThisPeriod || 0,
    qrUsed: sub.qrUsedThisPeriod || 0,
    nfcUsed: sub.nfcUsedThisPeriod || 0
  };
}

/**
 * Get remaining pack credits for an org
 */
function getPackRemaining(org) {
  return {
    sms: org.packWallet?.smsRemaining || 0,
    email: org.packWallet?.emailRemaining || 0,
    ai: org.packWallet?.aiRemaining || 0,
    qr: org.packWallet?.qrRemaining || 0,
    nfc: org.packWallet?.nfcRemaining || 0
  };
}

/**
 * Get total remaining credits for an org (subscription + packs)
 */
function getTotalRemaining(org) {
  const sub = getSubscriptionRemaining(org);
  const pack = getPackRemaining(org);
  return {
    sms: sub.sms + pack.sms,
    email: sub.email + pack.email,
    ai: sub.ai + pack.ai,
    qr: sub.qr + pack.qr,
    nfc: sub.nfc + pack.nfc,
    subscription: sub,
    pack
  };
}

/**
 * Clear all credits when subscription is cancelled
 */
function clearAllCredits(org) {
  const oldSub = getSubscriptionRemaining(org);
  const oldPack = getPackRemaining(org);
  
  // Reset subscription credits to 0
  if (org.subscriptionCredits) {
    org.subscriptionCredits.smsUsedThisPeriod = org.subscriptionCredits.smsIncludedMonthly + org.subscriptionCredits.smsGiftMonthly;
    org.subscriptionCredits.emailUsedThisPeriod = org.subscriptionCredits.emailIncludedMonthly + org.subscriptionCredits.emailGiftMonthly;
    org.subscriptionCredits.aiUsedThisPeriod = (org.subscriptionCredits.aiIncludedMonthly || 0) + (org.subscriptionCredits.aiGiftMonthly || 0);
  }
  
  // Reset pack wallet to 0
  if (org.packWallet) {
    org.packWallet.smsRemaining = 0;
    org.packWallet.emailRemaining = 0;
    org.packWallet.aiRemaining = 0;
  }
  
  console.log(`[BILLING] ❌ All credits cleared for org ${org.id}:`);
  console.log(`[BILLING]    Lost subscription: ${oldSub.sms} SMS, ${oldSub.email} Email, ${oldSub.ai} AI`);
  console.log(`[BILLING]    Lost packs: ${oldPack.sms} SMS, ${oldPack.email} Email, ${oldPack.ai} AI`);
  
  return { lostSubscription: oldSub, lostPack: oldPack };
}

/**
 * Get all allocations for an org's current period, sorted by debit priority
 * Priority: included (1) > gift (2) > pack (3), then FIFO by createdAt
 */
function getPeriodAllocations(data, org) {
  const periodStart = org.billing?.periodStart;
  const periodEnd = org.billing?.periodEnd;
  
  if (!periodStart || !periodEnd) return [];
  
  const priorityMap = { included: 1, gift: 2, pack: 3 };
  
  return (data.creditAllocations || [])
    .filter(a => 
      a.orgId === org.id && 
      a.periodStart === periodStart && 
      a.periodEnd === periodEnd
    )
    .sort((a, b) => {
      const pa = priorityMap[a.source] || 99;
      const pb = priorityMap[b.source] || 99;
      if (pa !== pb) return pa - pb;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

/**
 * Debit credits using NEW system: subscription first, then packs
 * @param {object} data - loaded data
 * @param {object} org - org object
 * @param {'sms'|'email'|'ai'} type - type of credit to debit
 * @param {number} qty - quantity to debit (default 1)
 * @returns {{ success: boolean, debitedFrom?: 'subscription'|'pack', reason?: string, smsRemaining?: number, emailRemaining?: number, aiRemaining?: number, periodEnd?: string }}
 */
function debitCredits(data, org, type, qty = 1) {
  ensureCurrentPeriod(data, org, true);
  
  // Check if subscription is active
  if (org.status !== 'active') {
    return {
      success: false,
      reason: 'SUBSCRIPTION_INACTIVE',
      smsRemaining: 0,
      emailRemaining: 0,
      aiRemaining: 0,
      periodEnd: org.billing?.periodEnd
    };
  }
  
  const sub = getSubscriptionRemaining(org);
  const pack = getPackRemaining(org);
  
  // Determine which type we're debiting
  let subRemaining, packRemaining;
  if (type === 'sms') {
    subRemaining = sub.sms;
    packRemaining = pack.sms;
  } else if (type === 'email') {
    subRemaining = sub.email;
    packRemaining = pack.email;
  } else if (type === 'ai') {
    subRemaining = sub.ai;
    packRemaining = pack.ai;
  } else if (type === 'qr') {
    subRemaining = sub.qr;
    packRemaining = pack.qr;
  } else if (type === 'nfc') {
    subRemaining = sub.nfc;
    packRemaining = pack.nfc;
  } else {
    return { success: false, reason: 'INVALID_TYPE' };
  }
  
  // Step 1: Try to debit from subscription credits
  if (subRemaining >= qty) {
    if (type === 'sms') {
      org.subscriptionCredits.smsUsedThisPeriod += qty;
    } else if (type === 'email') {
      org.subscriptionCredits.emailUsedThisPeriod += qty;
    } else if (type === 'ai') {
      org.subscriptionCredits.aiUsedThisPeriod = (org.subscriptionCredits.aiUsedThisPeriod || 0) + qty;
    } else if (type === 'qr') {
      org.subscriptionCredits.qrUsedThisPeriod = (org.subscriptionCredits.qrUsedThisPeriod || 0) + qty;
    } else if (type === 'nfc') {
      org.subscriptionCredits.nfcUsedThisPeriod = (org.subscriptionCredits.nfcUsedThisPeriod || 0) + qty;
    }
    return { success: true, debitedFrom: 'subscription' };
  }
  
  // Step 2: Try to debit from pack wallet
  if (packRemaining >= qty) {
    if (type === 'sms') {
      org.packWallet.smsRemaining -= qty;
    } else if (type === 'email') {
      org.packWallet.emailRemaining -= qty;
    } else if (type === 'ai') {
      org.packWallet.aiRemaining = (org.packWallet.aiRemaining || 0) - qty;
    } else if (type === 'qr') {
      org.packWallet.qrRemaining = (org.packWallet.qrRemaining || 0) - qty;
    } else if (type === 'nfc') {
      org.packWallet.nfcRemaining = (org.packWallet.nfcRemaining || 0) - qty;
    }
    return { success: true, debitedFrom: 'pack' };
  }
  
  // No credits remaining - return structured error for UI
  const total = getTotalRemaining(org);
  const quotaTypeLabel = type === 'qr' ? 'QR' : type === 'nfc' ? 'NFC' : type.toUpperCase();
  return { 
    success: false, 
    reason: 'QUOTA_EXCEEDED',
    errorCategory: `QUOTA_${type.toUpperCase()}_EXCEEDED`,
    message: `Quota ${quotaTypeLabel} atteint. Veuillez acheter des crédits supplémentaires.`,
    action: `BUY_${type.toUpperCase()}_ADDON`,
    smsRemaining: total.sms,
    emailRemaining: total.email,
    aiRemaining: total.ai,
    qrRemaining: total.qr,
    nfcRemaining: total.nfc,
    subscriptionRemaining: { sms: sub.sms, email: sub.email, ai: sub.ai, qr: sub.qr, nfc: sub.nfc },
    packRemaining: { sms: pack.sms, email: pack.email, ai: pack.ai, qr: pack.qr, nfc: pack.nfc },
    periodEnd: org.billing?.periodEnd
  };
}

// Legacy: kept for backward compatibility with old allocations
/**
 * Get all allocations for an org's current period (LEGACY - for historical data)
 */
function getPeriodAllocations(data, org) {
  const periodStart = org.billing?.periodStart;
  const periodEnd = org.billing?.periodEnd;
  
  if (!periodStart || !periodEnd) return [];
  
  const priorityMap = { included: 1, gift: 2, pack: 3 };
  
  return (data.creditAllocations || [])
    .filter(a => 
      a.orgId === org.id && 
      a.periodStart === periodStart && 
      a.periodEnd === periodEnd
    )
    .sort((a, b) => {
      const pa = priorityMap[a.source] || 99;
      const pb = priorityMap[b.source] || 99;
      if (pa !== pb) return pa - pb;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

/**
 * Calculate prorata ratio for remaining days in current period
 * @param {string} periodEnd - ISO date string of period end
 * @returns {number} ratio (0-1)
 */
function calculateRemainingRatio(periodEnd) {
  const now = new Date();
  const end = new Date(periodEnd);
  const monthStart = getMonthStart(now);
  const daysInMonth = getDaysInMonth(now);
  
  // Days remaining including today
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / msPerDay) + 1);
  
  return Math.min(1, daysRemaining / daysInMonth);
}

/**
 * Create a credit allocation (gift or pack) for current period
 * Packs can be prorated based on remaining days
 * @param {object} data - loaded data
 * @param {object} org - org object
 * @param {string} source - 'gift' or 'pack'
 * @param {number} smsAmount - SMS quantity (or monthly for packs)
 * @param {number} emailAmount - Email quantity (or monthly for packs)
 * @param {object} options - { label?, packCode?, prorata? }
 */
function createCreditAllocation(data, org, source, smsAmount, emailAmount, options = {}) {
  ensureCurrentPeriod(data, org, false);
  
  const { label, packCode, prorata = false } = options;
  
  let finalSms = smsAmount || 0;
  let finalEmail = emailAmount || 0;
  let meta = {};
  let finalLabel = label;
  
  // Handle pack prorata
  if (source === 'pack' && packCode && PACK_CATALOG[packCode]) {
    const pack = PACK_CATALOG[packCode];
    const ratioRemaining = calculateRemainingRatio(org.billing.periodEnd);
    
    // Calculate prorated quantities
    finalSms = Math.round(pack.smsMonthly * ratioRemaining);
    finalEmail = Math.round(pack.emailMonthly * ratioRemaining);
    const priceThisPeriodCents = Math.round(pack.priceMonthlyCents * ratioRemaining);
    
    meta = {
      packCode,
      packName: pack.name,
      ratioRemaining: Math.round(ratioRemaining * 1000) / 1000,
      smsMonthly: pack.smsMonthly,
      emailMonthly: pack.emailMonthly,
      priceMonthlyCents: pack.priceMonthlyCents,
      priceThisPeriodCents,
      currency: pack.currency
    };
    
    finalLabel = `${pack.name} (prorata ${Math.round(ratioRemaining * 100)}%)`;
    
    console.log(`[BILLING] 📦 Pack ${packCode} prorated:`);
    console.log(`[BILLING]    Ratio: ${(ratioRemaining * 100).toFixed(1)}%`);
    console.log(`[BILLING]    SMS: ${pack.smsMonthly} → ${finalSms}`);
    console.log(`[BILLING]    Email: ${pack.emailMonthly} → ${finalEmail}`);
    console.log(`[BILLING]    Price: ${pack.priceMonthlyCents/100}€ → ${priceThisPeriodCents/100}€`);
  } else if (source === 'pack' && prorata) {
    // Manual prorata for custom amounts
    const ratioRemaining = calculateRemainingRatio(org.billing.periodEnd);
    finalSms = Math.round(smsAmount * ratioRemaining);
    finalEmail = Math.round(emailAmount * ratioRemaining);
    meta = { ratioRemaining: Math.round(ratioRemaining * 1000) / 1000, prorated: true };
    finalLabel = label || `Pack (prorata ${Math.round(ratioRemaining * 100)}%)`;
  }
  
  const allocation = {
    id: generateId(),
    orgId: org.id,
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
    source,
    label: finalLabel || (source === 'gift' ? 'Crédits offerts' : 'Pack acheté'),
    smsAllocated: finalSms,
    emailAllocated: finalEmail,
    smsUsed: 0,
    emailUsed: 0,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
    createdAt: nowISO()
  };
  
  if (!data.creditAllocations) data.creditAllocations = [];
  data.creditAllocations.push(allocation);
  
  return allocation;
}

// ============ IDEMPOTENCE HELPERS ============

/**
 * Find existing usage entry by requestId (for idempotence)
 * @returns {object|null} existing usage entry or null
 */
function findUsageByRequestId(data, orgId, requestId) {
  if (!requestId || !orgId) return null;
  
  return (data.usageLedger || []).find(
    e => e.orgId === orgId && e.meta?.requestId === requestId
  );
}

/**
 * Calculate billing computed from creditAllocations
 */
function calculateBillingComputed(data, org) {
  // Ensure period and allocations exist
  ensureCurrentPeriod(data, org, false);
  
  const periodStart = org.billing.periodStart;
  const periodEnd = org.billing.periodEnd;
  const ratio = calculateProrataRatio(periodStart, periodEnd);
  
  // Get all allocations for current period
  const allocations = getPeriodAllocations(data, org);
  
  // Calculate totals and breakdown by source
  const breakdown = { included: { sms: 0, email: 0 }, gift: { sms: 0, email: 0 }, pack: { sms: 0, email: 0 } };
  let smsAllocatedTotal = 0, smsUsedTotal = 0;
  let emailAllocatedTotal = 0, emailUsedTotal = 0;
  
  for (const alloc of allocations) {
    smsAllocatedTotal += alloc.smsAllocated || 0;
    smsUsedTotal += alloc.smsUsed || 0;
    emailAllocatedTotal += alloc.emailAllocated || 0;
    emailUsedTotal += alloc.emailUsed || 0;
    
    if (breakdown[alloc.source]) {
      breakdown[alloc.source].sms += alloc.smsAllocated || 0;
      breakdown[alloc.source].email += alloc.emailAllocated || 0;
    }
  }
  
  const smsRemaining = Math.max(0, smsAllocatedTotal - smsUsedTotal);
  const emailRemaining = Math.max(0, emailAllocatedTotal - emailUsedTotal);
  
  // Pricing
  const basePriceCents = org.plan?.basePriceCents || 0;
  let monthlyPriceFinalCents = basePriceCents;
  let discountPercent = null;
  
  if (org.negotiated?.enabled) {
    if (org.negotiated.customPriceCents != null && org.negotiated.customPriceCents > 0) {
      monthlyPriceFinalCents = org.negotiated.customPriceCents;
    } else if (org.negotiated.discountPercent != null && org.negotiated.discountPercent > 0) {
      discountPercent = org.negotiated.discountPercent;
      monthlyPriceFinalCents = Math.round(basePriceCents * (1 - discountPercent / 100));
    }
  }
  
  const priceThisPeriodCents = Math.round(monthlyPriceFinalCents * ratio);
  
  // Get monthly quotas for display
  const smsIncludedMonthly = org.quotas?.smsIncluded || 0;
  const emailIncludedMonthly = org.quotas?.emailIncluded || 0;
  
  return {
    periodStart,
    periodEnd,
    ratio: Math.round(ratio * 1000) / 1000, // 3 decimals
    isProrata: ratio < 1,
    
    // Totals from allocations
    smsUsed: smsUsedTotal,
    smsAllocated: smsAllocatedTotal,
    smsRemaining,
    emailUsed: emailUsedTotal,
    emailAllocated: emailAllocatedTotal,
    emailRemaining,
    
    // Monthly base values
    smsIncludedMonthly,
    emailIncludedMonthly,
    
    // Breakdown by source (included/gift/pack)
    breakdown,
    
    // Detailed allocations list
    allocations: allocations.map(a => ({
      id: a.id,
      source: a.source,
      label: a.label,
      smsAllocated: a.smsAllocated,
      smsUsed: a.smsUsed,
      smsRemaining: Math.max(0, (a.smsAllocated || 0) - (a.smsUsed || 0)),
      emailAllocated: a.emailAllocated,
      emailUsed: a.emailUsed,
      emailRemaining: Math.max(0, (a.emailAllocated || 0) - (a.emailUsed || 0)),
      createdAt: a.createdAt,
      periodEnd: a.periodEnd,
      // Pack meta for prorated packs
      meta: a.meta || undefined
    })),
    
    // Pricing
    priceBaseCents: basePriceCents,
    priceMonthlyFinalCents: monthlyPriceFinalCents,
    priceThisPeriodCents,
    discountPercent,
    isNegotiated: org.negotiated?.enabled || false,
    currency: org.plan?.currency || 'EUR',
    
    // Business rule reminder
    noRollover: true
  };
}

/**
 * Calculate final pricing with discounts and custom prices (legacy)
 */
function calculateOrgPricing(org) {
  const basePriceCents = org.plan?.basePriceCents || 0;
  const currency = org.plan?.currency || 'EUR';
  const billingCycle = org.plan?.billingCycle || 'monthly';
  
  let finalPriceCents = basePriceCents;
  let discountPercent = null;
  let isNegotiated = false;
  
  if (org.negotiated?.enabled) {
    isNegotiated = true;
    
    if (org.negotiated.customPriceCents != null && org.negotiated.customPriceCents > 0) {
      finalPriceCents = org.negotiated.customPriceCents;
    } else if (org.negotiated.discountPercent != null && org.negotiated.discountPercent > 0) {
      discountPercent = org.negotiated.discountPercent;
      finalPriceCents = Math.round(basePriceCents * (1 - discountPercent / 100));
    }
  }
  
  return {
    basePriceCents,
    finalPriceCents,
    currency,
    billingCycle,
    discountPercent,
    isNegotiated
  };
}

/**
 * Enrich org with computed fields (NEW SYSTEM: subscriptionCredits + packWallet)
 * @param {object} data - loaded data
 * @param {object} org - org object
 * @param {Date|null} debugNow - optional: use this date for testing
 */
function enrichOrg(data, org, debugNow = null) {
  // Ensure billing structure and current period
  org = ensureOrgBilling(org);
  ensureCurrentPeriod(data, org, false, debugNow);
  
  // Get credits using NEW system
  const sub = getSubscriptionRemaining(org);
  const pack = getPackRemaining(org);
  const total = getTotalRemaining(org);
  
  // Legacy pricing (for backward compat)
  const pricing = calculateOrgPricing(org);
  
  // *** NEW: Get quotas from plan-catalog (source of truth) ***
  const catalogQuotas = planCatalog.getPlanQuotas(org.plan?.code);
  
  // Prorata info from subscriptionCredits
  const isProrata = org.subscriptionCredits?.isProrata || false;
  const ratio = org.subscriptionCredits?.ratio || 1;
  // Use plan-catalog quotas as base, not stored values
  const smsMonthlyBase = catalogQuotas.smsIncluded || 0;
  const emailMonthlyBase = catalogQuotas.emailIncluded || 0;
  const aiMonthlyBase = catalogQuotas.aiIncluded || 0;
  
  // Build credits computed with NEW structure
  // Use plan-catalog quotas + gifts (not stored values which may be outdated)
  const smsGift = org.subscriptionCredits?.smsGiftMonthly || 0;
  const emailGift = org.subscriptionCredits?.emailGiftMonthly || 0;
  const aiGift = org.subscriptionCredits?.aiGiftMonthly || 0;
  
  // Calculate effective monthly values (catalog base * prorata + gifts)
  const smsIncludedEffective = Math.round(smsMonthlyBase * ratio) + smsGift;
  const emailIncludedEffective = Math.round(emailMonthlyBase * ratio) + emailGift;
  const aiIncludedEffective = Math.round(aiMonthlyBase * ratio) + aiGift;
  
  const creditsComputed = {
    // Period info
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
    
    // Prorata info
    isProrata,
    ratio,
    ratioPercent: Math.round(ratio * 100),
    
    // Subscription credits (monthly, expiring)
    subscription: {
      // Base monthly values (from plan-catalog)
      smsMonthlyBase,
      emailMonthlyBase,
      aiMonthlyBase,
      // Effective included values for this period (catalog * prorata)
      smsIncludedMonthly: Math.round(smsMonthlyBase * ratio),
      emailIncludedMonthly: Math.round(emailMonthlyBase * ratio),
      aiIncludedMonthly: Math.round(aiMonthlyBase * ratio),
      // Gift credits (stored in DB)
      smsGiftMonthly: smsGift,
      emailGiftMonthly: emailGift,
      aiGiftMonthly: aiGift,
      // Totals and usage (using effective values from plan-catalog)
      smsTotal: smsIncludedEffective,
      emailTotal: emailIncludedEffective,
      aiTotal: aiIncludedEffective,
      smsUsed: org.subscriptionCredits?.smsUsedThisPeriod || 0,
      emailUsed: org.subscriptionCredits?.emailUsedThisPeriod || 0,
      aiUsed: org.subscriptionCredits?.aiUsedThisPeriod || 0,
      smsRemaining: Math.max(0, smsIncludedEffective - (org.subscriptionCredits?.smsUsedThisPeriod || 0)),
      emailRemaining: Math.max(0, emailIncludedEffective - (org.subscriptionCredits?.emailUsedThisPeriod || 0)),
      aiRemaining: Math.max(0, aiIncludedEffective - (org.subscriptionCredits?.aiUsedThisPeriod || 0)),
      // Prorata specific
      isProrata,
      ratio,
      expiresAt: org.billing.periodEnd
    },
    
    // Pack wallet (persistent)
    pack: {
      smsRemaining: pack.sms,
      emailRemaining: pack.email,
      aiRemaining: pack.ai,
      persistent: true,
      requiresActiveSubscription: true
    },
    
    // Totals (subscription + packs)
    total: {
      smsRemaining: Math.max(0, smsIncludedEffective - (org.subscriptionCredits?.smsUsedThisPeriod || 0)) + pack.sms,
      emailRemaining: Math.max(0, emailIncludedEffective - (org.subscriptionCredits?.emailUsedThisPeriod || 0)) + pack.email,
      aiRemaining: Math.max(0, aiIncludedEffective - (org.subscriptionCredits?.aiUsedThisPeriod || 0)) + pack.ai
    },
    
    // Status check
    canSend: org.status === 'active' && (total.sms > 0 || total.email > 0),
    subscriptionActive: org.status === 'active'
  };
  
  // Get effective billing from new centralized function
  const eb = effectiveBilling.computeEffectiveBilling({ 
    org, 
    now: debugNow ? new Date(debugNow) : new Date(),
    ensurePeriod: false // Already ensured above
  });
  
  // Legacy billingComputed for backward compat with old UI
  // Now enriched with effective billing data
  // Calculate effective usage remaining
  const smsUsedThisPeriod = org.subscriptionCredits?.smsUsedThisPeriod || 0;
  const emailUsedThisPeriod = org.subscriptionCredits?.emailUsedThisPeriod || 0;
  const aiUsedThisPeriod = org.subscriptionCredits?.aiUsedThisPeriod || 0;
  
  const billingComputed = {
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
    ratio,
    isProrata,
    
    // Usage and allocation (using plan-catalog values)
    smsUsed: smsUsedThisPeriod,
    smsAllocated: smsIncludedEffective + pack.sms,
    smsRemaining: Math.max(0, smsIncludedEffective - smsUsedThisPeriod) + pack.sms,
    emailUsed: emailUsedThisPeriod,
    emailAllocated: emailIncludedEffective + pack.email,
    emailRemaining: Math.max(0, emailIncludedEffective - emailUsedThisPeriod) + pack.email,
    aiUsed: aiUsedThisPeriod,
    aiAllocated: aiIncludedEffective + pack.ai,
    aiRemaining: Math.max(0, aiIncludedEffective - aiUsedThisPeriod) + pack.ai,
    
    // Monthly base vs prorated (from plan-catalog)
    smsMonthlyBase,
    emailMonthlyBase,
    aiMonthlyBase,
    smsIncludedMonthly: Math.round(smsMonthlyBase * ratio),
    emailIncludedMonthly: Math.round(emailMonthlyBase * ratio),
    aiIncludedMonthly: Math.round(aiMonthlyBase * ratio),
    smsIncludedThisPeriod: smsIncludedEffective,
    emailIncludedThisPeriod: emailIncludedEffective,
    aiIncludedThisPeriod: aiIncludedEffective,
    
    breakdown: {
      included: { sms: Math.round(smsMonthlyBase * ratio), email: Math.round(emailMonthlyBase * ratio), ai: Math.round(aiMonthlyBase * ratio) },
      gift: { sms: smsGift, email: emailGift, ai: aiGift },
      pack: { sms: pack.sms, email: pack.email, ai: pack.ai }
    },
    
    // Legacy allocations (empty since we use new system)
    allocations: [],
    
    // *** NEW: Pricing from effective billing (centralized source of truth) ***
    priceBaseCents: eb.priceCatalogCents,
    priceMonthlyFinalCents: eb.priceEffectiveCents,
    priceThisPeriodCents: isProrata ? Math.round(eb.priceEffectiveCents * ratio) : eb.priceEffectiveCents,
    discountPercent: pricing.discountPercent,
    isNegotiated: pricing.isNegotiated,
    currency: pricing.currency,
    
    // *** NEW: Effective billing fields for UI ***
    hasDiscount: eb.hasDiscount,
    discount: eb.discount,
    couponInfo: eb.couponInfo,
    stripeCouponId: eb.stripeCouponId,
    priceCatalogCents: eb.priceCatalogCents,
    priceEffectiveCents: eb.priceEffectiveCents,
    priceCatalogFormatted: eb.priceCatalogFormatted,
    priceEffectiveFormatted: eb.priceEffectiveFormatted,
    periodEndFormatted: eb.periodEndFormatted,
    
    noRollover: true
  };
  
  return {
    ...org,
    creditsComputed,  // NEW
    billingComputed,  // Legacy compat
    // Legacy fields for backward compat (using effective values)
    usage30d: {
      smsUsed: smsUsedThisPeriod,
      emailUsed: emailUsedThisPeriod,
      aiUsed: aiUsedThisPeriod,
      total: smsUsedThisPeriod + emailUsedThisPeriod
    },
    allocation: {
      smsAllocated: smsIncludedEffective + pack.sms,
      emailAllocated: emailIncludedEffective + pack.email,
      aiAllocated: aiIncludedEffective + pack.ai
    },
    remaining: {
      sms: Math.max(0, smsIncludedEffective - smsUsedThisPeriod) + pack.sms,
      email: Math.max(0, emailIncludedEffective - emailUsedThisPeriod) + pack.email,
      ai: Math.max(0, aiIncludedEffective - aiUsedThisPeriod) + pack.ai
    },
    pricing
  };
}

/**
 * P0.1: Sanitize org object before sending in API responses.
 * Removes sensitive fields (token hashes, internal secrets).
 * Keeps non-sensitive metadata (dates, IDs).
 * 
 * @param {object} org - org object (raw or enriched)
 * @returns {object} sanitized org (safe for API response)
 */
function sanitizeOrg(org) {
  if (!org) return org;
  const sanitized = { ...org };
  
  // Remove token hashes (sensitive — enables offline brute-force if leaked)
  delete sanitized.apiTokenHash;
  delete sanitized.apiTokenPreviousHash;
  delete sanitized.apiTokenPreviousExpiresAt;
  
  // Keep non-sensitive token metadata (useful for admin UI)
  // sanitized.apiTokenCreatedAt — kept
  // sanitized.apiTokenLastRotatedAt — kept
  
  return sanitized;
}

/**
 * Calculate usage for an org over X rolling days (legacy, for overview)
 */
function calculateOrgUsage(data, orgId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();
  
  const entries = (data.usageLedger || []).filter(
    e => e.orgId === orgId && e.ts >= sinceISO
  );
  
  return {
    sms: entries.filter(e => e.type === 'sms').reduce((sum, e) => sum + (e.qty || 0), 0),
    email: entries.filter(e => e.type === 'email').reduce((sum, e) => sum + (e.qty || 0), 0),
    total: entries.length
  };
}

// ============ IDEMPOTENCY HELPERS ============
// NOTE: Pour migration future vers DB, créer un UNIQUE INDEX sur idempotencyKey

/**
 * Génère une clé d'idempotence basée sur les données métier
 * Format: sha256(channel|phone|email|appointmentDate|locationId)
 */
function generateIdempotencyKey(body) {
  const parts = [
    body.channel || '',
    (body.patientPhone || '').replace(/\D/g, ''),  // Normaliser téléphone
    (body.patientEmail || '').toLowerCase().trim(),
    body.appointmentDate || '',  // Date du RDV si disponible
    body.locationId || 'default'
  ];
  const raw = parts.join('|');
  return createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

/**
 * Cherche une request existante avec la même idempotencyKey
 * dans la fenêtre temporelle configurée
 */
function findDuplicateRequest(data, idempotencyKey) {
  const windowMs = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [id, req] of Object.entries(data.requests || {})) {
    if (req.idempotencyKey === idempotencyKey) {
      const createdAt = new Date(req.createdAt).getTime();
      if (now - createdAt < windowMs) {
        return { id, request: req };
      }
    }
  }
  return null;
}

// ============ AUTH HELPERS ============

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a session token
 */
function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Generate a 6-digit verification code
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create a new session
 */
function createSession(data, userId, orgId) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  const session = {
    token,
    userId,
    orgId,
    expiresAt,
    createdAt: nowISO()
  };
  
  data.sessions.push(session);
  return session;
}

/**
 * Get session by token
 */
function getSessionByToken(data, token) {
  if (!token) return null;
  
  const session = data.sessions.find(s => s.token === token);
  if (!session) return null;
  
  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    return null;
  }
  
  return session;
}

/**
 * Get user from request (via Authorization header)
 */
function getAuthUser(req, data) {
  const authHeader = req.headers.authorization || req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7);
  
  // Use session repository in SQLite mode
  const repos = storage.getRepos();
  if (repos && repos.session) {
    const sessionData = repos.session.validateSession(token);
    if (!sessionData) return null;
    
    // Get user from SQLite
    const user = repos.user.getById(sessionData.userId);
    if (!user) return null;
    
    // Get org from SQLite
    const org = repos.org.getById(sessionData.orgId);
    
    return { 
      user, 
      org,
      session: { 
        token, 
        userId: sessionData.userId, 
        orgId: sessionData.orgId, 
        expiresAt: sessionData.expiresAt 
      } 
    };
  }
  
  // Legacy JSON mode
  const session = getSessionByToken(data, token);
  if (!session) return null;
  
  const user = data.users.find(u => u.id === session.userId);
  if (!user) return null;
  
  // Get org from data
  const org = data.orgs ? data.orgs.find(o => o.id === user.orgId) : null;
  
  return { user, org, session };
}

/**
 * Get user by email
 */
function getUserByEmail(data, email) {
  return data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Simple rate limiter (in-memory)
 */
function checkRateLimit(key, maxAttempts = RATE_LIMIT_MAX_ATTEMPTS) {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS)) {
    // Reset or create new record
    rateLimitStore.set(key, { attempts: 1, firstAttempt: now });
    return { allowed: true, remaining: maxAttempts - 1 };
  }
  
  if (record.attempts >= maxAttempts) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - record.firstAttempt)) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }
  
  record.attempts++;
  return { allowed: true, remaining: maxAttempts - record.attempts };
}

/**
 * Simulate sending an email (log + store in outbox)
 */
function sendEmail(data, to, subject, textContent, htmlContent = null) {
  const email = {
    id: generateId(),
    to,
    subject,
    text: textContent,
    html: htmlContent,
    createdAt: nowISO(),
    status: 'simulated'
  };
  
  data.emailOutbox.push(email);
  
  console.log('\n' + '='.repeat(60));
  console.log('📧 EMAIL SIMULÉ');
  console.log('='.repeat(60));
  console.log(`À: ${to}`);
  console.log(`Sujet: ${subject}`);
  console.log('-'.repeat(60));
  console.log(textContent);
  console.log('='.repeat(60) + '\n');
  
  return email;
}

/**
 * Create email verification
 */
function createEmailVerification(data, email, orgId = null) {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
  
  const verification = {
    id: generateId(),
    email: email.toLowerCase(),
    code,
    orgId,
    expiresAt,
    createdAt: nowISO(),
    usedAt: null
  };
  
  data.emailVerifications.push(verification);
  
  // Send verification email
  sendEmail(
    data,
    email,
    `Votre code de vérification Reputy: ${code}`,
    `Bonjour,

Votre code de vérification est: ${code}

Ce code expire dans ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.

Si vous n'avez pas créé de compte Reputy, ignorez cet email.

L'équipe Reputy`
  );
  
  return verification;
}

/**
 * Verify email code
 */
function verifyEmailCode(data, email, code) {
  const normalizedEmail = email.toLowerCase();
  
  // Find latest unused verification for this email
  const verification = data.emailVerifications
    .filter(v => v.email === normalizedEmail && !v.usedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  
  if (!verification) {
    return { valid: false, error: 'CODE_NOT_FOUND' };
  }
  
  if (new Date(verification.expiresAt) < new Date()) {
    return { valid: false, error: 'CODE_EXPIRED' };
  }
  
  if (verification.code !== code) {
    return { valid: false, error: 'CODE_INVALID' };
  }
  
  // Mark as used
  verification.usedAt = nowISO();
  
  return { valid: true, verification };
}

/**
 * Vérifie si une request est expirée
 */
function isRequestExpired(request) {
  if (!request.createdAt) return false;
  const expiryMs = REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const createdAt = new Date(request.createdAt).getTime();
  return Date.now() - createdAt > expiryMs;
}

// ============ DATA LAYER ============
// Now using storage bridge (SQLite or data.json based on USE_SQLITE env)

function loadData() {
  const data = storage.loadData();
  // Apply schema migration for JSON mode compatibility
  if (!storage.USE_SQLITE) {
    return ensureSchema(data);
  }
  return data;
}

// ============ AUTH MIDDLEWARES ============

// ============ P5: Legacy auth instrumentation + kill-switch + grace period ============

/**
 * Kill-switch: read at each call (PM2 restart applies env changes).
 * DISABLE_LEGACY_AUTH=1 → legacyAuth() always returns ok=false.
 */
function isLegacyAuthDisabled() {
  return (process.env.DISABLE_LEGACY_AUTH || '0') === '1';
}

// In-memory counters for legacy auth hits (best-effort, resets on restart)
const legacyAuthCounters = {};
let legacyAuthTotalHits = 0;
let _legacyHitOldCount = 0;

/**
 * Get legacy auth stats summary (for admin endpoint).
 */
function getLegacyAuthStats() {
  const entries = Object.entries(legacyAuthCounters);
  // Top 5 routes by hit count
  const topRoutes = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route, count]) => ({ route, count }));
  return {
    totalHits: legacyAuthTotalHits,
    oldTokenHits: _legacyHitOldCount,
    topRoutes,
    disabled: isLegacyAuthDisabled(),
  };
}

/**
 * P5 LEGACY AUTH — instrumented, constant-time, with grace period.
 *
 * - Pre-computed SHA256 hashes (CABINET_API_TOKEN_HASH / _OLD_HASH) — no per-request
 *   crypto overhead on the secrets themselves; only the incoming token is hashed once.
 * - Constant-time comparison via timingSafeEqual (consistent with P1.3).
 * - Sampled logging: 1 log per 100 hits per token type (anti log-flood).
 * - Supports CABINET_API_TOKEN_OLD for grace period during rotation (24–48h window).
 * - Kill-switch: if DISABLE_LEGACY_AUTH=1, returns ok=false immediately.
 * - Defense-in-depth: rejects if CABINET_API_TOKEN missing in production.
 * - NEVER logs the token value.
 *
 * REMOVE BY: v1.1 — once all clients confirmed on P1.3 per-org tokens.
 *
 * @param {object} req - HTTP request
 * @param {string} routeName - e.g. '/api/feedbacks'
 * @returns {{ ok: boolean, error?: string }}
 */
function legacyAuth(req, routeName) {
  // Kill-switch check
  if (isLegacyAuthDisabled()) {
    return { ok: false, error: 'legacy_auth_disabled' };
  }

  // P5: Defense-in-depth — never accept legacy auth on a misconfigured prod
  // (validateProductionSecrets() already prevents boot, but belt-and-suspenders)
  if (IS_PRODUCTION && !process.env.CABINET_API_TOKEN) {
    return { ok: false, error: 'CABINET_API_TOKEN not configured' };
  }

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return { ok: false, error: 'Token manquant' };
  }

  // Hash the incoming token ONCE (only per-request hash needed)
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Check current token (pre-computed hash, constant-time)
  if (CABINET_API_TOKEN_HASH &&
      tokenHash.length === CABINET_API_TOKEN_HASH.length &&
      timingSafeEqual(Buffer.from(tokenHash), Buffer.from(CABINET_API_TOKEN_HASH))) {
    // Instrumentation: count + sampled log (1/100 hits)
    legacyAuthTotalHits++;
    legacyAuthCounters[routeName] = (legacyAuthCounters[routeName] || 0) + 1;
    if (legacyAuthTotalHits % 100 === 1) {
      logger.logWarn('LEGACY_AUTH_HIT', `Legacy CABINET_API_TOKEN used (current) — hit #${legacyAuthTotalHits}`, {
        route: routeName,
        method: req.method,
      });
    }
    return { ok: true };
  }

  // P5: Grace period — accept old token during rotation window
  if (CABINET_API_TOKEN_OLD_HASH &&
      tokenHash.length === CABINET_API_TOKEN_OLD_HASH.length &&
      timingSafeEqual(Buffer.from(tokenHash), Buffer.from(CABINET_API_TOKEN_OLD_HASH))) {
    _legacyHitOldCount++;
    legacyAuthCounters[routeName + ':OLD'] = (legacyAuthCounters[routeName + ':OLD'] || 0) + 1;
    if (_legacyHitOldCount % 100 === 1) {
      logger.logWarn('LEGACY_AUTH_HIT_OLD', `Legacy CABINET_API_TOKEN_OLD used (grace period) — hit #${_legacyHitOldCount}`, {
        route: routeName,
        method: req.method,
      });
    }
    return { ok: true };
  }

  return { ok: false, error: 'Token invalide' };
}

/**
 * DEPRECATED: validateAuth — kept as alias during migration.
 * All call-sites should use legacyAuth(req, routeName) instead.
 * Will be removed when DISABLE_LEGACY_AUTH=1 is stable.
 */
function validateAuth(req) {
  return legacyAuth(req, '_unknown');
}

/**
 * P1.3: Validate extension request with publicKey + apiToken
 * 
 * SECURITY PRINCIPLE:
 * 1) Org is resolved ONLY via publicKey (never by token lookup)
 * 2) Token is verified AGAINST that specific org only
 * 
 * Supports both:
 * - SQLite mode: compare SHA256(token) against stored hash (timing-safe)
 * - JSON mode: direct token comparison (legacy)
 * 
 * @param {object} req - HTTP request
 * @param {string} publicKey - Public key from header/body
 * @returns {{ ok: boolean, org?: object, error?: string }}
 */
function validateExtensionAuth(req, publicKey) {
  const data = loadData();
  
  // 1) publicKey is REQUIRED
  if (!publicKey) {
    return { ok: false, error: 'PUBLIC_KEY_REQUIRED', message: 'publicKey manquante' };
  }
  
  // 2) Resolve org ONLY via publicKey
  const org = getOrgByPublicKey(data, publicKey);
  if (!org) {
    return { ok: false, error: 'ORG_NOT_FOUND', message: 'Organisation non trouvée' };
  }
  
  // 3) Extract token from headers (x-api-token priority, then Authorization Bearer)
  let token = req.headers['x-api-token'] || '';
  if (!token) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }
  
  if (!token) {
    return { ok: false, error: 'TOKEN_REQUIRED', message: 'API token manquant' };
  }
  
  // 4) DEV MODE: Accept dev-token as fallback (with warning)
  if (!IS_PRODUCTION && token === DEV_FALLBACKS.CABINET_API_TOKEN) {
    console.warn(`[SECURITY] ⚠️  DEV: Accepting dev-token for org ${org.id} (${org.name})`);
    return { ok: true, org };
  }
  
  // 5) PRODUCTION: dev-token is NEVER accepted
  if (IS_PRODUCTION && token === DEV_FALLBACKS.CABINET_API_TOKEN) {
    console.error(`[SECURITY] 🚫 PROD: Rejected dev-token for org ${org.id}`);
    return { ok: false, error: 'UNAUTHORIZED', message: 'Token invalide en production' };
  }
  
  // 6) Verify token
  const now = Date.now();
  
  // SQLite mode: compare hashes (timing-safe)
  if (storage.USE_SQLITE && org.apiTokenHash) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    
    // Check current token (timing-safe comparison)
    const isCurrentToken = org.apiTokenHash && 
      tokenHash.length === org.apiTokenHash.length &&
      require('crypto').timingSafeEqual(Buffer.from(tokenHash), Buffer.from(org.apiTokenHash));
    
    if (isCurrentToken) {
      return { ok: true, org };
    }
    
    // Check previous token (grace period)
    if (org.apiTokenPreviousHash && 
        org.apiTokenPreviousExpiresAt &&
        now < new Date(org.apiTokenPreviousExpiresAt).getTime()) {
      const isPreviousToken = tokenHash.length === org.apiTokenPreviousHash.length &&
        require('crypto').timingSafeEqual(Buffer.from(tokenHash), Buffer.from(org.apiTokenPreviousHash));
      
      if (isPreviousToken) {
        console.log(`[SECURITY] ℹ️  Using previous token (grace period) for org ${org.id}`);
        return { ok: true, org };
      }
    }
    
    // Token doesn't match
    console.warn(`[SECURITY] 🚫 Invalid token for org ${org.id} (publicKey: ${publicKey})`);
    return { ok: false, error: 'UNAUTHORIZED', message: 'Token invalide' };
  }
  
  // JSON mode: direct comparison (legacy)
  const isCurrentToken = token === org.apiToken;
  const isPreviousTokenValid = org.apiTokenPrevious && 
    token === org.apiTokenPrevious && 
    org.apiTokenPreviousExpiresAt && 
    now < new Date(org.apiTokenPreviousExpiresAt).getTime();
  
  if (isCurrentToken) {
    return { ok: true, org };
  }
  
  if (isPreviousTokenValid) {
    console.log(`[SECURITY] ℹ️  Using previous token (grace period) for org ${org.id}`);
    return { ok: true, org };
  }
  
  // Token doesn't match
  console.warn(`[SECURITY] 🚫 Invalid token for org ${org.id} (publicKey: ${publicKey})`);
  return { ok: false, error: 'UNAUTHORIZED', message: 'Token invalide' };
}

// ============ P0.3: Constant-time token comparison ============
function safeTokenCompare(a, b) {
  if (!a || !b) return false;
  try {
    const maxLen = Math.max(a.length, b.length);
    const bufA = Buffer.alloc(maxLen, 0);
    const bufB = Buffer.alloc(maxLen, 0);
    Buffer.from(a).copy(bufA);
    Buffer.from(b).copy(bufB);
    return a.length === b.length && timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function requireAdmin(req) {
  const token = req.headers['x-admin-token'] || '';
  if (!token) {
    return { ok: false, error: 'Admin token manquant', status: 401 };
  }
  if (!safeTokenCompare(token, INTERNAL_ADMIN_TOKEN)) {
    return { ok: false, error: 'Admin token invalide', status: 401 };
  }
  return { ok: true };
}

function getSettings() {
  const data = loadData();
  return {
    googleReviewUrl: data.settings?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
    cabinetName: data.settings?.cabinetName || DEFAULT_SETTINGS.cabinetName,
    reviewRouting: {
      enabled: data.settings?.reviewRouting?.enabled ?? DEFAULT_SETTINGS.reviewRouting.enabled,
      threshold: data.settings?.reviewRouting?.threshold ?? DEFAULT_SETTINGS.reviewRouting.threshold,
      publicTarget: data.settings?.reviewRouting?.publicTarget || DEFAULT_SETTINGS.reviewRouting.publicTarget
    }
  };
}

// ============ REVIEW ROUTING HELPERS ============

/**
 * Détermine le mode de routing basé sur la note et la config
 * @param {number} rating - Note 1-5
 * @returns {{ mode: 'PUBLIC_REVIEW' | 'INTERNAL_FEEDBACK', target?: string, redirectUrl?: string }}
 */
function determineReviewRouting(rating) {
  const settings = getSettings();
  const { reviewRouting, googleReviewUrl } = settings;
  
  // Si routing désactivé => tout en interne
  if (!reviewRouting.enabled) {
    console.log('[REPUTY][ROUTING] Routing disabled, internal feedback');
    return { mode: 'INTERNAL_FEEDBACK' };
  }
  
  // Si note >= seuil => redirection vers avis public
  if (rating >= reviewRouting.threshold) {
    console.log(`[REPUTY][ROUTING] Rating ${rating} >= threshold ${reviewRouting.threshold}, public review`);
    return {
      mode: 'PUBLIC_REVIEW',
      target: reviewRouting.publicTarget,
      redirectUrl: googleReviewUrl // Pour l'instant, tous les targets utilisent Google
    };
  }
  
  // Sinon => feedback interne
  console.log(`[REPUTY][ROUTING] Rating ${rating} < threshold ${reviewRouting.threshold}, internal feedback`);
  return { mode: 'INTERNAL_FEEDBACK' };
}

function saveData(data) {
  storage.saveData(data);
}

// ============ HTTP HELPERS ============

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json'
    // P0.3: CORS headers are now set globally by applyCors()
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html) {
  // P0.3: Override CSP for HTML pages (inline JS/CSS in patient rating pages)
  applySecurityHeaders(res, { isHtml: true });
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8'
    // P0.3: CORS headers are now set globally by applyCors()
  });
  res.end(html);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
let size = 0;
const MAX = 1024 * 1024; // 1MB

req.on('data', (chunk) => {
  size += chunk.length;
  if (size > MAX) {
    req.destroy();
    return;
  }
  body += chunk.toString();
});

    req.on('end', () => {
      try {
        // Handle both JSON and form data
        if (req.headers['content-type']?.includes('application/json')) {
        resolve(body ? JSON.parse(body) : {});
        } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [key, value] of params) {
            obj[key] = value;
          }
          resolve(obj);
        } else {
          resolve(body ? JSON.parse(body) : {});
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function validatePayload(body) {
  const { patientName, patientPhone, patientEmail, channel } = body || {};
  if (!patientName || !channel) {
    return 'Nom du patient ou canal manquant.';
  }
  if (channel === 'sms' && !patientPhone) {
    return 'Numéro de téléphone requis pour un SMS.';
  }
  if (channel === 'email' && !patientEmail) {
    return 'Email requis pour un envoi par email.';
  }
  return null;
}

// ============ PAGE HTML PATIENT ============

function generateRatingPage(requestId, request, existingFeedback, settings) {
  const patientName = request?.patient?.name || 'Patient';
  const patientFirstName = request?.patient?.firstName || '';
  const patientLastName = request?.patient?.lastName || '';
  // Afficher Prénom + Nom si disponibles, sinon fallback sur name
  const displayName = patientFirstName && patientLastName 
    ? `${patientFirstName} ${patientLastName}`
    : patientName;
  const firstName = patientFirstName || patientName.split(' ')[0]; // Pour le message de remerciement
  const CABINET_NAME = settings?.cabinetName || DEFAULT_SETTINGS.cabinetName;
  const GOOGLE_REVIEW_URL = settings?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl;
  
  // Si feedback déjà soumis
  if (existingFeedback) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merci ! - ${CABINET_NAME}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: #9ca3af;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #f3f4f6;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      border: 2px solid #111827;
    }
    .logo {
      width: 80px;
      margin: 0 auto 12px;
      text-align: center;
    }
    .logo svg {
      width: 60px;
      height: 60px;
    }
    .logo-text {
      display: block;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-weight: 500;
      font-size: 14px;
      color: #242c34;
      margin-top: 4px;
    }
    .slogan {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: 15px;
      color: #242c34;
      margin-bottom: 24px;
      letter-spacing: 0.3px;
    }
    h1 { font-size: 28px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    p { color: #1f2937; font-size: 16px; line-height: 1.6; }
    .rating-display {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin: 24px 0;
    }
    .star { font-size: 32px; }
    .star.filled { color: #fbbf24; }
    .star.empty { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="70 155 60 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" fill="#242c34"/>
      </svg>
      <span class="logo-text">health</span>
    </div>
    <p class="slogan">La réputation qui inspire confiance</p>
    <h1>Merci ${displayName} !</h1>
    <p>Votre avis a déjà été enregistré. Nous vous remercions pour votre retour.</p>
    <div class="rating-display">
      ${[1,2,3,4,5].map(i => `<span class="star ${i <= existingFeedback.rating ? 'filled' : 'empty'}">★</span>`).join('')}
    </div>
  </div>
</body>
</html>`;
  }

  // Page de notation
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Donnez votre avis - ${CABINET_NAME}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: #9ca3af;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #f3f4f6;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      border: 2px solid #111827;
    }
    .logo {
      width: 80px;
      margin: 0 auto 12px;
      text-align: center;
    }
    .logo svg {
      width: 60px;
      height: 60px;
    }
    .logo-text {
      display: block;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-weight: 500;
      font-size: 14px;
      color: #242c34;
      margin-top: 4px;
    }
    .slogan {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: 15px;
      color: #242c34;
      margin-bottom: 28px;
      letter-spacing: 0.3px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .cabinet-name {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 32px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .question {
      font-size: 16px;
      color: #1f2937;
      margin-bottom: 24px;
    }
    .stars {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .star {
      font-size: 48px;
      cursor: pointer;
      transition: all 0.2s ease;
      color: #e5e7eb;
      user-select: none;
    }
    .star:hover { transform: scale(1.15); }
    .star.active { color: #fbbf24; }
    .star.hover { color: #fcd34d; }
    .comment-section {
      display: none;
      margin-bottom: 24px;
    }
    .comment-section.visible { display: block; }
    .comment-section label {
      display: block;
      text-align: left;
      font-size: 14px;
      font-weight: 500;
      color: #1f2937;
      margin-bottom: 8px;
    }
    textarea {
      width: 100%;
      min-height: 100px;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      transition: border-color 0.2s;
    }
    textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .btn {
      display: none;
      width: 100%;
      padding: 16px 24px;
      border: none;
      border-radius: 12px;
      font-family: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn.visible { display: block; }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px -5px rgba(102, 126, 234, 0.4);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .btn-google {
      background: white;
      border: 2px solid #e5e7eb;
      color: #374151;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .btn-google:hover {
      border-color: #4285f4;
      background: #f8fafc;
    }
    .btn-google svg { width: 24px; height: 24px; }
    .success-message {
      display: none;
      padding: 16px;
      background: #ecfdf5;
      border-radius: 12px;
      color: #059669;
      font-weight: 500;
    }
    .success-message.visible { display: block; }
    .privacy {
      margin-top: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .loading { opacity: 0.7; pointer-events: none; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="logo">
      <svg viewBox="70 155 60 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" fill="#242c34"/>
      </svg>
      <span class="logo-text">health</span>
    </div>
    <p class="slogan">La réputation qui inspire confiance</p>
    <h1>Votre avis compte</h1>
    <p class="cabinet-name">${CABINET_NAME}</p>
    
    <p class="greeting">Bonjour ${displayName},</p>
    <p class="question">Comment s'est passée votre visite ?</p>
    
    <div class="stars" id="stars">
      <span class="star" data-value="1">★</span>
      <span class="star" data-value="2">★</span>
      <span class="star" data-value="3">★</span>
      <span class="star" data-value="4">★</span>
      <span class="star" data-value="5">★</span>
    </div>
    
    <div class="comment-section" id="commentSection">
      <label for="comment">Un commentaire ? (optionnel)</label>
      <textarea id="comment" placeholder="Partagez votre expérience..."></textarea>
    </div>
    
    <button class="btn btn-primary" id="submitBtn" onclick="submitFeedback()">
      Envoyer mon avis
    </button>
    
    <a href="${GOOGLE_REVIEW_URL}" target="_blank" class="btn btn-google" id="googleBtn" style="display:none;text-decoration:none;">
      <svg viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Laisser un avis sur Google
    </a>
    
    <div class="success-message" id="successMessage">
      ✓ Merci pour votre retour !
    </div>
    
    <p class="privacy">Vos données sont traitées de manière confidentielle.</p>
  </div>

  <script>
    const requestId = '${requestId}';
    const STORAGE_KEY = 'reputy_submitted_' + requestId;
    const ROUTING_THRESHOLD = ${settings?.reviewRouting?.threshold ?? 4};
    const ROUTING_ENABLED = ${settings?.reviewRouting?.enabled !== false};
    const GOOGLE_URL = '${GOOGLE_REVIEW_URL}';
    let selectedRating = 0;
    let isSubmitting = false;
    
    // Anti double-clic: vérifier si déjà soumis via localStorage
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      showAlreadySubmitted();
    }
    
    // Star rating
    const stars = document.querySelectorAll('.star');
    const commentSection = document.getElementById('commentSection');
    const submitBtn = document.getElementById('submitBtn');
    const googleBtn = document.getElementById('googleBtn');
    
    stars.forEach(star => {
      star.addEventListener('click', () => {
        if (isSubmitting) return;
        selectedRating = parseInt(star.dataset.value);
        updateStars();
        
        // Show comment section
        commentSection.classList.add('visible');
        
        // Check routing: si note >= seuil ET routing activé => Google direct
        if (ROUTING_ENABLED && selectedRating >= ROUTING_THRESHOLD) {
          submitBtn.classList.remove('visible');
          googleBtn.href = GOOGLE_URL;
          googleBtn.style.display = 'flex';
          // Auto-submit en arrière-plan (la note est enregistrée même si le client ne va pas sur Google)
          submitFeedbackSilent();
        } else {
          submitBtn.classList.add('visible');
          googleBtn.style.display = 'none';
        }
      });
      
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value);
        stars.forEach((s, i) => {
          s.classList.toggle('hover', i < val);
        });
      });
      
      star.addEventListener('mouseleave', () => {
        stars.forEach(s => s.classList.remove('hover'));
      });
    });
    
    function updateStars() {
      stars.forEach((star, i) => {
        star.classList.toggle('active', i < selectedRating);
      });
    }
    
    function showAlreadySubmitted() {
      document.getElementById('stars').style.display = 'none';
      document.getElementById('commentSection').style.display = 'none';
      document.getElementById('submitBtn').style.display = 'none';
      document.querySelector('.question').style.display = 'none';
      const msg = document.getElementById('successMessage');
      msg.textContent = '✓ Merci, votre avis a déjà été enregistré.';
      msg.classList.add('visible');
      document.querySelector('.greeting').textContent = 'Merci !';
    }
    
    async function submitFeedbackSilent() {
      if (isSubmitting) return;
      isSubmitting = true;
      
      try {
        const comment = document.getElementById('comment').value;
        const response = await fetch('/r/${requestId}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: selectedRating, comment })
        });
        
        // Marquer comme soumis même si 409 (déjà fait)
        if (response.ok || response.status === 409) {
          localStorage.setItem(STORAGE_KEY, 'true');
        }
      } catch (e) {
        console.error('Silent submit error:', e);
      }
      
      isSubmitting = false;
    }
    
    async function submitFeedback() {
      if (isSubmitting) return;
      
      const card = document.getElementById('card');
      const comment = document.getElementById('comment').value;
      
      if (!selectedRating) {
        alert('Veuillez sélectionner une note');
        return;
      }
      
      isSubmitting = true;
      card.classList.add('loading');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi...';
      
      try {
        const response = await fetch('/r/${requestId}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: selectedRating, comment })
        });
        
        const result = await response.json();
        
        // Gérer le 409 Conflict (déjà soumis)
        if (response.status === 409) {
          localStorage.setItem(STORAGE_KEY, 'true');
          showAlreadySubmitted();
          card.classList.remove('loading');
          return;
        }
        
        if (result.success || result.ok) {
          localStorage.setItem(STORAGE_KEY, 'true');
          
          // Hide form elements
          document.getElementById('stars').style.display = 'none';
          commentSection.style.display = 'none';
          submitBtn.style.display = 'none';
          document.querySelector('.question').style.display = 'none';
          
          // Check routing decision from backend
          const routing = result.routing || {};
          
          if (routing.mode === 'PUBLIC_REVIEW' && routing.redirectUrl) {
            // Show Google button for public review
            googleBtn.href = routing.redirectUrl;
            googleBtn.style.display = 'flex';
            document.getElementById('successMessage').innerHTML = '✓ Merci ! Partagez votre expérience sur Google ?';
            document.getElementById('successMessage').classList.add('visible');
          } else {
            // Internal feedback only
            document.getElementById('successMessage').innerHTML = '✓ Merci pour votre retour !';
            document.getElementById('successMessage').classList.add('visible');
          }
          
          document.querySelector('.greeting').textContent = 'Merci ${firstName} !';
        } else {
          alert(result.error || 'Une erreur est survenue');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Envoyer mon avis';
          isSubmitting = false;
        }
      } catch (e) {
        console.error('Submit error:', e);
        alert('Erreur de connexion');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Envoyer mon avis';
        isSubmitting = false;
      }
      
      card.classList.remove('loading');
    }
  </script>
</body>
</html>`;
}

function generate404Page() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lien invalide</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }
    .icon {
      width: 72px;
      height: 72px;
      background: #fef2f2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 32px;
    }
    h1 { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    p { color: #6b7280; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔗</div>
    <h1>Lien invalide</h1>
    <p>Ce lien de feedback n'existe pas. Veuillez contacter le cabinet si vous pensez qu'il s'agit d'une erreur.</p>
  </div>
</body>
</html>`;
}

function generateExpiredPage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lien expiré</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }
    .icon {
      width: 72px;
      height: 72px;
      background: #fef3c7;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 32px;
    }
    h1 { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    p { color: #6b7280; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <h1>Lien expiré</h1>
    <p>Ce lien de feedback a expiré (validité ${REQUEST_EXPIRY_DAYS} jours). Veuillez contacter le cabinet pour recevoir un nouveau lien.</p>
  </div>
</body>
</html>`;
}

// ============ ROUTE HANDLERS ============

function handleHealth(res) {
  sendJson(res, 200, { 
    ok: true, 
    version: VERSION,
    storage: storage.USE_SQLITE ? 'sqlite' : 'json'
  });
}

async function handleSendReview(req, res) {
  const startTime = Date.now();
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const reqId = logger.extractRequestId(req, body);

  const validationError = validatePayload(body);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }

  // ============ P1.3: AUTH VIA publicKey + apiToken ============
  const publicKey = req.headers['x-public-key'];
  const auth = validateExtensionAuth(req, publicKey);
  
  if (!auth.ok) {
    const data = loadData();
    // Log failed auth attempt
    recordTelemetry(data, null, 'warn', auth.error, 
      `Auth failed: ${auth.message}`, { source: 'extension', publicKey: publicKey || 'none' });
    saveData(data);
    
    // P1.4: Log extension auth failed
    logger.logExtensionAction('EXTENSION_SEND_REVIEW_FAILED', false, req, {
      requestId: reqId,
      durationMs: Date.now() - startTime,
      status: 401,
      errorCode: auth.error,
      publicKey: publicKey || 'none'
    });
    
    return sendJson(res, 401, { 
      ok: false, 
      error: auth.error, 
      message: auth.message 
    });
  }
  
  const org = auth.org;
  const orgId = org.id;
  const data = loadData();
  
  // STATE MACHINE GUARD: Check if org can send SMS/email
  // This replaces the old simple status check with proper state machine logic
  const accessCheckSms = stateMachine.canPerformAction(org, 'sendSms');
  const accessCheckEmail = stateMachine.canPerformAction(org, 'sendEmail');
  
  // Block if BOTH SMS and email are blocked (read_only or suspended state)
  if (!accessCheckSms.allowed && !accessCheckEmail.allowed) {
    recordTelemetry(data, orgId, 'warn', accessCheckSms.error?.errorCategory || 'SUBSCRIPTION_RESTRICTED', 
      `Tentative d'envoi sur compte ${org.status}`, { source: 'extension', publicKey });
    saveData(data);
    
    // P1.4: Log extension subscription restricted
    logger.logExtensionAction('EXTENSION_SEND_REVIEW_FAILED', false, req, {
      requestId: reqId,
      orgId,
      durationMs: Date.now() - startTime,
      status: 403,
      errorCode: accessCheckSms.error?.errorCategory || 'SUBSCRIPTION_RESTRICTED',
      orgStatus: org.status
    });
    
    return sendJson(res, 403, {
      ok: false,
      errorCategory: accessCheckSms.error?.errorCategory || 'SUBSCRIPTION_RESTRICTED',
      error: accessCheckSms.error?.errorCode || 'FEATURE_BLOCKED',
      message: accessCheckSms.error?.message || 'Fonctionnalité non disponible avec votre abonnement actuel.',
      action: accessCheckSms.error?.action || 'UPGRADE_PLAN',
      details: {
        status: org.status,
        orgName: org.name,
        message: stateMachine.getStateInfo(org).blockMessage || 'Contactez votre administrateur.'
      }
    });
  }
  
  // ============ IDEMPOTENCE VIA requestId ============
  // Si le client fournit un requestId, vérifier si déjà traité
  const clientRequestId = body.requestId;
  if (clientRequestId && orgId) {
    const existingUsage = findUsageByRequestId(data, orgId, clientRequestId);
    if (existingUsage) {
      console.log(`[REPUTY][API] ⚡ Idempotence: requestId ${clientRequestId} déjà traité`);
      
      // Trouver la request associée pour retourner feedbackUrl
      const existingReqId = existingUsage.meta?.requestId || existingUsage.meta?.originalRequestId;
      const existingRequest = existingReqId ? data.requests?.[existingReqId] : null;
      
      return sendJson(res, 200, {
        ok: true,
        deduped: true,
        requestId: existingReqId || clientRequestId,
        feedbackUrl: existingRequest?.feedbackUrl || null,
        message: 'Requête déjà traitée (idempotent)'
      });
    }
  }
  
  const idempotencyKey = generateIdempotencyKey(body);
  
  // ============ ANTI-DOUBLON: Vérifier si request existe déjà ============
  const duplicate = findDuplicateRequest(data, idempotencyKey);
  
  if (duplicate) {
    const { id, request: existingRequest } = duplicate;
    
    // Incrémenter le compteur de renvoi (si inférieur au max)
    if ((existingRequest.sendCount || 1) < MAX_SEND_COUNT) {
      existingRequest.sendCount = (existingRequest.sendCount || 1) + 1;
      existingRequest.lastSentAt = new Date().toISOString();
      
      // Enregistrer usage + telemetry même pour les renvois
      const channel = body.channel;
      const usageType = channel === 'email' ? 'email' : 'sms';
      const effectiveOrgId = orgId || existingRequest.orgId;
      
      if (effectiveOrgId) {
        const org = data.orgs.find(o => o.id === effectiveOrgId);
        
        if (org) {
          // Debit credits for resend
          const usageResult = recordUsageAndDebit(data, org, usageType, {
            channel,
            requestId: id,
            patientName: body.patientName,
            patientContact: channel === 'email' ? body.patientEmail : body.patientPhone,
            resend: true,
            sendCount: existingRequest.sendCount
          });
          
          if (!usageResult.success) {
            // Quota exceeded - reject the resend
            saveData(data);
            
            // P1.4: Log quota exceeded for resend
            logger.logExtensionAction('EXTENSION_SEND_REVIEW_FAILED', false, req, {
              requestId: reqId,
              orgId: effectiveOrgId,
              channel,
              durationMs: Date.now() - startTime,
              status: 402,
              errorCode: 'QUOTA_EXCEEDED',
              resend: true
            });
            
            return sendJson(res, 402, {
              ok: false,
              error: 'QUOTA_EXCEEDED',
              message: `Quota ${usageType.toUpperCase()} dépassé pour cette période (renvoi)`,
              billingPeriodEnd: org.billing?.periodEnd
            });
          }
          
          recordTelemetry(data, effectiveOrgId, 'info', 
            usageType === 'sms' ? 'RESEND_SMS_SUCCESS' : 'RESEND_EMAIL_SUCCESS',
            `Renvoi ${usageType.toUpperCase()} #${existingRequest.sendCount} à ${body.patientName}`, {
              source: 'extension',
              requestId: id,
              channel,
              allocationId: usageResult.entry?.meta?.allocationId
            });
        }
      }
      
      saveData(data);
      
      console.log('[REPUTY][API] Demande dupliquée (renvoi autorisé)', {
        requestId: id,
        sendCount: existingRequest.sendCount,
        orgId: effectiveOrgId || 'non rattaché'
      });
    }
    
    return sendJson(res, 200, {
      ok: true,
      requestId: id,
      feedbackUrl: existingRequest.feedbackUrl,
      duplicate: true,
      sendCount: existingRequest.sendCount || 1,
      reason: `Demande déjà créée il y a moins de ${DUPLICATE_WINDOW_HOURS}h`
    });
  }

  // ============ SQLITE MODE: DB-DRIVEN IDEMPOTENCE ============
  if (storage.USE_SQLITE) {
    const repos = storage.getRepos();
    
    // Use client-provided key or generate one
    const idempotencyKey = body.requestId || body.idempotencyKey || randomBytes(12).toString('hex');
    const feedbackUrl = `${REVIEWS_BASE_URL}/r/${idempotencyKey}`;
    
    // DB-driven idempotence: returns existing if already created
    const { request: dbRequest, created } = repos.request.createOrGetByIdempotencyKey(idempotencyKey, {
      orgId: orgId,
      channel: body.channel,
      patient: {
        name: body.patientName,
        firstName: body.patientFirstName || '',
        lastName: body.patientLastName || '',
        email: body.patientEmail || '',
        phone: body.patientPhone || ''
      },
      feedbackUrl: feedbackUrl,
      meta: {
        source: body.source || 'chrome-extension',
        pageUrl: body.pageUrl || '',
        appointmentDate: body.appointmentDate || '',
        locationId: body.locationId || ''
      }
    });
    
    // If already existed, return as duplicate
    if (!created) {
      console.log(`[REPUTY][API] ⚡ SQLite idempotence: ${idempotencyKey} already exists`);
      
      return sendJson(res, 200, {
        ok: true,
        requestId: dbRequest.idempotencyKey,
        feedbackUrl: dbRequest.feedbackUrl,
        duplicate: true,
        reason: 'Requête déjà traitée (idempotent)'
      });
    }
    
    // New request created - check quota and record usage
    const channel = body.channel;
    const usageType = channel === 'email' ? 'email' : 'sms';
    
    // Get fresh org data for quota check
    const freshOrg = repos.org.getById(orgId);
    if (!freshOrg) {
      return sendJson(res, 500, { ok: false, error: 'ORG_NOT_FOUND' });
    }
    
    // TODO: Implement quota check in SQLite mode
    // For now, just record usage
    repos.usage.addEntry({
      orgId: orgId,
      type: usageType,
      qty: 1,
      details: {
        requestId: dbRequest.idempotencyKey,
        channel: channel,
        source: 'extension',
        patientName: body.patientName
      }
    });
    
    // Create message entry (queued for future sending)
    const recipient = channel === 'email' ? body.patientEmail : body.patientPhone;
    repos.message.create({
      requestDbId: dbRequest.id,
      channel: channel,
      recipient: recipient,
      status: 'queued'
    });
    
    // Log success
    logger.logExtensionAction('EXTENSION_SEND_REVIEW_SUCCESS', true, req, {
      requestId: dbRequest.idempotencyKey,
      orgId: orgId,
      channel: channel,
      durationMs: Date.now() - startTime,
      status: 201
    });
    
    console.log(`[REPUTY][API] ✅ SQLite: New request created: ${dbRequest.idempotencyKey}`);
    
    return sendJson(res, 201, {
      ok: true,
      requestId: dbRequest.idempotencyKey,
      feedbackUrl: dbRequest.feedbackUrl,
      duplicate: false
    });
  }

  // ============ JSON MODE: NOUVELLE REQUEST (legacy) ============
  const requestId = randomBytes(12).toString('hex');
  const reviewUrl = `${REVIEWS_BASE_URL}/r/${requestId}`;
  const now = new Date().toISOString();

  data.requests[requestId] = {
    id: requestId,
    idempotencyKey,
    createdAt: now,
    lastSentAt: now,
    sendCount: 1,
    channel: body.channel,
    orgId: orgId || null, // Rattacher la request à l'org
    patient: {
      name: body.patientName,
      firstName: body.patientFirstName || '',
      lastName: body.patientLastName || '',
      email: body.patientEmail || '',
      phone: body.patientPhone || ''
    },
    feedbackUrl: reviewUrl,
    meta: {
      source: body.source || 'chrome-extension',
      pageUrl: body.pageUrl || '',
      appointmentDate: body.appointmentDate || '',
      locationId: body.locationId || ''
    }
  };
  
  // ============ VÉRIFIER QUOTA & ENREGISTRER USAGE ============
  const channel = body.channel; // 'sms' ou 'email'
  const usageType = channel === 'email' ? 'email' : 'sms';
  
  if (orgId) {
    // Get the org object for debit
    const org = data.orgs.find(o => o.id === orgId);
    
    if (org) {
      // Debit credits and record usage
      // Use body.requestId (from extension) for idempotence if provided, else use requestId
      const usageRequestId = body.requestId || requestId;
      const usageResult = recordUsageAndDebit(data, org, usageType, {
        channel,
        requestId: usageRequestId, // For idempotence check
        reviewRequestId: requestId, // Link to review request
        patientName: body.patientName,
        patientContact: channel === 'email' ? body.patientEmail : body.patientPhone
      });
      
      // Check if deduped (idempotent request)
      if (usageResult.deduped) {
        console.log('[REPUTY][API] Idempotent request detected, returning existing result');
        // Return success without re-debiting
        return sendJson(res, 200, {
          ok: true,
          requestId,
          feedbackUrl: reviewUrl,
          deduped: true,
          message: 'Requête déjà traitée (idempotent)'
        });
      }
      
      if (!usageResult.success) {
        saveData(data); // Save the usage entry with fail status
        
        // Handle SUBSCRIPTION_INACTIVE
        if (usageResult.reason === 'SUBSCRIPTION_INACTIVE') {
          return sendJson(res, 403, {
            ok: false,
            error: 'SUBSCRIPTION_INACTIVE',
            message: 'Abonnement inactif. Les envois sont désactivés.',
            details: {
              status: org.status,
              message: 'Contactez votre administrateur pour réactiver votre abonnement.'
            }
          });
        }
        
        // Handle QUOTA_EXCEEDED
        const periodEndDate = org.billing?.periodEnd ? 
          new Date(org.billing.periodEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 
          'fin de mois';
        
        // P1.4: Log quota exceeded
        logger.logExtensionAction('EXTENSION_SEND_REVIEW_FAILED', false, req, {
          requestId: reqId,
          orgId,
          channel,
          durationMs: Date.now() - startTime,
          status: 402,
          errorCode: 'QUOTA_EXCEEDED'
        });
        
        return sendJson(res, 402, {
          ok: false,
          error: 'QUOTA_EXCEEDED',
          message: `Crédits ${usageType.toUpperCase()} épuisés.`,
          details: {
            smsRemaining: usageResult.smsRemaining || 0,
            emailRemaining: usageResult.emailRemaining || 0,
            subscriptionRemaining: usageResult.subscriptionRemaining,
            packRemaining: usageResult.packRemaining,
            periodEnd: org.billing?.periodEnd,
            periodEndFormatted: periodEndDate,
            renewalMessage: `Renouvellement abonnement le ${periodEndDate}. Achetez un pack pour des crédits supplémentaires.`
          }
        });
      }
      
      // Update org in data
      const orgIndex = data.orgs.findIndex(o => o.id === orgId);
      if (orgIndex >= 0) {
        data.orgs[orgIndex] = org;
      }
      
      // Enregistrer la télémétrie
      const telemetryCode = usageType === 'sms' ? 'SEND_SMS_SUCCESS' : 'SEND_EMAIL_SUCCESS';
      recordTelemetry(data, orgId, 'info', telemetryCode, 
        `${usageType.toUpperCase()} envoyé à ${body.patientName}`, {
          source: 'extension',
          requestId,
          channel,
          allocationId: usageResult.entry?.meta?.allocationId
        });
    }
  }
  
  saveData(data);

  // P1.4: Log extension success
  logger.logExtensionAction('EXTENSION_SEND_REVIEW_SUCCESS', true, req, {
    requestId: reqId,
    orgId,
    channel: body.channel,
    durationMs: Date.now() - startTime,
    status: 200,
    reviewRequestId: requestId
  });

  return sendJson(res, 200, {
    ok: true,
    requestId,
    feedbackUrl: reviewUrl,
    duplicate: false,
    orgId: orgId || null
  });
}

function handleGetRatingPage(requestId, res) {
  const data = loadData();
  const request = data.requests[requestId];
  
  // Request inexistante
  if (!request) {
    return sendHtml(res, 404, generate404Page());
  }
  
  // Request expirée
  if (isRequestExpired(request)) {
    return sendHtml(res, 410, generateExpiredPage());
  }
  
  const existingFeedback = data.feedbacks[requestId];
  const settings = getSettings();
  return sendHtml(res, 200, generateRatingPage(requestId, request, existingFeedback, settings));
}

async function handleSubmitFeedback(requestId, req, res) {
  const data = loadData();
  const request = data.requests[requestId];
  
  // ============ VALIDATION: Request existe? ============
  if (!request) {
    return sendJson(res, 404, { ok: false, error: 'REQUEST_NOT_FOUND' });
  }
  
  // ============ VALIDATION: Request expirée? ============
  if (isRequestExpired(request)) {
    return sendJson(res, 410, { ok: false, error: 'REQUEST_EXPIRED' });
  }
  
  // ============ ANTI-DOUBLON: Feedback déjà soumis? (409 Conflict) ============
  if (data.feedbacks[requestId]) {
    console.log('[REPUTY][FEEDBACK] Tentative de double soumission bloquée', { requestId });
    return sendJson(res, 409, { ok: false, error: 'ALREADY_SUBMITTED' });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_BODY' });
  }
  
  const rating = parseInt(body.rating);
  if (!rating || rating < 1 || rating > 5) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_RATING' });
  }
  
  // ============ ENREGISTRER LE FEEDBACK ============
  // NOTE: Pour migration DB, créer UNIQUE INDEX sur requestId dans feedbacks
  const now = new Date().toISOString();
  
  data.feedbacks[requestId] = {
    requestId,
    submittedAt: now,
    createdAt: now,  // Backward compat
    rating,
    comment: (body.comment || '').trim(),
    channel: request.channel,
    patient: request.patient,
    // Metadata anti-abus (optionnel)
    meta: {
      userAgent: req.headers['user-agent'] || '',
      // Note: Pour ipHash, utiliser req.connection.remoteAddress avec hash
    }
  };
  saveData(data);
  
  console.log('[REPUTY][FEEDBACK] Nouveau feedback', {
    requestId,
    rating,
    hasComment: !!body.comment
  });
  
  // ============ APPLY REVIEW ROUTING LOGIC ============
  const routing = determineReviewRouting(rating);
  
  // Store routing decision in feedback for analytics
  data.feedbacks[requestId].routing = routing;
  saveData(data);
  
  const settings = getSettings();
  
  // Response with routing decision
  return sendJson(res, 200, { 
    ok: true,
    success: true,  // Backward compat
    // New routing response
    routing: routing,
    // Backward compat fields
    redirectToGoogle: routing.mode === 'PUBLIC_REVIEW',
    googleUrl: routing.redirectUrl || settings.googleReviewUrl
  });
}

function handleGetFeedbacks(req, res) {
  const data = loadData();

  // P5: Try session auth first (org-scoped, secure)
  const sessionAuth = getAuthUser(req, data);
  if (sessionAuth && sessionAuth.org) {
    const repos = storage.getRepos();
    if (repos && repos.feedback) {
      const feedbacks = repos.feedback.listByOrg(sessionAuth.org.id);
      return sendJson(res, 200, { feedbacks });
    }
    // JSON mode fallback: filter by orgId
    const feedbacks = Object.values(data.feedbacks)
      .filter(f => {
        const request = data.requests?.[f.requestId];
        return request && request.orgId === sessionAuth.org.id;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, { feedbacks });
  }

  // P5: Legacy fallback with instrumentation + kill-switch
  const auth = legacyAuth(req, '/api/feedbacks');
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const feedbacks = Object.values(data.feedbacks).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  return sendJson(res, 200, { feedbacks });
}

// ============ REQUESTS API (Traçabilité) ============

function handleGetRequests(req, res) {
  const data = loadData();

  // P5: Try session auth first (org-scoped, secure)
  const sessionAuth = getAuthUser(req, data);
  
  // Helper: enrich requests with feedback status
  function enrichRequests(rawRequests) {
    return rawRequests.map(request => {
      const feedback = data.feedbacks?.[request.id];
      const isExpired = isRequestExpired(request);
      let status = 'pending';
      if (feedback) status = 'completed';
      else if (isExpired) status = 'expired';
      return {
        ...request,
        status,
        feedback: feedback ? {
          rating: feedback.rating,
          comment: feedback.comment,
          submittedAt: feedback.submittedAt || feedback.createdAt,
          routing: feedback.routing
        } : null,
        isExpired
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function buildStats(requests) {
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === 'pending').length,
      completed: requests.filter(r => r.status === 'completed').length,
      expired: requests.filter(r => r.status === 'expired').length,
      conversionRate: requests.length > 0 
        ? Math.round((requests.filter(r => r.status === 'completed').length / requests.length) * 100) 
        : 0
    };
  }

  if (sessionAuth && sessionAuth.org) {
    const repos = storage.getRepos();
    let rawRequests;
    if (repos && repos.request) {
      rawRequests = repos.request.listByOrg(sessionAuth.org.id);
    } else {
      // JSON mode fallback: filter by orgId
      rawRequests = Object.values(data.requests || {})
        .filter(r => r.orgId === sessionAuth.org.id);
    }
    const requests = enrichRequests(rawRequests);
    return sendJson(res, 200, { requests, stats: buildStats(requests) });
  }

  // P5: Legacy fallback with instrumentation + kill-switch
  const auth = legacyAuth(req, '/api/requests');
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const requests = enrichRequests(Object.values(data.requests || {}));
  return sendJson(res, 200, { requests, stats: buildStats(requests) });
}

function handleGetSettings(req, res) {
  // Try session auth first (for dashboard users)
  const data = loadData();
  const sessionAuth = getAuthUser(req, data);
  
  if (sessionAuth && sessionAuth.org) {
    // User is authenticated via session - return org-specific settings
    const org = sessionAuth.org;
    return sendJson(res, 200, {
      googleReviewUrl: org.options?.googleReviewUrl || '',
      cabinetName: org.name || '',
      reviewRouting: org.options?.reviewRouting || DEFAULT_SETTINGS.reviewRouting
    });
  }
  
  // P5: Legacy fallback with instrumentation + kill-switch
  const auth = legacyAuth(req, '/api/settings:GET');
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const settings = getSettings();
  return sendJson(res, 200, settings);
}

async function handleSaveSettings(req, res) {
  const data = loadData();
  
  // Try session auth first (for dashboard users)
  const sessionAuth = getAuthUser(req, data);
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  if (sessionAuth && sessionAuth.org) {
    // User is authenticated via session - save to org-specific options
    const org = sessionAuth.org;
    const repos = storage.getRepos();
    
    if (repos && repos.org) {
      // Update org options in SQLite
      const optionsUpdate = {};
      if (body.googleReviewUrl !== undefined) {
        optionsUpdate.googleReviewUrl = body.googleReviewUrl.trim();
      }
      
      // Update options
      repos.org.updateOptions(org.id, optionsUpdate);
      
      // Update org name if provided
      if (body.cabinetName !== undefined && body.cabinetName.trim()) {
        repos.org.update(org.id, { name: body.cabinetName.trim() });
      }
      
      // Reload org to get updated data
      const updatedOrg = repos.org.getById(org.id);
      
      logger.logAudit('SETTINGS_UPDATED', {
        orgId: org.id,
        userId: sessionAuth.user.id,
        changes: { googleReviewUrl: optionsUpdate.googleReviewUrl, cabinetName: body.cabinetName }
      });
      
      return sendJson(res, 200, { 
        success: true, 
        settings: {
          googleReviewUrl: updatedOrg.options?.googleReviewUrl || '',
          cabinetName: updatedOrg.name || ''
        }
      });
    }
    
    return sendJson(res, 500, { error: 'Base de données non disponible' });
  }
  
  // P5: Legacy fallback with instrumentation + kill-switch
  const auth = legacyAuth(req, '/api/settings:POST');
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const currentSettings = data.settings || {};
  
  // Update settings (merge with existing, especially reviewRouting)
  data.settings = {
    googleReviewUrl: (body.googleReviewUrl || '').trim() || currentSettings.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
    cabinetName: (body.cabinetName || '').trim() || currentSettings.cabinetName || DEFAULT_SETTINGS.cabinetName,
    reviewRouting: currentSettings.reviewRouting || DEFAULT_SETTINGS.reviewRouting
  };
  
  saveData(data);
  
  logger.logAudit('SETTINGS_UPDATED_LEGACY', { settings: data.settings });
  
  return sendJson(res, 200, { success: true, settings: data.settings });
}

// ============ REVIEW ROUTING API ============

function handleGetReviewRouting(req, res) {
  const data = loadData();
  
  // Try session auth first (for dashboard users)
  const sessionAuth = getAuthUser(req, data);
  
  if (sessionAuth && sessionAuth.org) {
    const org = sessionAuth.org;
    return sendJson(res, 200, org.options?.reviewRouting || DEFAULT_SETTINGS.reviewRouting);
  }
  
  // P5: Legacy fallback with instrumentation + kill-switch
  const auth = legacyAuth(req, '/api/settings/review-routing:GET');
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const settings = getSettings();
  return sendJson(res, 200, settings.reviewRouting);
}

async function handleSaveReviewRouting(req, res) {
  const data = loadData();
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  // Validation
  const { enabled, threshold, publicTarget } = body;
  
  // Valider threshold (clamp 1-5)
  let validThreshold = parseInt(threshold);
  if (isNaN(validThreshold) || validThreshold < 1) validThreshold = 1;
  if (validThreshold > 5) validThreshold = 5;
  
  // Valider publicTarget
  const validTargets = ['DOCTOLIB', 'GOOGLE'];
  const validPublicTarget = validTargets.includes(publicTarget) ? publicTarget : 'DOCTOLIB';
  
  const reviewRouting = {
    enabled: enabled === true || enabled === 'true',
    threshold: validThreshold,
    publicTarget: validPublicTarget
  };
  
  // Try session auth first (for dashboard users)
  const sessionAuth = getAuthUser(req, data);
  
  if (sessionAuth && sessionAuth.org) {
    const org = sessionAuth.org;
    const repos = storage.getRepos();
    
    if (repos && repos.org) {
      // Save to org options in SQLite
      repos.org.updateOptions(org.id, { reviewRouting });
      
      logger.logAudit('REVIEW_ROUTING_UPDATED', {
        orgId: org.id,
        userId: sessionAuth.user.id,
        reviewRouting
      });
      
      return sendJson(res, 200, { success: true, reviewRouting });
    }
    
    return sendJson(res, 500, { error: 'Base de données non disponible' });
  }
  
  // P5: Legacy fallback with instrumentation + kill-switch
  const auth = legacyAuth(req, '/api/settings/review-routing:PUT');
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  // Ensure settings exists
  if (!data.settings) {
    data.settings = { ...DEFAULT_SETTINGS };
  }
  
  // Update reviewRouting (legacy mode)
  data.settings.reviewRouting = reviewRouting;
  
  saveData(data);
  
  logger.logAudit('REVIEW_ROUTING_UPDATED_LEGACY', { reviewRouting });
  
  return sendJson(res, 200, { success: true, reviewRouting });
}

// ============ INTERNAL BACKOFFICE API (Super Admin) ============

/**
 * P5: GET /internal/admin/feedbacks — All feedbacks (admin-only, no legacy token).
 * Replaces the legacy path through /api/feedbacks + CABINET_API_TOKEN.
 * Protected by requireAdmin (constant-time x-admin-token check).
 */
function handleAdminGetFeedbacks(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  const repos = storage.getRepos();
  if (repos && repos.feedback) {
    const feedbacks = repos.feedback.listAll();
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, { feedbacks });
  }

  // JSON mode fallback
  const data = loadData();
  const feedbacks = Object.values(data.feedbacks)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 200, { feedbacks });
}

/**
 * P5: GET /internal/admin/legacy-auth-stats — Monitor legacy auth usage.
 * Protected by requireAdmin (constant-time x-admin-token check).
 */
function handleLegacyAuthStats(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 200, getLegacyAuthStats());
}

/**
 * GET /internal/orgs - Liste tous les clients
 * Query params:
 *   - now: ISO date string for debug (triggers ensureCurrentPeriod with this date)
 */
function handleListOrgs(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  // Debug: support ?now=ISO for testing period rotation
  const debugNowParam = urlParams.get('now');
  let debugNow = null;
  let debugInfo = null;
  
  if (debugNowParam) {
    debugNow = new Date(debugNowParam);
    if (isNaN(debugNow.getTime())) {
      return sendJson(res, 400, { error: `Invalid now parameter: ${debugNowParam}` });
    }
    console.log(`[DEBUG] Using debugNow=${debugNow.toISOString()} for period calculations`);
    debugInfo = { debugNow: debugNow.toISOString(), warning: 'Using simulated date for testing' };
  }
  
  // Enrichir chaque org avec usage, allocation, pricing
  const orgsEnriched = data.orgs.map(org => {
    // If debug mode, run ensureCurrentPeriod with debugNow
    if (debugNow) {
      const result = ensureCurrentPeriod(data, org, true, debugNow);
      if (result.rotated || result.allocationCreated) {
        console.log(`[DEBUG] Org ${org.id}: rotated=${result.rotated}, allocationCreated=${result.allocationCreated}`);
      }
    }
    return sanitizeOrg(enrichOrg(data, org));
  });
  
  return sendJson(res, 200, { 
    orgs: orgsEnriched,
    total: orgsEnriched.length,
    ...(debugInfo && { _debug: debugInfo })
  });
}

/**
 * POST /internal/orgs - Crée un nouveau client
 */
async function handleCreateOrg(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { name, email, vertical = 'health' } = body;
  
  if (!name || name.trim().length < 2) {
    return sendJson(res, 400, { error: 'Nom requis (min 2 caractères)' });
  }
  
  const validVerticals = ['health', 'food', 'business'];
  if (!validVerticals.includes(vertical)) {
    return sendJson(res, 400, { error: `Vertical invalide. Valeurs: ${validVerticals.join(', ')}` });
  }
  
  const data = loadData();
  const now = nowISO();
  const planCode = `${vertical}_basic`;
  const quotas = PLAN_DEFAULTS[planCode] || { smsIncluded: 50, emailIncluded: 50, aiIncluded: 20, qrIncluded: 1, nfcIncluded: 0 };
  
  const newOrg = {
    id: generateId(),
    publicKey: generatePublicKey(), // Clé publique unique pour l'extension
    name: name.trim(),
    email: email ? email.toLowerCase().trim() : null,
    vertical,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    billing: {
      provider: 'none',
      stripeCustomerId: null,
      gocardlessMandateId: null
    },
    plan: {
      code: planCode,
      basePriceCents: 4900,
      currency: 'EUR',
      billingCycle: 'monthly'
    },
    negotiated: {
      enabled: false,
      customPriceCents: null,
      discountPercent: null,
      notes: '',
      contractRef: null
    },
    options: {
      reviewRouting: true,
      widgetsSeo: false,
      multiLocations: false,
      prioritySupport: false,
      custom: {}
    },
    quotas,
    balances: {
      smsExtra: 0,
      emailExtra: 0
    }
  };
  
  data.orgs.push(newOrg);
  saveData(data);
  
  console.log('[REPUTY][INTERNAL] Org created:', newOrg.id, newOrg.name);
  
  return sendJson(res, 201, { org: sanitizeOrg(newOrg) });
}

/**
 * GET /internal/orgs/:orgId - Détail d'un client
 * Query params:
 *   - now: ISO date string for debug (triggers ensureCurrentPeriod with this date)
 */
function handleGetOrg(req, res, orgId, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  // Debug: support ?now=ISO for testing period rotation
  const debugNowParam = urlParams.get('now');
  let debugNow = null;
  let debugInfo = null;
  
  if (debugNowParam) {
    debugNow = new Date(debugNowParam);
    if (isNaN(debugNow.getTime())) {
      return sendJson(res, 400, { error: `Invalid now parameter: ${debugNowParam}` });
    }
    console.log(`[DEBUG] Using debugNow=${debugNow.toISOString()} for org ${orgId}`);
    debugInfo = { debugNow: debugNow.toISOString(), warning: 'Using simulated date for testing' };
  }
  
  try {
    const org = getOrgOrThrow(data, orgId);
    
    // If debug mode, run ensureCurrentPeriod with debugNow
    if (debugNow) {
      const result = ensureCurrentPeriod(data, org, true, debugNow);
      debugInfo = {
        ...debugInfo,
        periodRotated: result.rotated,
        allocationCreated: result.allocationCreated
      };
      console.log(`[DEBUG] ensureCurrentPeriod result: rotated=${result.rotated}, allocationCreated=${result.allocationCreated}`);
    }
    
    // Enrichir l'org avec computed fields (pass debugNow if set)
    const enrichedOrg = enrichOrg(data, org, debugNow);
    
    // Calculs additionnels pour la vue détail
    const usage7d = calculateOrgUsage(data, orgId, 7);
    const usage30d = calculateOrgUsage(data, orgId, 30);
    
    // Derniers events usage
    const recentUsage = (data.usageLedger || [])
      .filter(e => e.orgId === orgId)
      .sort((a, b) => b.ts?.localeCompare(a.ts))
      .slice(0, 50);
    
    // Derniers telemetry
    const recentTelemetry = (data.telemetry || [])
      .filter(e => e.orgId === orgId)
      .sort((a, b) => b.ts?.localeCompare(a.ts))
      .slice(0, 50);
    
    return sendJson(res, 200, {
      org: sanitizeOrg(enrichedOrg),
      usage: { 
        days7: { sms: usage7d.sms, email: usage7d.email, total: usage7d.total },
        days30: { sms: usage30d.sms, email: usage30d.email, total: usage30d.total }
      },
      recentUsage,
      recentTelemetry,
      ...(debugInfo && { _debug: debugInfo })
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * PUT /internal/orgs/:orgId - Modifier un client
 */
async function handleUpdateOrg(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    
    // Mise à jour partielle (patch)
    if (body.name) org.name = body.name.trim();
    if (body.vertical) org.vertical = body.vertical;
    
    // Plan
    if (body.plan) {
      if (body.plan.code) org.plan.code = body.plan.code;
      if (body.plan.basePriceCents !== undefined) org.plan.basePriceCents = body.plan.basePriceCents;
      if (body.plan.billingCycle) org.plan.billingCycle = body.plan.billingCycle;
    }
    
    // Négociation commerciale
    if (body.negotiated) {
      if (body.negotiated.enabled !== undefined) org.negotiated.enabled = body.negotiated.enabled;
      if (body.negotiated.customPriceCents !== undefined) org.negotiated.customPriceCents = body.negotiated.customPriceCents;
      if (body.negotiated.discountPercent !== undefined) org.negotiated.discountPercent = body.negotiated.discountPercent;
      if (body.negotiated.notes !== undefined) org.negotiated.notes = body.negotiated.notes;
      if (body.negotiated.contractRef !== undefined) org.negotiated.contractRef = body.negotiated.contractRef;
    }
    
    // Options
    if (body.options) {
      Object.keys(body.options).forEach(key => {
        org.options[key] = body.options[key];
      });
    }
    
    // Quotas - merge with existing
    if (body.quotas) {
      org.quotas = {
        ...org.quotas,
        ...(body.quotas.smsIncluded !== undefined && { smsIncluded: body.quotas.smsIncluded }),
        ...(body.quotas.emailIncluded !== undefined && { emailIncluded: body.quotas.emailIncluded }),
        ...(body.quotas.aiIncluded !== undefined && { aiIncluded: body.quotas.aiIncluded }),
        ...(body.quotas.qrIncluded !== undefined && { qrIncluded: body.quotas.qrIncluded }),
        ...(body.quotas.nfcIncluded !== undefined && { nfcIncluded: body.quotas.nfcIncluded }),
      };
    }
    
    org.updatedAt = nowISO();
    
    // Save via repository in SQLite mode
    const repos = storage.getRepos();
    if (repos && repos.org) {
      repos.org.update(orgId, { 
        name: org.name,
        vertical: org.vertical,
        plan: org.plan,
        negotiated: org.negotiated,
        options: org.options,
        quotas: org.quotas
      });
    } else {
      saveData(data);
    }
    
    console.log('[REPUTY][INTERNAL] Org updated:', orgId);
    
    return sendJson(res, 200, { org: sanitizeOrg(org) });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * GET /internal/packs - Liste des packs disponibles (catalog)
 */
function handleGetPacks(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const packs = Object.values(PACK_CATALOG).map(p => ({
    ...p,
    // Add calculated prorata for current date
    prorataExample: {
      ratio: Math.round(calculateRemainingRatio(getMonthEnd(new Date()).toISOString()) * 100),
      note: 'Prorata basé sur aujourd\'hui jusqu\'à fin de mois'
    }
  }));
  
  return sendJson(res, 200, { packs, total: packs.length });
}

/**
 * POST /internal/orgs/:orgId/credits - Ajouter des crédits
 * Body: { sms?: number, email?: number, ai?: number, type: "gift"|"pack", label?: string, packCode?: string }
 * 
 * NEW SYSTEM:
 * - type="gift" => Crédits offerts mensuels (ajoutés à subscriptionCredits.smsGiftMonthly/emailGiftMonthly/aiGiftMonthly)
 *   => Expire à la fin du mois calendaire
 * - type="pack" => Crédits pack persistants (ajoutés à packWallet.smsRemaining/emailRemaining/aiRemaining)
 *   => Persiste jusqu'à consommation mais nécessite abonnement actif
 */
async function handleAddCredits(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  // Support both 'source' and 'type' for backward compatibility
  const { sms = 0, email = 0, ai = 0, type, source, label = '', packCode = null } = body;
  const creditType = type || source || 'gift';
  
  // Validate packCode if provided
  if (creditType === 'pack' && packCode && !PACK_CATALOG[packCode]) {
    const validCodes = Object.keys(PACK_CATALOG).join(', ');
    return sendJson(res, 400, { 
      error: `Pack inconnu: ${packCode}. Packs valides: ${validCodes}` 
    });
  }
  
  // Determine SMS/Email/AI amounts
  let finalSms = sms;
  let finalEmail = email;
  let finalAi = ai;
  
  if (packCode && PACK_CATALOG[packCode]) {
    const pack = PACK_CATALOG[packCode];
    finalSms = pack.smsMonthly;
    finalEmail = pack.emailMonthly;
    finalAi = pack.aiMonthly || 0;
  }
  
  if (finalSms === 0 && finalEmail === 0 && finalAi === 0) {
    return sendJson(res, 400, { error: 'Spécifier au moins sms, email ou ai > 0, ou un packCode' });
  }
  
  if (!['gift', 'pack'].includes(creditType)) {
    return sendJson(res, 400, { error: 'type doit être "gift" ou "pack"' });
  }
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    
    // Ensure current period and migrate if needed
    ensureOrgBilling(org);
    ensureCurrentPeriod(data, org, false);
    
    let message = '';
    
    if (creditType === 'gift') {
      // GIFT: Add to monthly subscription credits (expires at month end)
      org.subscriptionCredits.smsGiftMonthly += finalSms;
      org.subscriptionCredits.emailGiftMonthly += finalEmail;
      org.subscriptionCredits.aiGiftMonthly = (org.subscriptionCredits.aiGiftMonthly || 0) + finalAi;
      
      const parts = [];
      if (finalSms > 0) parts.push(`+${finalSms} SMS`);
      if (finalEmail > 0) parts.push(`+${finalEmail} Email`);
      if (finalAi > 0) parts.push(`+${finalAi} IA`);
      
      message = `Crédits offerts ajoutés: ${parts.join(', ')}. `;
      message += `Expire le ${new Date(org.billing.periodEnd).toLocaleDateString('fr-FR')}`;
      
      console.log(`[BILLING] 🎁 Gift credits added to org ${orgId}: ${parts.join(', ')}`);
      
    } else {
      // PACK: Add to persistent pack wallet (no expiration)
      org.packWallet.smsRemaining += finalSms;
      org.packWallet.emailRemaining += finalEmail;
      org.packWallet.aiRemaining = (org.packWallet.aiRemaining || 0) + finalAi;
      
      const parts = [];
      if (finalSms > 0) parts.push(`+${finalSms} SMS`);
      if (finalEmail > 0) parts.push(`+${finalEmail} Email`);
      if (finalAi > 0) parts.push(`+${finalAi} IA`);
      
      if (packCode && PACK_CATALOG[packCode]) {
        const pack = PACK_CATALOG[packCode];
        message = `Pack ${pack.name} ajouté: ${parts.join(', ')}. `;
        message += `Ces crédits persistent jusqu'à consommation.`;
      } else {
        message = `Pack ajouté: ${parts.join(', ')}. `;
        message += `Ces crédits persistent jusqu'à consommation.`;
      }
      
      console.log(`[BILLING] 📦 Pack credits added to org ${orgId}: ${parts.join(', ')} (persistent)`);
    }
    
    org.updatedAt = nowISO();
    
    // Update org in data array
    const orgIndex = data.orgs.findIndex(o => o.id === orgId);
    if (orgIndex >= 0) {
      data.orgs[orgIndex] = org;
    }
    
    saveData(data);
    
    // Get updated totals
    const remaining = getTotalRemaining(org);
    
    // P1.4: Log internal add credits
    logger.logInternalAction('INTERNAL_ADD_CREDITS', req, {
      orgId,
      status: 200,
      creditType,
      smsDelta: finalSms,
      emailDelta: finalEmail,
      aiDelta: finalAi,
      packCode: packCode || null,
      message: 'Credits added successfully'
    });
    
    return sendJson(res, 200, { 
      org: sanitizeOrg(enrichOrg(data, org)),
      added: {
        type: creditType,
        sms: finalSms,
        email: finalEmail,
        packCode: packCode || null,
        label: label || null
      },
      remaining: {
        subscription: remaining.subscription,
        pack: remaining.pack,
        total: { sms: remaining.sms, email: remaining.email }
      },
      expiresAt: creditType === 'gift' ? org.billing.periodEnd : null,
      message
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * POST /internal/orgs/:orgId/status - Changer le statut
 * 
 * Comportement selon le statut:
 * - active: envois autorisés, crédits utilisables
 * - suspended: envois bloqués, crédits CONSERVÉS jusqu'à résolution
 *   (lors du renouvellement: subscription expire, packs conservés)
 * - cancelled: envois bloqués, TOUS les crédits perdus (subscription + packs)
 */
async function handleChangeStatus(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { status, confirmLossCredits = false } = body;
  const validStatuses = ['active', 'suspended', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return sendJson(res, 400, { error: `Statut invalide. Valeurs: ${validStatuses.join(', ')}` });
  }
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    const oldStatus = org.status;
    
    // Ensure current period for credit calculation
    ensureCurrentPeriod(data, org, false);
    
    // Check if this change will cause credit loss (ONLY for cancelled)
    let creditsLost = null;
    const totalBefore = getTotalRemaining(org);
    
    // CANCELLED: Perte totale des crédits (subscription + packs)
    if (status === 'cancelled' && oldStatus !== 'cancelled') {
      // If there are credits and no confirmation, warn
      if ((totalBefore.sms > 0 || totalBefore.email > 0) && !confirmLossCredits) {
        return sendJson(res, 400, {
          error: 'CREDITS_WILL_BE_LOST',
          message: `Attention: ${totalBefore.sms} SMS et ${totalBefore.email} Email seront DÉFINITIVEMENT perdus. Envoyez confirmLossCredits: true pour confirmer.`,
          creditsAtRisk: {
            subscription: totalBefore.subscription,
            pack: totalBefore.pack,
            total: { sms: totalBefore.sms, email: totalBefore.email }
          }
        });
      }
      
      // Clear all credits (subscription + packs)
      creditsLost = clearAllCredits(org);
      console.log(`[BILLING] ❌ Org ${org.id} CANCELLED - all credits lost`);
    }
    
    // SUSPENDED: Crédits conservés, envois bloqués
    // Note: les crédits subscription expireront normalement au renouvellement,
    // les packs seront conservés jusqu'à réactivation ou annulation
    if (status === 'suspended' && oldStatus === 'active') {
      console.log(`[BILLING] ⏸️ Org ${org.id} SUSPENDED - credits preserved but sends blocked`);
      console.log(`[BILLING]    Subscription: ${totalBefore.subscription.sms} SMS, ${totalBefore.subscription.email} Email`);
      console.log(`[BILLING]    Packs: ${totalBefore.pack.sms} SMS, ${totalBefore.pack.email} Email`);
    }
    
    org.status = status;
    org.updatedAt = nowISO();
    
    // Persist status change
    const repos = storage.getRepos();
    let responseOrg = org; // For the response
    
    if (repos) {
      // SQLite mode: persist via repository
      repos.org.update(orgId, { status });
      // Reload fresh org from DB for accurate response
      const freshOrg = repos.org.getById(orgId);
      if (freshOrg) {
        responseOrg = freshOrg;
      }
    } else {
      // Legacy JSON mode
      const orgIndex = data.orgs.findIndex(o => o.id === orgId);
      if (orgIndex >= 0) {
        data.orgs[orgIndex] = org;
      }
      saveData(data);
    }
    
    // P1.4: Log org status change
    logger.logInternalAction('INTERNAL_ORG_STATUS_CHANGE', req, {
      orgId,
      status: 200,
      oldStatus,
      newStatus: status,
      creditsLost: creditsLost ? true : false,
      message: 'Org status changed successfully'
    });
    
    // Build response message based on new status
    let message = '';
    if (status === 'suspended') {
      message = 'Abonnement suspendu. Les crédits sont conservés mais les envois sont bloqués. ' +
                'Au prochain renouvellement, les crédits abonnement expireront mais les packs seront conservés.';
    } else if (status === 'cancelled') {
      message = 'Abonnement annulé. Tous les crédits (abonnement + packs) ont été perdus.';
    } else if (status === 'active') {
      message = 'Abonnement réactivé. Les envois sont à nouveau autorisés.';
    }
    
    return sendJson(res, 200, { 
      org: sanitizeOrg(enrichOrg(data, responseOrg)), 
      previousStatus: oldStatus,
      message,
      creditsLost: creditsLost ? {
        subscription: creditsLost.lostSubscription,
        pack: creditsLost.lostPack
      } : null,
      creditsPreserved: status === 'suspended' ? totalBefore : null
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * POST /internal/orgs/:orgId/simulate-usage - Simuler envoi SMS/Email (pour tests)
 * Body: { type: "sms"|"email", qty?: number }
 */
async function handleSimulateUsage(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { type = 'sms', qty = 1 } = body;
  
  if (!['sms', 'email'].includes(type)) {
    return sendJson(res, 400, { error: 'type doit être "sms" ou "email"' });
  }
  
  const count = Math.min(Math.max(1, parseInt(qty) || 1), 100); // Max 100 à la fois
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    
    // Ensure period and allocations
    ensureOrgBilling(org);
    ensureCurrentPeriod(data, org, false);
    
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < count; i++) {
      const result = recordUsageAndDebit(data, org, type, {
        simulated: true,
        source: 'admin_test',
        testBatch: i + 1
      });
      
      results.push({
        index: i + 1,
        success: result.success,
        allocationId: result.entry?.meta?.allocationId,
        reason: result.reason
      });
      
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        break; // Stop on first failure
      }
    }
    
    // Update org in data
    const orgIndex = data.orgs.findIndex(o => o.id === orgId);
    if (orgIndex >= 0) {
      data.orgs[orgIndex] = org;
    }
    
    saveData(data);
    
    // Return updated billing computed
    const billingComputed = calculateBillingComputed(data, org);
    
    console.log('[REPUTY][INTERNAL] Simulated usage:', orgId, type, '- Success:', successCount, 'Fail:', failCount);
    
    return sendJson(res, 200, {
      type,
      requested: count,
      successCount,
      failCount,
      results,
      billingComputed
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * GET /internal/orgs/:orgId/usage - Historique d'usage
 */
function handleGetOrgUsage(req, res, orgId, urlParams) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  try {
    getOrgOrThrow(data, orgId); // Verify org exists
    
    // Parse range param (default 30d)
    const range = urlParams.get('range') || '30d';
    const days = parseInt(range) || 30;
    const limit = parseInt(urlParams.get('limit')) || 200;
    
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();
    
    // Tous les events sur la période
    const allEntries = (data.usageLedger || [])
      .filter(e => e.orgId === orgId && e.ts >= sinceISO)
      .sort((a, b) => b.ts?.localeCompare(a.ts));
    
    // Limiter pour la réponse
    const entries = allEntries.slice(0, limit);
    
    // Summary sur TOUTES les entrées de la période
    const summary = {
      sms: allEntries.filter(e => e.type === 'sms').reduce((sum, e) => sum + (e.qty || 0), 0),
      email: allEntries.filter(e => e.type === 'email').reduce((sum, e) => sum + (e.qty || 0), 0)
    };
    
    return sendJson(res, 200, { 
      entries, 
      summary, 
      range: `${days}d`,
      total: allEntries.length,
      limited: allEntries.length > limit
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * GET /internal/orgs/:orgId/telemetry - Logs telemetry
 */
function handleGetOrgTelemetry(req, res, orgId, urlParams) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  try {
    getOrgOrThrow(data, orgId); // Verify org exists
    
    const limit = parseInt(urlParams.get('limit')) || 200;
    
    const entries = (data.telemetry || [])
      .filter(e => e.orgId === orgId)
      .sort((a, b) => b.ts?.localeCompare(a.ts))
      .slice(0, limit);
    
    return sendJson(res, 200, { entries, total: entries.length });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * POST /telemetry/extension - Log depuis l'extension (public, mais vérifie orgId)
 */
async function handleExtensionTelemetry(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { orgId, level = 'info', message, stack, version, code } = body;
  
  if (!message) {
    return sendJson(res, 400, { error: 'Message requis' });
  }
  
  const data = loadData();
  
  // Pour MVP, on accepte sans orgId strict (mode dev)
  // En prod, on vérifierait que l'org existe
  if (orgId) {
    const orgExists = data.orgs.some(o => o.id === orgId);
    if (!orgExists && data.orgs.length > 0) {
      // Log anyway but flag it
      console.warn('[REPUTY][TELEMETRY] Unknown orgId:', orgId);
    }
  }
  
  const entry = {
    id: generateId(),
    orgId: orgId || 'unknown',
    source: 'extension',
    level,
    code: code || null,
    message,
    stack: stack || null,
    version: version || null,
    ts: nowISO()
  };
  
  data.telemetry.push(entry);
  
  // Limiter la taille du telemetry (garder les 10000 derniers)
  if (data.telemetry.length > 10000) {
    data.telemetry = data.telemetry.slice(-10000);
  }
  
  saveData(data);
  
  return sendJson(res, 200, { ok: true, id: entry.id });
}

// ============ PUBLIC API (lecture seule) ============

/**
 * GET /public/org/by-key/:publicKey - Récupère info org par publicKey
 * Endpoint public (pas d'auth), retourne uniquement les infos non sensibles
 */
function handleGetOrgByPublicKey(req, res, publicKey) {
  const data = loadData();
  const org = getOrgByPublicKey(data, publicKey);
  
  if (!org) {
    return sendJson(res, 404, { error: 'Organisation non trouvée' });
  }
  
  // Retourner uniquement les infos publiques (pas de billing, balances, etc.)
  return sendJson(res, 200, {
    orgId: org.id,
    name: org.name,
    status: org.status,
    plan: org.plan.code,
    vertical: org.vertical
  });
}

// ============ AUTH ENDPOINTS ============

/**
 * Extract Google Place ID from a Google Maps/Business URL
 * Supports various URL formats:
 * - https://g.page/r/XXXXXX/review
 * - https://www.google.com/maps/place/...
 * - https://maps.google.com/?cid=XXXXX
 * @param {string} url - Google Business URL
 * @returns {string|null} - Place ID or null
 */
function extractGooglePlaceId(url) {
  if (!url) return null;
  
  try {
    // Format: https://g.page/r/XXXXX/review or https://g.page/r/XXXXX
    const gPageMatch = url.match(/g\.page\/r\/([A-Za-z0-9_-]+)/);
    if (gPageMatch) return `gpage_${gPageMatch[1]}`;
    
    // Format: cid=XXXXX (customer ID)
    const cidMatch = url.match(/[?&]cid=(\d+)/);
    if (cidMatch) return `cid_${cidMatch[1]}`;
    
    // Format: place_id=XXXXX
    const placeIdMatch = url.match(/place_id[=:]([A-Za-z0-9_-]+)/);
    if (placeIdMatch) return placeIdMatch[1];
    
    // Fallback: hash the URL to create a unique identifier
    const crypto = require('crypto');
    return `url_${crypto.createHash('sha256').update(url).digest('hex').substring(0, 16)}`;
  } catch (err) {
    logger.logError('GOOGLE_PLACE_ID_EXTRACTION_ERROR', { url, error: err.message });
    return null;
  }
}

/**
 * Check if a Google Place ID already exists (for Bronze anti-abuse)
 * @param {object} data - Data store
 * @param {string} googlePlaceId - Google Place ID
 * @returns {object|null} - Existing org or null
 */
function findOrgByGooglePlaceId(data, googlePlaceId) {
  if (!googlePlaceId) return null;
  return data.orgs.find(org => org.googlePlaceId === googlePlaceId);
}

/**
 * POST /auth/signup - Inscription client
 * Body: { email, password, orgName, vertical?, plan?, googleBusinessUrl? }
 * 
 * VERROU ANTI-ABUS BRONZE:
 * - Pour le forfait Bronze (gratuit), googleBusinessUrl est OBLIGATOIRE
 * - Un seul compte Bronze par Google Business (vérifié via google_place_id)
 * - Les forfaits payants n'ont pas cette restriction
 */
async function handleSignup(req, res) {
  const startTime = Date.now();
  const requestId = logger.extractRequestId(req);
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { 
    email, 
    password, 
    orgName, 
    vertical = 'health',
    plan = 'bronze', // Default to Bronze (free)
    googleBusinessUrl // Required for Bronze
  } = body;
  
  // Validation de base
  if (!email || !password || !orgName) {
    return sendJson(res, 400, { error: 'Email, password et orgName requis' });
  }
  
  if (password.length < 8) {
    return sendJson(res, 400, { error: 'Le mot de passe doit faire au moins 8 caractères' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return sendJson(res, 400, { error: 'Email invalide' });
  }
  
  const validVerticals = ['health', 'food', 'business'];
  if (!validVerticals.includes(vertical)) {
    return sendJson(res, 400, { error: `Vertical invalide. Valeurs: ${validVerticals.join(', ')}` });
  }
  
  const validPlans = ['bronze', 'argent', 'or', 'platinum'];
  if (!validPlans.includes(plan)) {
    return sendJson(res, 400, { error: `Plan invalide. Valeurs: ${validPlans.join(', ')}` });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // VERROU ANTI-ABUS BRONZE
  // ═══════════════════════════════════════════════════════════════
  let googlePlaceId = null;
  
  if (plan === 'bronze') {
    // Bronze REQUIRES a Google Business URL
    if (!googleBusinessUrl) {
      return sendJson(res, 400, { 
        error: 'GOOGLE_BUSINESS_REQUIRED',
        message: 'Le forfait Bronze gratuit nécessite un lien Google Business pour valider votre établissement.',
        action: 'PROVIDE_GOOGLE_BUSINESS_URL'
      });
    }
    
    // Extract Google Place ID
    googlePlaceId = extractGooglePlaceId(googleBusinessUrl);
    if (!googlePlaceId) {
      return sendJson(res, 400, { 
        error: 'INVALID_GOOGLE_BUSINESS_URL',
        message: 'Le lien Google Business fourni est invalide. Utilisez le format: https://g.page/r/XXXX/review',
        action: 'PROVIDE_VALID_GOOGLE_URL'
      });
    }
  }
  
  const data = loadData();
  
  // Check if email already exists
  if (getUserByEmail(data, email)) {
    return sendJson(res, 409, { error: 'EMAIL_ALREADY_EXISTS', message: 'Un compte existe déjà avec cet email' });
  }
  
  // VERROU: Check if Google Place ID already exists (Bronze only)
  if (plan === 'bronze' && googlePlaceId) {
    const existingOrg = findOrgByGooglePlaceId(data, googlePlaceId);
    if (existingOrg) {
      logger.logAudit('BRONZE_ANTI_ABUSE_BLOCKED', {
        email,
        googlePlaceId,
        existingOrgId: existingOrg.id,
        existingOrgName: existingOrg.name
      });
      
      return sendJson(res, 409, { 
        error: 'GOOGLE_BUSINESS_ALREADY_REGISTERED',
        message: 'Un compte gratuit existe déjà pour cet établissement. Connectez-vous ou passez à une offre payante.',
        action: 'LOGIN_OR_UPGRADE',
        hint: 'Si vous êtes le propriétaire de cet établissement, connectez-vous avec l\'email associé ou choisissez un forfait payant.'
      });
    }
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Determine plan code
  const planCode = `${vertical}_${plan === 'bronze' ? 'basic' : plan}`;
  const planDefaults = PLAN_DEFAULTS[planCode] || PLAN_DEFAULTS[`${vertical}_basic`] || {};
  
  // Determine price based on plan
  const PLAN_PRICES = { bronze: 0, argent: 5900, or: 9900, platinum: 12900 };
  const basePriceCents = PLAN_PRICES[plan] || 0;
  
  // Create org (status = pending until email verified)
  const orgId = generateId();
  const publicKey = generatePublicKey();
  
  const org = {
    id: orgId,
    publicKey,
    name: orgName,
    email: email.toLowerCase(),
    vertical,
    status: 'pending', // Will be "active" after email verification
    // Google Business (for Bronze anti-abuse)
    googlePlaceId: googlePlaceId || null,
    googleReviewsUrl: googleBusinessUrl || null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    billing: {
      provider: plan === 'bronze' ? 'none' : 'pending', // Bronze never goes through Stripe
      stripeCustomerId: null,
      gocardlessMandateId: null,
      startedAt: nowISO(),
      status: plan === 'bronze' ? 'active' : 'pending_payment',
      periodStart: null,
      periodEnd: null
    },
    plan: {
      code: planCode,
      basePriceCents,
      currency: 'EUR',
      billingCycle: 'monthly'
    },
    negotiated: {
      enabled: false,
      customPriceCents: null,
      discountPercent: null,
      notes: '',
      contractRef: null
    },
    options: {
      reviewRouting: true,
      widgetsSeo: false,
      multiLocations: false,
      prioritySupport: plan === 'platinum',
      custom: {},
      googleReviewUrl: googleBusinessUrl || null
    },
    quotas: {
      smsIncluded: planDefaults.smsIncluded ?? 0,
      emailIncluded: planDefaults.emailIncluded ?? 0,
      aiIncluded: planDefaults.aiIncluded ?? 0,
      qrIncluded: planDefaults.qrIncluded ?? 1,
      nfcIncluded: planDefaults.nfcIncluded ?? 0,
      qrScans: planDefaults.qrScans ?? 50,
      nfcScans: planDefaults.nfcScans ?? 0
    },
    balances: {
      smsExtra: 0,
      emailExtra: 0
    }
  };
  
  // Create user
  const userId = generateId();
  const user = {
    id: userId,
    orgId,
    email: email.toLowerCase(),
    passwordHash,
    role: 'owner',
    name: orgName,
    emailVerified: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    lastLoginAt: null
  };
  
  data.orgs.push(org);
  data.users.push(user);
  
  // Create email verification
  createEmailVerification(data, email, orgId);
  
  saveData(data);
  
  // Log signup
  logger.logAuth('SIGNUP', true, req, {
    requestId,
    email,
    userId,
    orgId,
    orgName,
    vertical,
    plan,
    googlePlaceId: googlePlaceId || null,
    durationMs: Date.now() - startTime,
    status: 201
  });
  
  // Response based on plan
  const response = {
    ok: true,
    next: 'verify',
    email: email.toLowerCase(),
    plan,
    message: 'Un code de vérification a été envoyé à votre email'
  };
  
  // For paid plans, indicate they need to complete payment after verification
  if (plan !== 'bronze') {
    response.nextAfterVerify = 'payment';
    response.message = 'Un code de vérification a été envoyé. Après vérification, vous serez redirigé vers le paiement.';
  }
  
  return sendJson(res, 201, response);
}

/**
 * POST /auth/verify - Vérifier le code email
 * Body: { email, code }
 */
async function handleVerifyEmail(req, res) {
  const startTime = Date.now();
  const requestId = logger.extractRequestId(req);
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { email, code } = body;
  
  if (!email || !code) {
    return sendJson(res, 400, { error: 'Email et code requis' });
  }
  
  // Rate limiting
  const rateLimitKey = `verify:${email.toLowerCase()}`;
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return sendJson(res, 429, { 
      error: 'RATE_LIMITED', 
      message: `Trop de tentatives. Réessayez dans ${rateLimit.retryAfter} secondes.`,
      retryAfter: rateLimit.retryAfter
    });
  }
  
  const data = loadData();
  
  // Verify code
  const verifyResult = verifyEmailCode(data, email, code);
  if (!verifyResult.valid) {
    saveData(data); // Save verification attempt
    
    const errorMessages = {
      'CODE_NOT_FOUND': 'Aucun code de vérification trouvé pour cet email',
      'CODE_EXPIRED': 'Le code a expiré. Demandez un nouveau code.',
      'CODE_INVALID': 'Code invalide'
    };
    
    // P1.4: Log verify failed
    logger.logAuth('VERIFY_FAILED', false, req, {
      requestId,
      email,
      durationMs: Date.now() - startTime,
      status: 400,
      errorCode: verifyResult.error
    });
    
    return sendJson(res, 400, { 
      error: verifyResult.error,
      message: errorMessages[verifyResult.error] || 'Erreur de vérification'
    });
  }
  
  // Find user and mark as verified
  const user = getUserByEmail(data, email);
  if (!user) {
    return sendJson(res, 404, { error: 'USER_NOT_FOUND', message: 'Utilisateur non trouvé' });
  }
  
  user.emailVerified = true;
  user.updatedAt = nowISO();
  
  // Activate org
  const org = data.orgs.find(o => o.id === user.orgId);
  if (org && org.status === 'pending') {
    org.status = 'active';
    org.updatedAt = nowISO();
    
    // Initialize billing period
    const period = computePeriod(new Date(), org.billing.startedAt || org.createdAt);
    org.billing.periodStart = period.periodStart;
    org.billing.periodEnd = period.periodEnd;
    
    // Ensure credits are initialized
    ensureCurrentPeriod(data, org, false);
  }
  
  // Create session
  const session = createSession(data, user.id, user.orgId);
  
  saveData(data);
  
  // Send welcome email
  const emailTemplates = require('./emails/templates');
  const welcomeEmail = emailTemplates.getWelcomeEmailTemplate({
    orgName: org?.name || 'Client',
    email: user.email,
    publicKey: org?.publicKey || 'N/A'
  });
  sendEmail(data, user.email, welcomeEmail.subject, welcomeEmail.text, welcomeEmail.html);
  saveData(data);
  
  // P1.4: Log verify success
  logger.logAuth('VERIFY_SUCCESS', true, req, {
    requestId,
    email,
    userId: user.id,
    orgId: user.orgId,
    durationMs: Date.now() - startTime,
    status: 200,
    orgActivated: org?.status === 'active'
  });
  
  return sendJson(res, 200, {
    ok: true,
    token: session.token,
    orgId: user.orgId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    }
  });
}

/**
 * POST /auth/resend-code - Renvoyer le code de vérification
 * Body: { email }
 */
async function handleResendCode(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { email } = body;
  
  if (!email) {
    return sendJson(res, 400, { error: 'Email requis' });
  }
  
  // Rate limiting
  const rateLimitKey = `resend:${email.toLowerCase()}`;
  const rateLimit = checkRateLimit(rateLimitKey, 3); // Max 3 resends per window
  if (!rateLimit.allowed) {
    return sendJson(res, 429, { 
      error: 'RATE_LIMITED', 
      message: `Trop de demandes. Réessayez dans ${rateLimit.retryAfter} secondes.`,
      retryAfter: rateLimit.retryAfter
    });
  }
  
  const data = loadData();
  
  const user = getUserByEmail(data, email);
  if (!user) {
    // Don't reveal if email exists or not
    return sendJson(res, 200, { ok: true, message: 'Si cet email existe, un nouveau code a été envoyé.' });
  }
  
  if (user.emailVerified) {
    return sendJson(res, 400, { error: 'EMAIL_ALREADY_VERIFIED', message: 'Cet email est déjà vérifié' });
  }
  
  // Create new verification
  createEmailVerification(data, email, user.orgId);
  
  saveData(data);
  
  return sendJson(res, 200, { ok: true, message: 'Un nouveau code a été envoyé.' });
}

/**
 * POST /auth/login - Connexion client
 * Body: { email, password }
 */
async function handleLogin(req, res) {
  const startTime = Date.now();
  const requestId = logger.extractRequestId(req);
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const { email, password } = body;
  
  if (!email || !password) {
    return sendJson(res, 400, { error: 'Email et password requis' });
  }
  
  // Rate limiting
  const rateLimitKey = `login:${email.toLowerCase()}`;
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return sendJson(res, 429, { 
      error: 'RATE_LIMITED', 
      message: `Trop de tentatives. Réessayez dans ${rateLimit.retryAfter} secondes.`,
      retryAfter: rateLimit.retryAfter
    });
  }
  
  const data = loadData();
  
  const user = getUserByEmail(data, email);
  if (!user) {
    // P1.4: Log failed login (user not found)
    logger.logAuth('LOGIN_FAILED', false, req, {
      requestId,
      email,
      durationMs: Date.now() - startTime,
      status: 401,
      errorCode: 'INVALID_CREDENTIALS',
      reason: 'user_not_found'
    });
    return sendJson(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' });
  }
  
  // Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    // P1.4: Log failed login (wrong password)
    logger.logAuth('LOGIN_FAILED', false, req, {
      requestId,
      email,
      userId: user.id,
      durationMs: Date.now() - startTime,
      status: 401,
      errorCode: 'INVALID_CREDENTIALS',
      reason: 'wrong_password'
    });
    return sendJson(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' });
  }
  
  // Check email verified
  if (!user.emailVerified) {
    // P1.4: Log failed login (email not verified)
    logger.logAuth('LOGIN_FAILED', false, req, {
      requestId,
      email,
      userId: user.id,
      durationMs: Date.now() - startTime,
      status: 403,
      errorCode: 'EMAIL_NOT_VERIFIED',
      reason: 'email_not_verified'
    });
    return sendJson(res, 403, { 
      error: 'EMAIL_NOT_VERIFIED', 
      message: 'Veuillez d\'abord vérifier votre email',
      email: user.email
    });
  }
  
  // Check org status
  const org = data.orgs.find(o => o.id === user.orgId);
  if (org && org.status === 'cancelled') {
    // P1.4: Log failed login (org cancelled)
    logger.logAuth('LOGIN_FAILED', false, req, {
      requestId,
      email,
      userId: user.id,
      orgId: user.orgId,
      durationMs: Date.now() - startTime,
      status: 403,
      errorCode: 'ORG_CANCELLED',
      reason: 'org_cancelled'
    });
    return sendJson(res, 403, { 
      error: 'ORG_CANCELLED', 
      message: 'Votre compte a été annulé. Contactez le support.'
    });
  }
  
  // Update last login
  user.lastLoginAt = nowISO();
  
  // Create session - use repository in SQLite mode
  let session;
  const repos = storage.getRepos();
  if (repos && repos.session) {
    // SQLite mode: use session repository
    session = repos.session.createSession(user.id, user.orgId);
    // Update user last login in SQLite
    repos.user.updateLastLogin(user.id);
  } else {
    // Legacy JSON mode
    session = createSession(data, user.id, user.orgId);
    saveData(data);
  }
  
  // P1.4: Log successful login
  logger.logAuth('LOGIN_SUCCESS', true, req, {
    requestId,
    email,
    userId: user.id,
    orgId: user.orgId,
    durationMs: Date.now() - startTime,
    status: 200
  });
  
  return sendJson(res, 200, {
    ok: true,
    token: session.token,
    orgId: user.orgId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    }
  });
}

/**
 * POST /auth/logout - Déconnexion
 */
async function handleLogout(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 200, { ok: true }); // Already logged out
  }
  
  // Remove session - use repository in SQLite mode
  const repos = storage.getRepos();
  if (repos && repos.session) {
    repos.session.deleteSession(auth.session.token);
  } else {
    // Legacy JSON mode
    const sessionIndex = data.sessions.findIndex(s => s.token === auth.session.token);
    if (sessionIndex >= 0) {
      data.sessions.splice(sessionIndex, 1);
    }
    saveData(data);
  }
  
  return sendJson(res, 200, { ok: true });
}

/**
 * GET /me - Get current user
 */
function handleGetMe(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }
  
  const { user } = auth;
  const org = data.orgs.find(o => o.id === user.orgId);
  
  return sendJson(res, 200, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    },
    org: org ? {
      id: org.id,
      name: org.name,
      status: org.status,
      publicKey: org.publicKey,
      plan: org.plan.code,
      vertical: org.vertical
    } : null
  });
}

// ============ CLIENT DASHBOARD ENDPOINTS ============

/**
 * GET /client/org - Get client's organization details
 * Requires auth
 */
function handleClientGetOrg(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }
  
  const org = data.orgs.find(o => o.id === auth.user.orgId);
  if (!org) {
    return sendJson(res, 404, { error: 'ORG_NOT_FOUND', message: 'Organisation non trouvée' });
  }
  
  // Enrich org with credits computed
  const enrichedOrg = enrichOrg(data, org);
  
  return sendJson(res, 200, {
    org: {
      id: enrichedOrg.id,
      name: enrichedOrg.name,
      email: enrichedOrg.email,
      status: enrichedOrg.status,
      publicKey: enrichedOrg.publicKey,
      vertical: enrichedOrg.vertical,
      plan: enrichedOrg.plan,
      options: enrichedOrg.options,
      createdAt: enrichedOrg.createdAt,
      // Credits info
      creditsComputed: enrichedOrg.creditsComputed,
      billingComputed: enrichedOrg.billingComputed
    }
  });
}

/**
 * GET /client/usage - Get client's usage
 * Requires auth
 */
function handleClientGetUsage(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }
  
  const org = data.orgs.find(o => o.id === auth.user.orgId);
  if (!org) {
    return sendJson(res, 404, { error: 'ORG_NOT_FOUND', message: 'Organisation non trouvée' });
  }
  
  // Get period
  ensureCurrentPeriod(data, org, false);
  const periodStart = org.billing?.periodStart;
  const periodEnd = org.billing?.periodEnd;
  
  // Get usage entries for current period
  const periodStartDate = periodStart ? new Date(periodStart) : new Date(0);
  const periodEndDate = periodEnd ? new Date(periodEnd) : new Date();
  
  const usageEntries = (data.usageLedger || [])
    .filter(e => e.orgId === auth.user.orgId)
    .filter(e => {
      const ts = new Date(e.ts);
      return ts >= periodStartDate && ts <= periodEndDate;
    })
    .sort((a, b) => b.ts?.localeCompare(a.ts))
    .slice(0, 100); // Last 100 entries
  
  // Calculate totals
  const usage = {
    sms: usageEntries.filter(e => e.type === 'sms').reduce((sum, e) => sum + (e.qty || 0), 0),
    email: usageEntries.filter(e => e.type === 'email').reduce((sum, e) => sum + (e.qty || 0), 0)
  };
  
  // Enrich org for credits
  const enrichedOrg = enrichOrg(data, org);
  
  return sendJson(res, 200, {
    period: {
      start: periodStart,
      end: periodEnd
    },
    usage,
    credits: enrichedOrg.creditsComputed,
    recentActivity: usageEntries.slice(0, 20).map(e => ({
      id: e.id,
      type: e.type,
      qty: e.qty,
      ts: e.ts,
      meta: {
        patientName: e.meta?.patientName,
        channel: e.meta?.channel
      }
    }))
  });
}

/**
 * GET /client/settings - Get client's settings
 */
function handleClientGetSettings(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }
  
  const org = data.orgs.find(o => o.id === auth.user.orgId);
  if (!org) {
    return sendJson(res, 404, { error: 'ORG_NOT_FOUND', message: 'Organisation non trouvée' });
  }
  
  // Get org-specific settings from global settings
  const settings = getSettings();
  
  return sendJson(res, 200, {
    reviewRouting: org.options?.reviewRouting ?? settings.reviewRouting,
    googleReviewUrl: settings.googleReviewUrl, // TODO: per-org settings
    cabinetName: org.name
  });
}

// ============ CLIENT INSTALLATIONS ENDPOINTS ============

/**
 * GET /client/installations - List installations for authenticated org
 */
function handleClientListInstallations(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    // Fallback for non-SQLite mode
    return sendJson(res, 200, { installations: [] });
  }
  
  const installations = repos.installation.getByOrgId(auth.user.orgId);
  
  return sendJson(res, 200, {
    ok: true,
    installations: installations.map(i => ({
      id: i.id,
      label: i.label,
      tokenMasked: i.tokenMasked,
      createdAt: i.createdAt,
      lastSeenAt: i.lastSeenAt,
      status: i.status
    }))
  });
}

/**
 * POST /client/installations - Create new installation
 * Returns token in cleartext ONLY HERE
 */
async function handleClientCreateInstallation(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 501, { 
      ok: false,
      errorCategory: 'SERVICE_UNAVAILABLE',
      errorCode: 'NOT_IMPLEMENTED',
      message: 'Fonctionnalité non disponible',
      action: 'RETRY_LATER'
    });
  }
  
  try {
    const body = await parseBody(req);
    const label = body.label || 'Nouvelle installation';
    const metadata = body.metadata || {};
    
    const result = repos.installation.create(auth.user.orgId, label, metadata);
    
    console.log(`[REPUTY][INSTALLATION] Created installation ${result.installation.id} for org ${auth.user.orgId}`);
    
    // Return token in cleartext ONLY HERE
    return sendJson(res, 201, {
      ok: true,
      installation: {
        id: result.installation.id,
        label: result.installation.label,
        tokenMasked: result.installation.tokenMasked,
        createdAt: result.installation.createdAt
      },
      token: result.token, // CLEARTEXT - shown only once!
      warning: "Copiez ce token maintenant, il ne sera plus affiché."
    });
  } catch (err) {
    console.error('[REPUTY][INSTALLATION] Create error:', err);
    return sendJson(res, 500, { 
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'INTERNAL_ERROR',
      message: 'Erreur lors de la création',
      action: 'RETRY'
    });
  }
}

/**
 * POST /client/installations/:id/revoke - Revoke an installation
 */
async function handleClientRevokeInstallation(req, res, installationId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 501, { 
      ok: false,
      errorCategory: 'SERVICE_UNAVAILABLE',
      errorCode: 'NOT_IMPLEMENTED',
      message: 'Fonctionnalité non disponible',
      action: 'RETRY_LATER'
    });
  }
  
  // Verify the installation belongs to the user's org
  const installation = repos.installation.getById(installationId);
  if (!installation || installation.orgId !== auth.user.orgId) {
    return sendJson(res, 404, { 
      ok: false,
      errorCategory: 'NOT_FOUND',
      errorCode: 'NOT_FOUND',
      message: 'Installation introuvable',
      action: 'CHECK_URL'
    });
  }
  
  if (installation.revokedAt) {
    return sendJson(res, 409, { 
      ok: false,
      errorCategory: 'ALREADY_EXISTS',
      errorCode: 'ALREADY_REVOKED',
      message: 'Cette installation est déjà révoquée',
      action: 'UPDATE'
    });
  }
  
  const success = repos.installation.revoke(installationId);
  
  if (success) {
    logger.logAudit('INSTALLATION_REVOKED', 'Installation revoked', {
      route: '/client/installations/:id/revoke',
      method: 'POST',
      status: 200,
      actor: 'client',
      userId: auth.user.id,
      orgId: auth.user.orgId,
      installationId: installationId
    });
    return sendJson(res, 200, { ok: true, message: 'Installation révoquée' });
  } else {
    return sendJson(res, 500, { 
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'REVOKE_FAILED',
      message: 'Échec de la révocation',
      action: 'RETRY'
    });
  }
}

/**
 * POST /client/installations/:id/rotate - Rotate installation token
 * Returns new token in cleartext ONLY HERE
 */
async function handleClientRotateInstallation(req, res, installationId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 501, { 
      ok: false,
      errorCategory: 'SERVICE_UNAVAILABLE',
      errorCode: 'NOT_IMPLEMENTED',
      message: 'Fonctionnalité non disponible',
      action: 'RETRY_LATER'
    });
  }
  
  // Verify the installation belongs to the user's org
  const installation = repos.installation.getById(installationId);
  if (!installation || installation.orgId !== auth.user.orgId) {
    return sendJson(res, 404, { 
      ok: false,
      errorCategory: 'NOT_FOUND',
      errorCode: 'NOT_FOUND',
      message: 'Installation introuvable',
      action: 'CHECK_URL'
    });
  }
  
  if (installation.revokedAt) {
    return sendJson(res, 409, { 
      ok: false,
      errorCategory: 'INSTALLATION_REVOKED',
      errorCode: 'ALREADY_REVOKED',
      message: 'Cette installation est révoquée et ne peut pas être régénérée',
      action: 'NEW_INSTALLATION'
    });
  }
  
  const result = repos.installation.rotateToken(installationId);
  
  if (result) {
    // Log avec logger structuré (JAMAIS le token en clair)
    logger.logAudit('INSTALLATION_TOKEN_ROTATED', 'Installation token rotated', {
      route: '/client/installations/:id/rotate',
      method: 'POST',
      status: 200,
      actor: 'client',
      userId: auth.user.id,
      orgId: auth.user.orgId,
      installationId: installationId,
      installationLabel: result.installation.label
      // ⚠️ JAMAIS le token en clair ici
    });
    
    // Return new token in cleartext ONLY HERE
    return sendJson(res, 200, {
      ok: true,
      installation: {
        id: result.installation.id,
        label: result.installation.label,
        tokenMasked: result.installation.tokenMasked,
        createdAt: result.installation.createdAt
      },
      token: result.token, // CLEARTEXT - shown only once!
      warning: "Copiez ce nouveau token maintenant, il ne sera plus affiché."
    });
  } else {
    return sendJson(res, 500, { 
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'ROTATE_FAILED',
      message: 'Échec de la régénération du token',
      action: 'RETRY'
    });
  }
}

// ============ CLIENT SHORTLINKS ENDPOINTS ============

/**
 * GET /client/shortlinks - List shortlinks for authenticated org
 */
function handleClientListShortlinks(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 200, { shortlinks: [], stats: { totalQr: 0, totalNfc: 0, totalClicks: 0 } });
  }
  
  const shortlinks = repos.shortlink.getByOrgId(auth.user.orgId);
  const stats = repos.shortlink.getStatsByOrgId(auth.user.orgId);
  
  return sendJson(res, 200, {
    ok: true,
    shortlinks: shortlinks.map(s => ({
      code: s.code,
      type: s.type,
      label: s.label,
      targetUrl: s.targetUrl,
      shortUrl: repos.shortlink.buildShortUrl(s.code, REVIEWS_BASE_URL),
      clicks: s.clicks,
      createdAt: s.createdAt,
      lastClickedAt: s.lastClickedAt
    })),
    stats
  });
}

/**
 * POST /client/shortlinks - Create new shortlink (QR or NFC)
 */
async function handleClientCreateShortlink(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  // STATE MACHINE GUARD: Check if org can create shortlinks
  const accessCheck = stateMachine.canPerformAction(auth.org, 'createShortlink');
  if (!accessCheck.allowed) {
    return sendJson(res, 403, {
      ok: false,
      errorCategory: accessCheck.error?.errorCategory || 'SUBSCRIPTION_RESTRICTED',
      errorCode: accessCheck.error?.errorCode || 'FEATURE_BLOCKED',
      message: accessCheck.error?.message || 'Fonctionnalité non disponible avec votre abonnement actuel',
      action: accessCheck.error?.action || 'UPGRADE_PLAN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 501, { 
      ok: false,
      errorCategory: 'SERVICE_UNAVAILABLE',
      errorCode: 'NOT_IMPLEMENTED',
      message: 'Fonctionnalité non disponible',
      action: 'RETRY_LATER'
    });
  }
  
  try {
    const body = await parseBody(req);
    const { type, targetUrl, label } = body;
    
    // Validate type
    if (!type || !['qr', 'nfc'].includes(type)) {
      return sendJson(res, 400, { 
        ok: false,
        errorCategory: 'VALIDATION_ERROR',
        errorCode: 'INVALID_TYPE',
        message: 'Type invalide (qr ou nfc)',
        action: 'FIX_INPUT',
        field: 'type'
      });
    }
    
    // Validate targetUrl
    if (!targetUrl) {
      return sendJson(res, 400, { 
        ok: false,
        errorCategory: 'MISSING_FIELD',
        errorCode: 'MISSING_TARGET_URL',
        message: 'URL de destination requise',
        action: 'FIX_INPUT',
        field: 'targetUrl'
      });
    }
    
    // Check and consume quota for QR/NFC creation
    const org = data.orgs.find(o => o.id === auth.user.orgId);
    if (!org) {
      return sendJson(res, 404, { 
        ok: false,
        errorCategory: 'ORG_NOT_FOUND',
        errorCode: 'NOT_FOUND',
        message: 'Organisation non trouvée',
        action: 'CONTACT_SUPPORT'
      });
    }
    
    // Debit 1 unit from quota (qr or nfc)
    const debitResult = debitCredits(data, org, type, 1);
    if (!debitResult.success) {
      const quotaTypeLabel = type === 'qr' ? 'QR' : 'NFC';
      const priceHint = type === 'qr' ? '5€ HT' : '15€ HT';
      return sendJson(res, 402, { 
        ok: false,
        errorCategory: debitResult.errorCategory || `QUOTA_${type.toUpperCase()}_EXCEEDED`,
        errorCode: 'QUOTA_EXCEEDED',
        message: debitResult.message || `Quota ${quotaTypeLabel} atteint. Vous pouvez acheter un crédit supplémentaire (${priceHint}).`,
        action: debitResult.action || `BUY_${type.toUpperCase()}_ADDON`,
        quotaRemaining: {
          qr: debitResult.qrRemaining || 0,
          nfc: debitResult.nfcRemaining || 0
        }
      });
    }
    
    // Save quota debit to data
    const orgIndex = data.orgs.findIndex(o => o.id === org.id);
    if (orgIndex >= 0) {
      data.orgs[orgIndex] = org;
      saveData(data);
    }
    
    const shortlink = repos.shortlink.create(auth.user.orgId, type, targetUrl, label);
    
    logger.logAudit('shortlink_created', auth.user.id, {
      orgId: auth.user.orgId,
      type: type,
      code: shortlink.code,
      debitedFrom: debitResult.debitedFrom
    });
    
    return sendJson(res, 201, {
      ok: true,
      shortlink: {
        code: shortlink.code,
        type: shortlink.type,
        label: shortlink.label,
        targetUrl: shortlink.targetUrl,
        shortUrl: repos.shortlink.buildShortUrl(shortlink.code, REVIEWS_BASE_URL),
        createdAt: shortlink.createdAt
      }
    });
  } catch (err) {
    console.error('[REPUTY][SHORTLINK] Create error:', err);
    return sendJson(res, 500, { 
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'INTERNAL_ERROR',
      message: 'Erreur lors de la création',
      action: 'RETRY'
    });
  }
}

/**
 * DELETE /client/shortlinks/:code - Delete a shortlink
 */
async function handleClientDeleteShortlink(req, res, code) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 501, { 
      ok: false,
      errorCategory: 'SERVICE_UNAVAILABLE',
      errorCode: 'NOT_IMPLEMENTED',
      message: 'Fonctionnalité non disponible',
      action: 'RETRY_LATER'
    });
  }
  
  // Verify the shortlink belongs to the user's org
  const shortlink = repos.shortlink.getByCode(code);
  if (!shortlink || shortlink.orgId !== auth.user.orgId) {
    return sendJson(res, 404, { 
      ok: false,
      errorCategory: 'NOT_FOUND',
      errorCode: 'NOT_FOUND',
      message: 'Shortlink introuvable',
      action: 'CHECK_URL'
    });
  }
  
  const success = repos.shortlink.remove(code);
  
  if (success) {
    logger.logAudit('shortlink_deleted', auth.user.id, {
      orgId: auth.user.orgId,
      code: code
    });
    return sendJson(res, 200, { ok: true, message: 'Shortlink supprimé' });
  } else {
    return sendJson(res, 500, { 
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'DELETE_FAILED',
      message: 'Échec de la suppression',
      action: 'RETRY'
    });
  }
}

/**
 * GET /client/shortlinks/:code/qr - Generate QR code image for shortlink
 * Query params: format=png|svg (default: png)
 */
async function handleClientGetShortlinkQR(req, res, code) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 501, { 
      ok: false,
      errorCategory: 'SERVICE_UNAVAILABLE',
      errorCode: 'NOT_IMPLEMENTED',
      message: 'Fonctionnalité non disponible',
      action: 'RETRY_LATER'
    });
  }
  
  // Verify the shortlink belongs to the user's org
  const shortlink = repos.shortlink.getByCode(code);
  if (!shortlink || shortlink.orgId !== auth.user.orgId) {
    return sendJson(res, 404, { 
      ok: false,
      errorCategory: 'NOT_FOUND',
      errorCode: 'NOT_FOUND',
      message: 'Shortlink introuvable',
      action: 'CHECK_URL'
    });
  }
  
  // Parse format from query string
  const urlParsed = require('url').parse(req.url, true);
  const format = (urlParsed.query.format || 'png').toLowerCase();
  
  if (!['png', 'svg'].includes(format)) {
    return sendJson(res, 400, { 
      ok: false,
      errorCategory: 'INVALID_FORMAT',
      errorCode: 'BAD_REQUEST',
      message: 'Format invalide. Utilisez png ou svg.',
      action: 'FIX_INPUT'
    });
  }
  
  try {
    const QRCode = require('qrcode');
    
    // Build the short URL to encode (not the target URL!)
    const shortUrl = repos.shortlink.buildShortUrl(code, REVIEWS_BASE_URL);
    
    if (format === 'svg') {
      // Generate SVG
      const svgString = await QRCode.toString(shortUrl, {
        type: 'svg',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      // P0.3: QR images may be embedded cross-site
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `inline; filename="qr-${code}.svg"`,
        'Cache-Control': 'private, max-age=3600'
      });
      res.end(svgString);
    } else {
      // Generate PNG
      const pngBuffer = await QRCode.toBuffer(shortUrl, {
        type: 'png',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      // P0.3: QR images may be embedded cross-site
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="qr-${code}.png"`,
        'Cache-Control': 'private, max-age=3600'
      });
      res.end(pngBuffer);
    }
    
    logger.logAudit('qr_generated', auth.user.id, {
      orgId: auth.user.orgId,
      code: code,
      format: format
    });
    
  } catch (err) {
    logger.logError('QR generation error:', err);
    return sendJson(res, 500, { 
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'QR_GENERATION_FAILED',
      message: 'Erreur lors de la génération du QR code',
      action: 'RETRY'
    });
  }
}

/**
 * GET /r/:code - Public shortlink redirect
 */
function handleShortlinkRedirect(req, res, code) {
  const repos = storage.getRepos();
  
  if (!repos) {
    // In non-SQLite mode, just 404
    return sendJson(res, 404, { error: 'Not found' });
  }
  
  const shortlink = repos.shortlink.getByCode(code);
  
  if (!shortlink) {
    // Return a nice 404 page
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>Lien introuvable</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>🔗 Lien introuvable</h1>
        <p>Ce lien n'existe pas ou a été supprimé.</p>
      </body>
      </html>
    `);
    return;
  }
  
  // Increment clicks counter
  repos.shortlink.incrementClicks(code);
  
  // 302 redirect to target URL
  res.writeHead(302, { 'Location': shortlink.targetUrl });
  res.end();
}

// ============================================================
// REVIEWS HANDLERS (Phase 1A)
// ============================================================

/**
 * GET /client/reviews - List reviews for authenticated org
 * Query params: status, rating, sort, order, limit, offset, search
 */
function handleClientListReviews(req, res, queryParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 200, { ok: true, reviews: [], total: 0, hasMore: false });
  }
  
  const filters = {
    status: queryParams.get('status'),
    rating: queryParams.get('rating') ? parseInt(queryParams.get('rating')) : null,
    search: queryParams.get('search')
  };
  
  const pagination = {
    sort: queryParams.get('sort') || 'reviewed_at',
    order: queryParams.get('order') || 'desc',
    limit: parseInt(queryParams.get('limit')) || 20,
    offset: parseInt(queryParams.get('offset')) || 0
  };
  
  const result = repos.review.listReviews(auth.user.orgId, filters, pagination);
  
  return sendJson(res, 200, {
    ok: true,
    reviews: result.reviews,
    total: result.total,
    hasMore: result.hasMore
  });
}

/**
 * GET /client/reviews/stats - Get review statistics for authenticated org
 * Query params: period (7d, 30d, 90d, 365d) - default: 30d
 */
function handleClientReviewStats(req, res, queryParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  // Get period from query params (default: 30d)
  const period = queryParams?.get('period') || '30d';
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 200, { 
      ok: true, 
      stats: {
        period,
        totalAllTime: 0,
        avgRatingAllTime: 0,
        totalPeriod: 0,
        avgRatingPeriod: 0,
        pendingCount: 0,
        repliedCountPeriod: 0,
        responseRatePeriod: 0,
        avgResponseTimeHours: null,
        reviewsDeltaPct: null,
        avgRatingDelta: null,
        responseRateDeltaPct: null,
        starDistributionPeriod: [
          { stars: 5, count: 0, percentage: 0 },
          { stars: 4, count: 0, percentage: 0 },
          { stars: 3, count: 0, percentage: 0 },
          { stars: 2, count: 0, percentage: 0 },
          { stars: 1, count: 0, percentage: 0 }
        ],
        // Legacy fields
        total: 0,
        avgRating: 0,
        repliedCount: 0,
        ignoredCount: 0,
        responseRate: 0,
        reviews30Days: 0,
        starDistribution: [
          { stars: 5, count: 0, percentage: 0 },
          { stars: 4, count: 0, percentage: 0 },
          { stars: 3, count: 0, percentage: 0 },
          { stars: 2, count: 0, percentage: 0 },
          { stars: 1, count: 0, percentage: 0 }
        ]
      }
    });
  }
  
  const stats = repos.review.getStats(auth.user.orgId, period);
  
  return sendJson(res, 200, {
    ok: true,
    stats
  });
}

/**
 * GET /client/reviews/analytics - Get review analytics time series
 * Query params: period (7d, 30d, 90d, 365d), groupBy (day, week, month)
 */
function handleClientReviewAnalytics(req, res, queryParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 200, { ok: true, analytics: { series: [] } });
  }
  
  const period = queryParams.get('period') || '30d';
  const groupBy = queryParams.get('groupBy') || 'day';
  
  const analytics = repos.review.getAnalytics(auth.user.orgId, period, groupBy);
  
  return sendJson(res, 200, {
    ok: true,
    analytics
  });
}

/**
 * GET /client/reviews/:id - Get single review by ID
 */
function handleClientGetReview(req, res, reviewId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 404, { ok: false, error: 'Review not found' });
  }
  
  const review = repos.review.getById(auth.user.orgId, reviewId);
  
  if (!review) {
    return sendJson(res, 404, { ok: false, error: 'Review not found' });
  }
  
  return sendJson(res, 200, {
    ok: true,
    review
  });
}

/**
 * POST /client/reviews/:id/reply - Submit reply to a review (idempotent)
 * Body: { replyText: string }
 * Sets reply_status to 'queued' for async processing
 */
async function handleClientReplyReview(req, res, reviewId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 404, { ok: false, error: 'Review not found' });
  }
  
  // Check review exists and belongs to org
  const existing = repos.review.getById(auth.user.orgId, reviewId);
  if (!existing) {
    return sendJson(res, 404, { ok: false, error: 'Review not found' });
  }
  
  // Parse body
  const body = await parseJsonBody(req);
  
  if (!body.replyText || typeof body.replyText !== 'string' || !body.replyText.trim()) {
    return sendJson(res, 400, { 
      ok: false, 
      errorCategory: 'VALIDATION_ERROR',
      errorCode: 'MISSING_REPLY_TEXT',
      message: 'Le texte de réponse est requis',
      action: 'PROVIDE_REPLY_TEXT'
    });
  }
  
  // Idempotence: if already queued or sent, return existing
  if (['queued', 'sent'].includes(existing.replyStatus)) {
    return sendJson(res, 200, {
      ok: true,
      review: existing,
      message: 'Reply already queued or sent'
    });
  }
  
  // Update reply with status 'queued' (will be processed async)
  const updated = repos.review.updateReply(auth.user.orgId, reviewId, {
    replyText: body.replyText.trim(),
    replyStatus: 'queued',
    replyError: null
  });
  
  // Log for audit
  logger.logAudit('REVIEW_REPLY_QUEUED', {
    reviewId,
    orgId: auth.user.orgId,
    userId: auth.user.id,
    replyLength: body.replyText.length
  });
  
  return sendJson(res, 200, {
    ok: true,
    review: updated,
    message: 'Reply queued for processing'
  });
}

/**
 * POST /client/reviews/:id/status - Update review status
 * Body: { status: 'pending' | 'replied' | 'ignored' }
 */
async function handleClientUpdateReviewStatus(req, res, reviewId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 404, { ok: false, error: 'Review not found' });
  }
  
  const body = await parseJsonBody(req);
  
  const validStatuses = ['pending', 'replied', 'ignored'];
  if (!body.status || !validStatuses.includes(body.status)) {
    return sendJson(res, 400, { 
      ok: false, 
      errorCategory: 'VALIDATION_ERROR',
      errorCode: 'INVALID_STATUS',
      message: 'Statut invalide. Valeurs acceptées: pending, replied, ignored',
      action: 'PROVIDE_VALID_STATUS'
    });
  }
  
  const updated = repos.review.updateStatus(auth.user.orgId, reviewId, body.status);
  
  if (!updated) {
    return sendJson(res, 404, { ok: false, error: 'Review not found' });
  }
  
  return sendJson(res, 200, {
    ok: true,
    review: updated
  });
}

/**
 * POST /client/reviews - Create a review (for dev/test/import)
 * Body: Review object
 */
async function handleClientCreateReview(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  // Protection dev-only: bloque en production sauf si ALLOW_DEV_SEED=1
  const allowDev = process.env.ALLOW_DEV_SEED === '1';
  const isProd = process.env.NODE_ENV === 'production';
  
  if (isProd && !allowDev) {
    console.warn('[SECURITY] Blocked dev-only reviews endpoint in production', { path: req.url });
    return sendJson(res, 403, {
      ok: false,
      error: 'Cette route est désactivée en production',
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, error: 'Storage not available' });
  }
  
  const body = await parseJsonBody(req);
  
  // Validate required fields
  if (!body.authorName) {
    return sendJson(res, 400, { ok: false, error: 'authorName is required' });
  }
  if (!body.rating || body.rating < 1 || body.rating > 5) {
    return sendJson(res, 400, { ok: false, error: 'rating must be 1-5' });
  }
  if (!body.reviewedAt) {
    return sendJson(res, 400, { ok: false, error: 'reviewedAt is required (ISO date)' });
  }
  
  try {
    const review = repos.review.create({
      ...body,
      orgId: auth.user.orgId
    });
    
    return sendJson(res, 201, {
      ok: true,
      review
    });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }
}

/**
 * POST /client/reviews/bulk - Bulk import reviews (for sync/import)
 * Body: { reviews: [...] }
 */
async function handleClientBulkImportReviews(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth) {
    return sendJson(res, 401, { 
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN'
    });
  }
  
  // Protection dev-only: bloque en production sauf si ALLOW_DEV_SEED=1
  const allowDev = process.env.ALLOW_DEV_SEED === '1';
  const isProd = process.env.NODE_ENV === 'production';
  
  if (isProd && !allowDev) {
    console.warn('[SECURITY] Blocked dev-only bulk reviews endpoint in production', { path: req.url });
    return sendJson(res, 403, {
      ok: false,
      error: 'Cette route est désactivée en production',
    });
  }
  
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, error: 'Storage not available' });
  }
  
  const body = await parseJsonBody(req);
  
  if (!body.reviews || !Array.isArray(body.reviews)) {
    return sendJson(res, 400, { ok: false, error: 'reviews array is required' });
  }
  
  if (body.reviews.length > 100) {
    return sendJson(res, 400, { ok: false, error: 'Maximum 100 reviews per request' });
  }
  
  const result = repos.review.bulkInsert(auth.user.orgId, body.reviews);
  
  logger.logAudit('REVIEWS_BULK_IMPORTED', {
    orgId: auth.user.orgId,
    userId: auth.user.id,
    inserted: result.inserted,
    skipped: result.skipped
  });
  
  return sendJson(res, 200, {
    ok: true,
    inserted: result.inserted,
    skipped: result.skipped
  });
}

// ============================================================
// BILLING HANDLERS (Étape 3)
// ============================================================

/**
 * GET /client/billing/status - Get billing status for authenticated org
 * Returns: plan, access state, dates, quotas using computeEffectiveBilling
 * 
 * NOW USES: effectiveBilling.computeEffectiveBilling() for consistent data
 */
async function handleBillingStatus(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  const repos = storage.getRepos();
  
  if (!auth || !auth.user) {
    return sendJson(res, 401, { 
      error: 'Non authentifié',
      errorCategory: 'AUTH_REQUIRED',
      action: 'LOGIN'
    });
  }
  
  let org = auth.org;
  if (!org) {
    return sendJson(res, 404, { 
      error: 'Organisation non trouvée',
      errorCategory: 'ORG_NOT_FOUND'
    });
  }
  
  // Compute effective billing (includes period rollover)
  const now = new Date();
  const billing = effectiveBilling.computeEffectiveBilling({ org, now, repos });
  
  // Refresh org after potential period rollover
  if (billing.periodRolledOver && repos) {
    org = repos.org.getById(org.id);
  }
  
  // Get current state from state machine
  const accessState = stateMachine.getCurrentState(org);
  const stateInfo = stateMachine.getStateInfo(org);
  
  // Get dunning state if applicable
  const dunningState = dunning.getDunningState(org);
  
  // Plan labels
  const planLabels = {
    health_bronze: 'Pack Bronze (Gratuit)',
    health_argent: 'Pack Argent',
    health_or: 'Pack Or',
    health_platinum: 'Pack Platinum'
  };
  
  // Billing provider info
  const orgBilling = org.billing || {};
  const hasPaymentMethod = !!(orgBilling.stripeCustomerId || orgBilling.gocardlessMandateId);
  
  return sendJson(res, 200, {
    ok: true,
    billing: {
      // Plan info from effectiveBilling
      plan: billing.planCode,
      planLabel: planLabels[billing.planCode] || billing.planName,
      planName: billing.planName,
      
      // Price info from effectiveBilling
      priceCatalogCents: billing.priceCatalogCents,
      priceEffectiveCents: billing.priceEffectiveCents,
      priceFormatted: billing.priceEffectiveFormatted,
      
      // Discount info
      hasDiscount: billing.hasDiscount,
      discount: billing.discount,
      couponInfo: billing.couponInfo,
      
      // Access state
      accessState,
      accessStateLabel: stateMachine.getStateLabel(accessState),
      isRestricted: stateInfo.isRestricted || false,
      warningMessage: stateInfo.warningMessage || null,
      blockMessage: stateInfo.blockMessage || null,
      
      // Period info from effectiveBilling (always current after rollover)
      periodStart: billing.billingPeriod.periodStart,
      periodEnd: billing.billingPeriod.periodEnd,
      periodEndFormatted: billing.periodEndFormatted,
      
      trialEnd: orgBilling.trialEnd || null,
      pastDueSince: dunningState.pastDueSince || null,
      daysPastDue: dunningState.pastDueSince ? dunning.getDaysPastDue(dunningState) : null,
      
      provider: billing.billingProvider,
      hasPaymentMethod,
      
      // Quotas from effectiveBilling (consistent with catalog)
      quotas: {
        sms: {
          included: billing.quotasEffective.smsIncluded,
          used: billing.monthlyUsed.sms,
          remaining: billing.monthlyRemaining.sms,
          packsBalance: billing.packsBalance.sms,
          totalAvailable: billing.totalAvailableThisMonth.sms
        },
        email: {
          included: billing.quotasEffective.emailIncluded,
          used: billing.monthlyUsed.email,
          remaining: billing.monthlyRemaining.email,
          packsBalance: billing.packsBalance.email,
          totalAvailable: billing.totalAvailableThisMonth.email
        },
        ai: {
          included: billing.quotasEffective.aiIncluded,
          used: billing.monthlyUsed.ai,
          remaining: billing.monthlyRemaining.ai,
          packsBalance: billing.packsBalance.ai,
          totalAvailable: billing.totalAvailableThisMonth.ai
        },
        qr: {
          included: billing.quotasEffective.qrIncluded,
          used: billing.monthlyUsed.qr,
          remaining: billing.monthlyRemaining.qr
        },
        nfc: {
          included: billing.quotasEffective.nfcIncluded,
          used: billing.monthlyUsed.nfc,
          remaining: billing.monthlyRemaining.nfc
        }
      },
      
      // Legacy compatibility fields
      quotasLegacy: {
        sms: { included: billing.quotasEffective.smsIncluded, used: billing.monthlyUsed.sms, remaining: billing.monthlyRemaining.sms },
        email: { included: billing.quotasEffective.emailIncluded, used: billing.monthlyUsed.email, remaining: billing.monthlyRemaining.email },
        ai: { included: billing.quotasEffective.aiIncluded, used: billing.monthlyUsed.ai, remaining: billing.monthlyRemaining.ai },
        qr: { included: billing.quotasEffective.qrIncluded, used: billing.monthlyUsed.qr, remaining: billing.monthlyRemaining.qr },
        nfc: { included: billing.quotasEffective.nfcIncluded, used: billing.monthlyUsed.nfc, remaining: billing.monthlyRemaining.nfc }
      }
    }
  });
}

/**
 * POST /client/billing/checkout - Create Stripe checkout session
 */
async function handleBillingCheckout(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth || !auth.user) {
    return sendJson(res, 401, { 
      error: 'Non authentifié',
      errorCategory: 'AUTH_REQUIRED',
      action: 'LOGIN'
    });
  }
  
  const org = auth.org;
  if (!org) {
    return sendJson(res, 404, { 
      error: 'Organisation non trouvée',
      errorCategory: 'ORG_NOT_FOUND'
    });
  }
  
  // Parse body
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { 
      error: 'Requête invalide',
      errorCategory: 'INVALID_REQUEST'
    });
  }
  
  const { planId, provider = 'stripe', billingDetails } = body;
  
  // Bronze is FREE and NEVER goes through Stripe
  if (planId === 'bronze') {
    return sendJson(res, 400, {
      error: 'Le forfait Bronze est gratuit et ne nécessite pas de paiement.',
      errorCategory: 'BRONZE_IS_FREE',
      action: 'USE_BRONZE_DIRECTLY'
    });
  }
  
  // Validate paid plans
  const validPaidPlans = ['argent', 'or', 'platinum'];
  if (!planId || !validPaidPlans.includes(planId)) {
    return sendJson(res, 400, {
      error: `Forfait invalide. Choisissez parmi: ${validPaidPlans.join(', ')}.`,
      errorCategory: 'INVALID_PLAN',
      action: 'SELECT_VALID_PLAN'
    });
  }
  
  // Handle SEPA (GoCardless)
  if (provider === 'gocardless' || provider === 'sepa') {
    const result = await gocardlessBilling.createMandateFlow({
      orgId: org.id,
      planId,
      billingDetails,
      successUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?success=true`,
      cancelUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?canceled=true`
    });
    
    if (result.error) {
      return sendJson(res, 400, result.error);
    }
    
    return sendJson(res, 200, { ok: true, url: result.url });
  }
  
  // Handle Stripe (default)
  const result = await stripeBilling.createCheckoutSession({
    orgId: org.id,
    planId,
    customerEmail: auth.user.email,
    customerId: org.billing?.stripeCustomerId,
    successUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?canceled=true`
  });
  
  if (result.error) {
    return sendJson(res, 400, result.error);
  }
  
  logger.logAudit('BILLING_CHECKOUT_INITIATED', {
    orgId: org.id,
    userId: auth.user.id,
    planId,
    provider
  });
  
  return sendJson(res, 200, { ok: true, url: result.url, sessionId: result.sessionId });
}

/**
 * POST /client/billing/pack/checkout - Create Stripe checkout for pack purchase (one-time)
 * 
 * Request body:
 * - packId: string (required) - Pack ID: 'ia-mini', 'ia-maxi', 'sms-150', 'sms-300', 'email-1000', 'email-2000', 'qr', 'nfc'
 * - quantity: number (optional, default 1) - Quantity of packs
 * 
 * Response:
 * - ok: boolean
 * - url: string - Stripe checkout URL
 * - sessionId: string - Stripe session ID
 */
async function handlePackCheckout(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth || !auth.user) {
    return sendJson(res, 401, { 
      error: 'Non authentifié',
      errorCategory: 'AUTH_REQUIRED',
      action: 'LOGIN'
    });
  }
  
  const org = auth.org;
  if (!org) {
    return sendJson(res, 404, { 
      error: 'Organisation non trouvée',
      errorCategory: 'ORG_NOT_FOUND'
    });
  }
  
  // Parse body
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { 
      error: 'Requête invalide',
      errorCategory: 'INVALID_REQUEST'
    });
  }
  
  const { packId, quantity = 1 } = body;
  
  // Validate pack ID
  const validPacks = ['ia-mini', 'ia-maxi', 'sms-150', 'sms-300', 'email-1000', 'email-2000', 'qr', 'nfc'];
  if (!packId || !validPacks.includes(packId)) {
    return sendJson(res, 400, {
      error: `Pack invalide. Choisissez parmi: ${validPacks.join(', ')}.`,
      errorCategory: 'INVALID_PACK',
      action: 'SELECT_VALID_PACK'
    });
  }
  
  // Call Stripe module
  const result = await stripeBilling.createPackCheckoutSession({
    orgId: org.id,
    packId,
    quantity: parseInt(quantity, 10) || 1,
    customerEmail: auth.user.email,
    customerId: org.billing?.stripeCustomerId,
    successUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?pack_success=true&pack=${packId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?pack_canceled=true`
  });
  
  if (result.error) {
    return sendJson(res, 400, result.error);
  }
  
  logger.logAudit('BILLING_PACK_CHECKOUT_INITIATED', {
    orgId: org.id,
    userId: auth.user.id,
    packId,
    quantity,
    provider: 'stripe'
  });
  
  return sendJson(res, 200, { ok: true, url: result.url, sessionId: result.sessionId });
}

/**
 * POST /client/billing/pack/multi-checkout - Create multi-pack checkout session
 */
async function handleMultiPackCheckout(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth || !auth.user) {
    return sendJson(res, 401, { 
      error: 'Non authentifié',
      errorCategory: 'AUTH_REQUIRED',
      action: 'LOGIN'
    });
  }
  
  const org = auth.org;
  if (!org) {
    return sendJson(res, 404, { 
      error: 'Organisation non trouvée',
      errorCategory: 'ORG_NOT_FOUND'
    });
  }
  
  // Parse body
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { 
      error: 'Requête invalide',
      errorCategory: 'INVALID_REQUEST'
    });
  }
  
  const { items } = body; // Array of {packId, quantity}
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return sendJson(res, 400, {
      error: 'Aucun pack sélectionné.',
      errorCategory: 'INVALID_REQUEST',
      action: 'SELECT_PACKS'
    });
  }
  
  // Validate all packs
  const validPacks = ['ia-mini', 'ia-maxi', 'sms-150', 'sms-300', 'email-1000', 'email-2000', 'qr', 'nfc'];
  for (const item of items) {
    if (!item.packId || !validPacks.includes(item.packId)) {
      return sendJson(res, 400, {
        error: `Pack invalide: ${item.packId}. Choisissez parmi: ${validPacks.join(', ')}.`,
        errorCategory: 'INVALID_PACK',
        action: 'SELECT_VALID_PACK'
      });
    }
  }
  
  // Call Stripe module
  const result = await stripeBilling.createMultiPackCheckoutSession({
    orgId: org.id,
    items: items.map(i => ({ packId: i.packId, quantity: parseInt(i.quantity, 10) || 1 })),
    customerEmail: auth.user.email,
    customerId: org.billing?.stripeCustomerId,
    successUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?pack_success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing?pack_canceled=true`
  });
  
  if (result.error) {
    return sendJson(res, 400, result.error);
  }
  
  logger.logAudit('BILLING_MULTI_PACK_CHECKOUT_INITIATED', {
    orgId: org.id,
    userId: auth.user.id,
    items,
    provider: 'stripe'
  });
  
  return sendJson(res, 200, { ok: true, url: result.url, sessionId: result.sessionId });
}

/**
 * POST /client/billing/portal - Create Stripe customer portal session
 */
async function handleBillingPortal(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth || !auth.user) {
    return sendJson(res, 401, { 
      error: 'Non authentifié',
      errorCategory: 'AUTH_REQUIRED',
      action: 'LOGIN'
    });
  }
  
  const org = auth.org;
  if (!org) {
    return sendJson(res, 404, { 
      error: 'Organisation non trouvée',
      errorCategory: 'ORG_NOT_FOUND'
    });
  }
  
  const customerId = org.billing?.stripeCustomerId;
  
  if (!customerId) {
    return sendJson(res, 400, {
      error: 'Aucun compte de facturation associé. Effectuez d\'abord un paiement.',
      errorCategory: 'NO_BILLING_ACCOUNT',
      action: 'SETUP_BILLING'
    });
  }
  
  const result = await stripeBilling.createPortalSession({
    customerId,
    returnUrl: `${process.env.REPUTY_DOMAIN || 'http://localhost:3002'}/billing`
  });
  
  if (result.error) {
    return sendJson(res, 400, result.error);
  }
  
  logger.logAudit('BILLING_PORTAL_ACCESSED', {
    orgId: org.id,
    userId: auth.user.id
  });
  
  return sendJson(res, 200, { ok: true, url: result.url });
}

/**
 * POST /webhooks/stripe - Handle Stripe webhook events
 */
async function handleStripeWebhook(req, res) {
  // Get raw body for signature verification
  let rawBody;
  try {
    rawBody = await getRawRequestBody(req);
  } catch (err) {
    logger.logError('STRIPE_WEBHOOK_BODY_ERROR', { error: err.message });
    return sendJson(res, 400, { error: 'Invalid request body' });
  }
  
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return sendJson(res, 400, { error: 'Missing signature' });
  }
  
  // Verify signature
  const verification = stripeBilling.verifyWebhook(rawBody, signature);
  
  if (verification.error) {
    logger.logError('STRIPE_WEBHOOK_SIGNATURE_INVALID', { error: verification.error.message });
    return sendJson(res, 400, verification.error);
  }
  
  const event = verification.event;
  
  // Process with idempotence
  const processResult = await webhookEventsRepo.processWithIdempotence(
    event,
    'stripe',
    async (evt) => {
      await processStripeEvent(evt);
    }
  );
  
  if (processResult.skipped) {
    return sendJson(res, 200, { received: true, skipped: true });
  }
  
  if (processResult.error) {
    // Log but still return 200 to prevent Stripe retries for business logic errors
    logger.logError('STRIPE_WEBHOOK_PROCESSING_ERROR', {
      eventId: event.id,
      eventType: event.type,
      error: processResult.error.message
    });
  }
  
  return sendJson(res, 200, { received: true });
}

/**
 * Process a Stripe webhook event
 */
async function processStripeEvent(event) {
  const data = loadData();
  const eventType = event.type;
  const eventData = event.data.object;
  
  logger.logAudit('STRIPE_EVENT_PROCESSING', {
    eventId: event.id,
    eventType,
    customerId: eventData.customer
  });
  
  switch (eventType) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(data, eventData);
      break;
      
    case 'invoice.paid':
      await handleInvoicePaid(data, eventData);
      break;
      
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(data, eventData);
      break;
      
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(data, eventData);
      break;
      
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(data, eventData);
      break;
      
    default:
      logger.logAudit('STRIPE_EVENT_IGNORED', { eventType, eventId: event.id });
  }
}

/**
 * Handle checkout.session.completed
 */
async function handleCheckoutCompleted(data, session) {
  const orgId = session.metadata?.orgId;
  const planId = session.metadata?.planId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  
  if (!orgId) {
    logger.logError('STRIPE_CHECKOUT_NO_ORG', { sessionId: session.id });
    return;
  }
  
  const org = data.orgs.find(o => o.id === orgId);
  if (!org) {
    logger.logError('STRIPE_CHECKOUT_ORG_NOT_FOUND', { orgId, sessionId: session.id });
    return;
  }
  
  // Update org billing info
  org.billing = org.billing || {};
  org.billing.provider = 'stripe';
  org.billing.stripeCustomerId = customerId;
  org.billing.stripeSubscriptionId = subscriptionId;
  org.billing.status = 'active';
  
  // Update plan
  if (planId) {
    org.plan = org.plan || {};
    
    // Map planId to plan code (support all plans: argent, or, platinum)
    const vertical = org.vertical || 'health';
    const planCodeMap = {
      argent: `${vertical}_argent`,
      or: `${vertical}_or`,
      platinum: `${vertical}_platinum`,
      // Legacy aliases
      silver: `${vertical}_argent`,
      gold: `${vertical}_or`
    };
    org.plan.code = planCodeMap[planId] || `${vertical}_${planId}`;
    
    // Update quotas based on plan
    const planQuotas = PLAN_DEFAULTS[org.plan.code] || PLAN_DEFAULTS[`${vertical}_argent`];
    if (planQuotas) {
      org.quotas = { ...org.quotas, ...planQuotas };
      
      // Initialize/reset subscription credits for new period with new plan quotas
      const now = new Date();
      const periodEndDate = new Date(now);
      periodEndDate.setMonth(periodEndDate.getMonth() + 1);
      
      org.subscriptionCredits = {
        periodStart: now.toISOString(),
        periodEnd: periodEndDate.toISOString(),
        // Base monthly values (for reference)
        smsMonthlyBase: planQuotas.smsIncluded || 0,
        emailMonthlyBase: planQuotas.emailIncluded || 0,
        aiMonthlyBase: planQuotas.aiIncluded || 0,
        qrMonthlyBase: planQuotas.qrIncluded || 1,
        nfcMonthlyBase: planQuotas.nfcIncluded || 0,
        // Included quotas for this period (used by getSubscriptionRemaining)
        smsIncludedMonthly: planQuotas.smsIncluded || 0,
        emailIncludedMonthly: planQuotas.emailIncluded || 0,
        aiIncludedMonthly: planQuotas.aiIncluded || 0,
        qrIncludedMonthly: planQuotas.qrIncluded || 1,
        nfcIncludedMonthly: planQuotas.nfcIncluded || 0,
        // Gift credits (0 at start)
        smsGiftMonthly: 0,
        emailGiftMonthly: 0,
        aiGiftMonthly: 0,
        qrGiftMonthly: 0,
        nfcGiftMonthly: 0,
        // Usage counters (reset to 0 for new subscription)
        smsUsedThisPeriod: 0,
        emailUsedThisPeriod: 0,
        aiUsedThisPeriod: 0,
        qrUsedThisPeriod: 0,
        nfcUsedThisPeriod: 0,
        // Prorata info
        ratio: 1,
        isProrata: false
      };
      
      logger.logAudit('SUBSCRIPTION_CREDITS_INITIALIZED', {
        orgId: org.id,
        planId,
        planCode: org.plan.code,
        quotas: {
          sms: planQuotas.smsIncluded,
          email: planQuotas.emailIncluded,
          ai: planQuotas.aiIncluded,
          qr: planQuotas.qrIncluded,
          nfc: planQuotas.nfcIncluded
        }
      });
    }
  }
  
  // Update status from trial to active
  org.status = 'active';
  org.updatedAt = new Date().toISOString();
  
  // Clear any dunning state
  dunning.clearDunning(org);
  
  // Persist to database
  const repos = storage.getRepos();
  if (repos) {
    repos.org.update(orgId, {
      status: 'active',
      billing: org.billing,
      plan: org.plan,
      quotas: org.quotas,
      subscriptionCredits: org.subscriptionCredits, // Include subscription credits
      options: org.options // dunning state is stored in options
    });
  } else {
    saveData(data);
  }
  
  logger.logAudit('STRIPE_CHECKOUT_COMPLETED', {
    orgId,
    planId,
    customerId,
    subscriptionId
  });
  
  // Send confirmation email (async, don't block)
  sendBillingEmail('payment_success', org, { planId }).catch(err => {
    logger.logError('BILLING_EMAIL_ERROR', { orgId, type: 'payment_success', error: err.message });
  });
}

/**
 * Handle invoice.paid
 */
async function handleInvoicePaid(data, invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;
  const amountPaid = invoice.amount_paid;
  
  // Find org by Stripe customer ID
  const org = data.orgs.find(o => o.billing?.stripeCustomerId === customerId);
  if (!org) {
    logger.logAudit('STRIPE_INVOICE_NO_ORG', { customerId, invoiceId: invoice.id });
    return;
  }
  
  // Update billing period
  const periodStart = new Date(invoice.period_start * 1000).toISOString();
  const periodEnd = new Date(invoice.period_end * 1000).toISOString();
  
  org.billing = org.billing || {};
  org.billing.status = 'active';
  org.billing.periodStart = periodStart;
  org.billing.periodEnd = periodEnd;
  
  // Reset subscription credits for new period
  // Get plan quotas to set included credits
  const planCode = org.plan?.code || 'health_argent';
  const planQuotas = PLAN_DEFAULTS[planCode] || PLAN_DEFAULTS['health_argent'] || {};
  
  org.subscriptionCredits = {
    periodStart,
    periodEnd,
    // Base monthly values (for reference)
    smsMonthlyBase: planQuotas.smsIncluded || 0,
    emailMonthlyBase: planQuotas.emailIncluded || 0,
    aiMonthlyBase: planQuotas.aiIncluded || 0,
    qrMonthlyBase: planQuotas.qrIncluded || 1,
    nfcMonthlyBase: planQuotas.nfcIncluded || 0,
    // Included quotas for this period (used by getSubscriptionRemaining)
    smsIncludedMonthly: planQuotas.smsIncluded || 0,
    emailIncludedMonthly: planQuotas.emailIncluded || 0,
    aiIncludedMonthly: planQuotas.aiIncluded || 0,
    qrIncludedMonthly: planQuotas.qrIncluded || 1,
    nfcIncludedMonthly: planQuotas.nfcIncluded || 0,
    // Gift credits (preserve existing or reset to 0)
    smsGiftMonthly: org.subscriptionCredits?.smsGiftMonthly || 0,
    emailGiftMonthly: org.subscriptionCredits?.emailGiftMonthly || 0,
    aiGiftMonthly: org.subscriptionCredits?.aiGiftMonthly || 0,
    qrGiftMonthly: org.subscriptionCredits?.qrGiftMonthly || 0,
    nfcGiftMonthly: org.subscriptionCredits?.nfcGiftMonthly || 0,
    // Usage counters (reset for new period)
    smsUsedThisPeriod: 0,
    emailUsedThisPeriod: 0,
    aiUsedThisPeriod: 0,
    qrUsedThisPeriod: 0,
    nfcUsedThisPeriod: 0,
    // Prorata info (full month = no prorata)
    ratio: 1,
    isProrata: false
  };
  
  logger.logAudit('SUBSCRIPTION_CREDITS_RESET', {
    orgId: org.id,
    planCode,
    quotas: {
      sms: planQuotas.smsIncluded,
      email: planQuotas.emailIncluded,
      ai: planQuotas.aiIncluded,
      qr: planQuotas.qrIncluded,
      nfc: planQuotas.nfcIncluded
    }
  });
  
  // Update status
  org.status = 'active';
  org.updatedAt = new Date().toISOString();
  
  // Clear dunning
  dunning.clearDunning(org);
  
  // Persist to database
  const repos = storage.getRepos();
  if (repos) {
    repos.org.update(org.id, {
      status: 'active',
      billing: org.billing,
      subscriptionCredits: org.subscriptionCredits,
      options: org.options // dunning state is stored in options
    });
  } else {
    saveData(data);
  }
  
  logger.logAudit('STRIPE_INVOICE_PAID', {
    orgId: org.id,
    invoiceId: invoice.id,
    amountPaid,
    periodStart,
    periodEnd
  });
  
  // Send confirmation email
  sendBillingEmail('payment_success', org, { 
    amount: amountPaid,
    periodStart,
    periodEnd,
    invoiceUrl: invoice.hosted_invoice_url
  }).catch(err => {
    logger.logError('BILLING_EMAIL_ERROR', { orgId: org.id, error: err.message });
  });
}

/**
 * Handle invoice.payment_failed
 */
async function handleInvoicePaymentFailed(data, invoice) {
  const customerId = invoice.customer;
  
  const org = data.orgs.find(o => o.billing?.stripeCustomerId === customerId);
  if (!org) {
    logger.logAudit('STRIPE_INVOICE_FAIL_NO_ORG', { customerId, invoiceId: invoice.id });
    return;
  }
  
  // Set status to past_due
  org.status = 'past_due';
  org.billing = org.billing || {};
  org.billing.status = 'past_due';
  org.updatedAt = new Date().toISOString();
  
  // Initialize dunning
  dunning.initializeDunning(org);
  
  // Persist to database
  const repos = storage.getRepos();
  if (repos) {
    repos.org.update(org.id, {
      status: 'past_due',
      billing: org.billing,
      options: org.options // dunning state is stored in options
    });
  } else {
    saveData(data);
  }
  
  logger.logAudit('STRIPE_INVOICE_FAILED', {
    orgId: org.id,
    invoiceId: invoice.id
  });
  
  // Send failure notification
  sendBillingEmail('payment_failed', org, { daysPastDue: 0 }).catch(err => {
    logger.logError('BILLING_EMAIL_ERROR', { orgId: org.id, error: err.message });
  });
}

/**
 * Handle customer.subscription.updated
 */
async function handleSubscriptionUpdated(data, subscription) {
  const customerId = subscription.customer;
  
  const org = data.orgs.find(o => o.billing?.stripeCustomerId === customerId);
  if (!org) {
    return;
  }
  
  // Update subscription info
  org.billing = org.billing || {};
  org.billing.stripeSubscriptionId = subscription.id;
  org.billing.status = subscription.status;
  
  // Map Stripe status to our status
  const statusMap = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    trialing: 'trial'
  };
  
  org.status = statusMap[subscription.status] || org.status;
  org.updatedAt = new Date().toISOString();
  
  // Persist to database
  const repos = storage.getRepos();
  if (repos) {
    repos.org.update(org.id, {
      status: org.status,
      billing: org.billing
    });
  } else {
    saveData(data);
  }
  
  logger.logAudit('STRIPE_SUBSCRIPTION_UPDATED', {
    orgId: org.id,
    subscriptionId: subscription.id,
    status: subscription.status
  });
}

/**
 * Handle customer.subscription.deleted
 */
async function handleSubscriptionDeleted(data, subscription) {
  const customerId = subscription.customer;
  
  const org = data.orgs.find(o => o.billing?.stripeCustomerId === customerId);
  if (!org) {
    return;
  }
  
  // Mark as cancelled
  org.status = 'cancelled';
  org.billing = org.billing || {};
  org.billing.status = 'cancelled';
  org.billing.cancelledAt = new Date().toISOString();
  org.updatedAt = new Date().toISOString();
  
  // Persist to database
  const repos = storage.getRepos();
  if (repos) {
    repos.org.update(org.id, {
      status: 'cancelled',
      billing: org.billing
    });
  } else {
    saveData(data);
  }
  
  logger.logAudit('STRIPE_SUBSCRIPTION_DELETED', {
    orgId: org.id,
    subscriptionId: subscription.id
  });
  
  // Send notification
  sendBillingEmail('subscription_cancelled', org, {}).catch(err => {
    logger.logError('BILLING_EMAIL_ERROR', { orgId: org.id, error: err.message });
  });
}

/**
 * POST /webhooks/gocardless - Handle GoCardless webhook events (stub)
 */
async function handleGoCardlessWebhook(req, res) {
  // Get raw body
  let rawBody;
  try {
    rawBody = await getRawRequestBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Invalid request body' });
  }
  
  const signature = req.headers['webhook-signature'];
  
  // Verify and parse
  const verification = gocardlessBilling.verifyWebhook(rawBody, signature);
  
  if (verification.error) {
    // GoCardless not implemented yet
    if (verification.error.errorCode === 'SEPA_NOT_READY') {
      logger.logAudit('GOCARDLESS_WEBHOOK_NOT_IMPLEMENTED', {});
      return sendJson(res, 200, { received: true, implemented: false });
    }
    return sendJson(res, 400, verification.error);
  }
  
  // Process events (stub)
  const result = await gocardlessBilling.handleWebhookEvents(verification.events);
  
  return sendJson(res, 200, { received: true, processed: result.processed });
}

/**
 * Send billing-related email
 */
async function sendBillingEmail(type, org, details) {
  const SUPPORT_BILLING_EMAIL = process.env.SUPPORT_BILLING_EMAIL;
  
  // Get template
  let template;
  const templateData = {
    orgId: org.id,
    orgName: org.name,
    email: org.email,
    planId: org.plan?.code || 'bronze',
    ...details
  };
  
  switch (type) {
    case 'payment_success':
      template = billingTemplates.getPaymentSuccessTemplate(templateData);
      break;
    case 'payment_failed':
      template = billingTemplates.getPaymentFailedTemplate(templateData);
      break;
    case 'read_only':
      template = billingTemplates.getReadOnlyTemplate(templateData);
      break;
    default:
      logger.logAudit('BILLING_EMAIL_UNKNOWN_TYPE', { type, orgId: org.id });
      return;
  }
  
  // Log the email (actual sending via nodemailer would go here)
  logger.logAudit('BILLING_EMAIL_QUEUED', {
    type,
    orgId: org.id,
    to: org.email,
    subject: template.subject
  });
  
  // Send internal notification if configured
  if (SUPPORT_BILLING_EMAIL) {
    const internalTemplate = billingTemplates.getInternalBillingNotification({
      type,
      ...templateData,
      provider: org.billing?.provider
    });
    
    logger.logAudit('BILLING_INTERNAL_NOTIFICATION', {
      type,
      orgId: org.id,
      to: SUPPORT_BILLING_EMAIL,
      subject: internalTemplate.subject
    });
  }
  
  // TODO: Actually send emails via nodemailer when email provider is configured
  // For now, just log them
}

/**
 * Helper to get raw request body (for webhook signature verification)
 */
function getRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ============================================================
// END BILLING HANDLERS
// ============================================================

/**
 * POST /internal/orgs/:orgId/reset-public-key - Régénère la publicKey
 * Attention: l'extension devra être mise à jour avec la nouvelle clé
 */
async function handleResetPublicKey(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    const oldKey = org.publicKey;
    const newKey = generatePublicKey();
    
    org.publicKey = newKey;
    org.updatedAt = nowISO();
    
    saveData(data);
    
    console.log(`[REPUTY][INTERNAL] PublicKey reset for org ${orgId}: ${oldKey} -> ${newKey}`);
    
    return sendJson(res, 200, {
      ok: true,
      oldPublicKey: oldKey,
      newPublicKey: newKey,
      warning: "L'extension Chrome devra être mise à jour avec la nouvelle clé."
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * P1.3: POST /internal/orgs/:orgId/rotate-api-token - Rotation du token API
 * L'ancien token reste valide 24h (période de grâce)
 * Le nouveau token est retourné EN CLAIR UNE SEULE FOIS
 */
async function handleRotateApiToken(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    
    // Store old token for grace period
    const oldToken = org.apiToken;
    const now = new Date();
    const gracePeriodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
    
    // Generate new token
    const newToken = generateApiToken();
    
    // Update org
    org.apiTokenPrevious = oldToken;
    org.apiTokenPreviousExpiresAt = gracePeriodEnd.toISOString();
    org.apiToken = newToken;
    org.apiTokenLastRotatedAt = now.toISOString();
    org.updatedAt = now.toISOString();
    
    saveData(data);
    
    // P1.4: Log API token rotation
    logger.logInternalAction('INTERNAL_ROTATE_API_TOKEN', req, {
      orgId: org.id,
      status: 200,
      previousStillValidUntil: gracePeriodEnd.toISOString(),
      message: 'API token rotated successfully'
    });
    
    return sendJson(res, 200, {
      ok: true,
      newApiToken: newToken, // ⚠️ Affiché UNE SEULE FOIS
      previousTokenValidUntil: gracePeriodEnd.toISOString(),
      message: "Nouveau token généré. L'ancien token reste valide pendant 24h.",
      warning: "Copiez ce token maintenant, il ne sera plus affiché en clair."
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

/**
 * P1.3: GET /internal/orgs/:orgId/api-token - Info token API (masqué)
 * Ne retourne PAS le token en clair, seulement les métadonnées
 */
function handleGetApiToken(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const data = loadData();
  
  try {
    const org = getOrgOrThrow(data, orgId);
    
    const now = Date.now();
    const previousValid = org.apiTokenPrevious && 
      org.apiTokenPreviousExpiresAt && 
      now < new Date(org.apiTokenPreviousExpiresAt).getTime();
    
    return sendJson(res, 200, {
      ok: true,
      apiTokenMasked: maskApiToken(org.apiToken),
      apiTokenCreatedAt: org.apiTokenCreatedAt || null,
      apiTokenLastRotatedAt: org.apiTokenLastRotatedAt || null,
      previousTokenActive: previousValid,
      previousTokenMasked: previousValid ? maskApiToken(org.apiTokenPrevious) : null,
      previousTokenExpiresAt: previousValid ? org.apiTokenPreviousExpiresAt : null
    });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message });
  }
}

// ============================================================
// BILLING MANAGEMENT (Admin) - Assign Plan & Coupons
// ============================================================

/**
 * POST /internal/orgs/:orgId/assign-plan - Assigner un plan à un client
 * Body: { planCode: "health_argent" | "health_or" | "health_platinum" | "health_bronze" }
 * 
 * Action atomique :
 * - Met à jour plan.code
 * - Met à jour le prix selon le catalogue
 * - Met à jour les quotas selon le catalogue  
 * - Reset les crédits mensuels
 * - Rollover période si nécessaire
 */
async function handleAssignPlan(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const repos = storage.getRepos();
  
  try {
    const body = await parseBody(req);
    const { planCode } = body;
    
    // Validate plan code
    const validCodes = planCatalog.getAvailablePlanCodes();
    if (!planCode || !validCodes.includes(planCode)) {
      return sendJson(res, 400, {
        ok: false,
        error: `Plan invalide. Plans disponibles: ${validCodes.join(', ')}`,
      });
    }
    
    // Get org
    let org;
    if (repos) {
      org = repos.org.getById(orgId);
    } else {
      const data = loadData();
      org = data.orgs[orgId];
    }
    
    if (!org) {
      return sendJson(res, 404, { ok: false, error: 'Client non trouvé' });
    }
    
    // Get plan info from catalog
    const plan = planCatalog.getPlan(planCode);
    const quotas = planCatalog.getPlanQuotas(planCode);
    
    // Build update
    const now = new Date();
    
    // Ensure billing period is current and get reset credits
    periodRollover.ensureBillingPeriodIsCurrent({ org, now, repos, persist: false });
    
    // Build subscription credits with new plan quotas
    const newSubscriptionCredits = {
      periodStart: org.billing?.periodStart || now.toISOString(),
      periodEnd: org.billing?.periodEnd || now.toISOString(),
      smsIncludedMonthly: quotas.smsIncluded,
      emailIncludedMonthly: quotas.emailIncluded,
      aiIncludedMonthly: quotas.aiIncluded,
      qrIncludedMonthly: quotas.qrIncluded,
      nfcIncludedMonthly: quotas.nfcIncluded,
      smsGiftMonthly: org.subscriptionCredits?.smsGiftMonthly || 0,
      emailGiftMonthly: org.subscriptionCredits?.emailGiftMonthly || 0,
      aiGiftMonthly: org.subscriptionCredits?.aiGiftMonthly || 0,
      smsTotal: quotas.smsIncluded + (org.subscriptionCredits?.smsGiftMonthly || 0),
      emailTotal: quotas.emailIncluded + (org.subscriptionCredits?.emailGiftMonthly || 0),
      aiTotal: quotas.aiIncluded + (org.subscriptionCredits?.aiGiftMonthly || 0),
      smsUsedThisPeriod: 0,
      emailUsedThisPeriod: 0,
      aiUsedThisPeriod: 0,
      qrUsedThisPeriod: 0,
      nfcUsedThisPeriod: 0,
    };
    
    // Update org
    let updatedOrg;
    if (repos) {
      updatedOrg = repos.org.assignPlan(orgId, {
        planCode,
        priceCents: plan.priceCents,
        quotas,
        subscriptionCredits: newSubscriptionCredits,
      });
    } else {
      // Legacy JSON mode
      const data = loadData();
      org.plan = {
        ...org.plan,
        code: planCode,
        basePriceCents: plan.priceCents,
        currency: 'EUR',
        billingCycle: 'monthly',
      };
      org.quotas = { ...org.quotas, ...quotas };
      org.subscriptionCredits = newSubscriptionCredits;
      saveData(data);
      updatedOrg = org;
    }
    
    // Compute effective billing for response
    const billing = effectiveBilling.computeEffectiveBilling({ org: updatedOrg, now, repos, ensurePeriod: false });
    
    logger.logAudit('PLAN_ASSIGNED', {
      orgId,
      planCode,
      priceCents: plan.priceCents,
      adminEmail: auth.user?.email || 'unknown',
    });
    
    return sendJson(res, 200, {
      ok: true,
      message: `Plan ${plan.name} assigné avec succès`,
      org: sanitizeOrg(updatedOrg),
      effectiveBilling: billing,
    });
    
  } catch (err) {
    logger.logError('ASSIGN_PLAN_ERROR', { orgId, error: err.message });
    return sendJson(res, err.status || 500, { ok: false, error: err.message });
  }
}

/**
 * POST /internal/orgs/:orgId/apply-coupon - Appliquer un coupon/remise
 * Body: { couponKey: "FIXED_10" | "PCT_20" | ... }
 * 
 * Applique un coupon Stripe sur la subscription du client.
 * Les coupons doivent exister dans Stripe.
 */
async function handleApplyCoupon(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const repos = storage.getRepos();
  
  try {
    const body = await parseBody(req);
    const { couponKey } = body;
    
    // Validate coupon key
    if (!couponKey || !stripeCoupons.isValidCouponKey(couponKey)) {
      const available = stripeCoupons.getAvailableCoupons();
      return sendJson(res, 400, {
        ok: false,
        error: `Coupon invalide. Coupons disponibles: ${available.map(c => c.key).join(', ')}`,
        availableCoupons: available,
      });
    }
    
    // Get org
    let org;
    if (repos) {
      org = repos.org.getById(orgId);
    } else {
      const data = loadData();
      org = data.orgs[orgId];
    }
    
    if (!org) {
      return sendJson(res, 404, { ok: false, error: 'Client non trouvé' });
    }
    
    // Get Stripe coupon ID
    const stripeCouponId = stripeCoupons.getStripeCouponId(couponKey);
    const subscriptionId = org.billing?.stripeSubscriptionId;
    
    // Apply coupon in Stripe (if subscription exists)
    if (subscriptionId && stripeBilling.stripe) {
      try {
        await stripeBilling.stripe.subscriptions.update(subscriptionId, {
          coupon: stripeCouponId,
        });
        logger.logAudit('STRIPE_COUPON_APPLIED', { orgId, subscriptionId, couponKey, stripeCouponId });
      } catch (stripeErr) {
        logger.logError('STRIPE_COUPON_ERROR', { orgId, error: stripeErr.message });
        // Continue anyway to store locally
      }
    }
    
    // Store coupon in org billing
    const newBilling = {
      ...org.billing,
      stripeCouponId,
      couponAppliedAt: new Date().toISOString(),
      couponAppliedBy: auth.user?.email || 'admin',
    };
    
    let updatedOrg;
    if (repos) {
      updatedOrg = repos.org.patchBilling(orgId, newBilling);
    } else {
      const data = loadData();
      org.billing = newBilling;
      saveData(data);
      updatedOrg = org;
    }
    
    // Compute effective billing for response
    const billing = effectiveBilling.computeEffectiveBilling({ org: updatedOrg, now: new Date(), repos });
    
    logger.logAudit('COUPON_APPLIED', {
      orgId,
      couponKey,
      stripeCouponId,
      priceEffectiveCents: billing.priceEffectiveCents,
      adminEmail: auth.user?.email || 'unknown',
    });
    
    return sendJson(res, 200, {
      ok: true,
      message: `Coupon ${stripeCouponId} appliqué avec succès`,
      org: sanitizeOrg(updatedOrg),
      effectiveBilling: billing,
    });
    
  } catch (err) {
    logger.logError('APPLY_COUPON_ERROR', { orgId, error: err.message });
    return sendJson(res, err.status || 500, { ok: false, error: err.message });
  }
}

/**
 * POST /internal/orgs/:orgId/remove-coupon - Retirer le coupon/remise
 * 
 * Retire le discount de la subscription Stripe.
 */
async function handleRemoveCoupon(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const repos = storage.getRepos();
  
  try {
    // Get org
    let org;
    if (repos) {
      org = repos.org.getById(orgId);
    } else {
      const data = loadData();
      org = data.orgs[orgId];
    }
    
    if (!org) {
      return sendJson(res, 404, { ok: false, error: 'Client non trouvé' });
    }
    
    const previousCoupon = org.billing?.stripeCouponId;
    if (!previousCoupon) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Aucun coupon à retirer',
      });
    }
    
    const subscriptionId = org.billing?.stripeSubscriptionId;
    
    // Remove coupon in Stripe (if subscription exists)
    if (subscriptionId && stripeBilling.stripe) {
      try {
        // Setting coupon to empty string removes it
        await stripeBilling.stripe.subscriptions.update(subscriptionId, {
          coupon: '',
        });
        logger.logAudit('STRIPE_COUPON_REMOVED', { orgId, subscriptionId, previousCoupon });
      } catch (stripeErr) {
        logger.logError('STRIPE_REMOVE_COUPON_ERROR', { orgId, error: stripeErr.message });
        // Continue anyway to update locally
      }
    }
    
    // Remove coupon from org billing
    const newBilling = {
      ...org.billing,
      stripeCouponId: null,
      couponRemovedAt: new Date().toISOString(),
      couponRemovedBy: auth.user?.email || 'admin',
    };
    
    let updatedOrg;
    if (repos) {
      updatedOrg = repos.org.patchBilling(orgId, newBilling);
    } else {
      const data = loadData();
      org.billing = newBilling;
      saveData(data);
      updatedOrg = org;
    }
    
    // Compute effective billing for response
    const billing = effectiveBilling.computeEffectiveBilling({ org: updatedOrg, now: new Date(), repos });
    
    logger.logAudit('COUPON_REMOVED', {
      orgId,
      previousCoupon,
      priceEffectiveCents: billing.priceEffectiveCents,
      adminEmail: auth.user?.email || 'unknown',
    });
    
    return sendJson(res, 200, {
      ok: true,
      message: `Coupon ${previousCoupon} retiré avec succès`,
      org: sanitizeOrg(updatedOrg),
      effectiveBilling: billing,
    });
    
  } catch (err) {
    logger.logError('REMOVE_COUPON_ERROR', { orgId, error: err.message });
    return sendJson(res, err.status || 500, { ok: false, error: err.message });
  }
}

/**
 * GET /internal/orgs/:orgId/effective-billing - Obtenir le billing effectif calculé
 */
function handleGetEffectiveBilling(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }
  
  const repos = storage.getRepos();
  
  try {
    // Get org
    let org;
    if (repos) {
      org = repos.org.getById(orgId);
    } else {
      const data = loadData();
      org = data.orgs[orgId];
    }
    
    if (!org) {
      return sendJson(res, 404, { ok: false, error: 'Client non trouvé' });
    }
    
    // Compute effective billing
    const billing = effectiveBilling.computeEffectiveBilling({ org, now: new Date(), repos });
    
    return sendJson(res, 200, {
      ok: true,
      effectiveBilling: billing,
    });
    
  } catch (err) {
    logger.logError('GET_EFFECTIVE_BILLING_ERROR', { orgId, error: err.message });
    return sendJson(res, err.status || 500, { ok: false, error: err.message });
  }
}

/**
 * Résout l'orgId à partir du header x-public-key
 * Utilisé par les endpoints appelés depuis l'extension
 */
function resolveOrgFromRequest(req) {
  const publicKey = req.headers['x-public-key'];
  if (!publicKey) {
    return { ok: false, error: 'Header x-public-key manquant' };
  }
  
  const data = loadData();
  const org = getOrgByPublicKey(data, publicKey);
  
  if (!org) {
    return { ok: false, error: 'PublicKey invalide' };
  }
  
  if (org.status !== 'active') {
    return { ok: false, error: `Compte ${org.status}` };
  }
  
  return { ok: true, org, orgId: org.id };
}

/**
 * Enregistre une entrée d'usage (SMS/Email envoyé) et débite les crédits
 * NEW SYSTEM: debit subscription first, then pack. Check for active subscription.
 * @param {object} data - données chargées
 * @param {object} org - org object
 * @param {string} type - 'sms' ou 'email'
 * @param {object} meta - métadonnées supplémentaires (can include requestId for idempotence)
 * @returns {{ success: boolean, entry?: object, reason?: string, deduped?: boolean, debitedFrom?: string }}
 */
function recordUsageAndDebit(data, org, type, meta = {}) {
  if (!org || !org.id) return { success: false, reason: 'NO_ORG' };
  
  // IDEMPOTENCE CHECK: If requestId provided, check for duplicate
  const requestId = meta.requestId;
  if (requestId) {
    const existingEntry = findUsageByRequestId(data, org.id, requestId);
    if (existingEntry) {
      console.log(`[BILLING] ⚠️ Duplicate requestId detected: ${requestId}, returning existing entry`);
      return { 
        success: existingEntry.meta?.status === 'success',
        entry: existingEntry, 
        deduped: true,
        reason: existingEntry.meta?.status !== 'success' ? existingEntry.meta?.reason : null
      };
    }
  }
  
  // Ensure period exists
  ensureCurrentPeriod(data, org, false);
  
  // Try to debit credits (checks for active subscription internally)
  const debitResult = debitCredits(data, org, type, 1);
  
  const entry = {
    id: generateId(),
    orgId: org.id,
    type, // 'sms' | 'email'
    qty: 1,
    ts: nowISO(),
    meta: {
      simulated: true,
      status: debitResult.success ? 'success' : 'fail',
      billingPeriodStart: org.billing?.periodStart,
      billingPeriodEnd: org.billing?.periodEnd,
      debitedFrom: debitResult.debitedFrom || null,  // 'subscription' or 'pack'
      reason: debitResult.reason || null,
      requestId: requestId || null,
      ...meta
    }
  };
  
  if (!data.usageLedger) data.usageLedger = [];
  data.usageLedger.push(entry);
  
  // Limiter la taille (garder les 50000 derniers)
  if (data.usageLedger.length > 50000) {
    data.usageLedger = data.usageLedger.slice(-50000);
  }
  
  if (!debitResult.success) {
    // Log the error (SUBSCRIPTION_INACTIVE or QUOTA_EXCEEDED)
    const telemetryCode = debitResult.reason === 'SUBSCRIPTION_INACTIVE' ? 'SUBSCRIPTION_INACTIVE' : 'QUOTA_EXCEEDED';
    const telemetryMsg = debitResult.reason === 'SUBSCRIPTION_INACTIVE' 
      ? `Abonnement inactif - envoi refusé`
      : `Quota ${type.toUpperCase()} dépassé`;
    
    recordTelemetry(data, org.id, 'warn', telemetryCode, telemetryMsg, { source: 'backend' });
    
    return { 
      success: false, 
      entry, 
      reason: debitResult.reason,
      smsRemaining: debitResult.smsRemaining,
      emailRemaining: debitResult.emailRemaining,
      subscriptionRemaining: debitResult.subscriptionRemaining,
      packRemaining: debitResult.packRemaining,
      periodEnd: debitResult.periodEnd
    };
  }
  
  return { success: true, entry, debitedFrom: debitResult.debitedFrom };
}

/**
 * Legacy recordUsage for backward compatibility (use recordUsageAndDebit instead)
 */
function recordUsage(data, orgId, type, meta = {}) {
  if (!orgId) return null;
  
  const entry = {
    id: generateId(),
    orgId,
    type,
    qty: 1,
    ts: nowISO(),
    meta: {
      simulated: true,
      status: 'success',
      ...meta
    }
  };
  
  if (!data.usageLedger) data.usageLedger = [];
  data.usageLedger.push(entry);
  
  if (data.usageLedger.length > 50000) {
    data.usageLedger = data.usageLedger.slice(-50000);
  }
  
  return entry;
}

/**
 * Enregistre une entrée de télémétrie (log/event)
 * @param {object} data - données chargées
 * @param {string} orgId - ID de l'org (peut être null)
 * @param {string} level - 'info' | 'warn' | 'error'
 * @param {string} code - code de l'événement
 * @param {string} message - message descriptif
 * @param {object} extra - données supplémentaires (stack, version, etc.)
 */
function recordTelemetry(data, orgId, level, code, message, extra = {}) {
  const entry = {
    id: generateId(),
    orgId: orgId || null,
    source: extra.source || 'backend',
    level,
    code,
    message,
    ts: nowISO(),
    ...extra
  };
  
  if (!data.telemetry) data.telemetry = [];
  data.telemetry.push(entry);
  
  // Limiter la taille (garder les 10000 derniers)
  if (data.telemetry.length > 10000) {
    data.telemetry = data.telemetry.slice(-10000);
  }
  
  return entry;
}

// ============ SERVER ============

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // ── P0.3: Security headers (default: API-safe strict CSP) ──
  applySecurityHeaders(res);

  // ── P0.3: CORS (must run before any route) ──
  const corsResult = applyCors(req, res);
  if (corsResult === 'blocked' || corsResult === 'preflight') return;

  // Health check
  if (method === 'GET' && url === '/health') {
    return handleHealth(res);
  }

  // Send review request (from extension)
  if (method === 'POST' && url === '/api/send-review-request') {
    return handleSendReview(req, res);
  }

  // Get feedbacks list (admin)
  if (method === 'GET' && url === '/api/feedbacks') {
    return handleGetFeedbacks(req, res);
  }
  
  // Get requests list with status (admin) - Traçabilité
  if (method === 'GET' && url === '/api/requests') {
    return handleGetRequests(req, res);
  }

  // Settings (admin)
  if (method === 'GET' && url === '/api/settings') {
    return handleGetSettings(req, res);
  }
  if (method === 'POST' && url === '/api/settings') {
    return handleSaveSettings(req, res);
  }
  
  // Review Routing Settings (admin)
  if (method === 'GET' && url === '/api/settings/review-routing') {
    return handleGetReviewRouting(req, res);
  }
  if (method === 'PUT' && url === '/api/settings/review-routing') {
    return handleSaveReviewRouting(req, res);
  }

  // ============ AUTH ROUTES (Public) ============
  
  if (method === 'POST' && url === '/auth/signup') {
    return handleSignup(req, res);
  }
  
  // P0.4: Rate limiting on /auth/verify
  if (method === 'POST' && url === '/auth/verify') {
    if (applyAuthRateLimit(req, res, '/auth/verify')) return; // Blocked
    return handleVerifyEmail(req, res);
  }
  
  // P0.4: Rate limiting on /auth/resend-code
  if (method === 'POST' && url === '/auth/resend-code') {
    if (applyAuthRateLimit(req, res, '/auth/resend-code')) return; // Blocked
    return handleResendCode(req, res);
  }
  
  // P0.4: Rate limiting on /auth/login
  if (method === 'POST' && url === '/auth/login') {
    if (applyAuthRateLimit(req, res, '/auth/login')) return; // Blocked
    return handleLogin(req, res);
  }
  
  if (method === 'POST' && url === '/auth/logout') {
    return handleLogout(req, res);
  }
  
  if (method === 'GET' && url === '/me') {
    return handleGetMe(req, res);
  }
  
  // ============ INTERNAL BACKOFFICE ROUTES (Super Admin) ============
  
  // Parse URL for query params
  const urlParts = url.split('?');
  const pathname = urlParts[0];
  const urlParams = new URLSearchParams(urlParts[1] || '');
  
  // ============ CLIENT DASHBOARD ROUTES (Authenticated Users) ============
  
  if (method === 'GET' && pathname === '/client/org') {
    return handleClientGetOrg(req, res);
  }
  
  if (method === 'GET' && pathname === '/client/usage') {
    return handleClientGetUsage(req, res, urlParams);
  }
  
  if (method === 'GET' && pathname === '/client/settings') {
    return handleClientGetSettings(req, res);
  }
  
  // ============ CLIENT INSTALLATIONS ROUTES ============
  
  if (method === 'GET' && pathname === '/client/installations') {
    return handleClientListInstallations(req, res);
  }
  
  if (method === 'POST' && pathname === '/client/installations') {
    return handleClientCreateInstallation(req, res);
  }
  
  // Revoke installation: /client/installations/:id/revoke
  const revokeInstallMatch = pathname.match(/^\/client\/installations\/([a-zA-Z0-9_-]+)\/revoke$/);
  if (revokeInstallMatch && method === 'POST') {
    return handleClientRevokeInstallation(req, res, revokeInstallMatch[1]);
  }
  
  // Rotate installation token: /client/installations/:id/rotate
  const rotateInstallMatch = pathname.match(/^\/client\/installations\/([a-zA-Z0-9_-]+)\/rotate$/);
  if (rotateInstallMatch && method === 'POST') {
    return handleClientRotateInstallation(req, res, rotateInstallMatch[1]);
  }
  
  // ============ CLIENT SHORTLINKS ROUTES ============
  
  if (method === 'GET' && pathname === '/client/shortlinks') {
    return handleClientListShortlinks(req, res);
  }
  
  if (method === 'POST' && pathname === '/client/shortlinks') {
    return handleClientCreateShortlink(req, res);
  }
  
  // Get QR code for shortlink: /client/shortlinks/:code/qr
  const qrShortlinkMatch = pathname.match(/^\/client\/shortlinks\/([a-zA-Z0-9]+)\/qr$/);
  if (qrShortlinkMatch && method === 'GET') {
    return handleClientGetShortlinkQR(req, res, qrShortlinkMatch[1]);
  }
  
  // Delete shortlink: /client/shortlinks/:code
  const deleteShortlinkMatch = pathname.match(/^\/client\/shortlinks\/([a-zA-Z0-9]+)$/);
  if (deleteShortlinkMatch && method === 'DELETE') {
    return handleClientDeleteShortlink(req, res, deleteShortlinkMatch[1]);
  }
  
  // ============ CLIENT REVIEWS ROUTES (Phase 1A) ============
  
  // List reviews with filters and pagination
  if (method === 'GET' && pathname === '/client/reviews') {
    return handleClientListReviews(req, res, urlParams);
  }
  
  // Get review stats (KPIs + star distribution)
  if (method === 'GET' && pathname === '/client/reviews/stats') {
    return handleClientReviewStats(req, res, urlParams);
  }
  
  // Get review analytics (time series)
  if (method === 'GET' && pathname === '/client/reviews/analytics') {
    return handleClientReviewAnalytics(req, res, urlParams);
  }
  
  // Create review (for dev/test/import)
  if (method === 'POST' && pathname === '/client/reviews') {
    return handleClientCreateReview(req, res);
  }
  
  // Bulk import reviews
  if (method === 'POST' && pathname === '/client/reviews/bulk') {
    return handleClientBulkImportReviews(req, res);
  }
  
  // Get single review by ID
  const reviewIdMatch = pathname.match(/^\/client\/reviews\/([a-zA-Z0-9_-]+)$/);
  if (reviewIdMatch && method === 'GET') {
    return handleClientGetReview(req, res, reviewIdMatch[1]);
  }
  
  // Reply to a review (idempotent)
  const reviewReplyMatch = pathname.match(/^\/client\/reviews\/([a-zA-Z0-9_-]+)\/reply$/);
  if (reviewReplyMatch && method === 'POST') {
    return handleClientReplyReview(req, res, reviewReplyMatch[1]);
  }
  
  // Update review status
  const reviewStatusMatch = pathname.match(/^\/client\/reviews\/([a-zA-Z0-9_-]+)\/status$/);
  if (reviewStatusMatch && method === 'POST') {
    return handleClientUpdateReviewStatus(req, res, reviewStatusMatch[1]);
  }
  
  // ============ CLIENT BILLING ROUTES ============
  
  // Get billing status
  if (method === 'GET' && pathname === '/client/billing/status') {
    return handleBillingStatus(req, res);
  }
  
  // Create checkout session (Stripe)
  if (method === 'POST' && pathname === '/client/billing/checkout') {
    return handleBillingCheckout(req, res);
  }
  
  // Create portal session (Stripe)
  if (method === 'POST' && pathname === '/client/billing/portal') {
    return handleBillingPortal(req, res);
  }
  
  // Pack checkout (one-time purchase)
  if (method === 'POST' && pathname === '/client/billing/pack/checkout') {
    return handlePackCheckout(req, res);
  }
  
  // Multi-pack checkout (cart functionality)
  if (method === 'POST' && pathname === '/client/billing/pack/multi-checkout') {
    return handleMultiPackCheckout(req, res);
  }
  
  // SEPA mandate flow (GoCardless) - alias for checkout with provider=gocardless
  if (method === 'POST' && pathname === '/client/billing/sepa') {
    // Set provider to gocardless and forward to checkout
    req._forceProvider = 'gocardless';
    return handleBillingCheckout(req, res);
  }
  
  // ============ WEBHOOK ROUTES ============
  
  // Stripe webhooks
  if (method === 'POST' && pathname === '/webhooks/stripe') {
    return handleStripeWebhook(req, res);
  }
  
  // GoCardless webhooks
  if (method === 'POST' && pathname === '/webhooks/gocardless') {
    return handleGoCardlessWebhook(req, res);
  }
  
  // ============ PUBLIC API ROUTES ============
  
  // Get org by publicKey (public, no auth)
  const publicOrgMatch = pathname.match(/^\/public\/org\/by-key\/([a-zA-Z0-9_]+)$/);
  if (publicOrgMatch && method === 'GET') {
    return handleGetOrgByPublicKey(req, res, publicOrgMatch[1]);
  }
  
  // Extension telemetry (public endpoint, no admin token)
  if (method === 'POST' && pathname === '/telemetry/extension') {
    return handleExtensionTelemetry(req, res);
  }
  
  // P5: Admin feedbacks (replaces legacy /api/feedbacks + CABINET_API_TOKEN)
  if (method === 'GET' && pathname === '/internal/admin/feedbacks') {
    return handleAdminGetFeedbacks(req, res);
  }
  
  // P5: Legacy auth stats (monitoring kill-switch migration)
  if (method === 'GET' && pathname === '/internal/admin/legacy-auth-stats') {
    return handleLegacyAuthStats(req, res);
  }
  
  // List packs catalog
  if (method === 'GET' && pathname === '/internal/packs') {
    return handleGetPacks(req, res);
  }
  
  // List all orgs (supports ?now=ISO for debug)
  if (method === 'GET' && pathname === '/internal/orgs') {
    return handleListOrgs(req, res, urlParams);
  }
  
  // Create org
  if (method === 'POST' && pathname === '/internal/orgs') {
    return handleCreateOrg(req, res);
  }
  
  // Org-specific routes (supports ?now=ISO for debug on GET)
  const orgMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)$/);
  if (orgMatch) {
    const orgId = orgMatch[1];
    if (method === 'GET') return handleGetOrg(req, res, orgId, urlParams);
    if (method === 'PUT') return handleUpdateOrg(req, res, orgId);
  }
  
  // Org credits
  const creditsMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/credits$/);
  if (creditsMatch && method === 'POST') {
    return handleAddCredits(req, res, creditsMatch[1]);
  }
  
  // Org status
  const statusMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/status$/);
  if (statusMatch && method === 'POST') {
    return handleChangeStatus(req, res, statusMatch[1]);
  }
  
  // Simulate usage (for testing)
  const simulateMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/simulate-usage$/);
  if (simulateMatch && method === 'POST') {
    return handleSimulateUsage(req, res, simulateMatch[1]);
  }
  
  // Reset public key
  const resetKeyMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/reset-public-key$/);
  if (resetKeyMatch && method === 'POST') {
    return handleResetPublicKey(req, res, resetKeyMatch[1]);
  }
  
  // P1.3: Rotate API token
  const rotateTokenMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/rotate-api-token$/);
  if (rotateTokenMatch && method === 'POST') {
    return handleRotateApiToken(req, res, rotateTokenMatch[1]);
  }
  
  // P1.3: Get API token info (masked)
  const getTokenMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/api-token$/);
  if (getTokenMatch && method === 'GET') {
    return handleGetApiToken(req, res, getTokenMatch[1]);
  }
  
  // Assign plan
  const assignPlanMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/assign-plan$/);
  if (assignPlanMatch && method === 'POST') {
    return handleAssignPlan(req, res, assignPlanMatch[1]);
  }
  
  // Apply coupon
  const applyCouponMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/apply-coupon$/);
  if (applyCouponMatch && method === 'POST') {
    return handleApplyCoupon(req, res, applyCouponMatch[1]);
  }
  
  // Remove coupon
  const removeCouponMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/remove-coupon$/);
  if (removeCouponMatch && method === 'POST') {
    return handleRemoveCoupon(req, res, removeCouponMatch[1]);
  }
  
  // Get effective billing
  const effectiveBillingMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/effective-billing$/);
  if (effectiveBillingMatch && method === 'GET') {
    return handleGetEffectiveBilling(req, res, effectiveBillingMatch[1]);
  }
  
  // Org usage
  const usageMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/usage$/);
  if (usageMatch && method === 'GET') {
    return handleGetOrgUsage(req, res, usageMatch[1], urlParams);
  }
  
  // Org telemetry
  const telemetryMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/telemetry$/);
  if (telemetryMatch && method === 'GET') {
    return handleGetOrgTelemetry(req, res, telemetryMatch[1], urlParams);
  }

  // Shortlink redirect (QR/NFC) - check first with alphanumeric pattern
  // Shortlinks use base62 codes (letters + numbers), while request IDs are hex only
  const shortlinkMatch = pathname.match(/^\/r\/([a-zA-Z0-9]+)$/);
  if (shortlinkMatch && method === 'GET') {
    const code = shortlinkMatch[1];
    // If code contains letters (not just hex), it's likely a shortlink
    if (/[g-zG-Z]/.test(code)) {
      return handleShortlinkRedirect(req, res, code);
    }
    // Otherwise, check if it's a shortlink in DB first
    const repos = storage.getRepos();
    if (repos) {
      const shortlink = repos.shortlink.getByCode(code);
      if (shortlink) {
        return handleShortlinkRedirect(req, res, code);
      }
    }
  }
  
  // Rating page (feedback form) - hex IDs only
  const ratingMatch = pathname.match(/^\/r\/([a-f0-9]+)$/);
  if (ratingMatch) {
    const requestId = ratingMatch[1];
    if (method === 'GET') {
      return handleGetRatingPage(requestId, res);
    }
    if (method === 'POST') {
      return handleSubmitFeedback(requestId, req, res);
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

// ============ SERVER STARTUP ============
try {
  // P0.1: Validate secrets before starting
  validateProductionSecrets();
  
  server.listen(PORT, () => {
    const settings = getSettings();
    console.log(`[REPUTY][API] Serveur démarré sur http://localhost:${PORT} (version ${VERSION})`);
    console.log(`[REPUTY][API] Environment: ${NODE_ENV}`);
    console.log(`[REPUTY][API] Storage: ${storage.USE_SQLITE ? 'SQLite (reputy.db)' : 'data.json (legacy)'}`);
    console.log(`[REPUTY][API] Page de notation: ${REVIEWS_BASE_URL}/r/{id}`);
    console.log(`[REPUTY][API] Cabinet: ${settings.cabinetName}`);
    console.log(`[REPUTY][API] Google Review: ${settings.googleReviewUrl}`);
  });
} catch (error) {
  console.error('[REPUTY][FATAL] Server startup failed:', error.message);
  process.exit(1);
}
