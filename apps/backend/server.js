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
//  - GET    /internal/admin/health                  -> health check riche (P1.1)
//  - GET    /internal/admin/metrics                 -> business metrics (P1.2)
//  - GET    /internal/admin/feedbacks              -> feedbacks admin (P5)
//  - GET    /internal/admin/legacy-auth-stats      -> stats legacy auth (P5)
//  - GET    /internal/admin/mrr-history            -> MRR snapshots history (P2)
//  - POST   /telemetry/extension       -> log depuis extension
//
// Google Business Profile (OAuth + API):
//  - GET  /google/oauth/callback           -> Google OAuth redirect (renders HTML)
//  - GET  /client/google/status            -> connection status
//  - GET  /client/google/auth-url          -> generate OAuth URL
//  - POST /client/google/callback          -> exchange code for tokens
//  - GET  /client/google/accounts          -> list GBP accounts/locations
//  - POST /client/google/select-location   -> select a location
//  - POST /client/google/sync              -> sync reviews from Google
//  - POST /client/google/post-reply/:id    -> post reply to Google
//  - POST /client/google/disconnect        -> disconnect Google
//  - GET  /client/google/sync-log          -> sync history
//
// Public API (lecture seule, pas d'auth):
//  - GET    /public/org/by-key/:publicKey -> info org par publicKey
//
// Configuration via variables d'environnement :
//  - PORT                (défaut : 8787)
//  - CABINET_API_TOKEN   (token attendu par l'extension)
//  - REVIEWS_BASE_URL    (défaut : http://localhost:PORT)
//  - INTERNAL_ADMIN_TOKEN (token backoffice super admin)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash, createHmac, timingSafeEqual } = require('node:crypto');
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

// Audit log
const { writeAudit } = require('./lib/audit-log');

// RBAC (session-auth endpoints only)
const { checkRole } = require('./lib/rbac');

// AI provider (PR-3)
const { suggestReply: aiSuggestReply } = require('./lib/ai/openai-provider');

// Email provider (Brevo API or dry-run)
const emailProvider = require('./lib/email/provider');
const emailSigner = require('./lib/email/signer');
const emailMonitoring = require('./lib/email/monitoring');
const emailWarmup = require('./lib/email/warmup');

// Sentry — optional error tracking (PR-5, no-op if SENTRY_DSN absent)
const sentry = require('./lib/sentry');

// Zod validation helper (PR-5)
const { validateBody, schemas } = require('./lib/validate-body');

// Google Business Profile integration
const googleOAuth = require('./lib/google/google-oauth');
const googleBusiness = require('./lib/google/google-business');
const googleSync = require('./lib/google/google-sync');

// Health monitoring & resilience
const heartbeatRepo = require('./lib/repositories/worker-heartbeat.repo');
const circuitBreaker = require('./lib/resilience/circuit-breaker');

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

  // 3) Flush Sentry events best-effort before exiting
  const flushAndExit = async () => {
    try {
      await sentry.flush(2000);
    } catch (err) { console.debug('[SHUTDOWN] Sentry flush failed:', err.message); }
    process.exit(exitCode);
  };

  // 4) Force exit after timeout (in case server.close() hangs on open connections)
  const SHUTDOWN_TIMEOUT_MS = 5000;
  const forceExitTimer = setTimeout(() => {
    console.error(`[REPUTY][SHUTDOWN] Forced exit after ${SHUTDOWN_TIMEOUT_MS}ms timeout`);
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // Don't keep process alive just for this timer

  // 5) Attempt exit after Sentry flush (the timeout above is a safety net)
  setImmediate(() => {
    flushAndExit();
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
  sentry.captureException(err, { source: 'uncaughtException' }, { level: 'fatal' });
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
  const errObj = reason instanceof Error ? reason : new Error(errMessage);
  sentry.captureException(errObj, { source: 'unhandledRejection' }, { level: 'fatal' });
  gracefulShutdown('unhandledRejection', errObj);
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

// ============ P1.6: MESSAGING KILL SWITCH ============
// If enabled, all SMS/email sends are silently skipped (simulated success).
// Set MESSAGING_DISABLED=1 or MESSAGING_DISABLED=true to activate.
const MESSAGING_DISABLED = ['1', 'true'].includes((process.env.MESSAGING_DISABLED || '').toLowerCase());

// ============ AUTH CONFIG ============
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACKS.JWT_SECRET;
const SESSION_EXPIRY_DAYS = 7;
const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const BCRYPT_ROUNDS = 10;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || (IS_PRODUCTION ? '' : 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3001'))
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
 * Check rate limit for a given key (route:ip or ai:orgId:userId)
 * @param {string} key - Unique key (e.g., "/auth/login:192.168.1.1", "ai:org1:user1")
 * @param {number} maxAttempts - Max attempts per window (default: AUTH_RATE_LIMIT_MAX_ATTEMPTS)
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec?: number }}
 */
function checkRateLimit(key, maxAttempts = AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
  const now = Date.now();
  const entry = authRateLimitStore.get(key);
  
  // No entry or expired: create new
  if (!entry || now >= entry.resetAt) {
    authRateLimitStore.set(key, {
      count: 1,
      resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true, remaining: maxAttempts - 1 };
  }
  
  // Entry exists and not expired
  entry.count++;
  
  if (entry.count > maxAttempts) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  
  return { allowed: true, remaining: maxAttempts - entry.count };
}

/**
 * Apply rate limiting to a request
 * @param {object} req
 * @param {object} res
 * @param {string} route - Rate limit bucket name
 * @param {number} [maxAttempts] - Override default max attempts per window
 * @returns {boolean} true if request should be blocked
 */
function applyAuthRateLimit(req, res, route, maxAttempts) {
  // En dev, désactiver le rate limiting pour localhost
  if (!IS_PRODUCTION) {
    const ip = getClientIp(req);
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || ip === '::ffff:127.0.0.1') {
      return false; // Never block localhost in dev
    }
  }
  
  const ip = getClientIp(req);
  const key = `${route}:${ip}`;
  const result = checkRateLimit(key, maxAttempts);
  
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

// Start periodic cleanup (rate limit + expired login_pending tokens)
setInterval(() => {
  cleanupRateLimitStore();
  // Cleanup expired login_pending tokens (multi-org login flow)
  try {
    const repos = storage.getRepos();
    if (repos && repos.membership) {
      const cleaned = repos.membership.cleanupLoginPending();
      if (cleaned > 0 && !IS_PRODUCTION) {
        console.log(`[LoginPending] Cleaned ${cleaned} expired tokens`);
      }
    }
  } catch (err) { console.debug('[CLEANUP] Rate limit cleanup skipped:', err.message); }
}, AUTH_RATE_LIMIT_CLEANUP_INTERVAL_MS);

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

  // Allow Chrome extension origins (they authenticate via API token, not cookies)
  if (origin.startsWith('chrome-extension://')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, x-admin-token, x-api-token, x-public-key, X-Internal-Admin-Token, X-Cabinet-Api-Token, X-Public-Key, X-Request-Id'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return 'preflight';
    }
    return 'pass';
  }

  // Same-origin: patient pages served by this backend (e.g. /r/{id}) do fetch POST
  // The browser sends Origin: https://api.reputyapp.com which IS the backend itself.
  const selfOrigin = REVIEWS_BASE_URL.replace(/\/$/, '');
  if (origin === selfOrigin) {
    // Same-origin request from our own served pages — allow without CORS headers
    // (no Access-Control-Allow-Origin needed for same-origin)
    return 'pass';
  }

  // P1.5: Block 'null' origin in production (sandbox iframes, local file://)
  if (IS_PRODUCTION && origin === 'null') {
    logger.logError('CORS_BLOCKED_NULL', { origin, url: req.url, method: req.method });
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return 'blocked';
  }

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
    'Content-Type, Authorization, X-Requested-With, x-admin-token, x-api-token, x-public-key, X-Internal-Admin-Token, X-Cabinet-Api-Token, X-Public-Key, X-Request-Id'
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
      '  Exemple: ALLOWED_ORIGINS=https://app.reputyapp.com,https://reputyapp.com'
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
  // Accès ReputyBoard, réponses manuelles, 1 QR (200 scans)
  // Campagnes SMS/Email UNIQUEMENT via achat de packs
  health_bronze: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 200, nfcScans: 0 },
  food_bronze: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 200, nfcScans: 0 },
  business_bronze: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 200, nfcScans: 0 },
  // Alias pour rétrocompatibilité
  health_basic: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 200, nfcScans: 0 },
  food_basic: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 200, nfcScans: 0 },
  business_basic: { smsIncluded: 0, emailIncluded: 0, aiIncluded: 0, qrIncluded: 1, nfcIncluded: 0, qrScans: 200, nfcScans: 0 },

  // ──────────────────────────────────────────────────────────────
  // ARGENT - 49€ HT/mois
  // ──────────────────────────────────────────────────────────────
  // 200 SMS, 2000 emails, 100 IA, Module Doctolib, 3 QR (1000 scans), 1 NFC (1000 scans)
  health_argent: { smsIncluded: 200, emailIncluded: 2000, aiIncluded: 100, qrIncluded: 3, nfcIncluded: 1, qrScans: 1000, nfcScans: 1000 },
  food_argent: { smsIncluded: 200, emailIncluded: 2000, aiIncluded: 100, qrIncluded: 3, nfcIncluded: 1, qrScans: 1000, nfcScans: 1000 },
  business_argent: { smsIncluded: 200, emailIncluded: 2000, aiIncluded: 100, qrIncluded: 3, nfcIncluded: 1, qrScans: 1000, nfcScans: 1000 },
  // Alias (silver = argent)
  health_silver: { smsIncluded: 200, emailIncluded: 2000, aiIncluded: 100, qrIncluded: 3, nfcIncluded: 1, qrScans: 1000, nfcScans: 1000 },
  health_pro: { smsIncluded: 200, emailIncluded: 2000, aiIncluded: 100, qrIncluded: 3, nfcIncluded: 1, qrScans: 1000, nfcScans: 1000 },

  // ──────────────────────────────────────────────────────────────
  // RÉTRO-COMPAT: ancien "Or/Gold" → quotas Platinum
  // Les clients existants en "or" gardent le même service (= platinum)
  // ──────────────────────────────────────────────────────────────
  health_or: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
  food_or: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
  business_or: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
  health_gold: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
  health_enterprise: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },

  // ──────────────────────────────────────────────────────────────
  // PLATINUM - 99€ HT/mois
  // ──────────────────────────────────────────────────────────────
  // 500 SMS, 4000 emails, 200 IA, Module Doctolib, 10 QR (1000 scans), 3 NFC (1000 scans)
  health_platinum: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
  food_platinum: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
  business_platinum: { smsIncluded: 500, emailIncluded: 4000, aiIncluded: 200, qrIncluded: 10, nfcIncluded: 3, qrScans: 1000, nfcScans: 1000 },
};

// Plan tier mapping (for feature access checks)
// V2: 3 tiers — Bronze(0), Argent(1), Platinum(2). Ancien "or/gold" → tier 2
const PLAN_TIERS = {
  bronze: 0,
  basic: 0, // alias
  argent: 1,
  silver: 1, // alias
  pro: 1, // alias
  or: 2,         // rétro-compat → tier Platinum
  gold: 2,       // rétro-compat → tier Platinum
  enterprise: 2, // rétro-compat → tier Platinum
  platinum: 2,
};

// Features available per tier
const TIER_FEATURES = {
  0: ['reputyboard', 'manual_replies', 'qr_basic'], // Bronze
  1: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib', 'ai', 'monthly_report'], // Argent
  2: ['reputyboard', 'manual_replies', 'qr', 'nfc', 'sms', 'email', 'doctolib', 'ai', 'advanced_report', 'priority_support'], // Platinum
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
// V2: Packs simplifiés — Pack SMS 200, Pack Email 1000, Pack IA 50, QR, QR+NFC
const PACK_CATALOG = {
  pack_sms_200: {
    code: 'pack_sms_200',
    name: 'Pack 200 SMS',
    smsMonthly: 200,
    emailMonthly: 0,
    aiMonthly: 0,
    priceMonthlyCents: 2900, // 29€
    currency: 'EUR'
  },
  pack_email_1000: {
    code: 'pack_email_1000',
    name: 'Pack 1000 Emails',
    smsMonthly: 0,
    emailMonthly: 1000,
    aiMonthly: 0,
    priceMonthlyCents: 1900, // 19€
    currency: 'EUR'
  },
  pack_ia_50: {
    code: 'pack_ia_50',
    name: 'Pack 50 IA',
    smsMonthly: 0,
    emailMonthly: 0,
    aiMonthly: 50,
    priceMonthlyCents: 2900, // 29€
    currency: 'EUR'
  },
  pack_qr: {
    code: 'pack_qr',
    name: 'QR Code supplémentaire',
    smsMonthly: 0,
    emailMonthly: 0,
    aiMonthly: 0,
    qr: 1,
    qrScans: 1000,
    priceMonthlyCents: 500, // 5€
    currency: 'EUR'
  },
  pack_qr_nfc: {
    code: 'pack_qr_nfc',
    name: 'QR Code + NFC Tag',
    smsMonthly: 0,
    emailMonthly: 0,
    aiMonthly: 0,
    qr: 1,
    nfc: 1,
    qrScans: 1000,
    nfcScans: 1000,
    priceMonthlyCents: 1500, // 15€
    currency: 'EUR'
  },
  // Rétro-compatibilité : les anciens packs continuent de fonctionner
  pack_sms_50: { code: 'pack_sms_50', name: 'Pack 50 SMS (ancien)', smsMonthly: 50, emailMonthly: 0, aiMonthly: 0, priceMonthlyCents: 1500, currency: 'EUR' },
  pack_sms_100: { code: 'pack_sms_100', name: 'Pack 100 SMS (ancien)', smsMonthly: 100, emailMonthly: 0, aiMonthly: 0, priceMonthlyCents: 2500, currency: 'EUR' },
  pack_email_100: { code: 'pack_email_100', name: 'Pack 100 Emails (ancien)', smsMonthly: 0, emailMonthly: 100, aiMonthly: 0, priceMonthlyCents: 500, currency: 'EUR' },
  pack_combo_50: { code: 'pack_combo_50', name: 'Pack Combo 50 (ancien)', smsMonthly: 50, emailMonthly: 50, aiMonthly: 0, priceMonthlyCents: 1800, currency: 'EUR' },
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
  for (const byte of bytes) {
    result += chars[byte % chars.length];
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
    logger.logInfo('BILLING_PRORATA', `Prorata applied: ratio=${(ratio * 100).toFixed(1)}%, SMS: ${smsMonthlyBase} → ${smsIncludedThisPeriod}, Email: ${emailMonthlyBase} → ${emailIncludedThisPeriod}, AI: ${aiMonthlyBase} → ${aiIncludedThisPeriod}`);
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

function migrateFromOldAllocations(org, allocations, period) {
  const currentAllocations = allocations.filter(
    a => a.periodStart === period.periodStart && a.periodEnd === period.periodEnd
  );
  
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
    migrateFromOldAllocations(org, allocations, period);
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
const CREDIT_FIELD_MAP = {
  sms: { subUsed: 'smsUsedThisPeriod', packField: 'smsRemaining' },
  email: { subUsed: 'emailUsedThisPeriod', packField: 'emailRemaining' },
  ai: { subUsed: 'aiUsedThisPeriod', packField: 'aiRemaining' },
  qr: { subUsed: 'qrUsedThisPeriod', packField: 'qrRemaining' },
  nfc: { subUsed: 'nfcUsedThisPeriod', packField: 'nfcRemaining' },
};
const QUOTA_LABELS = { qr: 'QR', nfc: 'NFC' };

function buildQuotaExceededResponse(org, type, sub, pack) {
  const total = getTotalRemaining(org);
  const quotaTypeLabel = QUOTA_LABELS[type] || type.toUpperCase();
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

function debitCredits(data, org, type, qty = 1) {
  ensureCurrentPeriod(data, org, true);

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

  const fields = CREDIT_FIELD_MAP[type];
  if (!fields) return { success: false, reason: 'INVALID_TYPE' };

  const sub = getSubscriptionRemaining(org);
  const pack = getPackRemaining(org);

  if (sub[type] >= qty) {
    org.subscriptionCredits[fields.subUsed] = (org.subscriptionCredits[fields.subUsed] || 0) + qty;
    return { success: true, debitedFrom: 'subscription' };
  }

  if (pack[type] >= qty) {
    org.packWallet[fields.packField] = (org.packWallet[fields.packField] || 0) - qty;
    return { success: true, debitedFrom: 'pack' };
  }

  return buildQuotaExceededResponse(org, type, sub, pack);
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
  
  // Get pack credits (used in legacy billingComputed)
  const pack = getPackRemaining(org);
  
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
  
  // Get effective billing from centralized function (source of truth for quotas)
  const eb = effectiveBilling.computeEffectiveBilling({ 
    org, 
    now: debugNow ? new Date(debugNow) : new Date(),
    ensurePeriod: false // Already ensured above
  });

  // *** creditsComputed: aligned with computeEffectiveBilling (source of truth) ***
  // Uses eb.quotasEffective (catalog + bonus) for "included" values
  // Uses eb.monthlyUsed for "used" values
  // Computes "remaining" from (catalog_included - used) to avoid stale DB values
  const ebSmsIncluded = eb.quotasEffective.smsIncluded;
  const ebEmailIncluded = eb.quotasEffective.emailIncluded;
  const ebAiIncluded = eb.quotasEffective.aiIncluded;
  const ebSmsUsed = eb.monthlyUsed.sms;
  const ebEmailUsed = eb.monthlyUsed.email;
  const ebAiUsed = eb.monthlyUsed.ai;
  // Remaining = catalog included - used (not from DB smsTotal which may be stale)
  const ebSmsRemaining = Math.max(0, ebSmsIncluded - ebSmsUsed);
  const ebEmailRemaining = Math.max(0, ebEmailIncluded - ebEmailUsed);
  const ebAiRemaining = Math.max(0, ebAiIncluded - ebAiUsed);

  const creditsComputed = {
    // Period info
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
    
    // Prorata info
    isProrata,
    ratio,
    ratioPercent: Math.round(ratio * 100),
    
    // Subscription credits (monthly, expiring)
    // Source of truth: plan-catalog quotas + bonus (not stale DB subscriptionCredits.smsTotal)
    subscription: {
      // Base monthly values (from plan-catalog)
      smsMonthlyBase: smsMonthlyBase,
      emailMonthlyBase: emailMonthlyBase,
      aiMonthlyBase: aiMonthlyBase,
      // Effective included values for this period (catalog + bonus)
      smsIncludedMonthly: ebSmsIncluded,
      emailIncludedMonthly: ebEmailIncluded,
      aiIncludedMonthly: ebAiIncluded,
      // Gift credits
      smsGiftMonthly: eb.bonusMonthly?.sms || smsGift,
      emailGiftMonthly: eb.bonusMonthly?.email || emailGift,
      aiGiftMonthly: eb.bonusMonthly?.ai || aiGift,
      // Totals and usage — catalog as source of truth
      smsTotal: ebSmsIncluded,
      emailTotal: ebEmailIncluded,
      aiTotal: ebAiIncluded,
      smsUsed: ebSmsUsed,
      emailUsed: ebEmailUsed,
      aiUsed: ebAiUsed,
      smsRemaining: ebSmsRemaining,
      emailRemaining: ebEmailRemaining,
      aiRemaining: ebAiRemaining,
      // Prorata specific
      isProrata,
      ratio,
      expiresAt: org.billing.periodEnd
    },
    
    // Pack wallet (persistent) — from effectiveBilling
    pack: {
      smsRemaining: eb.packsBalance.sms,
      emailRemaining: eb.packsBalance.email,
      aiRemaining: eb.packsBalance.ai,
      persistent: true,
      requiresActiveSubscription: true
    },
    
    // Totals (subscription remaining + packs) — consistent with catalog
    total: {
      smsRemaining: ebSmsRemaining + eb.packsBalance.sms,
      emailRemaining: ebEmailRemaining + eb.packsBalance.email,
      aiRemaining: ebAiRemaining + eb.packsBalance.ai
    },
    
    // Status check
    canSend: org.status === 'active' && ((ebSmsRemaining + eb.packsBalance.sms) > 0 || (ebEmailRemaining + eb.packsBalance.email) > 0),
    subscriptionActive: org.status === 'active'
  };
  
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
  const buf = randomBytes(4);
  const num = buf.readUInt32BE(0) % 900000 + 100000;
  return num.toString();
}

/**
 * Create a new session
 */
function createSession(data, userId, orgId) {
  // SQLite mode: use session repository for persistence
  const repos = storage.getRepos();
  if (repos && repos.session) {
    return repos.session.createSession(userId, orgId, SESSION_EXPIRY_DAYS);
  }
  
  // Legacy JSON mode
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
    
    // Get org from SQLite — use session's orgId (supports multi-org switch)
    const org = repos.org.getById(sessionData.orgId);
    
    // CRITICAL: override user.orgId with session orgId so all endpoints
    // automatically use the correct org after a switch (no need to patch every endpoint)
    const effectiveUser = { ...user, orgId: sessionData.orgId };
    
    return { 
      user: effectiveUser, 
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
  // SQLite mode: use user repository
  const repos = storage.getRepos();
  if (repos && repos.user) {
    return repos.user.getByEmail(email);
  }
  // Legacy JSON mode
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
 * Send an email via the real provider (Brevo API) or dry-run.
 * Falls back to console simulation if provider fails.
 */
function sendEmail(data, to, subject, textContent, htmlContent = null) {
  const emailRecord = {
    id: generateId(),
    to,
    subject,
    text: textContent,
    html: htmlContent,
    createdAt: nowISO(),
    status: 'pending'
  };
  
  data.emailOutbox.push(emailRecord);
  
  // Send via real provider (async, fire-and-forget)
  emailProvider.sendEmail({
    to,
    subject,
    text: textContent,
    html: htmlContent || undefined,
  }).then((result) => {
    emailRecord.status = 'sent';
    emailRecord.messageId = result.messageId;
    console.log(`[REPUTY][EMAIL] ✅ Envoyé à ${to} — sujet: "${subject}" — messageId: ${result.messageId}`);
  }).catch((err) => {
    emailRecord.status = 'error';
    emailRecord.error = err.message;
    console.error(`[REPUTY][EMAIL] ❌ Échec envoi à ${to} — sujet: "${subject}" — erreur: ${err.message}`);
    // Log in console for debugging
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL NON ENVOYÉ (fallback console)');
    console.log('='.repeat(60));
    console.log(`À: ${to}`);
    console.log(`Sujet: ${subject}`);
    console.log('-'.repeat(60));
    console.log(textContent);
    console.log('='.repeat(60) + '\n');
  });
  
  return emailRecord;
}

/**
 * Create email verification
 */
function createEmailVerification(data, email, orgId = null) {
  const code = generateVerificationCode();
  
  let verification;
  
  // SQLite mode: use email verification repository for persistence
  const repos = storage.getRepos();
  if (repos && repos.emailVerification) {
    verification = repos.emailVerification.createOrUpdate(email, code, orgId);
  } else {
    // Legacy JSON mode
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
    verification = {
      id: generateId(),
      email: email.toLowerCase(),
      code,
      orgId,
      expiresAt,
      createdAt: nowISO(),
      usedAt: null
    };
    data.emailVerifications.push(verification);
  }
  
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
  
  // SQLite mode: use email verification repository
  const repos = storage.getRepos();
  if (repos && repos.emailVerification) {
    const verification = repos.emailVerification.verifyCode(normalizedEmail, code);
    if (!verification) {
      // Check if there's an active verification at all (to distinguish NOT_FOUND vs INVALID)
      const existing = repos.emailVerification.getByEmail(normalizedEmail);
      if (!existing) {
        return { valid: false, error: 'CODE_NOT_FOUND' };
      }
      if (new Date(existing.expiresAt) < new Date()) {
        return { valid: false, error: 'CODE_EXPIRED' };
      }
      return { valid: false, error: 'CODE_INVALID' };
    }
    // Clean up used verification
    repos.emailVerification.deleteByEmail(normalizedEmail);
    return { valid: true, verification };
  }
  
  // Legacy JSON mode
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
function resolveOrgByPublicKey(publicKey) {
  if (storage.USE_SQLITE) {
    const repos = storage.getRepos();
    return repos.org.getByPublicKey(publicKey);
  }
  const data = loadData();
  return getOrgByPublicKey(data, publicKey);
}

function extractApiToken(req) {
  const token = req.headers['x-api-token'] || '';
  if (token) return token;
  const authHeader = req.headers['authorization'] || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

function verifyTokenSqlite(token, org) {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const isCurrentToken = org.apiTokenHash &&
    tokenHash.length === org.apiTokenHash.length &&
    require('node:crypto').timingSafeEqual(Buffer.from(tokenHash), Buffer.from(org.apiTokenHash));
  if (isCurrentToken) return { ok: true, org };

  const hasPrevious = org.apiTokenPreviousHash &&
    org.apiTokenPreviousExpiresAt &&
    Date.now() < new Date(org.apiTokenPreviousExpiresAt).getTime();
  if (hasPrevious) {
    const isPrev = tokenHash.length === org.apiTokenPreviousHash.length &&
      require('node:crypto').timingSafeEqual(Buffer.from(tokenHash), Buffer.from(org.apiTokenPreviousHash));
    if (isPrev) {
      console.log(`[SECURITY] ℹ️  Using previous token (grace period) for org ${org.id}`);
      return { ok: true, org };
    }
  }

  return null;
}

function verifyTokenLegacy(token, org) {
  if (token === org.apiToken) return { ok: true, org };

  const isPreviousValid = org.apiTokenPrevious &&
    token === org.apiTokenPrevious &&
    org.apiTokenPreviousExpiresAt &&
    Date.now() < new Date(org.apiTokenPreviousExpiresAt).getTime();
  if (isPreviousValid) {
    console.log(`[SECURITY] ℹ️  Using previous token (grace period) for org ${org.id}`);
    return { ok: true, org };
  }

  return null;
}

function validateExtensionAuth(req, publicKey) {
  if (!publicKey) {
    return { ok: false, error: 'PUBLIC_KEY_REQUIRED', message: 'publicKey manquante' };
  }

  const org = resolveOrgByPublicKey(publicKey);
  if (!org) {
    return { ok: false, error: 'ORG_NOT_FOUND', message: 'Organisation non trouvée' };
  }

  const token = extractApiToken(req);
  if (!token) {
    return { ok: false, error: 'TOKEN_REQUIRED', message: 'API token manquant' };
  }

  if (token === DEV_FALLBACKS.CABINET_API_TOKEN) {
    if (!IS_PRODUCTION) {
      console.warn(`[SECURITY] ⚠️  DEV: Accepting dev-token for org ${org.id} (${org.name})`);
      return { ok: true, org };
    }
    console.error(`[SECURITY] 🚫 PROD: Rejected dev-token for org ${org.id}`);
    return { ok: false, error: 'UNAUTHORIZED', message: 'Token invalide en production' };
  }

  const result = (storage.USE_SQLITE && org.apiTokenHash)
    ? verifyTokenSqlite(token, org)
    : verifyTokenLegacy(token, org);
  if (result) return result;

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
function determineReviewRouting(rating, orgSettings) {
  const settings = orgSettings || getSettings();
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

/**
 * XSS Prevention: escape user-supplied values before injecting into HTML.
 * Prevents script injection via patient names, cabinet names, etc.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate that a URL is safe for use in HTML href attributes.
 * Only allows https:// URLs to prevent javascript: or data: injection.
 */
function sanitizeUrl(url) {
  if (!url) return '#';
  const trimmed = String(url).trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
  return '#';
}

const _RATING_SVG_LOGO = `<div class="logo">
  <svg viewBox="70 155 60 75" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" fill="#242c34"/>
  </svg>
  <span class="logo-text">health</span>
</div>`;

const _RATING_BASE_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; background: #9ca3af; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.card { background: #f3f4f6; border-radius: 24px; padding: 48px 40px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); border: 2px solid #111827; }
.logo { width: 80px; margin: 0 auto 12px; text-align: center; }
.logo svg { width: 60px; height: 60px; }
.logo-text { display: block; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 500; font-size: 14px; color: #242c34; margin-top: 4px; }
.slogan { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 15px; color: #242c34; letter-spacing: 0.3px; }`;

const _RATING_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`;

function _ratingPageData(request, settings) {
  const patientName = request?.patient?.name || 'Patient';
  const patientFirstName = request?.patient?.firstName || '';
  const patientLastName = request?.patient?.lastName || '';
  const displayName = patientFirstName && patientLastName
    ? `${patientFirstName} ${patientLastName}` : patientName;
  const firstName = patientFirstName || patientName.split(' ')[0];
  const cabinetName = settings?.cabinetName || DEFAULT_SETTINGS.cabinetName;
  const googleUrl = settings?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl;
  return {
    displayNameSafe: escapeHtml(displayName),
    firstNameSafe: escapeHtml(firstName),
    firstName,
    cabinetNameSafe: escapeHtml(cabinetName),
    googleUrlSafe: sanitizeUrl(googleUrl),
  };
}

function _generateAlreadySubmittedPage(data, existingFeedback) {
  const starsHtml = [1,2,3,4,5].map(i =>
    `<span class="star ${i <= existingFeedback.rating ? 'filled' : 'empty'}">★</span>`
  ).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Merci ! - ${data.cabinetNameSafe}</title>${_RATING_FONTS}
<style>${_RATING_BASE_CSS} .slogan { margin-bottom: 24px; }
h1 { font-size: 28px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
p { color: #1f2937; font-size: 16px; line-height: 1.6; }
.rating-display { display: flex; justify-content: center; gap: 8px; margin: 24px 0; }
.star { font-size: 32px; } .star.filled { color: #fbbf24; } .star.empty { color: #9ca3af; }
</style></head><body><div class="card">${_RATING_SVG_LOGO}
<p class="slogan">La réputation qui inspire confiance</p>
<h1>Merci ${data.displayNameSafe} !</h1>
<p>Votre avis a déjà été enregistré. Nous vous remercions pour votre retour.</p>
<div class="rating-display">${starsHtml}</div></div></body></html>`;
}

function _buildRatingScript(requestId, threshold, routingEnabled, firstName) { // NOSONAR - client-side JS assembled as string
  const rid = JSON.stringify(requestId);
  const fn = JSON.stringify(firstName);
  return `const requestId=${rid};const STORAGE_KEY='reputy_submitted_'+requestId;`
    + `const ROUTING_THRESHOLD=${threshold};const ROUTING_ENABLED=${routingEnabled};`
    + `const GOOGLE_URL=document.getElementById('googleBtn').href;`
    + `let selectedRating=0;let isSubmitting=false;`
    + `if(localStorage.getItem(STORAGE_KEY)==='true'){showAlreadySubmitted();}`
    + `const stars=document.querySelectorAll('.star');const commentSection=document.getElementById('commentSection');`
    + `const submitBtn=document.getElementById('submitBtn');const googleBtn=document.getElementById('googleBtn');`
    + `googleBtn.addEventListener('click',function(){try{navigator.sendBeacon('/r/'+requestId+'/redirected');}catch(e){console.debug(e);}});`
    + `stars.forEach(star=>{star.addEventListener('click',()=>{if(isSubmitting)return;selectedRating=parseInt(star.dataset.value);updateStars();commentSection.classList.add('visible');if(ROUTING_ENABLED&&selectedRating>=ROUTING_THRESHOLD){submitBtn.classList.remove('visible');googleBtn.style.display='flex';submitFeedbackSilent();}else{submitBtn.classList.add('visible');googleBtn.style.display='none';}});star.addEventListener('mouseenter',()=>{const val=parseInt(star.dataset.value);stars.forEach((s,i)=>{s.classList.toggle('hover',i<val);});});star.addEventListener('mouseleave',()=>{stars.forEach(s=>s.classList.remove('hover'));});});`
    + `function updateStars(){stars.forEach((star,i)=>{star.classList.toggle('active',i<selectedRating);});}`
    + `function showAlreadySubmitted(){document.getElementById('stars').style.display='none';document.getElementById('commentSection').style.display='none';document.getElementById('submitBtn').style.display='none';document.querySelector('.question').style.display='none';const msg=document.getElementById('successMessage');msg.textContent='\\u2713 Merci, votre avis a d\\u00e9j\\u00e0 \\u00e9t\\u00e9 enregistr\\u00e9.';msg.classList.add('visible');document.querySelector('.greeting').textContent='Merci !';}`
    + `async function submitFeedbackSilent(){if(isSubmitting)return;isSubmitting=true;try{const comment=document.getElementById('comment').value;const response=await fetch('/r/'+requestId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:selectedRating,comment})});if(response.ok||response.status===409){localStorage.setItem(STORAGE_KEY,'true');}}catch(e){console.error('Silent submit error:',e);}isSubmitting=false;}`
    + `async function submitFeedback(){if(isSubmitting)return;const card=document.getElementById('card');const comment=document.getElementById('comment').value;if(!selectedRating){alert('Veuillez s\\u00e9lectionner une note');return;}isSubmitting=true;card.classList.add('loading');submitBtn.disabled=true;submitBtn.textContent='Envoi...';try{const response=await fetch('/r/'+requestId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:selectedRating,comment})});const result=await response.json();if(response.status===409){localStorage.setItem(STORAGE_KEY,'true');showAlreadySubmitted();card.classList.remove('loading');return;}if(result.success||result.ok){localStorage.setItem(STORAGE_KEY,'true');document.getElementById('stars').style.display='none';commentSection.style.display='none';submitBtn.style.display='none';document.querySelector('.question').style.display='none';const routing=result.routing||{};if(routing.mode==='PUBLIC_REVIEW'&&routing.redirectUrl){googleBtn.href=routing.redirectUrl;googleBtn.style.display='flex';document.getElementById('successMessage').innerHTML='\\u2713 Merci ! Partagez votre exp\\u00e9rience sur Google ?';document.getElementById('successMessage').classList.add('visible');}else{document.getElementById('successMessage').innerHTML='\\u2713 Merci pour votre retour !';document.getElementById('successMessage').classList.add('visible');}document.querySelector('.greeting').textContent='Merci '+${fn}+' !';}else{alert(result.error||'Une erreur est survenue');submitBtn.disabled=false;submitBtn.textContent='Envoyer mon avis';isSubmitting=false;}}catch(e){console.error('Submit error:',e);alert('Erreur de connexion');submitBtn.disabled=false;submitBtn.textContent='Envoyer mon avis';isSubmitting=false;}card.classList.remove('loading');}`;
}

function _generateRatingFormPage(requestId, data, settings) {
  const threshold = settings?.reviewRouting?.threshold ?? 4;
  const routingEnabled = settings?.reviewRouting?.enabled !== false;
  const clientScript = _buildRatingScript(requestId, threshold, routingEnabled, data.firstName);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Donnez votre avis - ${data.cabinetNameSafe}</title>${_RATING_FONTS}
<style>${_RATING_BASE_CSS} .slogan { margin-bottom: 28px; }
h1 { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
.cabinet-name { font-size: 14px; color: #1f2937; margin-bottom: 32px; }
.greeting { font-size: 18px; color: #1f2937; margin-bottom: 8px; }
.question { font-size: 16px; color: #1f2937; margin-bottom: 24px; }
.stars { display: flex; justify-content: center; gap: 8px; margin-bottom: 32px; }
.star { font-size: 48px; cursor: pointer; transition: all 0.2s ease; color: #e5e7eb; user-select: none; }
.star:hover { transform: scale(1.15); } .star.active { color: #fbbf24; } .star.hover { color: #fcd34d; }
.comment-section { display: none; margin-bottom: 24px; } .comment-section.visible { display: block; }
.comment-section label { display: block; text-align: left; font-size: 14px; font-weight: 500; color: #1f2937; margin-bottom: 8px; }
textarea { width: 100%; min-height: 100px; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-family: inherit; font-size: 14px; resize: vertical; transition: border-color 0.2s; }
textarea:focus { outline: none; border-color: #667eea; }
.btn { display: none; width: 100%; padding: 16px 24px; border: none; border-radius: 12px; font-family: inherit; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.btn.visible { display: block; }
.btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px -5px rgba(102, 126, 234, 0.4); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
.btn-google { background: white; border: 2px solid #e5e7eb; color: #374151; display: flex; align-items: center; justify-content: center; gap: 12px; }
.btn-google:hover { border-color: #4285f4; background: #f8fafc; } .btn-google svg { width: 24px; height: 24px; }
.success-message { display: none; padding: 16px; background: #ecfdf5; border-radius: 12px; color: #059669; font-weight: 500; }
.success-message.visible { display: block; }
.privacy { margin-top: 24px; font-size: 12px; color: #6b7280; }
.loading { opacity: 0.7; pointer-events: none; }
</style></head><body>
<div class="card" id="card">${_RATING_SVG_LOGO}
<p class="slogan">La réputation qui inspire confiance</p>
<h1>Votre avis compte</h1>
<p class="cabinet-name">${data.cabinetNameSafe}</p>
<p class="greeting">Bonjour ${data.displayNameSafe},</p>
<p class="question">Comment s'est passée votre visite ?</p>
<div class="stars" id="stars">
  <span class="star" data-value="1">★</span><span class="star" data-value="2">★</span>
  <span class="star" data-value="3">★</span><span class="star" data-value="4">★</span>
  <span class="star" data-value="5">★</span>
</div>
<div class="comment-section" id="commentSection">
  <label for="comment">Un commentaire ? (optionnel)</label>
  <textarea id="comment" placeholder="Partagez votre expérience..."></textarea>
</div>
<button class="btn btn-primary" id="submitBtn" onclick="submitFeedback()">Envoyer mon avis</button>
<a href="${data.googleUrlSafe}" target="_blank" rel="noopener noreferrer" class="btn btn-google" id="googleBtn" style="display:none;text-decoration:none;">
  <svg viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>Laisser un avis sur Google
</a>
<div class="success-message" id="successMessage">✓ Merci pour votre retour !</div>
<p class="privacy">Vos données sont traitées de manière confidentielle.</p>
</div>
<script>${clientScript}</script></body></html>`;
}

function generateRatingPage(requestId, request, existingFeedback, settings) {
  const data = _ratingPageData(request, settings);
  if (existingFeedback) return _generateAlreadySubmittedPage(data, existingFeedback);
  return _generateRatingFormPage(requestId, data, settings);
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
  // ── Deep health check ──
  // 1) DB check
  let dbOk = false;
  try {
    const db = require('./lib/db');
    db.get("SELECT 1 AS ok");
    dbOk = true;
  } catch (err) { console.warn('[HEALTH] DB check failed:', err.message); }

  // 2) Worker heartbeats
  let workers = [];
  let workersHealthy = true;
  try {
    workers = heartbeatRepo.getAll();
    const unhealthy = heartbeatRepo.getUnhealthy();
    if (unhealthy.length > 0) workersHealthy = false;
  } catch (err) { console.warn('[HEALTH] Heartbeat check skipped:', err.message); }

  // 3) Circuit breakers
  const circuits = circuitBreaker.getStatus();
  const circuitsOk = Object.values(circuits).every(c => c.state === 'closed');

  // Overall status
  const ok = dbOk; // DB is critical; workers/circuits are warnings
  let status = 'healthy';
  if (!dbOk) status = 'critical';
  else if (!workersHealthy || !circuitsOk) status = 'degraded';

  sendJson(res, ok ? 200 : 503, {
    ok,
    status,
    version: VERSION,
    storage: storage.USE_SQLITE ? 'sqlite' : 'json',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk,
      workers: workers.map(w => ({
        name: w.workerName,
        status: w.status,
        lastOkAt: w.lastOkAt,
        lastError: w.lastError,
        itemsProcessed: w.itemsProcessed,
        durationMs: w.runDurationMs,
      })),
      circuitBreakers: circuits,
    },
  });
}

async function _handleSendReviewSQLite(req, res, body, orgId, startTime) {
  const repos = storage.getRepos();

  const freshOrg = repos.org.getById(orgId);
  if (!freshOrg) return sendJson(res, 500, { ok: false, error: 'ORG_NOT_FOUND' });

  const channel = body.channel;

  // Quota check before creating the request (fail-fast)
  const billing = effectiveBilling.computeEffectiveBilling({ org: freshOrg, repos });
  if (channel === 'sms' && billing.totalAvailableThisMonth.sms <= 0) {
    return sendJson(res, 402, {
      ok: false,
      error: 'SMS_QUOTA_EXCEEDED',
      errorCategory: 'QUOTA_SMS_EXCEEDED',
      message: 'Quota SMS atteint pour cette période. Passez au plan supérieur ou achetez un pack.',
      action: 'UPGRADE_PLAN',
      remainingSms: 0,
    });
  }
  if (channel === 'email' && billing.totalAvailableThisMonth.email <= 0) {
    return sendJson(res, 402, {
      ok: false,
      error: 'EMAIL_QUOTA_EXCEEDED',
      errorCategory: 'QUOTA_EMAIL_EXCEEDED',
      message: 'Quota email atteint pour cette période. Passez au plan supérieur ou achetez un pack.',
      action: 'UPGRADE_PLAN',
      remainingEmail: 0,
    });
  }

  const idempotencyKey = body.requestId || body.idempotencyKey || randomBytes(12).toString('hex');
  const feedbackUrl = `${REVIEWS_BASE_URL}/r/${idempotencyKey}`;

  const { request: dbRequest, created } = repos.request.createOrGetByIdempotencyKey(idempotencyKey, {
    orgId, channel: body.channel,
    patient: { name: body.patientName, firstName: body.patientFirstName || '', lastName: body.patientLastName || '', email: body.patientEmail || '', phone: body.patientPhone || '' },
    feedbackUrl,
    meta: { source: body.source || 'chrome-extension', pageUrl: body.pageUrl || '', appointmentDate: body.appointmentDate || '', locationId: body.locationId || '' }
  });

  if (!created) {
    return sendJson(res, 200, { ok: true, requestId: dbRequest.idempotencyKey, feedbackUrl: dbRequest.feedbackUrl, duplicate: true, reason: 'Requête déjà traitée (idempotent)' });
  }

  const recipient = channel === 'email' ? body.patientEmail : body.patientPhone;

  const smsResult = _enqueueSqliteChannel(repos, dbRequest, body, orgId, channel);
  if (smsResult) return sendJson(res, smsResult.status, smsResult.body);

  repos.message.create({ requestDbId: dbRequest.id, channel, recipient, status: 'queued' });

  // Usage is recorded by the worker when the message is actually sent (process-scheduled-sends.js
  // for SMS, process-email-outbox.js for email). Recording here would cause double counting.

  logger.logExtensionAction('EXTENSION_SEND_REVIEW_SUCCESS', true, req, { requestId: dbRequest.idempotencyKey, orgId, channel, durationMs: Date.now() - startTime, status: 201 });
  console.log(`[REPUTY][API] ✅ SQLite: New request created: ${dbRequest.idempotencyKey}`);
  return sendJson(res, 201, { ok: true, requestId: dbRequest.idempotencyKey, feedbackUrl: dbRequest.feedbackUrl, duplicate: false });
}

function _enqueueSqliteChannel(repos, dbRequest, body, orgId, channel) {
  if (channel === 'email' && body.patientEmail) {
    const dbModule = storage.getDb();
    dbModule.transaction(() => {
      repos.emailOutbox.createOutbox({
        orgId, toEmail: body.patientEmail, templateKey: 'review_request',
        payload: { patientName: body.patientName, patientFirstName: body.patientFirstName || '', requestId: dbRequest.idempotencyKey },
        requestDbId: dbRequest.id,
      });
      repos.request.setLifecycleStatus(dbRequest.id, 'queued');
    });
    return null;
  }
  if (channel === 'sms' && body.patientPhone) {
    if (repos.scheduledSend.hasExistingForRequest(dbRequest.id)) {
      return { status: 200, body: { ok: true, requestId: dbRequest.idempotencyKey, feedbackUrl: dbRequest.feedbackUrl, duplicate: true, message: 'SMS déjà programmé pour cette demande' } };
    }
    if (repos.scheduledSend.hasRecentSend(orgId, body.patientPhone)) {
      return { status: 429, body: { ok: false, error: 'ANTI_SPAM', message: 'Ce destinataire a déjà été contacté par SMS récemment (max 1 par semaine).' } };
    }
    let smsFeedbackUrl = dbRequest.feedbackUrl;
    try {
      const smsShortlink = repos.shortlink.create(orgId, 'sms', dbRequest.feedbackUrl, 'SMS demande avis');
      smsFeedbackUrl = repos.shortlink.buildShortUrl(smsShortlink.code, REVIEWS_BASE_URL);
    } catch (slErr) {
      console.warn('[REPUTY][SMS] Shortlink creation failed, using full URL:', slErr.message);
    }
    repos.scheduledSend.create({
      orgId, recipient: body.patientPhone,
      payload: { patientName: body.patientName, patientFirstName: body.patientFirstName || '', requestId: dbRequest.idempotencyKey, feedbackUrl: dbRequest.feedbackUrl, shortUrl: smsFeedbackUrl },
      requestDbId: dbRequest.id,
    });
    repos.request.setLifecycleStatus(dbRequest.id, 'queued');
    return null;
  }
  return null;
}

function handleSendReviewAuthFailure(req, res, auth, publicKey, reqId, startTime) {
  const data = loadData();
  recordTelemetry(data, null, 'warn', auth.error,
    `Auth failed: ${auth.message}`, { source: 'extension', publicKey: publicKey || 'none' });
  saveData(data);

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

function handleSendReviewAccessBlocked(req, res, data, org, accessCheckSms, publicKey, orgId, reqId, startTime) {
  recordTelemetry(data, orgId, 'warn', accessCheckSms.error?.errorCategory || 'SUBSCRIPTION_RESTRICTED',
    `Tentative d'envoi sur compte ${org.status}`, { source: 'extension', publicKey });
  saveData(data);

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

function checkSendReviewIdempotency(data, orgId, clientRequestId) {
  if (!clientRequestId || !orgId) return null;

  const existingUsage = findUsageByRequestId(data, orgId, clientRequestId);
  if (!existingUsage) return null;

  console.log(`[REPUTY][API] ⚡ Idempotence: requestId ${clientRequestId} déjà traité`);
  const existingReqId = existingUsage.meta?.requestId || existingUsage.meta?.originalRequestId;
  const existingRequest = existingReqId ? data.requests?.[existingReqId] : null;

  return {
    ok: true,
    deduped: true,
    requestId: existingReqId || clientRequestId,
    feedbackUrl: existingRequest?.feedbackUrl || null,
    message: 'Requête déjà traitée (idempotent)'
  };
}

function processResendCredits(req, res, data, body, existingRequest, id, orgId, reqId, startTime) {
  const channel = body.channel;
  const usageType = channel === 'email' ? 'email' : 'sms';
  const effectiveOrgId = orgId || existingRequest.orgId;

  if (!effectiveOrgId) return null;

  const org = data.orgs.find(o => o.id === effectiveOrgId);
  if (!org) return null;

  const usageResult = recordUsageAndDebit(data, org, usageType, {
    channel,
    requestId: id,
    patientName: body.patientName,
    patientContact: channel === 'email' ? body.patientEmail : body.patientPhone,
    resend: true,
    sendCount: existingRequest.sendCount
  });

  if (!usageResult.success) {
    saveData(data);

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

  return null;
}

function handleDuplicateResend(req, res, data, body, duplicate, orgId, reqId, startTime) {
  const { id, request: existingRequest } = duplicate;

  if ((existingRequest.sendCount || 1) < MAX_SEND_COUNT) {
    existingRequest.sendCount = (existingRequest.sendCount || 1) + 1;
    existingRequest.lastSentAt = new Date().toISOString();

    const quotaError = processResendCredits(req, res, data, body, existingRequest, id, orgId, reqId, startTime);
    if (quotaError) return quotaError;

    saveData(data);

    const effectiveOrgId = orgId || existingRequest.orgId;
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

function processNewRequestUsage(req, res, data, body, orgId, requestId, reqId, startTime, reviewUrl) {
  const channel = body.channel;
  const usageType = channel === 'email' ? 'email' : 'sms';

  if (!orgId) return null;

  const org = data.orgs.find(o => o.id === orgId);
  if (!org) return null;

  const usageRequestId = body.requestId || requestId;
  const usageResult = recordUsageAndDebit(data, org, usageType, {
    channel,
    requestId: usageRequestId,
    reviewRequestId: requestId,
    patientName: body.patientName,
    patientContact: channel === 'email' ? body.patientEmail : body.patientPhone
  });

  if (usageResult.deduped) {
    console.log('[REPUTY][API] Idempotent request detected, returning existing result');
    return sendJson(res, 200, {
      ok: true,
      requestId,
      feedbackUrl: reviewUrl,
      deduped: true,
      message: 'Requête déjà traitée (idempotent)'
    });
  }

  if (!usageResult.success) {
    saveData(data);

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

    const periodEndDate = org.billing?.periodEnd ?
      new Date(org.billing.periodEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) :
      'fin de mois';

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

  const orgIndex = data.orgs.findIndex(o => o.id === orgId);
  if (orgIndex >= 0) {
    data.orgs[orgIndex] = org;
  }

  const telemetryCode = usageType === 'sms' ? 'SEND_SMS_SUCCESS' : 'SEND_EMAIL_SUCCESS';
  recordTelemetry(data, orgId, 'info', telemetryCode,
    `${usageType.toUpperCase()} envoyé à ${body.patientName}`, {
      source: 'extension',
      requestId,
      channel,
      allocationId: usageResult.entry?.meta?.allocationId
    });

  return null;
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

  const publicKey = req.headers['x-public-key'];
  const auth = validateExtensionAuth(req, publicKey);

  if (!auth.ok) {
    return handleSendReviewAuthFailure(req, res, auth, publicKey, reqId, startTime);
  }

  const org = auth.org;
  const orgId = org.id;

  if (MESSAGING_DISABLED) {
    logger.logInfo('MESSAGING_DISABLED', { orgId, reqId, route: '/api/send-review-request' });
    return sendJson(res, 200, {
      ok: true,
      message: 'Messaging is temporarily disabled (maintenance mode)',
      sent: false,
      _killSwitch: true
    });
  }

  const data = loadData();

  const accessCheckSms = stateMachine.canPerformAction(org, 'sendSms');
  const accessCheckEmail = stateMachine.canPerformAction(org, 'sendEmail');

  if (!accessCheckSms.allowed && !accessCheckEmail.allowed) {
    return handleSendReviewAccessBlocked(req, res, data, org, accessCheckSms, publicKey, orgId, reqId, startTime);
  }

  const idempotentResult = checkSendReviewIdempotency(data, orgId, body.requestId);
  if (idempotentResult) {
    return sendJson(res, 200, idempotentResult);
  }

  const idempotencyKey = generateIdempotencyKey(body);
  const duplicate = findDuplicateRequest(data, idempotencyKey);

  if (duplicate) {
    return handleDuplicateResend(req, res, data, body, duplicate, orgId, reqId, startTime);
  }

  if (storage.USE_SQLITE) {
    return _handleSendReviewSQLite(req, res, body, orgId, startTime);
  }

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
    orgId: orgId || null,
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

  const usageResponse = processNewRequestUsage(req, res, data, body, orgId, requestId, reqId, startTime, reviewUrl);
  if (usageResponse) return usageResponse;

  saveData(data);

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
  // ============ SQLITE MODE: lookup by idempotency key ============
  if (storage.USE_SQLITE) {
    const repos = storage.getRepos();
    const dbRequest = repos.request.getByIdempotencyKey(requestId);
    
    if (dbRequest) {
      // Check expiry
      if (isRequestExpired(dbRequest)) {
        return sendHtml(res, 410, generateExpiredPage());
      }
      
      // Check existing feedback
      const existingFeedback = repos.feedback.getByRequestDbId(dbRequest.id);

      // Load settings from the org that owns this request (multi-org support)
      let settings;
      if (dbRequest.orgId && repos.org) {
        const org = repos.org.getById(dbRequest.orgId);
        settings = {
          cabinetName: org?.name || DEFAULT_SETTINGS.cabinetName,
          googleReviewUrl: org?.options?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
          reviewRouting: org?.options?.reviewRouting || DEFAULT_SETTINGS.reviewRouting,
        };
      } else {
        settings = getSettings();
      }

      return sendHtml(res, 200, generateRatingPage(requestId, dbRequest, existingFeedback, settings));
    }
  }
  
  // ============ JSON MODE (legacy fallback) ============
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

function buildFeedbackRoutingResponse(rating, orgSettings) {
  const routing = determineReviewRouting(rating, orgSettings);
  const settings = orgSettings || getSettings();
  return {
    ok: true,
    success: true,
    routing: routing,
    redirectToGoogle: routing.mode === 'PUBLIC_REVIEW',
    googleUrl: routing.redirectUrl || settings.googleReviewUrl
  };
}

async function parseFeedbackBody(req) {
  const body = await parseBody(req);
  const rating = parseInt(body.rating);
  if (!rating || rating < 1 || rating > 5) return null;
  return { rating, comment: (body.comment || '').trim() };
}

async function handleSubmitFeedbackSqlite(requestId, req, res) {
  const repos = storage.getRepos();
  const dbModule = storage.getDb();
  const dbRequest = repos.request.getByIdempotencyKey(requestId);

  if (!dbRequest) return null;

  if (isRequestExpired(dbRequest)) {
    return sendJson(res, 410, { ok: false, error: 'REQUEST_EXPIRED' });
  }

  const existingFb = repos.feedback.getByRequestDbId(dbRequest.id);
  if (existingFb) {
    return sendJson(res, 409, { ok: false, error: 'ALREADY_SUBMITTED' });
  }

  let parsed;
  try { parsed = await parseFeedbackBody(req); } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_BODY' });
  }
  if (!parsed) return sendJson(res, 400, { ok: false, error: 'INVALID_RATING' });

  dbModule.transaction(() => {
    repos.feedback.create({
      requestDbId: dbRequest.id,
      orgId: dbRequest.orgId,
      rating: parsed.rating,
      comment: parsed.comment,
      source: dbRequest.channel || 'web',
    });
    repos.request.setLifecycleStatus(dbRequest.id, 'feedback_received');
  });

  console.log('[REPUTY][FEEDBACK] Nouveau feedback (SQLite)', {
    requestId, dbId: dbRequest.id, rating: parsed.rating, hasComment: !!parsed.comment
  });

  // Load org-specific settings for routing (correct googleReviewUrl per org)
  let orgSettings;
  if (dbRequest.orgId && repos.org) {
    const org = repos.org.getById(dbRequest.orgId);
    orgSettings = {
      cabinetName: org?.name || DEFAULT_SETTINGS.cabinetName,
      googleReviewUrl: org?.options?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
      reviewRouting: org?.options?.reviewRouting || DEFAULT_SETTINGS.reviewRouting,
    };
  }

  return sendJson(res, 200, buildFeedbackRoutingResponse(parsed.rating, orgSettings));
}

async function handleSubmitFeedback(requestId, req, res) {
  if (storage.USE_SQLITE) {
    const sqliteResult = await handleSubmitFeedbackSqlite(requestId, req, res);
    if (sqliteResult !== null) return sqliteResult;
  }

  const data = loadData();
  const request = data.requests[requestId];

  if (!request) return sendJson(res, 404, { ok: false, error: 'REQUEST_NOT_FOUND' });
  if (isRequestExpired(request)) return sendJson(res, 410, { ok: false, error: 'REQUEST_EXPIRED' });

  if (data.feedbacks[requestId]) {
    console.log('[REPUTY][FEEDBACK] Tentative de double soumission bloquée', { requestId });
    return sendJson(res, 409, { ok: false, error: 'ALREADY_SUBMITTED' });
  }

  let parsed;
  try { parsed = await parseFeedbackBody(req); } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_BODY' });
  }
  if (!parsed) return sendJson(res, 400, { ok: false, error: 'INVALID_RATING' });

  const now = new Date().toISOString();
  data.feedbacks[requestId] = {
    requestId,
    submittedAt: now,
    createdAt: now,
    rating: parsed.rating,
    comment: parsed.comment,
    channel: request.channel,
    patient: request.patient,
    meta: { userAgent: req.headers['user-agent'] || '' }
  };
  saveData(data);

  console.log('[REPUTY][FEEDBACK] Nouveau feedback', {
    requestId, rating: parsed.rating, hasComment: !!parsed.comment
  });

  const routing = determineReviewRouting(parsed.rating);
  data.feedbacks[requestId].routing = routing;
  saveData(data);

  return sendJson(res, 200, buildFeedbackRoutingResponse(parsed.rating));
}

/**
 * Track public redirect click (beacon from patient page).
 * Updates review_request lifecycle → public_redirected.
 */
function handleTrackRedirect(requestId, res) {
  if (storage.USE_SQLITE) {
    try {
      const repos = storage.getRepos();
      const rr = repos.request.getByIdempotencyKey(requestId);
      if (rr) {
        repos.request.setLifecycleStatus(rr.id, 'public_redirected');
      }
    } catch (e) {
      console.error('[REPUTY][REDIRECT] Lifecycle update error:', e.message);
    }
  }
  // Fire-and-forget: always 204
  res.writeHead(204);
  res.end();
}

/**
 * GET /r/review?token=... — Email review link (signed token)
 * Verifies HMAC token, resolves outbox → request, shows rating page.
 */
function handleEmailReviewLink(req, res, urlParams) {
  const token = urlParams.get('token');
  if (!token) {
    return sendHtml(res, 400, generate404Page());
  }

  const result = emailSigner.verifyToken(token);
  if (!result.valid) {
    console.log('[REPUTY][REVIEW-LINK] Invalid token:', result.error);
    if (result.error === 'token_expired') {
      return sendHtml(res, 410, generateExpiredPage());
    }
    return sendHtml(res, 403, generate404Page());
  }

  const { payload } = result;
  if (payload.type !== 'review') {
    return sendHtml(res, 400, generate404Page());
  }

  const repos = storage.getRepos();
  if (!repos) {
    return sendHtml(res, 404, generate404Page());
  }

  // Resolve: outbox → request (via requestDbId)
  const outboxEntry = repos.emailOutbox.getOutboxById(payload.outbox_id);
  if (!outboxEntry || !outboxEntry.requestDbId) {
    console.log('[REPUTY][REVIEW-LINK] Outbox entry not found or no requestDbId:', payload.outbox_id);
    return sendHtml(res, 404, generate404Page());
  }

  const dbRequest = repos.request.getById(outboxEntry.requestDbId);
  if (!dbRequest) {
    console.log('[REPUTY][REVIEW-LINK] Request not found for outbox:', outboxEntry.requestDbId);
    return sendHtml(res, 404, generate404Page());
  }

  // Check expiry
  if (isRequestExpired(dbRequest)) {
    return sendHtml(res, 410, generateExpiredPage());
  }

  // Check existing feedback
  const existingFeedback = repos.feedback.getByRequestDbId(dbRequest.id);

  // Charger les settings de l'org propriétaire du RDV (comme dans /r/:id)
  let settings;
  if (dbRequest.orgId && repos.org) {
    const org = repos.org.getById(dbRequest.orgId);
    settings = {
      cabinetName: org?.name || DEFAULT_SETTINGS.cabinetName,
      googleReviewUrl: org?.options?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
      reviewRouting: org?.options?.reviewRouting || DEFAULT_SETTINGS.reviewRouting,
    };
  } else {
    settings = getSettings();
  }

  // Use idempotencyKey as the requestId for the rating page (POST /r/:id uses this)
  return sendHtml(res, 200, generateRatingPage(dbRequest.idempotencyKey, dbRequest, existingFeedback, settings));
}

/**
 * GET /r/unsubscribe?token=... — One-click email unsubscribe
 * POST /r/unsubscribe?token=... — List-Unsubscribe-Post header
 */
function handleEmailUnsubscribe(req, res, urlParams) {
  const token = urlParams.get('token');
  if (!token) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Lien invalide</h1></body></html>');
    return;
  }

  const result = emailSigner.verifyToken(token);
  if (!result.valid) {
    console.log('[REPUTY][UNSUB] Invalid token:', result.error);
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Lien invalide ou expiré</h1></body></html>');
    return;
  }

  const { payload } = result;
  if (payload.type !== 'unsubscribe') {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Lien invalide</h1></body></html>');
    return;
  }

  const repos = storage.getRepos();
  if (!repos) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Erreur serveur</h1></body></html>');
    return;
  }

  // Add unsubscribe record (idempotent)
  repos.emailOutbox.addUnsubscribe(payload.org_id, payload.email, 'user_request');
  console.log(`[REPUTY][UNSUB] ✅ ${payload.email} unsubscribed from org ${payload.org_id}`);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Désinscription confirmée</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; padding: 50px 20px; background: #f8fafc; }
    .card { max-width: 400px; margin: 40px auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    h1 { font-size: 24px; color: #1f2937; }
    p { color: #6b7280; font-size: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Désinscription confirmée</h1>
    <p>Vous ne recevrez plus d'emails de demande d'avis de notre part.</p>
    <p style="font-size:13px; color:#9ca3af; margin-top:24px;">Si c'était une erreur, contactez votre praticien.</p>
  </div>
</body>
</html>`);
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
      smsTemplate: org.options?.smsTemplate || '',
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

function buildSettingsOptionsUpdate(body) {
  const optionsUpdate = {};
  if (body.googleReviewUrl !== undefined) {
    optionsUpdate.googleReviewUrl = body.googleReviewUrl.trim();
  }
  if (body.smsTemplate !== undefined) {
    const tpl = body.smsTemplate.trim();
    if (tpl && tpl.length <= 300) {
      if (!tpl.includes('{lien}')) {
        return { error: 'VALIDATION_ERROR', message: 'Le template SMS doit contenir {lien} pour inclure le lien de collecte.' };
      }
      optionsUpdate.smsTemplate = tpl;
    }
  }
  return optionsUpdate;
}

function saveSettingsSqlite(sessionAuth, body) {
  const org = sessionAuth.org;
  const repos = storage.getRepos();
  if (!repos || !repos.org) return null;

  const optionsUpdate = buildSettingsOptionsUpdate(body);
  if (optionsUpdate?.error) return optionsUpdate;
  repos.org.updateOptions(org.id, optionsUpdate);

  if (body.cabinetName !== undefined && body.cabinetName.trim()) {
    repos.org.update(org.id, { name: body.cabinetName.trim() });
  }

  const updatedOrg = repos.org.getById(org.id);

  logger.logAudit('SETTINGS_UPDATED', {
    orgId: org.id,
    userId: sessionAuth.user.id,
    changes: { googleReviewUrl: optionsUpdate.googleReviewUrl, cabinetName: body.cabinetName, smsTemplate: optionsUpdate.smsTemplate }
  });

  return {
    success: true,
    settings: {
      googleReviewUrl: updatedOrg.options?.googleReviewUrl || '',
      cabinetName: updatedOrg.name || '',
      smsTemplate: updatedOrg.options?.smsTemplate || ''
    }
  };
}

async function handleSaveSettings(req, res) {
  const data = loadData();
  const sessionAuth = getAuthUser(req, data);

  let body;
  try { body = await parseBody(req); } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }

  if (sessionAuth && sessionAuth.org) {
    if (!checkRole(sessionAuth, ['owner', 'admin'], res)) return;
    const v = validateBody(schemas.settingsUpdate, body);
    if (!v.ok) return sendJson(res, 400, v.payload);

    const result = saveSettingsSqlite(sessionAuth, body);
    if (!result) return sendJson(res, 500, { error: 'Base de données non disponible' });
    if (result.error) return sendJson(res, 400, result);
    return sendJson(res, 200, result);
  }

  const auth = legacyAuth(req, '/api/settings:POST');
  if (!auth.ok) return sendJson(res, 401, { error: auth.error });

  const currentSettings = data.settings || {};
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
 * P1.1: GET /internal/admin/health — Rich health check (admin-only).
 * Returns system status for monitoring (UptimeRobot / BetterStack).
 * HTTP 200 if ok/degraded, 503 if error.
 * Constraint: < 100ms, no sensitive data, Cache-Control: no-store.
 */
function _healthCheckDb(issues) {
  const info = { status: 'ok', wal_mode: null, foreign_keys: null, integrity_ok: null, latency_ms: null };
  let globalStatus = 'ok';
  try {
    const dbModule = storage.getDb();
    const database = dbModule ? dbModule.getDb() : null;
    if (database) {
      const t0 = Date.now();
      database.prepare('SELECT 1').get();
      info.latency_ms = Date.now() - t0;
      info.wal_mode = String(database.pragma('journal_mode', { simple: true })).toLowerCase() === 'wal';
      info.foreign_keys = Boolean(database.pragma('foreign_keys', { simple: true }));
      info.integrity_ok = (database.prepare('PRAGMA integrity_check(1)').get()?.integrity_check === 'ok');
      if (!info.integrity_ok) { info.status = 'error'; globalStatus = 'error'; issues.push('integrity_check failed'); }
    } else if (!storage.USE_SQLITE) {
      info.status = 'n/a';
    } else {
      info.status = 'error'; globalStatus = 'error'; issues.push('db not available');
    }
  } catch (err) {
    info.status = 'error'; globalStatus = 'error'; issues.push('db error');
    logger.logError('ADMIN_HEALTH_DB_ERROR', 'DB check failed during health check', { errorMessage: err.message });
  }
  return { info, globalStatus };
}

function _healthCheckBackups() {
  const info = { last_backup_utc: null, count_24h: 0, dir: 'backups' };
  try {
    const backupDir = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) info.last_backup_utc = files[0].mtime.toISOString();
      const now = Date.now();
      info.count_24h = files.filter(f => now - f.mtime.getTime() < 86400000).length;
    }
  } catch (err) { console.warn('[HEALTH] Backup check failed:', err.message); }
  return info;
}

function _healthCheckMrr() {
  const info = { last_snapshot_date: null, fresh: false };
  try {
    const repos = storage.getRepos();
    if (repos && repos.mrrSnapshot) {
      const latest = repos.mrrSnapshot.getLatest();
      if (latest) {
        info.last_snapshot_date = latest.date;
        info.fresh = (latest.date === new Date().toISOString().slice(0, 10));
      }
    }
  } catch (err) { console.warn('[HEALTH] MRR snapshot check failed:', err.message); }
  return info;
}

function handleAdminHealth(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status || 401, { error: auth.error });

  const issues = [];
  const { info: dbInfo, globalStatus: dbStatus } = _healthCheckDb(issues);
  const backupsInfo = _healthCheckBackups();
  const mrrSnapshotsInfo = _healthCheckMrr();

  const mem = process.memoryUsage();
  const processInfo = {
    rss_mb: +(mem.rss / 1048576).toFixed(1),
    heap_used_mb: +(mem.heapUsed / 1048576).toFixed(1),
    heap_total_mb: +(mem.heapTotal / 1048576).toFixed(1),
    uptime_seconds: Math.floor(process.uptime()),
    event_loop_lag_ms: null
  };

  let globalStatus = dbStatus;
  const degradedChecks = [
    [backupsInfo.count_24h === 0, 'no backup in last 24h'],
    [dbInfo.status === 'ok' && !dbInfo.wal_mode, 'WAL mode not active'],
    [dbInfo.status === 'ok' && !dbInfo.foreign_keys, 'foreign keys not enabled'],
    [!mrrSnapshotsInfo.fresh, 'mrr snapshot missing for today'],
  ];
  for (const [cond, msg] of degradedChecks) {
    if (globalStatus === 'ok' && cond) { globalStatus = 'degraded'; issues.push(msg); }
  }

  const payload = {
    status: globalStatus, version: VERSION,
    uptime_seconds: Math.floor(process.uptime()),
    node: { version: process.version },
    storage: { mode: storage.USE_SQLITE ? 'sqlite' : 'json' },
    db: dbInfo, backups: backupsInfo, mrr_snapshots: mrrSnapshotsInfo, process: processInfo
  };

  if (globalStatus !== 'ok') logger.logWarn('ADMIN_HEALTH', `Health check: ${globalStatus}`, { issues });
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, globalStatus === 'error' ? 503 : 200, payload);
}

/**
 * Step 5: GET /internal/admin/metrics — Business metrics (admin-only).
 *
 * Authoritative payload aligned with docs/metrics-definition.md.
 * Uses lifecycle timestamps (sent_at, feedback_received_at, etc.)
 * and activated_at-based activation rate.
 *
 * Supports ?since=7d|30d|90d|365d (default 30d, clamp ≤ 365).
 * Always HTTP 200 (even if partially empty). Tolerant of JSON mode.
 *
 * SQL verification:
 *   SELECT status, COUNT(*) FROM review_requests GROUP BY status;
 *   SELECT COUNT(*) FROM review_requests WHERE sent_at IS NOT NULL AND sent_at >= '<sinceISO>';
 *   SELECT COUNT(*) FROM orgs WHERE activated_at IS NOT NULL;
 */
function handleAdminMetrics(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  const t0 = Date.now();

  // --- Period: canonical computeSinceISO(days) from db.js ---
  const dbModule = storage.getDb();
  const sinceParam = (urlParams.get('since') || '30d').trim();
  const sinceMatch = sinceParam.match(/^(\d+)d$/);
  const days = sinceMatch ? Math.min(parseInt(sinceMatch[1], 10), 365) : 30;
  const sinceISO = dbModule ? dbModule.computeSinceISO(days) : new Date().toISOString();

  const payload = {
    generated_at_utc: new Date().toISOString(),
    period: { since: sinceISO, days },

    // North Star V1 (top-level for visibility)
    north_star_v1: 0,

    orgs: {
      total: 0,
      active_in_period: 0,   // orgs with usage_ledger activity in period
    },

    requests: {
      total: 0,
      created_in_period: 0,
      queued_in_period: 0,
      sent_in_period: 0,
      failed_in_period: 0,
      feedback_received_in_period: 0,
      public_redirected_in_period: 0,
      // All-time lifecycle totals
      total_sent: 0,
      total_failed: 0,
      total_feedback_received: 0,
      total_public_redirected: 0,
    },

    feedback: {
      total: 0,
      in_period: 0,           // = feedback_received_at >= since (authoritative)
      in_period_crosscheck: 0, // = feedbacks.created_at >= since (validation only)
    },

    activation: {
      activated_orgs: 0,
      total_orgs: 0,
      activation_rate_percent: 0,
      // Legacy signals (still useful for usage-type breakdowns, not for activation rate)
      deprecated_usage_signals: {
        orgs_with_email: 0,
        orgs_with_sms: 0,
        orgs_with_ai: 0,
        orgs_with_feedback: 0,
        orgs_with_request: 0,
      },
    },

    usage: { emails_sent: 0, sms_sent: 0, ai_used: 0 },

    revenue: {
      mrr_total_cents: 0,
      mrr_total_eur: 0,
      orgs_paid: 0,
      orgs_free: 0,
      arpu_cents: 0,
      arpu_eur: 0,
      mrr_by_tier: { bronze: 0, argent: 0, gold: 0, platinum: 0, custom: 0 },
      negotiated_orgs: 0,
      negotiated_percent: 0,
    },
  };

  const database = dbModule ? dbModule.getDb() : null;
  if (!database) {
    payload.performance = { duration_ms: Date.now() - t0 };
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, payload);
  }

  try {
    _metricsOrgs(database, sinceISO, payload);
    _metricsRequests(database, sinceISO, payload);
    _metricsFeedback(database, sinceISO, payload);
    _metricsUsage(database, sinceISO, payload);
    _metricsActivation(database, sinceISO, payload);
    _metricsRevenue(database, payload);
  } catch (err) {
    logger.logWarn('ADMIN_METRICS_ERROR', 'Metrics aggregation failed', { message: err.message });
  }

  payload.performance = { duration_ms: Date.now() - t0 };
  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 200, payload);
}

function _metricsOrgs(db, since, p) {
  p.orgs.total = db.prepare('SELECT COUNT(*) as cnt FROM orgs').get().cnt;
  p.orgs.active_in_period = db.prepare(
    'SELECT COUNT(DISTINCT org_id) as cnt FROM usage_ledger WHERE created_at >= $since'
  ).get({ since }).cnt;
}

function _metricsRequests(db, since, p) {
  p.requests.total = db.prepare('SELECT COUNT(*) as cnt FROM review_requests').get().cnt;

  const PERIOD_COLS = ['created_at', 'queued_at', 'sent_at', 'failed_at', 'feedback_received_at', 'public_redirected_at'];
  const PERIOD_KEYS = ['created_in_period', 'queued_in_period', 'sent_in_period', 'failed_in_period', 'feedback_received_in_period', 'public_redirected_in_period'];
  for (const [i, col] of PERIOD_COLS.entries()) {
    const nullClause = col === 'created_at' ? '' : `${col} IS NOT NULL AND `;
    p.requests[PERIOD_KEYS[i]] = db.prepare(
      `SELECT COUNT(*) as cnt FROM review_requests WHERE ${nullClause}${col} >= $since`
    ).get({ since }).cnt;
  }

  const ALL_TIME_COLS = ['sent_at', 'failed_at', 'feedback_received_at', 'public_redirected_at'];
  const ALL_TIME_KEYS = ['total_sent', 'total_failed', 'total_feedback_received', 'total_public_redirected'];
  for (const [i, col] of ALL_TIME_COLS.entries()) {
    p.requests[ALL_TIME_KEYS[i]] = db.prepare(
      `SELECT COUNT(*) as cnt FROM review_requests WHERE ${col} IS NOT NULL`
    ).get().cnt;
  }

  p.north_star_v1 = p.requests.public_redirected_in_period;
}

function _metricsFeedback(db, since, p) {
  p.feedback.total = db.prepare('SELECT COUNT(*) as cnt FROM feedbacks').get().cnt;
  p.feedback.in_period = p.requests.feedback_received_in_period;
  p.feedback.in_period_crosscheck = db.prepare(
    'SELECT COUNT(*) as cnt FROM feedbacks WHERE created_at >= $since'
  ).get({ since }).cnt;
}

function _metricsUsage(db, since, p) {
  const rows = db.prepare(
    'SELECT type, SUM(qty) as total FROM usage_ledger WHERE created_at >= $since GROUP BY type'
  ).all({ since });
  const MAP = { email: 'emails_sent', sms: 'sms_sent', ai: 'ai_used' };
  for (const row of rows) {
    const key = MAP[row.type];
    if (key) p.usage[key] = row.total || 0;
  }
}

function _metricsActivation(db, since, p) {
  try {
    p.activation.total_orgs = p.orgs.total;
    p.activation.activated_orgs = db.prepare(
      'SELECT COUNT(*) as cnt FROM orgs WHERE activated_at IS NOT NULL'
    ).get().cnt;
    if (p.activation.total_orgs > 0) {
      p.activation.activation_rate_percent = +(
        (p.activation.activated_orgs / p.activation.total_orgs) * 100
      ).toFixed(1);
    }
    const dep = p.activation.deprecated_usage_signals;
    const USAGE_TYPES = [['email', 'orgs_with_email'], ['sms', 'orgs_with_sms'], ['ai', 'orgs_with_ai']];
    for (const [type, key] of USAGE_TYPES) {
      dep[key] = db.prepare(
        `SELECT COUNT(DISTINCT org_id) as cnt FROM usage_ledger WHERE type='${type}' AND created_at >= $since`
      ).get({ since }).cnt || 0;
    }
    dep.orgs_with_feedback = db.prepare(
      `SELECT COUNT(DISTINCT rr.org_id) as cnt FROM feedbacks f JOIN review_requests rr ON rr.id = f.request_db_id WHERE f.created_at >= $since`
    ).get({ since }).cnt || 0;
    dep.orgs_with_request = db.prepare(
      'SELECT COUNT(DISTINCT org_id) as cnt FROM review_requests WHERE created_at >= $since'
    ).get({ since }).cnt || 0;
  } catch (activErr) {
    logger.logWarn('ADMIN_METRICS_ERROR', 'Activation aggregation failed', { message: activErr.message });
  }
}

// Monthly effective price SQL fragments for revenue metrics
const _MRR_CASE = `CASE
  WHEN CAST(json_extract(negotiated_json,'$.enabled') AS INTEGER) = 1
    AND CAST(json_extract(negotiated_json,'$.customPriceCents') AS INTEGER) > 0
  THEN CAST(json_extract(negotiated_json,'$.customPriceCents') AS INTEGER)
  WHEN CAST(json_extract(negotiated_json,'$.enabled') AS INTEGER) = 1
    AND CAST(json_extract(negotiated_json,'$.discountPercent') AS REAL) > 0
  THEN CAST(ROUND(
    CAST(json_extract(plan_json,'$.basePriceCents') AS REAL)
    * (1.0 - CAST(json_extract(negotiated_json,'$.discountPercent') AS REAL) / 100.0)
  ) AS INTEGER)
  WHEN json_extract(plan_json,'$.basePriceCents') IS NULL THEN 0
  ELSE CAST(json_extract(plan_json,'$.basePriceCents') AS INTEGER)
END`;
const _TIER_CASE = `CASE
  WHEN json_extract(plan_json,'$.code') IS NULL THEN 'unknown'
  WHEN INSTR(json_extract(plan_json,'$.code'),'_') = 0 THEN json_extract(plan_json,'$.code')
  ELSE SUBSTR(json_extract(plan_json,'$.code'), INSTR(json_extract(plan_json,'$.code'),'_') + 1)
END`;
const _ACTIVE_FILTER = `status = 'active' AND json_extract(billing_json,'$.status') = 'active'`;
const _TIER_ALIASES = { basic: 'bronze', silver: 'argent', or: 'gold' };

function _metricsRevenue(db, p) {
  try {
    const mrrRow = db.prepare(`
      SELECT SUM(monthly) AS total_mrr, COUNT(*) AS paid_count
      FROM (SELECT ${_MRR_CASE} AS monthly FROM orgs WHERE ${_ACTIVE_FILTER})
      WHERE monthly > 0
    `).get();
    p.revenue.mrr_total_cents = mrrRow?.total_mrr || 0;
    p.revenue.orgs_paid = mrrRow?.paid_count || 0;

    p.revenue.orgs_free = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM (SELECT ${_MRR_CASE} AS monthly FROM orgs WHERE ${_ACTIVE_FILTER})
      WHERE monthly = 0
    `).get()?.cnt || 0;

    p.revenue.negotiated_orgs = db.prepare(`
      SELECT COUNT(*) AS cnt FROM orgs
      WHERE ${_ACTIVE_FILTER} AND CAST(json_extract(negotiated_json,'$.enabled') AS INTEGER) = 1
    `).get()?.cnt || 0;

    const tierRows = db.prepare(`
      SELECT tier, SUM(monthly) AS total
      FROM (SELECT ${_TIER_CASE} AS tier, ${_MRR_CASE} AS monthly FROM orgs WHERE ${_ACTIVE_FILTER})
      WHERE monthly > 0 GROUP BY tier
    `).all();
    for (const row of tierRows) {
      const normalized = _TIER_ALIASES[row.tier] || row.tier;
      const t = (normalized in p.revenue.mrr_by_tier) ? normalized : 'custom';
      p.revenue.mrr_by_tier[t] += (row.total || 0);
    }

    if (p.revenue.orgs_paid > 0) {
      p.revenue.arpu_cents = Math.round(p.revenue.mrr_total_cents / p.revenue.orgs_paid);
      p.revenue.negotiated_percent = +((p.revenue.negotiated_orgs / p.revenue.orgs_paid) * 100).toFixed(1);
    }
    p.revenue.mrr_total_eur = +(p.revenue.mrr_total_cents / 100).toFixed(2);
    p.revenue.arpu_eur = +(p.revenue.arpu_cents / 100).toFixed(2);
  } catch (revErr) {
    logger.logWarn('ADMIN_REVENUE_ERROR', 'Revenue aggregation failed', { message: revErr.message });
  }
}

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
/**
 * GET /internal/admin/at-risk-orgs — Paying orgs that are NOT activated.
 *
 * Filters: billing.status = 'active' AND activated_at IS NULL.
 * Returns org info + lastLogin + lastSentAt + daysSinceLastLogin.
 */
function handleAdminAtRiskOrgs(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  const dbModule = storage.getDb();
  if (!dbModule) {
    return sendJson(res, 200, { ok: true, orgs: [], total: 0 });
  }
  const database = dbModule.getDb();

  const rows = database.prepare(`
    SELECT
      o.id,
      o.name,
      o.email,
      o.vertical,
      o.status,
      json_extract(o.plan_json, '$.code') AS plan_code,
      json_extract(o.billing_json, '$.status') AS billing_status,
      o.activated_at,
      o.created_at,
      (SELECT MAX(u.last_login_at) FROM users u WHERE u.org_id = o.id) AS last_login,
      (SELECT MAX(rr.sent_at) FROM review_requests rr WHERE rr.org_id = o.id AND rr.sent_at IS NOT NULL) AS last_sent_at
    FROM orgs o
    WHERE json_extract(o.billing_json, '$.status') = 'active'
      AND o.activated_at IS NULL
    ORDER BY o.created_at ASC
  `).all();

  const nowMs = Date.now();
  const atRiskOrgs = rows.map(r => {
    const lastLoginMs = r.last_login ? new Date(r.last_login).getTime() : null;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      vertical: r.vertical,
      status: r.status,
      planCode: r.plan_code,
      billingStatus: r.billing_status,
      activatedAt: r.activated_at,
      createdAt: r.created_at,
      lastLogin: r.last_login || null,
      lastSentAt: r.last_sent_at || null,
      daysSinceLastLogin: lastLoginMs
        ? Math.max(0, Math.round((nowMs - lastLoginMs) / (1000 * 60 * 60 * 24)))
        : null
    };
  });

  return sendJson(res, 200, { ok: true, orgs: atRiskOrgs, total: atRiskOrgs.length });
}

/**
 * P2: GET /internal/admin/mrr-history — Historical MRR snapshots.
 *
 * Query params:
 *   ?days=90  (default 90, clamped 1..365)
 *
 * Returns an array of daily snapshots ordered by date ASC.
 * Snapshots are populated by the daily cron script (snapshot-mrr.js).
 */
function handleAdminMrrHistory(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  const repos = storage.getRepos();
  if (!repos || !repos.mrrSnapshot) {
    return sendJson(res, 200, { days: 0, sinceDate: null, snapshots: [] });
  }

  // Parse & clamp days
  let days = parseInt(urlParams.get('days') || '90', 10);
  if (isNaN(days) || days < 1) days = 1;
  if (days > 365) days = 365;

  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  const sinceDate = d.toISOString().slice(0, 10); // YYYY-MM-DD

  const snapshots = repos.mrrSnapshot.listSince(sinceDate);

  // Map to consistent snake_case response (aligned with /admin/metrics)
  const result = snapshots.map(s => ({
    date: s.date,
    mrr_total_cents: s.mrrTotalCents,
    orgs_paid: s.orgsPaid,
    orgs_free: s.orgsFree,
    arpu_cents: s.arpuCents,
    mrr_by_tier: s.mrr_by_tier,
    negotiated_orgs: s.negotiatedOrgs,
    negotiated_percent: s.negotiatedPercent,
  }));

  res.setHeader('Cache-Control', 'no-store');
  return sendJson(res, 200, {
    days,
    sinceDate,
    snapshots: result,
  });
}

// ============================================================
// EMAIL HEALTH API (Super Admin)
// ============================================================

/**
 * GET /api/email/admin/health — Global email health stats.
 * Query: ?window=7d&include=topRisk,lastWebhook,alerts
 */
function handleEmailAdminHealth(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  try {
    const windowStr = urlParams.get('window') || '7d';
    const includeStr = urlParams.get('include') || '';
    const includes = includeStr.split(',').filter(Boolean);

    const global = emailMonitoring.getGlobalEmailHealth(windowStr);
    const result = {
      ok: true,
      window: global.window,
      sinceISO: global.sinceISO,
      global,
    };

    if (includes.includes('topRisk')) {
      result.topRiskOrgs = emailMonitoring.getTopRiskOrgs(windowStr, 20);
    }

    if (includes.includes('lastWebhook')) {
      result.lastSesWebhook = emailMonitoring.getLastSesWebhookSeen();
    }

    if (includes.includes('alerts')) {
      result.alerts = emailMonitoring.computeAlerts(windowStr, {
        globalStats: global,
        lastSesWebhook: result.lastSesWebhook,
        topRiskOrgs: result.topRiskOrgs,
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, result);
  } catch (err) {
    logger.error('emailAdminHealth error', err);
    return sendJson(res, 500, { ok: false, error: 'Internal error' });
  }
}

/**
 * GET /api/email/admin/alerts — Email deliverability alerts.
 * Query: ?window=7d
 */
function handleEmailAdminAlerts(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  try {
    const windowStr = urlParams.get('window') || '7d';
    const alerts = emailMonitoring.computeAlerts(windowStr);

    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, {
      ok: true,
      window: windowStr,
      alertCount: alerts.length,
      alerts,
    });
  } catch (err) {
    logger.error('emailAdminAlerts error', err);
    return sendJson(res, 500, { ok: false, error: 'Internal error' });
  }
}

/**
 * GET /api/email/admin/org-stats — Per-org email stats.
 * Query: ?org_id=xxx&window=7d
 */
function handleEmailAdminOrgStats(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  try {
    const orgId = urlParams.get('org_id');
    if (!orgId) {
      return sendJson(res, 400, { ok: false, error: 'org_id required' });
    }

    const windowStr = urlParams.get('window') || '7d';
    const repos = storage.getRepos();
    const org = repos?.org?.getById(orgId);
    if (!org) {
      return sendJson(res, 404, { ok: false, error: 'Org not found' });
    }

    const stats = emailMonitoring.getOrgEmailStats(orgId, windowStr);
    const warmupState = emailWarmup.getWarmupState(org);

    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, {
      ok: true,
      orgId,
      orgName: org.name,
      plan: org.plan?.code || 'unknown',
      window: windowStr,
      stats,
      warmupState,
    });
  } catch (err) {
    logger.error('emailAdminOrgStats error', err);
    return sendJson(res, 500, { ok: false, error: 'Internal error' });
  }
}

/**
 * POST /api/email/admin/pause — Pause/unpause email sending for an org.
 * Body: { org_id, paused, reason? }
 */
async function handleEmailAdminPause(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  try {
    const body = await parseBody(req);
    const orgId = body.org_id;
    const paused = !!body.paused;
    const reason = body.reason || null;

    if (!orgId) {
      return sendJson(res, 400, { ok: false, error: 'org_id required' });
    }

    const repos = storage.getRepos();
    const org = repos?.org?.getById(orgId);
    if (!org) {
      return sendJson(res, 404, { ok: false, error: 'Org not found' });
    }

    const options = org.options || {};
    options.emailPaused = paused;
    options.emailPausedReason = reason;
    repos.org.update(orgId, { options });

    logger.logAudit('EMAIL_PAUSE_TOGGLED', { orgId, paused, reason });
    return sendJson(res, 200, { ok: true, orgId, paused, reason });
  } catch (err) {
    logger.error('emailAdminPause error', err);
    return sendJson(res, 400, { ok: false, error: 'Invalid request' });
  }
}

/**
 * GET /api/email/admin/pause-state — Get pause state for an org.
 * Query: ?org_id=xxx
 */
function handleEmailAdminPauseState(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  const orgId = urlParams.get('org_id');
  if (!orgId) {
    return sendJson(res, 400, { ok: false, error: 'org_id required' });
  }

  const repos = storage.getRepos();
  const org = repos?.org?.getById(orgId);
  if (!org) {
    return sendJson(res, 404, { ok: false, error: 'Org not found' });
  }

  return sendJson(res, 200, {
    ok: true,
    orgId,
    paused: !!org.options?.emailPaused,
    reason: org.options?.emailPausedReason || null,
  });
}

/**
 * POST /api/email/admin/force-warm — Force an org to warm status.
 * Body: { org_id }
 */
async function handleEmailAdminForceWarm(req, res) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  try {
    const body = await parseBody(req);
    const orgId = body.org_id;
    if (!orgId) {
      return sendJson(res, 400, { ok: false, error: 'org_id required' });
    }

    const result = emailWarmup.forceWarm(orgId);
    if (!result.ok) {
      return sendJson(res, 404, { ok: false, error: result.error || 'Failed' });
    }

    logger.logAudit('EMAIL_FORCE_WARM', { orgId });
    return sendJson(res, 200, { ok: true, orgId, state: result.state });
  } catch (err) {
    logger.error('emailAdminForceWarm error', err);
    return sendJson(res, 400, { ok: false, error: 'Invalid request' });
  }
}

/**
 * GET /api/email/admin/top-risk-csv — Download top-risk orgs as CSV.
 * Query: ?window=7d&limit=50
 */
function handleEmailAdminTopRiskCsv(req, res, urlParams = new URLSearchParams()) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, { error: auth.error });
  }

  try {
    const windowStr = urlParams.get('window') || '7d';
    const limit = Math.min(parseInt(urlParams.get('limit') || '50', 10) || 50, 200);
    const rows = emailMonitoring.getTopRiskOrgs(windowStr, limit);

    const header = 'org_id,org_name,plan,sent,bounces,complaints,delivered,bounce_rate,complaint_rate,warmup_status,warmup_day';
    const lines = rows.map(r =>
      `${r.org_id},"${(r.org_name || '').replace(/"/g, '""')}",${r.plan},${r.sent},${r.bounces},${r.complaints},${r.delivered},${r.bounceRate},${r.complaintRate},${r.warmupStatus},${r.warmupDay ?? ''}`
    );

    const csv = [header, ...lines].join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="top-risk-${windowStr}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.end(csv);
  } catch (err) {
    logger.error('emailAdminTopRiskCsv error', err);
    return sendJson(res, 500, { ok: false, error: 'Internal error' });
  }
}

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
  
  // Audit log: org created by admin
  writeAudit({ orgId: newOrg.id, actorUserId: auth.user?.id || null, action: 'admin.org_created', targetType: 'org', targetId: newOrg.id, meta: { name: newOrg.name, vertical: newOrg.vertical }, req });
  
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
    const repos = storage.getRepos();
    
    let usage7d, usage30d, recentUsage, recentTelemetry;
    
    if (repos) {
      // ── SQLite mode: read from usage_ledger + review_requests + messages ──
      const now = new Date();
      const since7d = new Date(now); since7d.setDate(since7d.getDate() - 7);
      const since30d = new Date(now); since30d.setDate(since30d.getDate() - 30);
      
      usage7d = repos.usage.getSummary(orgId, since7d.toISOString());
      usage30d = repos.usage.getSummary(orgId, since30d.toISOString());
      
      // Recent activity: JOIN review_requests + messages for rich data
      const dbModule = storage.getDb();
      const recentRows = dbModule.all(`
        SELECT 
          rr.id as request_id,
          rr.channel,
          rr.patient_json,
          rr.created_at,
          rr.status as request_status,
          m.recipient,
          m.status as message_status,
          m.sent_at,
          ul.qty as usage_qty,
          ul.details_json as usage_details
        FROM review_requests rr
        LEFT JOIN messages m ON m.request_db_id = rr.id
        LEFT JOIN usage_ledger ul ON ul.org_id = rr.org_id 
          AND ul.details_json LIKE ('%' || rr.idempotency_key || '%')
        WHERE rr.org_id = $orgId
        ORDER BY rr.created_at DESC
        LIMIT 50
      `, { orgId });
      
      recentUsage = recentRows.map(row => {
        const patient = JSON.parse(row.patient_json || '{}');
        const usageDetails = JSON.parse(row.usage_details || '{}');
        // Display name: prefer firstName+lastName, then name, then recipient (phone/email), never anonymous
        const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim()
          || patient.name
          || row.recipient
          || (row.channel === 'email' ? patient.email : patient.phone)
          || 'N/A';
        const patientContact = row.recipient 
          || (row.channel === 'email' ? patient.email : patient.phone)
          || '';
        
        return {
          id: row.request_id,
          type: row.channel || 'sms',
          qty: row.usage_qty || 1,
          ts: row.created_at,
          meta: {
            patientName,
            patientContact,
            status: row.message_status || row.request_status || 'queued',
            segments: usageDetails.segments || null,
            simulated: false,
          }
        };
      });
      
      // Telemetry from SQLite (map to frontend-expected format)
      const rawTelemetry = repos.telemetry
        ? repos.telemetry.listRecent({ orgId, limit: 50 })
        : [];
      recentTelemetry = rawTelemetry.map(t => ({
        id: t.id,
        orgId: t.orgId,
        source: t.source,
        level: t.level,
        code: t.data?.code || '',
        message: t.data?.message || '',
        stack: t.data?.stack || '',
        version: t.data?.version || '',
        ts: t.createdAt,
      }));
      
    } else {
      // ── JSON legacy mode ──
      usage7d = calculateOrgUsage(data, orgId, 7);
      usage30d = calculateOrgUsage(data, orgId, 30);
      
      recentUsage = (data.usageLedger || [])
        .filter(e => e.orgId === orgId)
        .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
        .slice(0, 50);
      
      recentTelemetry = (data.telemetry || [])
        .filter(e => e.orgId === orgId)
        .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
        .slice(0, 50);
    }
    
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
function patchOrgFields(org, body) {
  if (body.name) org.name = body.name.trim();
  if (body.vertical) org.vertical = body.vertical;
}

function patchOrgPlan(org, plan) {
  if (!plan) return;
  if (plan.code) org.plan.code = plan.code;
  if (plan.basePriceCents !== undefined) org.plan.basePriceCents = plan.basePriceCents;
  if (plan.billingCycle) org.plan.billingCycle = plan.billingCycle;
}

function patchOrgNegotiated(org, negotiated) {
  if (!negotiated) return;
  const fields = ['enabled', 'customPriceCents', 'discountPercent', 'notes', 'contractRef'];
  for (const key of fields) {
    if (negotiated[key] !== undefined) org.negotiated[key] = negotiated[key];
  }
}

function patchOrgQuotas(org, quotas) {
  if (!quotas) return;
  const quotaFields = ['smsIncluded', 'emailIncluded', 'aiIncluded', 'qrIncluded', 'nfcIncluded'];
  const patch = {};
  for (const key of quotaFields) {
    if (quotas[key] !== undefined) patch[key] = quotas[key];
  }
  org.quotas = { ...org.quotas, ...patch };
}

async function handleUpdateOrg(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status || 401, { error: auth.error });

  let body;
  try { body = await parseBody(req); } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }

  const data = loadData();

  try {
    const org = getOrgOrThrow(data, orgId);

    patchOrgFields(org, body);
    patchOrgPlan(org, body.plan);
    patchOrgNegotiated(org, body.negotiated);

    if (body.options) {
      Object.assign(org.options, body.options);
    }

    patchOrgQuotas(org, body.quotas);
    org.updatedAt = nowISO();

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
function buildCreditParts(sms, email, ai) {
  const parts = [];
  if (sms > 0) parts.push(`+${sms} SMS`);
  if (email > 0) parts.push(`+${email} Email`);
  if (ai > 0) parts.push(`+${ai} IA`);
  return parts;
}

function resolveCreditAmounts(body) {
  const { sms = 0, email = 0, ai = 0, packCode = null } = body;
  if (packCode && PACK_CATALOG[packCode]) {
    const pack = PACK_CATALOG[packCode];
    return { sms: pack.smsMonthly, email: pack.emailMonthly, ai: pack.aiMonthly || 0 };
  }
  return { sms, email, ai };
}

function applyGiftCredits(org, orgId, amounts) {
  org.subscriptionCredits.smsGiftMonthly += amounts.sms;
  org.subscriptionCredits.emailGiftMonthly += amounts.email;
  org.subscriptionCredits.aiGiftMonthly = (org.subscriptionCredits.aiGiftMonthly || 0) + amounts.ai;
  const parts = buildCreditParts(amounts.sms, amounts.email, amounts.ai);
  console.log(`[BILLING] 🎁 Gift credits added to org ${orgId}: ${parts.join(', ')}`);
  return `Crédits offerts ajoutés: ${parts.join(', ')}. Expire le ${new Date(org.billing.periodEnd).toLocaleDateString('fr-FR')}`;
}

function applyPackCredits(org, orgId, amounts, packCode) {
  org.packWallet.smsRemaining += amounts.sms;
  org.packWallet.emailRemaining += amounts.email;
  org.packWallet.aiRemaining = (org.packWallet.aiRemaining || 0) + amounts.ai;
  const parts = buildCreditParts(amounts.sms, amounts.email, amounts.ai);
  console.log(`[BILLING] 📦 Pack credits added to org ${orgId}: ${parts.join(', ')} (persistent)`);
  const packName = (packCode && PACK_CATALOG[packCode]) ? PACK_CATALOG[packCode].name : null;
  const prefix = packName ? `Pack ${packName} ajouté` : 'Pack ajouté';
  return `${prefix}: ${parts.join(', ')}. Ces crédits persistent jusqu'à consommation.`;
}

async function handleAddCredits(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status || 401, { error: auth.error });

  let body;
  try { body = await parseBody(req); } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }

  const { type, source, label = '', packCode = null } = body;
  const creditType = type || source || 'gift';

  if (!['gift', 'pack'].includes(creditType)) {
    return sendJson(res, 400, { error: 'type doit être "gift" ou "pack"' });
  }

  if (creditType === 'pack' && packCode && !PACK_CATALOG[packCode]) {
    return sendJson(res, 400, { error: `Pack inconnu: ${packCode}. Packs valides: ${Object.keys(PACK_CATALOG).join(', ')}` });
  }

  const amounts = resolveCreditAmounts(body);
  if (amounts.sms === 0 && amounts.email === 0 && amounts.ai === 0) {
    return sendJson(res, 400, { error: 'Spécifier au moins sms, email ou ai > 0, ou un packCode' });
  }

  const data = loadData();

  try {
    const org = getOrgOrThrow(data, orgId);
    ensureOrgBilling(org);
    ensureCurrentPeriod(data, org, false);

    const message = creditType === 'gift'
      ? applyGiftCredits(org, orgId, amounts)
      : applyPackCredits(org, orgId, amounts, packCode);

    org.updatedAt = nowISO();
    const orgIndex = data.orgs.findIndex(o => o.id === orgId);
    if (orgIndex >= 0) data.orgs[orgIndex] = org;
    saveData(data);

    const remaining = getTotalRemaining(org);

    logger.logInternalAction('INTERNAL_ADD_CREDITS', req, {
      orgId, status: 200, creditType,
      smsDelta: amounts.sms, emailDelta: amounts.email, aiDelta: amounts.ai,
      packCode: packCode || null, message: 'Credits added successfully'
    });

    return sendJson(res, 200, {
      org: sanitizeOrg(enrichOrg(data, org)),
      added: { type: creditType, sms: amounts.sms, email: amounts.email, packCode: packCode || null, label: label || null },
      remaining: { subscription: remaining.subscription, pack: remaining.pack, total: { sms: remaining.sms, email: remaining.email } },
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
const STATUS_MESSAGES = {
  suspended: 'Abonnement suspendu. Les crédits sont conservés mais les envois sont bloqués. Au prochain renouvellement, les crédits abonnement expireront mais les packs seront conservés.',
  cancelled: 'Abonnement annulé. Tous les crédits (abonnement + packs) ont été perdus.',
  active: 'Abonnement réactivé. Les envois sont à nouveau autorisés.',
};

function handleCancellationCredits(org, totalBefore, confirmLossCredits) {
  if ((totalBefore.sms > 0 || totalBefore.email > 0) && !confirmLossCredits) {
    return {
      needsConfirmation: true,
      response: {
        error: 'CREDITS_WILL_BE_LOST',
        message: `Attention: ${totalBefore.sms} SMS et ${totalBefore.email} Email seront DÉFINITIVEMENT perdus. Envoyez confirmLossCredits: true pour confirmer.`,
        creditsAtRisk: {
          subscription: totalBefore.subscription,
          pack: totalBefore.pack,
          total: { sms: totalBefore.sms, email: totalBefore.email }
        }
      }
    };
  }
  const creditsLost = clearAllCredits(org);
  console.log(`[BILLING] ❌ Org ${org.id} CANCELLED - all credits lost`);
  return { needsConfirmation: false, creditsLost };
}

function persistStatusChange(data, orgId, org, status) {
  const repos = storage.getRepos();
  if (repos) {
    repos.org.update(orgId, { status });
    return repos.org.getById(orgId) || org;
  }
  const orgIndex = data.orgs.findIndex(o => o.id === orgId);
  if (orgIndex >= 0) data.orgs[orgIndex] = org;
  saveData(data);
  return org;
}

async function handleChangeStatus(req, res, orgId) {
  const auth = requireAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status || 401, { error: auth.error });

  let body;
  try { body = await parseBody(req); } catch (err) {
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
    ensureCurrentPeriod(data, org, false);

    let creditsLost = null;
    const totalBefore = getTotalRemaining(org);

    if (status === 'cancelled' && oldStatus !== 'cancelled') {
      const result = handleCancellationCredits(org, totalBefore, confirmLossCredits);
      if (result.needsConfirmation) return sendJson(res, 400, result.response);
      creditsLost = result.creditsLost;
    }

    if (status === 'suspended' && oldStatus === 'active') {
      console.log(`[BILLING] ⏸️ Org ${org.id} SUSPENDED - credits preserved but sends blocked`);
      console.log(`[BILLING]    Subscription: ${totalBefore.subscription.sms} SMS, ${totalBefore.subscription.email} Email`);
      console.log(`[BILLING]    Packs: ${totalBefore.pack.sms} SMS, ${totalBefore.pack.email} Email`);
    }

    org.status = status;
    org.updatedAt = nowISO();
    const responseOrg = persistStatusChange(data, orgId, org, status);

    logger.logInternalAction('INTERNAL_ORG_STATUS_CHANGE', req, {
      orgId, status: 200, oldStatus, newStatus: status,
      creditsLost: !!creditsLost, message: 'Org status changed successfully'
    });

    return sendJson(res, 200, {
      org: sanitizeOrg(enrichOrg(data, responseOrg)),
      previousStatus: oldStatus,
      message: STATUS_MESSAGES[status] || '',
      creditsLost: creditsLost ? { subscription: creditsLost.lostSubscription, pack: creditsLost.lostPack } : null,
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
    const crypto = require('node:crypto');
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
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
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
  // Google Business URL — optionnel au signup, configurable ensuite dans le dashboard
  // ═══════════════════════════════════════════════════════════════
  let googlePlaceId = null;
  
  if (googleBusinessUrl) {
    googlePlaceId = extractGooglePlaceId(googleBusinessUrl);
    // Si l'URL est fournie mais invalide, on l'ignore silencieusement
    // L'utilisateur pourra la configurer correctement dans le dashboard
  }
  
  const data = loadData();
  
  // Check if email already exists
  if (getUserByEmail(data, email)) {
    return sendJson(res, 409, { error: 'EMAIL_ALREADY_EXISTS', message: 'Un compte existe déjà avec cet email' });
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Determine plan code
  const planCode = `${vertical}_${plan === 'bronze' ? 'basic' : plan}`;
  const planDefaults = PLAN_DEFAULTS[planCode] || PLAN_DEFAULTS[`${vertical}_basic`] || {};
  
  // Determine price based on plan (must match plan-catalog.js)
  const PLAN_PRICES = { bronze: 0, argent: 4900, platinum: 9900 };
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
  
  // Persist org + user
  const repos = storage.getRepos();
  if (repos) {
    // SQLite mode: use repositories for persistence
    repos.org.create({
      id: orgId,
      publicKey,
      name: orgName,
      email: email.toLowerCase(),
      vertical,
      status: 'pending',
      googlePlaceId: googlePlaceId || null,
      billing: org.billing,
      plan: org.plan,
      negotiated: org.negotiated,
      options: org.options,
      quotas: org.quotas,
      balances: org.balances,
    });
    repos.user.create({
      id: userId,
      orgId,
      email: email.toLowerCase(),
      passwordHash,
      role: 'owner',
      name: orgName,
      emailVerified: false,
    });
  } else {
    // Legacy JSON mode
    data.orgs.push(org);
    data.users.push(user);
  }
  
  // Create email verification (already SQLite-aware)
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

  // Notify admin of new signup (fire-and-forget, never blocks the response)
  const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'admin@reputyapp.com';
  const verticalLabels = { health: 'Santé', food: 'Restauration', business: 'Services' };
  const planLabels = { bronze: 'Bronze (gratuit)', argent: 'Argent', or: 'Or', platinum: 'Platinum' };
  emailProvider.sendEmail({
    to: ADMIN_NOTIFY_EMAIL,
    subject: `🆕 Nouveau client Reputy — ${orgName}`,
    text: [
      `Nouveau compte créé sur Reputy`,
      ``,
      `Établissement : ${orgName}`,
      `Email         : ${email}`,
      `Secteur       : ${verticalLabels[vertical] || vertical}`,
      `Forfait       : ${planLabels[plan] || plan}`,
      `Date          : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
      ``,
      `→ Backoffice : https://app.reputyapp.com/admin`,
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
        <h2 style="color:#1f2937;margin-bottom:4px;">🆕 Nouveau client Reputy</h2>
        <p style="color:#6b7280;margin-top:0;">Un nouveau compte vient d'être créé.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Établissement</td><td style="padding:8px 0;font-weight:600;color:#111827;">${escapeHtml(orgName)}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px;color:#6b7280;">Email</td><td style="padding:8px;color:#111827;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Secteur</td><td style="padding:8px 0;color:#111827;">${escapeHtml(verticalLabels[vertical] || vertical)}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:8px;color:#6b7280;">Forfait</td><td style="padding:8px;color:#111827;">${escapeHtml(planLabels[plan] || plan)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;color:#111827;">${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</td></tr>
        </table>
        <a href="https://app.reputyapp.com/admin" style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Voir dans le backoffice</a>
      </div>
    `,
  }).catch(err => logger.logWarn('SIGNUP_NOTIFY_FAILED', `Could not send admin signup notification: ${err.message}`, { orgId, email }));

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
  
  const repos = storage.getRepos();
  let org;
  
  if (repos) {
    // SQLite mode: use repositories for persistence
    repos.user.verifyEmail(user.id);
    
    org = repos.org.getById(user.orgId);
    if (org && org.status === 'pending') {
      // Activate org
      const period = computePeriod(new Date(), (org.billing && org.billing.startedAt) || org.createdAt);
      const updatedBilling = {
        ...(org.billing || {}),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      };
      repos.org.update(org.id, { 
        status: 'active',
        billing: updatedBilling
      });
      org = repos.org.getById(org.id); // refresh
    }
  } else {
    // Legacy JSON mode
    user.emailVerified = true;
    user.updatedAt = nowISO();
    
    org = data.orgs.find(o => o.id === user.orgId);
    if (org && org.status === 'pending') {
      org.status = 'active';
      org.updatedAt = nowISO();
      
      const period = computePeriod(new Date(), org.billing.startedAt || org.createdAt);
      org.billing.periodStart = period.periodStart;
      org.billing.periodEnd = period.periodEnd;
      
      ensureCurrentPeriod(data, org, false);
    }
  }
  
  // Create session (already SQLite-aware)
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
  
  // Zod validation (PR-5)
  const v = validateBody(schemas.login, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const { email, password } = v.data;
  
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
    // Audit log: login failed (unknown email)
    writeAudit({ action: 'auth.login_failed', meta: { email, reason: 'user_not_found' }, req });
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
    // Audit log: login failed
    writeAudit({ orgId: user.orgId, actorUserId: user.id, action: 'auth.login_failed', targetType: 'user', targetId: user.id, meta: { email, reason: 'wrong_password' }, req });
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
  let loginOrgId = user.orgId; // Default: legacy user.orgId
  let loginMembershipRole = user.role; // Default: legacy user.role

  // PR-8b: Multi-org login — always connect to first active membership (no org-picker at login)
  // User switches orgs from the topbar in reputy-admin (3002)
  if (repos && repos.membership) {
    const activeMemberships = repos.membership.getActiveByUserId(user.id);

    if (activeMemberships.length >= 1) {
      // Use first active membership as default org
      loginOrgId = activeMemberships[0].orgId;
      loginMembershipRole = activeMemberships[0].role;
    }
    // activeMemberships.length === 0: fallback to legacy user.orgId
  }

  if (repos && repos.session) {
    // SQLite mode: use session repository
    session = repos.session.createSession(user.id, loginOrgId);
    // Update user last login in SQLite
    repos.user.updateLastLogin(user.id);
  } else {
    // Legacy JSON mode
    session = createSession(data, user.id, loginOrgId);
    saveData(data);
  }
  
  // P1.4: Log successful login
  logger.logAuth('LOGIN_SUCCESS', true, req, {
    requestId,
    email,
    userId: user.id,
    orgId: loginOrgId,
    durationMs: Date.now() - startTime,
    status: 200
  });
  
  // Audit log: login success
  writeAudit({ orgId: loginOrgId, actorUserId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, meta: { email }, req });
  
  return sendJson(res, 200, {
    ok: true,
    token: session.token,
    orgId: loginOrgId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role, // Legacy compat
      name: user.name
    },
    membership: {
      orgId: loginOrgId,
      role: loginMembershipRole,
    },
    mustChangePassword: !!user.mustChangePassword,
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

// ============ CLIENT MEMBERSHIPS ENDPOINTS ============

/**
 * GET /client/memberships - List all orgs the user belongs to
 * Returns active memberships with org info (for org-picker / topbar)
 */
function handleClientGetMemberships(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }

  const repos = storage.getRepos();
  if (!repos || !repos.membership) {
    // Fallback: return current org only (pre-membership migration)
    const org = auth.org;
    return sendJson(res, 200, {
      ok: true,
      currentOrgId: org ? org.id : null,
      memberships: org ? [{
        id: null,
        orgId: org.id,
        orgName: org.name,
        orgStatus: org.status,
        orgVertical: org.vertical,
        orgPlan: org.plan,
        role: auth.user.role || 'owner',
        status: 'active',
        acceptedAt: auth.user.createdAt
      }] : []
    });
  }

  let memberships = repos.membership.getActiveByUserId(auth.user.id);

  // Self-heal: if user has no memberships but has an org, create owner membership
  // (fixes accounts created before PR-8b membership migration)
  if (memberships.length === 0 && auth.org && auth.user.role === 'owner') {
    console.log(`[MEMBERSHIP] Self-heal (memberships): creating owner membership for user ${auth.user.id} on org ${auth.org.id}`);
    repos.membership.create({
      orgId: auth.org.id,
      userId: auth.user.id,
      role: 'owner',
      status: 'active',
      invitedAt: auth.user.createdAt || nowISO(),
      acceptedAt: auth.user.createdAt || nowISO(),
    });
    memberships = repos.membership.getActiveByUserId(auth.user.id);
  }

  return sendJson(res, 200, {
    ok: true,
    currentOrgId: auth.org ? auth.org.id : null,
    memberships: memberships.map(m => ({
      id: m.id,
      orgId: m.orgId,
      orgName: m.orgName,
      orgStatus: m.orgStatus,
      orgVertical: m.orgVertical,
      orgPlan: m.orgPlan,
      role: m.role,
      status: m.status,
      permissions: repos.membership.getEffectivePermissions(m),
      acceptedAt: m.acceptedAt
    }))
  });
}

// ============ PR-8b: MULTI-ESTABLISHMENT HELPER ============

/**
 * Check if user has an active membership with allowed role on an org.
 * Returns the membership object if OK, or null (and sends 403) if not.
 * Use this for membership-based RBAC (not user.role).
 */
function requireMembershipRole(repos, userId, orgId, allowedRoles, res) {
  if (!repos || !repos.membership) {
    sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Membership service unavailable' });
    return null;
  }
  let m = repos.membership.getByUserAndOrg(userId, orgId);
  
  // Self-heal: auto-create membership for legacy accounts (created before PR-8b)
  if (!m) {
    const user = repos.user.getById(userId);
    if (user && user.orgId === orgId && user.role === 'owner') {
      console.log(`[MEMBERSHIP] Self-heal: creating owner membership for user ${userId} on org ${orgId}`);
      repos.membership.create({
        orgId,
        userId,
        role: 'owner',
        status: 'active',
        invitedAt: user.createdAt || nowISO(),
        acceptedAt: user.createdAt || nowISO(),
      });
      m = repos.membership.getByUserAndOrg(userId, orgId);
    }
  }
  
  if (!m || m.status !== 'active') {
    sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Vous n\'avez pas accès à cet établissement' });
    return null;
  }
  if (!allowedRoles.includes(m.role)) {
    sendJson(res, 403, {
      ok: false,
      error: 'FORBIDDEN',
      message: `Rôle "${m.role}" non autorisé pour cette action`,
      requiredRoles: allowedRoles,
    });
    return null;
  }
  return m;
}

// ============ PR-8b: POST /auth/select-org ============

/**
 * POST /auth/select-org — Multi-org login: user picks an org after auth
 * Body: { pendingToken, orgId }
 */
async function handleAuthSelectOrg(req, res) {
  let body;
  try { body = await parseBody(req); } catch (_) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
  }

  const v = validateBody(schemas.selectOrg, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const { pendingToken, orgId } = v.data;

  const repos = storage.getRepos();
  if (!repos || !repos.membership) {
    return sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Service indisponible' });
  }

  // Validate & consume pending token (single-use)
  const pending = repos.membership.validateLoginPending(pendingToken);
  if (!pending) {
    return sendJson(res, 401, { ok: false, error: 'INVALID_TOKEN', message: 'Token invalide ou expiré. Veuillez vous reconnecter.' });
  }

  // Check user has active membership on requested org
  const membership = repos.membership.getByUserAndOrg(pending.userId, orgId);
  if (!membership || membership.status !== 'active') {
    return sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Vous n\'avez pas accès à cet établissement' });
  }

  // Create session on chosen org
  const session = repos.session.createSession(pending.userId, orgId);
  const user = repos.user.getById(pending.userId);

  // Audit
  writeAudit({ orgId, actorUserId: pending.userId, action: 'auth.select_org', targetType: 'org', targetId: orgId, meta: { membershipRole: membership.role }, req });

  return sendJson(res, 200, {
    ok: true,
    token: session.token,
    orgId,
    user: { id: user.id, email: user.email, name: user.name },
    membership: { orgId, role: membership.role },
    mustChangePassword: !!user.mustChangePassword,
  });
}

// ============ PR-8e: POST /auth/accept-invite ============

/**
 * POST /auth/accept-invite — Accept an invitation via invite token
 * Body: { token, newPassword? }
 * Flow:
 *   1. Validate invite token → find pending membership
 *   2. If must_change_password and no newPassword → 400 PASSWORD_REQUIRED
 *   3. Transaction: update password + activate membership + create session
 *   4. Return session token for redirect to 3002
 */
async function handleAuthAcceptInvite(req, res) {
  let body;
  try { body = await parseBody(req); } catch (_) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
  }

  const v = validateBody(schemas.acceptInvite, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const { token: inviteToken, newPassword } = v.data;

  const repos = storage.getRepos();
  if (!repos || !repos.membership) {
    return sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Service indisponible' });
  }

  // Find membership by invite token
  const membership = repos.membership.getByInviteToken(inviteToken);
  if (!membership) {
    return sendJson(res, 404, { ok: false, error: 'INVITE_NOT_FOUND', message: 'Invitation invalide ou expirée' });
  }
  if (membership.status !== 'pending') {
    return sendJson(res, 409, { ok: false, error: 'INVITE_ALREADY_USED', message: 'Cette invitation a déjà été acceptée' });
  }

  // Get user
  const user = repos.user.getById(membership.userId);
  if (!user) {
    return sendJson(res, 404, { ok: false, error: 'USER_NOT_FOUND', message: 'Utilisateur introuvable' });
  }

  // Check if password is required (new user with temp password)
  if (user.mustChangePassword && !newPassword) {
    return sendJson(res, 400, { ok: false, error: 'PASSWORD_REQUIRED', message: 'Vous devez définir un mot de passe' });
  }

  // Hash password BEFORE transaction (hashPassword is async, transaction is sync)
  let hashedPassword = null;
  if (user.mustChangePassword && newPassword) {
    hashedPassword = await hashPassword(newPassword);
  }

  // CRITICAL: Transaction for atomicity (password + membership + session)
  const dbModule = storage.getDb();
  let session;
  dbModule.transaction(() => {
    // 1. Update password if must_change_password
    if (hashedPassword) {
      dbModule.prepare('UPDATE users SET password_hash = $hash, must_change_password = 0 WHERE id = $id')
        .run({ hash: hashedPassword, id: user.id });
    }
    // 2. Activate membership (clears inviteToken + sets acceptedAt)
    repos.membership.updateStatus(membership.id, 'active');
    // 3. Create session on the org of the invitation
    session = repos.session.createSession(user.id, membership.orgId);
  });

  writeAudit({
    orgId: membership.orgId,
    actorUserId: user.id,
    action: 'auth.accept_invite',
    targetType: 'membership',
    targetId: membership.id,
    meta: { role: membership.role },
    req
  });

  return sendJson(res, 200, {
    ok: true,
    token: session.token,
    orgId: membership.orgId,
    user: { id: user.id, email: user.email, name: user.name },
    membership: { orgId: membership.orgId, role: membership.role },
    orgName: membership.orgName,
  });
}

// ============ PR-8b: POST /client/orgs/switch ============

/**
 * POST /client/orgs/switch — Switch to another establishment (new session)
 * Body: { orgId }
 * CRITICAL: create new session BEFORE deleting old one (no lock-out)
 */
async function handleClientSwitchOrg(req, res) {
  try {
    const data = loadData();
    const auth = getAuthUser(req, data);
    if (!auth) {
      return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
    }

    let body;
    try { body = await parseBody(req); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
    }

    const v = validateBody(schemas.switchOrg, body);
    if (!v.ok) return sendJson(res, 400, v.payload);
    const { orgId: targetOrgId } = v.data;

    const repos = storage.getRepos();

    // Verify membership on target org
    const membership = requireMembershipRole(repos, auth.user.id, targetOrgId, ['owner', 'admin', 'agent'], res);
    if (!membership) return; // 403 already sent

    // Create new session FIRST (safety: old session still valid if this fails)
    const newSession = repos.session.createSession(auth.user.id, targetOrgId);

    // Delete old session (best effort)
    try { repos.session.deleteSession(auth.session.token); } catch (err) { console.warn('[SESSION] Delete old session failed:', err.message); }

    // Audit
    writeAudit({ orgId: targetOrgId, actorUserId: auth.user.id, action: 'org.switch', targetType: 'org', targetId: targetOrgId, meta: { fromOrgId: auth.org?.id, toOrgId: targetOrgId }, req });

    return sendJson(res, 200, {
      ok: true,
      token: newSession.token,
      orgId: targetOrgId,
      membership: { orgId: targetOrgId, role: membership.role },
    });
  } catch (err) {
    console.error('[REPUTY][ERROR] switchOrg failed:', err.message, err.stack);
    if (!res.headersSent) {
      return sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Erreur lors du changement d\'établissement' });
    }
  }
}

// ============ PR-8b: POST /client/orgs (create establishment) ============

/**
 * POST /client/orgs — Create a new establishment (org)
 * Body: { name, email?, vertical? }
 */
async function handleClientCreateOrg(req, res) {
  try {
    const data = loadData();
    const auth = getAuthUser(req, data);
    if (!auth) {
      return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
    }

    const repos = storage.getRepos();

    // Membership RBAC: only owner/admin of current org can create new establishments
    const currentMembership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner', 'admin'], res);
    if (!currentMembership) return;

    let body;
    try { body = await parseBody(req); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
    }

    const v = validateBody(schemas.createOrg, body);
    if (!v.ok) return sendJson(res, 400, v.payload);
    const { name, email, vertical } = v.data;

    let newOrg;
    let newMembership;

    const dbModule = storage.getDb();
    dbModule.transaction(() => {
      // Create new org (status: 'active')
      newOrg = repos.org.create({
        name,
        email: email || null,
        vertical: vertical || 'health',
        status: 'active',
      });

      // Create owner membership for current user on new org
      newMembership = repos.membership.create({
        userId: auth.user.id,
        orgId: newOrg.id,
        role: 'owner',
        status: 'active',
      });
    });

    // Audit
    writeAudit({ orgId: newOrg.id, actorUserId: auth.user.id, action: 'org.create', targetType: 'org', targetId: newOrg.id, meta: { parentOrgId: auth.org.id, name, vertical }, req });

    return sendJson(res, 201, {
      ok: true,
      org: { id: newOrg.id, name: newOrg.name, vertical: newOrg.vertical, status: newOrg.status },
      membership: { id: newMembership.id, orgId: newOrg.id, role: 'owner' },
    });
  } catch (err) {
    console.error('[REPUTY][ERROR] createOrg failed:', err.message, err.stack);
    if (!res.headersSent) {
      return sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Erreur lors de la création de l\'établissement' });
    }
  }
}

// ============ DELETE /client/orgs/:orgId — Archive an establishment ============

/**
 * DELETE /client/orgs/:orgId — Archive (soft-delete) an establishment
 * Only the owner of that org can archive it.
 * Cannot archive the org you're currently logged into.
 */
async function handleClientDeleteOrg(req, res, targetOrgId) {
  try {
    const data = loadData();
    const auth = getAuthUser(req, data);
    if (!auth) {
      return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
    }

    const repos = storage.getRepos();

    // Cannot delete your current org (must switch first)
    if (targetOrgId === auth.org.id) {
      return sendJson(res, 400, { ok: false, error: 'CANNOT_DELETE_CURRENT', message: 'Impossible de supprimer l\'établissement actif. Changez d\'établissement d\'abord.' });
    }

    // Check that the user is owner on the TARGET org
    const targetMembership = repos.membership.getByUserAndOrg(auth.user.id, targetOrgId);
    if (!targetMembership || targetMembership.role !== 'owner') {
      return sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Seul le propriétaire peut supprimer un établissement' });
    }

    // Verify the org exists
    const targetOrg = repos.org.getById(targetOrgId);
    if (!targetOrg) {
      return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Établissement introuvable' });
    }

    if (targetOrg.status === 'archived') {
      return sendJson(res, 400, { ok: false, error: 'ALREADY_ARCHIVED', message: 'Cet établissement est déjà archivé' });
    }

    // Soft-delete: set status to 'archived'
    const dbModule = storage.getDb();
    dbModule.prepare('UPDATE orgs SET status = $status, updated_at = $now WHERE id = $id').run({
      status: 'archived',
      now: new Date().toISOString(),
      id: targetOrgId,
    });

    // Revoke all memberships on this org
    const allMemberships = repos.membership.getByOrgId(targetOrgId);
    for (const m of allMemberships) {
      if (m.status === 'active' || m.status === 'pending') {
        repos.membership.updateStatus(m.id, 'revoked');
      }
    }

    // Audit
    writeAudit({ orgId: targetOrgId, actorUserId: auth.user.id, action: 'org.archive', targetType: 'org', targetId: targetOrgId, meta: { previousStatus: targetOrg.status }, req });

    return sendJson(res, 200, { ok: true, message: 'Établissement archivé avec succès' });
  } catch (err) {
    console.error('[REPUTY][ERROR] deleteOrg failed:', err.message, err.stack);
    if (!res.headersSent) {
      return sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Erreur lors de la suppression de l\'établissement' });
    }
  }
}

// ============ CLIENT API TOKEN ============

/**
 * GET /client/api-token — Get masked API token info for current org
 * Only owner/admin can view
 */
function handleClientGetApiToken(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }

  const repos = storage.getRepos();
  const membership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner', 'admin'], res);
  if (!membership) return;

  const org = repos.org.getById(auth.org.id);
  if (!org) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Organisation non trouvée' });
  }

  return sendJson(res, 200, {
    ok: true,
    publicKey: org.publicKey,
    apiTokenMasked: maskApiToken(org.apiTokenHash ? '••••••••' : null),
    apiTokenCreatedAt: org.apiTokenCreatedAt || null,
    apiTokenLastRotatedAt: org.apiTokenLastRotatedAt || null,
    hasApiToken: !!org.apiTokenHash,
  });
}

/**
 * POST /client/api-token/rotate — Generate/rotate API token for current org
 * Only owner can rotate. Returns new plain token ONCE.
 */
function handleClientRotateApiToken(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }

  const repos = storage.getRepos();
  const membership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner'], res);
  if (!membership) return;

  try {
    const result = repos.org.rotateApiToken(auth.org.id, 24);
    
    logger.logAudit('CLIENT_ROTATE_API_TOKEN', {
      orgId: auth.org.id,
      userId: auth.user.id,
      message: 'API token rotated by client',
    });

    return sendJson(res, 200, {
      ok: true,
      newApiToken: result.newToken,
      message: "Nouveau token généré. Copiez-le maintenant, il ne sera plus affiché.",
      warning: "⚠️ L'ancien token reste valide 24h pour vous laisser le temps de mettre à jour l'extension.",
    });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Erreur lors de la rotation du token' });
  }
}

// ============ PR-8b: GET /client/team ============

/**
 * GET /client/team — List team members of current org
 * Query: ?includeRevoked=true (optional, admin+ only)
 */
function handleClientGetTeam(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }

  const repos = storage.getRepos();

  // Membership RBAC: owner/admin can see team
  const currentMembership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner', 'admin'], res);
  if (!currentMembership) return;

  // Get all memberships for this org
  const allMembers = repos.membership.getByOrgId(auth.org.id);

  // Filter: by default active+pending only, includeRevoked if admin+ requested
  const includeRevoked = urlParams && urlParams.get('includeRevoked') === 'true';
  const filtered = allMembers.filter(m => {
    if (m.status === 'active' || m.status === 'pending') return true;
    if (m.status === 'revoked' && includeRevoked) return true;
    return false;
  });

  return sendJson(res, 200, {
    ok: true,
    team: filtered.map(m => ({
      membershipId: m.id,
      userId: m.userId,
      email: m.userEmail,
      name: m.userName,
      role: m.role,
      status: m.status,
      permissions: repos.membership.getEffectivePermissions(m),
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      revokedAt: m.revokedAt || null,
      // Never expose inviteToken
    })),
  });
}

// ============ PR-8b: POST /client/team/invite ============

/**
 * POST /client/team/invite — Invite someone to current org
 * Body: { email, role, name? }
 */
function checkExistingMembership(repos, targetUser, orgId) {
  if (!targetUser) return null;
  const existing = repos.membership.getByUserAndOrg(targetUser.id, orgId);
  if (!existing) return null;
  if (existing.status === 'active') return { conflict: true, error: 'ALREADY_MEMBER', message: 'Cet utilisateur est déjà membre de cet établissement' };
  if (existing.status === 'pending') return { conflict: true, error: 'ALREADY_INVITED', message: 'Cet utilisateur a déjà été invité (invitation en attente)' };
  return { conflict: false, existing };
}

function reactivateMembership(repos, existing, role, permissions) {
  repos.membership.updateRole(existing.id, role);
  if (permissions) repos.membership.updatePermissions(existing.id, permissions);
  return repos.membership.updateStatus(existing.id, 'pending');
}

async function createInvitedUser(repos, auth, email, role, name) {
  const tempPassword = require('node:crypto').randomBytes(8).toString('base64url').slice(0, 12);
  const passwordHash = await hashPassword(tempPassword);
  const user = repos.user.create({
    orgId: auth.org.id, email, passwordHash, role, name: name || null, emailVerified: true,
  });
  try {
    const dbModule = storage.getDb();
    dbModule.prepare('UPDATE users SET must_change_password = 1 WHERE id = $id').run({ id: user.id });
  } catch (err) { console.warn('[TEAM] must_change_password column not ready:', err.message); }
  return user;
}

function createOrRefreshMembership(repos, reactivated, targetUser, auth, role, permissions) {
  const inviteToken = repos.membership.generateInviteToken();
  if (reactivated) {
    try {
      const dbModule = storage.getDb();
      dbModule.prepare('UPDATE memberships SET invite_token = $inviteToken WHERE id = $id')
        .run({ inviteToken, id: reactivated.id });
    } catch (err) { console.warn('[TEAM] invite_token update failed:', err.message); }
    return { membership: reactivated, inviteToken };
  }
  const membership = repos.membership.create({
    userId: targetUser.id, orgId: auth.org.id, role, status: 'pending',
    invitedBy: auth.user.id, inviteToken, permissions: permissions || null,
  });
  return { membership, inviteToken };
}

function sendInviteEmail(data, email, acceptLink, orgName, inviterName, name, isNewUser) {
  const subject = `Vous êtes invité à rejoindre ${orgName} sur Reputy`;
  const namePrefix = isNewUser && name ? ` ${name}` : '';
  const greeting = isNewUser ? `Bonjour${namePrefix},` : 'Bonjour,';
  const actionLine = isNewUser
    ? `Pour accepter l'invitation et créer votre mot de passe :`
    : `Pour accepter l'invitation :`;
  const extraLine = isNewUser ? '' : `\nOu connectez-vous directement sur ReputyBoard.\n`;
  const emailText = [greeting, '', `${inviterName} vous invite à rejoindre l'établissement "${orgName}" sur ReputyBoard.`, '', actionLine, acceptLink, '', extraLine, 'Cordialement,', `L'équipe Reputy`].filter(l => l !== undefined).join('\n');
  const extraHtml = isNewUser
    ? `<p style="color:#666;font-size:13px;">Ou copiez ce lien : ${acceptLink}</p>`
    : `<p>Ou connectez-vous directement sur ReputyBoard.</p>`;
  const actionHtml = isNewUser ? 'Pour accepter l\'invitation et créer votre mot de passe :' : '';
  const emailHtml = `
      <p>${greeting}</p>
      <p><strong>${inviterName}</strong> vous invite à rejoindre l'établissement <strong>"${orgName}"</strong> sur ReputyBoard.</p>
      ${actionHtml ? `<p>${actionHtml}</p>` : ''}
      <p><a href="${acceptLink}" style="display:inline-block;padding:12px 24px;background:#242c34;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accepter l'invitation</a></p>
      ${extraHtml}
      <p>Cordialement,<br/>L'équipe Reputy</p>
    `.trim();
  sendEmail(data, email, subject, emailText, emailHtml);
}

async function handleClientTeamInvite(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  const currentMembership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner', 'admin'], res);
  if (!currentMembership) return;

  let body;
  try { body = await parseBody(req); } catch (_) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
  }

  const v = validateBody(schemas.teamInvite, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const { email, role, name, permissions } = v.data;

  let targetUser = repos.user.getByEmail(email);
  let tempPasswordGenerated = false;
  let reactivated = null;

  const membershipCheck = checkExistingMembership(repos, targetUser, auth.org.id);
  if (membershipCheck?.conflict) {
    return sendJson(res, 409, { ok: false, error: membershipCheck.error, message: membershipCheck.message });
  }
  if (membershipCheck?.existing?.status === 'revoked') {
    reactivated = reactivateMembership(repos, membershipCheck.existing, role, permissions);
  }

  if (!targetUser) {
    targetUser = await createInvitedUser(repos, auth, email, role, name);
    tempPasswordGenerated = true;
  }

  const { membership: newMembership, inviteToken } = createOrRefreshMembership(repos, reactivated, targetUser, auth, role, permissions);

  const REPUTY_WEB_URL = process.env.REPUTY_WEB_URL || process.env.NEXT_PUBLIC_REPUTY_WEB_URL || 'http://localhost:3001';
  const acceptLink = `${REPUTY_WEB_URL}/invite/accept?token=${inviteToken}`;
  const orgName = auth.org.name || 'Reputy';
  const inviterName = auth.user.name || auth.user.email;

  sendInviteEmail(data, email, acceptLink, orgName, inviterName, name, tempPasswordGenerated);

  writeAudit({ orgId: auth.org.id, actorUserId: auth.user.id, action: 'team.invite', targetType: 'user', targetId: targetUser.id, meta: { email, role, isNewUser: tempPasswordGenerated }, req });

  return sendJson(res, 201, {
    ok: true,
    membership: { id: newMembership.id, userId: targetUser.id, email, role, status: 'pending' },
  });
}

// ============ PR-8b: PUT /client/team/:membershipId ============

/**
 * PUT /client/team/:membershipId — Update a member's role
 * Body: { role }
 * Only owner can change roles.
 */
async function handleClientTeamUpdateRole(req, res, membershipId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }

  const repos = storage.getRepos();

  // Only owner can update roles
  const currentMembership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner'], res);
  if (!currentMembership) return;

  let body;
  try { body = await parseBody(req); } catch (_) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
  }

  const v = validateBody(schemas.teamUpdateRole, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const { role: newRole, permissions: newPermissions } = v.data;

  // Get target membership
  const targetMembership = repos.membership.getById(membershipId);
  if (!targetMembership || targetMembership.orgId !== auth.org.id) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Membre non trouvé' });
  }

  // Cannot modify self
  if (targetMembership.userId === auth.user.id) {
    return sendJson(res, 400, { ok: false, error: 'CANNOT_MODIFY_SELF', message: 'Vous ne pouvez pas modifier votre propre rôle' });
  }

  // Cannot modify or promote to owner
  if (targetMembership.role === 'owner') {
    return sendJson(res, 400, { ok: false, error: 'CANNOT_MODIFY_OWNER', message: 'Impossible de modifier le rôle du propriétaire' });
  }

  let updated = targetMembership;
  if (newRole) {
    updated = repos.membership.updateRole(membershipId, newRole);
  }
  if (newPermissions) {
    updated = repos.membership.updatePermissions(membershipId, newPermissions);
  }

  // Audit
  writeAudit({ orgId: auth.org.id, actorUserId: auth.user.id, action: 'team.update', targetType: 'membership', targetId: membershipId, meta: { previousRole: targetMembership.role, newRole: newRole || targetMembership.role, permissionsUpdated: !!newPermissions }, req });

  return sendJson(res, 200, {
    ok: true,
    membership: {
      id: updated.id,
      role: updated.role,
      status: updated.status,
      permissions: repos.membership.getEffectivePermissions(updated),
    },
  });
}

// ============ PR-8b: DELETE /client/team/:membershipId ============

/**
 * DELETE /client/team/:membershipId — Revoke a member's access
 * Soft delete: sets status to 'revoked'.
 */
function handleClientTeamRevoke(req, res, membershipId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });
  }

  const repos = storage.getRepos();

  // Owner/admin can revoke
  const currentMembership = requireMembershipRole(repos, auth.user.id, auth.org.id, ['owner', 'admin'], res);
  if (!currentMembership) return;

  // Get target membership
  const targetMembership = repos.membership.getById(membershipId);
  if (!targetMembership || targetMembership.orgId !== auth.org.id) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Membre non trouvé' });
  }

  // Cannot revoke self
  if (targetMembership.userId === auth.user.id) {
    return sendJson(res, 400, { ok: false, error: 'CANNOT_REVOKE_SELF', message: 'Vous ne pouvez pas révoquer votre propre accès' });
  }

  // Admin cannot revoke owner
  if (currentMembership.role !== 'owner' && targetMembership.role === 'owner') {
    return sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Seul le propriétaire peut révoquer un autre propriétaire' });
  }

  // Admin cannot revoke another admin (only owner can)
  if (currentMembership.role === 'admin' && targetMembership.role === 'admin') {
    return sendJson(res, 403, { ok: false, error: 'FORBIDDEN', message: 'Un admin ne peut pas révoquer un autre admin' });
  }

  repos.membership.updateStatus(membershipId, 'revoked');

  // TODO: also revoke active sessions for this user on this org

  // Audit
  writeAudit({ orgId: auth.org.id, actorUserId: auth.user.id, action: 'team.revoke', targetType: 'membership', targetId: membershipId, meta: { revokedUserId: targetMembership.userId, revokedRole: targetMembership.role }, req });

  return sendJson(res, 200, { ok: true });
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
      billingComputed: enrichedOrg.billingComputed,
      // Establishment location (for competitor search)
      lat: enrichedOrg.lat || null,
      lng: enrichedOrg.lng || null,
      specialty: enrichedOrg.specialty || null,
      address: enrichedOrg.address || null,
      googlePlaceId: enrichedOrg.googlePlaceId || null,
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
  
  const orgId = auth.user.orgId;
  const repos = storage.getRepos();
  
  if (repos) {
    // ── SQLite mode ──
    const org = repos.org.getById(orgId);
    if (!org) {
      return sendJson(res, 404, { error: 'ORG_NOT_FOUND', message: 'Organisation non trouvée' });
    }
    
    // Get usage from SQLite usage_ledger
    const since30d = new Date();
    since30d.setDate(since30d.getDate() - 30);
    const summary = repos.usage.getSummary(orgId, since30d.toISOString());
    
    const recentEntries = repos.usage.listByOrg(orgId, { limit: 20 });
    
    return sendJson(res, 200, {
      period: {
        start: since30d.toISOString(),
        end: new Date().toISOString()
      },
      usage: {
        sms: summary.sms || 0,
        email: summary.email || 0
      },
      credits: null, // TODO: compute from org.subscriptionCredits
      recentActivity: recentEntries.map(e => ({
        id: e.id,
        type: e.type,
        qty: e.qty,
        ts: e.createdAt,
        meta: {
          patientName: e.details?.patientName || e.details?.patientFirstName || e.details?.recipient || e.details?.to || '',
          patientContact: e.details?.patientContact || e.details?.recipient || e.details?.to || '',
          channel: e.type,
          segments: e.details?.segments || null,
        }
      }))
    });
  }
  
  // ── JSON legacy mode ──
  const org = data.orgs.find(o => o.id === orgId);
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
    .filter(e => e.orgId === orgId)
    .filter(e => {
      const ts = new Date(e.createdAt || e.ts);
      return ts >= periodStartDate && ts <= periodEndDate;
    })
    .sort((a, b) => (b.createdAt || b.ts || '').localeCompare(a.createdAt || a.ts || ''))
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
      ts: e.createdAt || e.ts,
      meta: {
        patientName: e.meta?.patientName || e.patientName,
        channel: e.meta?.channel || e.channel
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
  // RBAC Tier 1: installation write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
    // Zod validation (PR-5)
    const v = validateBody(schemas.installationCreate, body);
    if (!v.ok) return sendJson(res, 400, v.payload);
    const { label, metadata } = v.data;
    
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
    sentry.captureException(err, {
      route: '/client/installations',
      status_code: '500',
      phase: 'create',
      orgId: auth.user?.orgId,
      userId: auth.user?.id,
    });
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
  // RBAC Tier 1: installation write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
  // RBAC Tier 1: installation write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
  
  // SMS review shortlinks are single-use (one per patient) → no scan limit
  if (shortlink.type !== 'sms') {
    // V2: Vérifier la limite de scans (200 pour Bronze, 1000 pour plans payants/packs)
    const org = repos.org.getById(shortlink.orgId);
    const planCode = org?.plan?.code || 'health_bronze';
    const isBronze = planCode.includes('bronze') || planCode.includes('basic');
    const maxScans = isBronze ? 200 : 1000;

    if (shortlink.clicks >= maxScans) {
      res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Limite atteinte</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>📱 Limite de scans atteinte</h1>
          <p>Ce QR code/tag NFC a atteint sa limite de ${maxScans} scans.</p>
          <p>Contactez votre praticien pour plus d'informations.</p>
        </body>
        </html>
      `);
      return;
    }
  }

  // Increment clicks counter
  repos.shortlink.incrementClicks(code);
  
  // 302 redirect to target URL
  res.writeHead(302, { 'Location': shortlink.targetUrl });
  res.end();
}

// ============================================================
// CONTACTS & CAMPAIGNS HANDLERS
// ============================================================

/**
 * GET /client/contacts — List contacts for current org
 * Query: ?search=&source=&limit=&offset=&hasEmail=1&hasPhone=1
 */
async function handleClientGetContacts(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const orgId = auth.org?.id || auth.user.orgId;
  const opts = {
    search: urlParams.get('search') || undefined,
    source: urlParams.get('source') || undefined,
    limit: parseInt(urlParams.get('limit') || '50', 10),
    offset: parseInt(urlParams.get('offset') || '0', 10),
    hasEmail: urlParams.get('hasEmail') === '1',
    hasPhone: urlParams.get('hasPhone') === '1',
  };

  const result = repos.contact.listByOrg(orgId, opts);
  const counts = repos.contact.countBySource(orgId);

  return sendJson(res, 200, { ok: true, ...result, counts });
}

/**
 * POST /client/contacts — Create a contact
 */
async function handleClientCreateContact(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const body = await parseBody(req);
  const v = validateBody(schemas.contactCreate, body);
  if (!v.ok) return sendJson(res, 400, v.payload);

  const orgId = auth.org?.id || auth.user.orgId;

  try {
    const result = repos.contact.create(orgId, v.data);
    return sendJson(res, result.created ? 201 : 200, {
      ok: true,
      contact: result.contact,
      created: result.created,
      message: result.created ? 'Contact créé' : 'Contact existant (doublon)',
    });
  } catch (err) {
    logger.logError('Contact create error:', err);
    return sendJson(res, 400, { ok: false, error: 'INVALID_DATA', message: err.message });
  }
}

/**
 * POST /client/contacts/import — Bulk import contacts
 */
async function handleClientImportContacts(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const body = await parseBody(req);
  const v = validateBody(schemas.contactImport, body);
  if (!v.ok) return sendJson(res, 400, v.payload);

  const orgId = auth.org?.id || auth.user.orgId;

  try {
    const stats = repos.contact.bulkImport(orgId, v.data.contacts, v.data.source);
    return sendJson(res, 200, {
      ok: true,
      message: `Import terminé : ${stats.imported} importé(s), ${stats.duplicates} doublon(s), ${stats.invalid} invalide(s)`,
      stats,
    });
  } catch (err) {
    logger.logError('Contact import error:', err);
    return sendJson(res, 500, { ok: false, error: 'IMPORT_FAILED', message: err.message });
  }
}

/**
 * POST /client/contacts/sync — Sync contacts from review_requests
 */
async function handleClientSyncContacts(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const orgId = auth.org?.id || auth.user.orgId;

  try {
    const stats = repos.contact.syncFromReviewRequests(orgId);
    return sendJson(res, 200, {
      ok: true,
      message: `Synchronisation terminée : ${stats.imported} nouveau(x) contact(s)`,
      stats,
    });
  } catch (err) {
    logger.logError('Contact sync error:', err);
    return sendJson(res, 500, { ok: false, error: 'SYNC_FAILED', message: err.message });
  }
}

/**
 * DELETE /client/contacts/:id — Delete a contact
 */
async function handleClientDeleteContact(req, res, contactId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const contact = repos.contact.getById(contactId);
  if (!contact) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND', message: 'Contact introuvable' });

  const orgId = auth.org?.id || auth.user.orgId;
  if (contact.orgId !== orgId) return sendJson(res, 403, { ok: false, error: 'FORBIDDEN' });

  repos.contact.remove(contactId);
  return sendJson(res, 200, { ok: true, message: 'Contact supprimé' });
}

/**
 * GET /client/campaigns — List campaigns for current org
 * Query: ?status=&type=&limit=&offset=
 */
async function handleClientGetCampaigns(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const orgId = auth.org?.id || auth.user.orgId;
  const opts = {
    status: urlParams.get('status') || undefined,
    type: urlParams.get('type') || undefined,
    limit: parseInt(urlParams.get('limit') || '50', 10),
    offset: parseInt(urlParams.get('offset') || '0', 10),
  };

  const result = repos.campaign.listByOrg(orgId, opts);
  return sendJson(res, 200, { ok: true, ...result });
}

/**
 * GET /client/campaigns/:id — Get single campaign with stats
 */
async function handleClientGetCampaign(req, res, campaignId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const campaign = repos.campaign.getById(campaignId);
  if (!campaign) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });

  const orgId = auth.org?.id || auth.user.orgId;
  if (campaign.orgId !== orgId) return sendJson(res, 403, { ok: false, error: 'FORBIDDEN' });

  const stats = repos.campaign.getStats(campaignId);
  const recipients = repos.campaign.listRecipients(campaignId);

  return sendJson(res, 200, { ok: true, campaign, stats, recipients });
}

/**
 * POST /client/campaigns — Create a campaign
 */
async function handleClientCreateCampaign(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const body = await parseBody(req);
  const v = validateBody(schemas.campaignCreate, body);
  if (!v.ok) return sendJson(res, 400, v.payload);

  const orgId = auth.org?.id || auth.user.orgId;

  try {
    const campaign = repos.campaign.create(orgId, v.data);
    return sendJson(res, 201, { ok: true, campaign, message: 'Campagne créée' });
  } catch (err) {
    logger.logError('Campaign create error:', err);
    return sendJson(res, 500, { ok: false, error: 'CREATE_FAILED', message: err.message });
  }
}

/**
 * PUT /client/campaigns/:id — Update a campaign
 */
async function handleClientUpdateCampaign(req, res, campaignId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const campaign = repos.campaign.getById(campaignId);
  if (!campaign) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });

  const orgId = auth.org?.id || auth.user.orgId;
  if (campaign.orgId !== orgId) return sendJson(res, 403, { ok: false, error: 'FORBIDDEN' });

  if (campaign.status === 'sending' || campaign.status === 'completed') {
    return sendJson(res, 409, { ok: false, error: 'CAMPAIGN_LOCKED', message: 'Campagne en cours ou terminée, modification impossible' });
  }

  const body = await parseBody(req);
  const v = validateBody(schemas.campaignUpdate, body);
  if (!v.ok) return sendJson(res, 400, v.payload);

  try {
    const updated = repos.campaign.update(campaignId, v.data);
    return sendJson(res, 200, { ok: true, campaign: updated, message: 'Campagne mise à jour' });
  } catch (err) {
    logger.logError('Campaign update error:', err);
    return sendJson(res, 500, { ok: false, error: 'UPDATE_FAILED', message: err.message });
  }
}

/**
 * DELETE /client/campaigns/:id — Delete a campaign
 */
async function handleClientDeleteCampaign(req, res, campaignId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const campaign = repos.campaign.getById(campaignId);
  if (!campaign) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });

  const orgId = auth.org?.id || auth.user.orgId;
  if (campaign.orgId !== orgId) return sendJson(res, 403, { ok: false, error: 'FORBIDDEN' });

  if (campaign.status === 'sending') {
    return sendJson(res, 409, { ok: false, error: 'CAMPAIGN_LOCKED', message: 'Campagne en cours d\'envoi' });
  }

  repos.campaign.remove(campaignId);
  return sendJson(res, 200, { ok: true, message: 'Campagne supprimée' });
}

/**
 * POST /client/campaigns/:id/recipients — Add recipients to a campaign
 */
function buildSendAllRecipients(repos, orgId, campaign) {
  const eligible = repos.contact.listEligibleForReviewCampaign(orgId, campaign.channel, campaign.spamThreshold);
  const excluded = repos.contact.listExcludedFromReviewCampaign(orgId, campaign.channel, campaign.spamThreshold);
  const recipients = eligible.map(c => ({ contactId: c.id }));
  for (const c of excluded.spamExcluded) {
    recipients.push({ contactId: c.id, excludedReason: 'spam_threshold' });
  }
  for (const c of excluded.reviewedExcluded) {
    recipients.push({ contactId: c.id, excludedReason: 'already_reviewed' });
  }
  return recipients;
}

function buildSelectedRecipients(repos, contactIds, orgId) {
  const recipients = [];
  for (const contactId of contactIds) {
    const contact = repos.contact.getById(contactId);
    if (contact && contact.orgId === orgId) recipients.push({ contactId });
  }
  return recipients;
}

async function handleClientAddCampaignRecipients(req, res, campaignId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const campaign = repos.campaign.getById(campaignId);
  if (!campaign) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });

  const orgId = auth.org?.id || auth.user.orgId;
  if (campaign.orgId !== orgId) return sendJson(res, 403, { ok: false, error: 'FORBIDDEN' });

  const body = await parseBody(req);

  try {
    let recipients;
    if (body.sendAll) {
      recipients = buildSendAllRecipients(repos, orgId, campaign);
    } else if (body.contactIds && Array.isArray(body.contactIds)) {
      recipients = buildSelectedRecipients(repos, body.contactIds, orgId);
    } else {
      return sendJson(res, 400, { ok: false, error: 'INVALID_DATA', message: 'contactIds ou sendAll requis' });
    }

    const result = repos.campaign.addRecipients(campaignId, recipients);
    return sendJson(res, 200, {
      ok: true,
      message: `${result.added} destinataire(s) ajouté(s), ${result.excluded} exclu(s)`,
      ...result,
    });
  } catch (err) {
    logger.logError('Campaign recipients error:', err);
    return sendJson(res, 500, { ok: false, error: 'ADD_RECIPIENTS_FAILED', message: err.message });
  }
}

/**
 * POST /client/campaigns/:id/send — Launch campaign send
 * (For now: marks as 'sending' + updates recipients — actual send is separate)
 */
async function handleClientSendCampaign(req, res, campaignId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED', message: 'Non authentifié' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 501, { ok: false, error: 'NOT_IMPLEMENTED' });

  const campaign = repos.campaign.getById(campaignId);
  if (!campaign) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });

  const orgId = auth.org?.id || auth.user.orgId;
  if (campaign.orgId !== orgId) return sendJson(res, 403, { ok: false, error: 'FORBIDDEN' });

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return sendJson(res, 409, { ok: false, error: 'INVALID_STATUS', message: 'Campagne doit être en brouillon ou programmée' });
  }

  // Check that there are pending recipients
  const pendingRecipients = repos.campaign.listRecipients(campaignId, { status: 'pending', excludeExcluded: true });
  if (pendingRecipients.length === 0) {
    return sendJson(res, 400, { ok: false, error: 'NO_RECIPIENTS', message: 'Aucun destinataire éligible' });
  }

  // Check credits — V2: Les campagnes ne consomment PAS les crédits forfait
  // Seuls les crédits packs (packWallet) sont utilisables pour les campagnes
  const org = repos.org.getById(orgId);
  if (!org) return sendJson(res, 404, { ok: false, error: 'ORG_NOT_FOUND' });

  const packBalance = org.packWallet || { sms: 0, email: 0, ai: 0 };
  const channelType = campaign.channel || 'sms'; // 'sms' ou 'email'
  const neededCredits = pendingRecipients.length;

  if (channelType === 'sms' && (packBalance.sms || 0) < neededCredits) {
    return sendJson(res, 402, {
      ok: false,
      error: 'INSUFFICIENT_PACK_CREDITS',
      message: `Crédits packs SMS insuffisants. Nécessaire: ${neededCredits}, Disponible (packs): ${packBalance.sms || 0}. Les campagnes nécessitent l'achat de packs.`
    });
  }
  if (channelType === 'email' && (packBalance.email || 0) < neededCredits) {
    return sendJson(res, 402, {
      ok: false,
      error: 'INSUFFICIENT_PACK_CREDITS',
      message: `Crédits packs Email insuffisants. Nécessaire: ${neededCredits}, Disponible (packs): ${packBalance.email || 0}. Les campagnes nécessitent l'achat de packs.`
    });
  }

  // Mark campaign as sending
  repos.campaign.update(campaignId, { status: 'active' });

  // TODO: Actual send logic (process recipients one by one, check credits, send email/sms)
  // For now: mark campaign as active, actual send will be background job

  const stats = repos.campaign.getStats(campaignId);

  return sendJson(res, 200, {
    ok: true,
    message: `Campagne lancée avec ${pendingRecipients.length} destinataire(s) éligible(s)`,
    campaign: repos.campaign.getById(campaignId),
    stats,
  });
}

// ============================================================
// LIFECYCLE STATS HANDLER (P1a — KPI client lifecycle)
// ============================================================

/**
 * GET /client/lifecycle-stats — Lifecycle KPIs for the authenticated org.
 *
 * Accepts ?period=30d or ?since=30d (alias), default 30d, clamp ≤ 365.
 * Returns { sent, feedbackReceived, publicRedirected, conversionRate }
 * computed from review_requests lifecycle timestamps.
 */
function handleClientLifecycleStats(req, res, urlParams) {
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

  const orgId = auth.user.orgId;

  // Parse period — accept ?period= OR ?since= (alias)
  const raw = (urlParams.get('period') || urlParams.get('since') || '30d').trim();
  const m = raw.match(/^(\d+)d$/);
  const days = m ? Math.min(parseInt(m[1], 10), 365) : 30;

  const dbModule = storage.getDb();
  if (!dbModule) {
    return sendJson(res, 200, {
      ok: true,
      period: { since: new Date().toISOString(), days },
      sent: 0,
      feedbackReceived: 0,
      publicRedirected: 0,
      conversionRate: 0
    });
  }

  const sinceISO = dbModule.computeSinceISO(days);
  const database = dbModule.getDb();

  const sent = database.prepare(
    `SELECT COUNT(*) as cnt FROM review_requests
     WHERE org_id = $orgId AND sent_at IS NOT NULL AND sent_at >= $since`
  ).get({ orgId, since: sinceISO }).cnt;

  const feedbackReceived = database.prepare(
    `SELECT COUNT(*) as cnt FROM review_requests
     WHERE org_id = $orgId AND feedback_received_at IS NOT NULL AND feedback_received_at >= $since`
  ).get({ orgId, since: sinceISO }).cnt;

  const publicRedirected = database.prepare(
    `SELECT COUNT(*) as cnt FROM review_requests
     WHERE org_id = $orgId AND public_redirected_at IS NOT NULL AND public_redirected_at >= $since`
  ).get({ orgId, since: sinceISO }).cnt;

  // Conversion rate: publicRedirected / sent, protect against division by zero, round 1 decimal
  const conversionRate = sent > 0
    ? +(publicRedirected / sent * 100).toFixed(1)
    : 0;

  return sendJson(res, 200, {
    ok: true,
    period: { since: sinceISO, days },
    sent,
    feedbackReceived,
    publicRedirected,
    conversionRate
  });
}

// ============================================================
// AI SUGGEST-REPLY HANDLER (PR-3)
// ============================================================

/**
 * POST /client/ai/suggest-reply
 *
 * Flow:
 *   1) Auth (getAuthUser)
 *   2) RBAC owner/admin/agent
 *   3) Validate body (reviewText min 5 chars)
 *   4) Check AI quota via computeEffectiveBilling
 *   5) Call OpenAI (async, outside transaction)
 *   6) db.transaction: debit quota + audit (sync, atomic)
 *   7) Return { ok, draft, sensitive, requireApproval, remainingAi }
 */
async function handleAiSuggestReply(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth || !auth.user) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'AUTH_REQUIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Non authentifié',
      action: 'LOGIN'
    });
  }

  // RBAC — all session roles can use AI
  if (!checkRole(auth, ['owner', 'admin', 'agent'], res)) return;

  // Rate limit IA — 10 req/min par user+org (PR-6)
  const aiRlKey = `ai:${auth.org.id}:${auth.user.id}`;
  const aiRl = checkRateLimit(aiRlKey, IS_PRODUCTION ? 10 : 1000);
  if (!aiRl.allowed) {
    return sendJson(res, 429, {
      ok: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Trop de requêtes IA. Réessayez plus tard.',
      retryAfter: aiRl.retryAfterSec
    });
  }

  // Parse & validate body
  let body;
  try {
    body = await parseBody(req);
  } catch (_) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_JSON', message: 'Corps JSON invalide' });
  }

  // Zod validation (PR-5)
  const v = validateBody(schemas.aiSuggestReply, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const reviewText = v.data.reviewText.trim();

  // Get fresh org + quota check via computeEffectiveBilling
  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 503, { ok: false, error: 'STORAGE_UNAVAILABLE' });
  }

  const freshOrg = repos.org.getById(auth.org.id);
  if (!freshOrg) {
    return sendJson(res, 404, { ok: false, error: 'ORG_NOT_FOUND' });
  }

  const billing = effectiveBilling.computeEffectiveBilling({ org: freshOrg, repos });
  const remainingAi = billing.totalAvailableThisMonth.ai;

  if (remainingAi <= 0) {
    return sendJson(res, 402, {
      ok: false,
      error: 'AI_QUOTA_EXCEEDED',
      errorCategory: 'QUOTA_AI_EXCEEDED',
      message: 'Quota IA atteint pour cette période. Passez au plan supérieur ou achetez un pack.',
      action: 'BUY_AI_ADDON',
      remainingAi: 0
    });
  }

  // Call OpenAI — async, outside transaction
  let aiResult;
  try {
    aiResult = await aiSuggestReply({
      reviewText,
      orgName: freshOrg.name || '',
      language: body.language || 'fr',
      tone: body.tone || 'professional',
    });
  } catch (err) {
    const status = err.statusCode || 502;
    const code = err.message || 'AI_ERROR';
    console.error('[AI] OpenAI error:', err.message);
    sentry.captureException(err, {
      route: '/client/ai/suggest-reply',
      provider: 'openai',
      status_code: String(status),
      phase: 'openai_call',
      orgId: auth.org?.id,
      userId: auth.user?.id,
      errorCode: code,
      reviewTextLen: reviewText.length, // Never send raw text
    });
    return sendJson(res, status, {
      ok: false,
      error: code,
      message: status === 503
        ? 'Service IA non configuré. Contactez l\'administrateur.'
        : 'Erreur lors de la génération de la réponse IA.'
    });
  }

  // Atomic: debit quota + audit (sync transaction)
  const dbModule = storage.getDb();
  try {
    dbModule.transaction(() => {
      // Re-read fresh org inside transaction to avoid stale data
      const orgNow = repos.org.getById(auth.org.id);
      orgNow.subscriptionCredits.aiUsedThisPeriod =
        (orgNow.subscriptionCredits.aiUsedThisPeriod || 0) + 1;
      repos.org.updateSubscriptionCredits(orgNow.id, orgNow.subscriptionCredits);

      writeAudit({
        orgId: auth.org.id,
        actorUserId: auth.user.id,
        action: 'ai.suggest_reply',
        targetType: 'org',
        targetId: auth.org.id,
        meta: {
          sensitive: aiResult.sensitive,
          chars: reviewText.length,
          tone: body.tone || 'professional',
        },
        req
      });
    });
  } catch (err) {
    console.error('[AI] Transaction error (debit/audit):', err.message);
    sentry.captureException(err, {
      route: '/client/ai/suggest-reply',
      provider: 'openai',
      status_code: '500',
      phase: 'debit_transaction',
      orgId: auth.org?.id,
      userId: auth.user?.id,
      errorCode: 'DEBIT_ERROR',
    });
    return sendJson(res, 500, {
      ok: false,
      error: 'DEBIT_ERROR',
      message: 'Erreur lors de la consommation du quota IA.'
    });
  }

  return sendJson(res, 200, {
    ok: true,
    draft: aiResult.draft,
    sensitive: aiResult.sensitive,
    requireApproval: true,
    remainingAi: remainingAi - 1
  });
}

// ============================================================
// GOOGLE BUSINESS PROFILE HANDLERS
// ============================================================

/**
 * GET /client/google/status - Get Google connection status
 */
function handleGoogleStatus(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  const isGoogleConfigured = googleOAuth.isConfigured();

  // Read google_oauth_json from org
  const repos = storage.getRepos();
  let googleStatus = null;

  if (repos) {
    const org = repos.org.getById(auth.user.orgId);
    if (org && org.googleOauthJson) {
      try {
        const oauthRaw = JSON.parse(org.googleOauthJson);
        googleStatus = {
          connected: true,
          accountId: oauthRaw.accountId || null,
          locationId: oauthRaw.locationId || null,
          locationName: oauthRaw.locationName || null,
          connectedAt: oauthRaw.connectedAt || null,
          lastSyncAt: oauthRaw.lastSyncAt || null,
          syncStatus: oauthRaw.syncStatus || 'idle',
        };
      } catch (e) {
        googleStatus = null;
      }
    }
  }

  return sendJson(res, 200, {
    ok: true,
    configured: isGoogleConfigured,
    google: googleStatus || { connected: false },
  });
}

/**
 * GET /client/google/auth-url - Generate Google OAuth URL
 */
function handleGoogleAuthUrl(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  if (!googleOAuth.isConfigured()) {
    return sendJson(res, 503, {
      ok: false,
      errorCode: 'GOOGLE_NOT_CONFIGURED',
      message: 'Google Business Profile n\'est pas configuré. Contactez le support.',
    });
  }

  try {
    const { url, state } = googleOAuth.getAuthUrl(auth.user.orgId);
    return sendJson(res, 200, { ok: true, authUrl: url, state });
  } catch (err) {
    return sendJson(res, 500, { ok: false, errorCode: 'GOOGLE_AUTH_ERROR', message: err.message });
  }
}

/**
 * POST /client/google/callback - Handle OAuth callback (exchange code for tokens)
 * Body: { code, state }
 */
async function discoverGoogleAccountsAndLocations(accessToken, orgId) {
  let accounts = [];
  let accountId = null;
  let locations = [];
  let apiWarning = null;

  try {
    accounts = await googleBusiness.listAccounts(accessToken);
    if (accounts && accounts.length > 0) {
      accountId = accounts[0].name;
      try {
        locations = await googleBusiness.listLocations(accessToken, accountId);
      } catch (locErr) {
        logger.logError('GOOGLE_LIST_LOCATIONS_WARN', { orgId, error: locErr.message });
        apiWarning = 'Impossible de lister les établissements. Le quota GBP API est peut-être à 0.';
      }
    }
  } catch (accErr) {
    logger.logError('GOOGLE_LIST_ACCOUNTS_WARN', {
      orgId, error: accErr.message, statusCode: accErr.statusCode,
      body: accErr.body ? JSON.stringify(accErr.body).slice(0, 500) : undefined,
    });
    apiWarning = `Impossible de lister les comptes GBP (${accErr.message}). Le quota API est peut-être à 0. Remplissez le formulaire Google pour demander l'accès.`;
  }

  return { accounts, accountId, locations, apiWarning };
}

function saveGoogleOAuthTokens(tokens, accountId, locations, orgId) {
  const oauthJson = googleOAuth.buildOAuthJson({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    accountId: accountId || null,
    locationId: locations.length > 0 ? locations[0].name : null,
    locationName: locations.length > 0 ? locations[0].title : null,
  });

  const repos = storage.getRepos();
  if (!repos) return;

  const db = storage.getDb();
  db.run('UPDATE orgs SET google_oauth_json = $json, updated_at = $now WHERE id = $id', {
    json: oauthJson, now: db.nowISO(), id: orgId,
  });

  if (locations.length > 0 && locations[0].placeId) {
    db.run('UPDATE orgs SET google_place_id = $placeId WHERE id = $id', {
      placeId: locations[0].placeId, id: orgId,
    });
  }
}

async function handleGoogleCallback(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });

  const body = await parseBody(req);
  if (!body.code) return sendJson(res, 400, { ok: false, errorCode: 'MISSING_CODE', message: 'Code d\'autorisation manquant' });

  let tokens;
  try {
    tokens = await googleOAuth.exchangeCode(body.code);
  } catch (err) {
    logger.logError('GOOGLE_TOKEN_EXCHANGE_ERROR', {
      orgId: auth.user.orgId, error: err.message, statusCode: err.statusCode,
      body: err.body ? JSON.stringify(err.body).slice(0, 500) : undefined,
    });
    return sendJson(res, 400, { ok: false, errorCode: 'TOKEN_EXCHANGE_FAILED', message: `Échec de l'échange de tokens Google: ${err.message}` });
  }

  if (!tokens.accessToken) {
    return sendJson(res, 400, { ok: false, errorCode: 'TOKEN_EXCHANGE_FAILED', message: 'Aucun access token reçu de Google' });
  }

  const { accounts, accountId, locations, apiWarning } = await discoverGoogleAccountsAndLocations(tokens.accessToken, auth.user.orgId);

  try {
    saveGoogleOAuthTokens(tokens, accountId, locations, auth.user.orgId);

    googleSync.logSyncEvent(auth.user.orgId, 'connect', 'success', {
      accountId, locationCount: locations.length, apiWarning: apiWarning || undefined,
    });
    logger.logAudit('GOOGLE_CONNECTED', {
      orgId: auth.user.orgId, userId: auth.user.id, accountId, locationCount: locations.length,
    });

    return sendJson(res, 200, {
      ok: true,
      message: apiWarning ? `Google connecté (avec avertissement: ${apiWarning})` : 'Google Business connecté avec succès',
      warning: apiWarning || undefined,
      account: accountId ? { accountId, accountName: accounts[0]?.accountName || accounts[0]?.name || accountId } : null,
      locations: locations.map(l => ({ id: l.name, title: l.title, address: l.address, placeId: l.placeId })),
    });
  } catch (err) {
    logger.logError('GOOGLE_CALLBACK_ERROR', { orgId: auth.user.orgId, error: err.message });
    return sendJson(res, 500, { ok: false, errorCode: 'GOOGLE_CALLBACK_ERROR', message: `Erreur lors de la sauvegarde: ${err.message}` });
  }
}

/**
 * GET /client/google/accounts - List Google Business accounts and locations
 */
async function handleGoogleListAccounts(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, errorCode: 'STORAGE_ERROR', message: 'Storage not available' });
  }

  try {
    const { accessToken } = await googleSync.getValidToken(repos.org, auth.user.orgId);

    const accounts = await googleBusiness.listAccounts(accessToken);
    const result = [];

    for (const account of accounts) {
      let locations = [];
      try {
        locations = await googleBusiness.listLocations(accessToken, account.name);
      } catch (err) {
        logger.logError('GOOGLE_LIST_LOCATIONS_ERROR', { account: account.name, error: err.message });
      }

      result.push({
        accountId: account.name,
        accountName: account.accountName || account.name,
        type: account.type,
        locations,
      });
    }

    return sendJson(res, 200, { ok: true, accounts: result });
  } catch (err) {
    return sendJson(res, 500, { ok: false, errorCode: 'GOOGLE_API_ERROR', message: err.message });
  }
}

/**
 * POST /client/google/select-location - Select a Google Business location
 * Body: { accountId, locationId, locationName }
 */
async function handleGoogleSelectLocation(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  const body = await parseBody(req);
  if (!body.accountId || !body.locationId) {
    return sendJson(res, 400, {
      ok: false,
      errorCode: 'MISSING_FIELDS',
      message: 'accountId et locationId requis',
    });
  }

  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, errorCode: 'STORAGE_ERROR' });
  }

  const org = repos.org.getById(auth.user.orgId);
  if (!org || !org.googleOauthJson) {
    return sendJson(res, 400, { ok: false, errorCode: 'GOOGLE_NOT_CONNECTED', message: 'Google non connecté' });
  }

  try {
    // Parse existing OAuth data, update account/location
    const oauthRaw = JSON.parse(org.googleOauthJson);
    oauthRaw.accountId = body.accountId;
    oauthRaw.locationId = body.locationId;
    oauthRaw.locationName = body.locationName || null;

    const dbInstance = storage.getDb();
    dbInstance.run('UPDATE orgs SET google_oauth_json = $json, updated_at = $now WHERE id = $id', {
      json: JSON.stringify(oauthRaw),
      now: dbInstance.nowISO(),
      id: auth.user.orgId,
    });

    return sendJson(res, 200, {
      ok: true,
      message: 'Établissement Google sélectionné',
      location: {
        accountId: body.accountId,
        locationId: body.locationId,
        locationName: body.locationName,
      },
    });
  } catch (err) {
    return sendJson(res, 500, { ok: false, errorCode: 'UPDATE_ERROR', message: err.message });
  }
}

/**
 * POST /client/google/sync - Trigger manual review sync from Google
 */
async function handleGoogleSync(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, errorCode: 'STORAGE_ERROR' });
  }

  try {
    const result = await googleSync.syncReviews(repos.org, repos.review, auth.user.orgId, {
      logSync: googleSync.logSyncEvent,
    });

    logger.logAudit('GOOGLE_SYNC_TRIGGERED', {
      orgId: auth.user.orgId,
      userId: auth.user.id,
      imported: result.imported,
      skipped: result.skipped,
    });

    return sendJson(res, 200, {
      ok: true,
      message: `Synchronisation terminée: ${result.imported} nouveaux avis importés`,
      sync: result,
    });
  } catch (err) {
    logger.logError('GOOGLE_SYNC_ERROR', { orgId: auth.user.orgId, error: err.message });
    return sendJson(res, 500, {
      ok: false,
      errorCode: 'SYNC_ERROR',
      message: `Erreur de synchronisation: ${err.message}`,
    });
  }
}

/**
 * POST /client/google/post-reply/:reviewId - Post a queued reply to Google
 */
async function handleGooglePostReply(req, res, reviewId) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, errorCode: 'STORAGE_ERROR' });
  }

  try {
    const updated = await googleSync.postReplyToGoogle(repos.org, repos.review, auth.user.orgId, reviewId, {
      logSync: googleSync.logSyncEvent,
    });

    logger.logAudit('GOOGLE_REPLY_POSTED', {
      orgId: auth.user.orgId,
      userId: auth.user.id,
      reviewId,
    });

    return sendJson(res, 200, {
      ok: true,
      message: 'Réponse publiée sur Google',
      review: updated,
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: 'POST_REPLY_ERROR',
      message: `Erreur publication réponse: ${err.message}`,
    });
  }
}

/**
 * POST /client/google/disconnect - Disconnect Google account
 */
function handleGoogleDisconnect(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  googleSync.disconnectGoogle(auth.user.orgId, {
    logSync: googleSync.logSyncEvent,
  });

  logger.logAudit('GOOGLE_DISCONNECTED', {
    orgId: auth.user.orgId,
    userId: auth.user.id,
  });

  return sendJson(res, 200, {
    ok: true,
    message: 'Google Business déconnecté',
  });
}

/**
 * GET /client/google/sync-log - Get sync history
 */
function handleGoogleSyncLog(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) {
    return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  }

  const dbInstance = storage.getDb();
  if (!dbInstance) {
    return sendJson(res, 200, { ok: true, logs: [] });
  }

  const limit = Math.min(parseInt(urlParams.get('limit')) || 20, 100);

  const logs = dbInstance.all(`
    SELECT * FROM google_sync_log 
    WHERE org_id = $orgId 
    ORDER BY created_at DESC 
    LIMIT $limit
  `, { orgId: auth.user.orgId, limit });

  return sendJson(res, 200, {
    ok: true,
    logs: (logs || []).map(log => ({
      id: log.id,
      action: log.action,
      status: log.status,
      details: JSON.parse(log.details_json || '{}'),
      createdAt: log.created_at,
    })),
  });
}

/**
 * GET /client/google/my-place - Get client's own Google rating, reviews, and place info
 * Uses Places API (New) with the org's google_place_id.
 * Falls back to text search if no place_id is stored.
 * Caches results for 24h to minimize API calls.
 */
function isInvalidPlaceId(placeId) {
  if (!placeId) return true;
  const invalidPrefixes = ['gpage_', 'cid_', 'url_'];
  return invalidPrefixes.some(p => placeId.startsWith(p));
}

function resolveDbPlaceId(orgId) {
  const dbInstance = storage.getDb();
  if (!dbInstance) return null;
  const row = dbInstance.get('SELECT google_place_id FROM orgs WHERE id = $id', { id: orgId });
  if (row?.google_place_id && !row.google_place_id.startsWith('gpage_') && !row.google_place_id.startsWith('cid_')) {
    return row.google_place_id;
  }
  return null;
}

async function searchAndSavePlaceId(org) {
  const searchQuery = org.name || org.options?.cabinetName || '';
  if (!searchQuery || !org.lat || !org.lng) return { placeId: null, notConfigured: 'Aucun Place ID Google trouvé. Connectez votre fiche Google Business ou configurez vos coordonnées GPS.' };

  const searchResults = await googlePlaces.textSearch({
    textQuery: searchQuery, lat: org.lat, lng: org.lng, radiusMeters: 1000, maxResultCount: 3,
  });

  if (!searchResults || searchResults.length === 0) {
    return { placeId: null, notConfigured: 'Fiche Google introuvable. Vérifiez le nom de votre établissement ou connectez Google Business.' };
  }

  const placeId = searchResults[0].placeId;
  const dbInstance = storage.getDb();
  if (dbInstance && placeId) {
    dbInstance.run('UPDATE orgs SET google_place_id = $placeId, updated_at = $now WHERE id = $id', {
      placeId, now: new Date().toISOString(), id: org.id,
    });
  }
  return { placeId, notConfigured: null };
}

async function resolveGooglePlaceId(org) {
  let placeId = org.googlePlaceId || null;

  if (isInvalidPlaceId(placeId)) {
    placeId = resolveDbPlaceId(org.id);
  }

  if (isInvalidPlaceId(placeId)) {
    const result = await searchAndSavePlaceId(org);
    if (result.notConfigured) return { placeId: null, notConfigured: result.notConfigured };
    placeId = result.placeId;
  }

  return { placeId, notConfigured: null };
}

async function handleGoogleMyPlace(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  if (!auth) return sendJson(res, 401, { ok: false, errorCode: 'UNAUTHORIZED', message: 'Session expirée' });
  if (!googlePlaces.isConfigured()) return sendJson(res, 503, { ok: false, error: 'Google Places API non configurée' });

  const repos = storage.getRepos();
  if (!repos) return sendJson(res, 503, { ok: false, error: 'Storage unavailable' });

  const org = repos.org.getById(auth.user.orgId);
  if (!org) return sendJson(res, 404, { ok: false, error: 'Organisation non trouvée' });

  try {
    const { placeId, notConfigured } = await resolveGooglePlaceId(org);
    if (notConfigured) {
      return sendJson(res, 200, { ok: true, configured: false, message: notConfigured });
    }

    let details = competitorRepo.getCachedPlaceDetails(placeId, 1);
    if (!details) {
      details = await googlePlaces.getPlaceDetails(placeId);
      if (details) competitorRepo.cachePlaceDetails(details);
    }

    if (!details) {
      return sendJson(res, 200, { ok: true, configured: false, message: 'Impossible de récupérer les détails de la fiche.' });
    }

    return sendJson(res, 200, {
      ok: true, configured: true, placeId,
      name: details.name, address: details.address, phone: details.phone,
      website: details.website, rating: details.rating, totalReviews: details.userRatingsTotal,
      reviews: (details.reviews || []).map(r => ({
        author: r.author, rating: r.rating, text: r.text,
        publishTime: r.publishTime, relativeTime: r.relativePublishTimeDescription,
      })),
      openingHours: details.openingHours,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.logError('GOOGLE_MY_PLACE_ERROR', { orgId: org.id, error: err.message });
    return sendJson(res, 500, { ok: false, error: `Erreur lors de la récupération: ${err.message}` });
  }
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
  const body = await parseBody(req);
  
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
  let updated = repos.review.updateReply(auth.user.orgId, reviewId, {
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

  // Auto-post to Google if connected and review is from Google provider
  let googlePosted = false;
  if (existing.provider === 'google' && existing.providerReviewId) {
    try {
      const org = repos.org.getById(auth.user.orgId);
      if (org && org.googleOauthJson) {
        updated = await googleSync.postReplyToGoogle(repos.org, repos.review, auth.user.orgId, reviewId, {
          logSync: googleSync.logSyncEvent,
        });
        googlePosted = true;
        logger.logInfo('REVIEW_REPLY_AUTO_POSTED_GOOGLE', { reviewId, orgId: auth.user.orgId });
      }
    } catch (googleErr) {
      // Don't fail the whole reply if Google post fails — it stays 'queued' for retry
      logger.logError('REVIEW_REPLY_GOOGLE_AUTO_POST_FAILED', {
        reviewId,
        orgId: auth.user.orgId,
        error: googleErr.message,
      });
    }
  }
  
  return sendJson(res, 200, {
    ok: true,
    review: updated,
    message: googlePosted ? 'Reply posted to Google' : 'Reply queued for processing',
    googlePosted,
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
  
  const body = await parseBody(req);
  
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
  
  const body = await parseBody(req);
  
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
  
  const body = await parseBody(req);
  
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
// COMPETITORS HANDLERS (Google Places API)
// ============================================================

const googlePlaces = require('./lib/google/google-places');
const competitorRepo = require('./lib/repositories/competitor.repo');
const placesProfiles = require('./lib/google/places-profiles');

/**
 * GET /client/competitors?radius=1000|2000|5000
 * Returns server-side buckets with estimated 30d reviews.
 */
const SYNC_MAX_RADIUS_M = 5000;
const SYNC_MAX_RESULTS = 20;
const SYNC_MIN_FALLBACK = 3;
const SYNC_MAX_COMPETITORS = 25;
const SYNC_IRRELEVANT_TYPES = [
  'pharmacy', 'drugstore', 'hospital',
  'university', 'school', 'secondary_school', 'primary_school',
  'fire_station', 'police', 'post_office',
  'supermarket', 'grocery_store', 'gas_station', 'parking',
  'atm', 'bank', 'city_hall', 'local_government_office',
  'cemetery', 'church', 'mosque', 'synagogue', 'hindu_temple',
  'beauty_salon', 'hair_salon', 'hair_care', 'spa', 'nail_salon', 'tanning_studio',
];
const SYNC_SPECIFIC_TYPES = ['dentist', 'pharmacy', 'veterinary_care', 'physiotherapist', 'hospital'];

async function _syncDedupMerge(places, ids, fetcher, label) {
  try {
    const results = await fetcher();
    let added = 0;
    for (const p of results) {
      if (p.placeId && !ids.has(p.placeId)) { places.push(p); ids.add(p.placeId); added++; }
    }
    if (added > 0) console.log(`[SYNC-MANUAL] ${label}: +${added} (${places.length} total)`);
  } catch (err) { console.log(`[SYNC-MANUAL] ${label} failed: ${err.message}`); }
}

async function _syncTextFirst(profile, org) {
  const places = [];
  const ids = new Set();
  const radius = profile.maxRadius || SYNC_MAX_RADIUS_M;
  const queries = [profile.textQuery, ...(profile.textQueryVariants || [])];
  console.log(`[SYNC-MANUAL] Strategy: Text Search first (profile=${profile.profileName})`);

  for (const q of queries) {
    await _syncDedupMerge(places, ids, () => googlePlaces.textSearch({ textQuery: q, lat: org.lat, lng: org.lng, radiusMeters: radius, maxResultCount: SYNC_MAX_RESULTS }), `Text Search "${q}"`);
    if (queries.length > 1) await new Promise((r) => setTimeout(r, 200));
  }
  let method = 'text';
  if (places.length < SYNC_MIN_FALLBACK) {
    method = places.length > 0 ? 'text+nearby_fallback' : 'nearby_fallback';
    await _syncDedupMerge(places, ids, () => googlePlaces.nearbySearch({ lat: org.lat, lng: org.lng, radiusMeters: SYNC_MAX_RADIUS_M, includedTypes: profile.includedTypes, maxResultCount: SYNC_MAX_RESULTS }), 'Nearby fallback');
  }
  return { places, method };
}

async function _syncNearbyFirst(profile, org) {
  let places = [];
  const radius = profile.maxRadius || SYNC_MAX_RADIUS_M;
  console.log(`[SYNC-MANUAL] Strategy: Nearby Search first (types: ${profile.includedTypes.join(', ')})`);

  try { places = await googlePlaces.nearbySearch({ lat: org.lat, lng: org.lng, radiusMeters: radius, includedTypes: profile.includedTypes, maxResultCount: SYNC_MAX_RESULTS }); }
  catch (err) { console.log(`[SYNC-MANUAL] Nearby Search failed: ${err.message}`); }

  let method = 'nearby';
  if (places.length < SYNC_MIN_FALLBACK && profile.textQuery) {
    method = places.length > 0 ? 'nearby+text_fallback' : 'text_fallback';
    const ids = new Set(places.map((p) => p.placeId));
    const queries = [profile.textQuery, ...(profile.textQueryVariants || [])];
    for (const q of queries) {
      await _syncDedupMerge(places, ids, () => googlePlaces.textSearch({ textQuery: q, lat: org.lat, lng: org.lng, radiusMeters: radius, maxResultCount: SYNC_MAX_RESULTS }), `Text Search "${q}"`);
      if (queries.length > 1) await new Promise((r) => setTimeout(r, 200));
    }
  }
  return { places, method };
}

function _syncPostFilter(places, profile) {
  if (profile.includedTypes.some((t) => SYNC_IRRELEVANT_TYPES.includes(t))) return places;
  const before = places.length;
  const out = places.filter((p) => !p.types || p.types.length === 0 || !p.types.some((t) => SYNC_IRRELEVANT_TYPES.includes(t)));
  if (before > out.length) console.log(`[SYNC-MANUAL] Post-filter: removed ${before - out.length} irrelevant places`);
  return out;
}

function _syncExcludeOwn(places, org) {
  return places.filter((p) => {
    if (org.googlePlaceId && p.placeId === org.googlePlaceId) return false;
    if (!org.googlePlaceId && p.lat && p.lng) {
      const dist = googlePlaces.haversineDistance(org.lat, org.lng, p.lat, p.lng);
      if (dist < 50 && org.name && p.name) {
        const norm = (s) => s.toLowerCase().replace(/[^a-zàâéèêëïîôùûüç\s]/g, '').trim();
        if (norm(p.name).includes(norm(org.name)) || norm(org.name).includes(norm(p.name))) return false;
      }
    }
    return true;
  });
}

async function runCompetitorSync(org) {
  const profile = placesProfiles.getSearchProfile(org.vertical, org.specialty);
  const profileName = profile.profileName;
  const periodKey = competitorRepo.getISOWeekKey();

  try { competitorRepo.clearSync(org.id, profileName, periodKey); }
  catch (err) { console.warn('[SYNC] clearSync failed:', err.message); }

  const hasSpecificType = profile.includedTypes.some((t) => SYNC_SPECIFIC_TYPES.includes(t));
  const { places: rawPlaces, method } = (!hasSpecificType && profile.textQuery)
    ? await _syncTextFirst(profile, org)
    : await _syncNearbyFirst(profile, org);

  const places = _syncExcludeOwn(_syncPostFilter(rawPlaces, profile), org);
  const maxR = profile.maxRadius || SYNC_MAX_RADIUS_M;
  const snapshots = places
    .map((place) => ({
      orgId: org.id, profile: profileName, runPeriodKey: periodKey,
      placeId: place.placeId, name: place.name, lat: place.lat, lng: place.lng,
      rating: place.rating, userRatingsTotal: place.userRatingsTotal,
      distanceM: googlePlaces.haversineDistance(org.lat, org.lng, place.lat, place.lng),
      types: place.types,
    }))
    .filter((s) => s.distanceM <= maxR)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, SYNC_MAX_COMPETITORS);

  competitorRepo.bulkUpsertSnapshots(snapshots);
  competitorRepo.logSync({ orgId: org.id, profile: profileName, runPeriodKey: periodKey, status: 'success', placesFound: places.length, placesStored: snapshots.length });

  return { places, method, snapshots, profileName };
}

function handleClientGetCompetitors(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  const org = auth.org;
  if (!org) {
    return sendJson(res, 404, { ok: false, error: 'Organisation non trouvée' });
  }

  // Parse optional radius filter (default 5000)
  const requestedRadius = parseInt(urlParams.get('radius') || '5000', 10);
  const maxRadius = [1000, 2000, 5000].includes(requestedRadius) ? requestedRadius : 5000;

  // Check if org has coordinates
  if (!org.lat || !org.lng) {
    return sendJson(res, 200, {
      ok: true,
      configured: false,
      message: 'Coordonnées GPS non configurées. Renseignez latitude/longitude dans les paramètres.',
      buckets: { 1000: [], 2000: [], 5000: [] },
      updatedAt: null,
      isEstimated30d: false,
      placesApiConfigured: googlePlaces.isConfigured(),
    });
  }

  // Derive profile from org vertical + specialty
  const searchProfile = placesProfiles.getSearchProfile(org.vertical, org.specialty);
  const profileName = searchProfile.profileName;

  // Build buckets from stored snapshots
  const result = competitorRepo.buildBuckets(org.id, profileName, maxRadius);

  // Compute aggregated stats per bucket
  const computeStats = (items) => {
    if (items.length === 0) return null;
    const avgRating = items.reduce((acc, c) => acc + (c.rating || 0), 0) / items.length;
    const avgReviews = items.reduce((acc, c) => acc + (c.userRatingsTotal || 0), 0) / items.length;
    return {
      avgRating: Math.round(avgRating * 10) / 10,
      avgReviews: Math.round(avgReviews),
      totalCompetitors: items.length,
    };
  };

  return sendJson(res, 200, {
    ok: true,
    configured: true,
    radius: maxRadius,
    updatedAt: result.updatedAt,
    isEstimated30d: result.isEstimated30d,
    placesApiConfigured: googlePlaces.isConfigured(),
    buckets: {
      1000: result.buckets[1000].map(formatCompetitorForApi),
      2000: result.buckets[2000].map(formatCompetitorForApi),
      5000: result.buckets[5000].map(formatCompetitorForApi),
    },
    stats: {
      1000: computeStats(result.buckets[1000]),
      2000: computeStats(result.buckets[2000]),
      5000: computeStats(result.buckets[5000]),
    },
  });
}

/**
 * GET /client/competitors/:placeId/details
 * Returns cached Place Details, fetching from Google if expired.
 */
async function handleClientGetCompetitorDetails(req, res, placeId) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  if (!placeId) {
    return sendJson(res, 400, { ok: false, error: 'placeId is required' });
  }

  try {
    // Check cache first (TTL 30 days)
    let details = competitorRepo.getCachedPlaceDetails(placeId, 30);

    if (!details) {
      // Fetch from Google Places API
      if (!googlePlaces.isConfigured()) {
        return sendJson(res, 503, {
          ok: false,
          error: 'Google Places API non configurée (GOOGLE_PLACES_API_KEY manquant)',
        });
      }

      const freshDetails = await googlePlaces.getPlaceDetails(placeId);
      competitorRepo.cachePlaceDetails(freshDetails);
      details = freshDetails;
    }

    return sendJson(res, 200, { ok: true, details });
  } catch (err) {
    console.error(`[COMPETITORS] Error fetching details for ${placeId}:`, err.message);
    return sendJson(res, 500, { ok: false, error: `Erreur récupération détails: ${err.message}` });
  }
}

/**
 * GET /client/places/autocomplete?input=<query>
 * Proxy for Google Places Autocomplete API (New).
 * Keeps GOOGLE_PLACES_API_KEY server-side only.
 */
async function handleClientPlacesAutocomplete(req, res, urlParams) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  const input = urlParams.get('input');
  if (!input || input.length < 2) {
    return sendJson(res, 400, { ok: false, error: 'Le paramètre "input" doit contenir au moins 2 caractères' });
  }

  if (!googlePlaces.isConfigured()) {
    return sendJson(res, 503, { ok: false, error: 'Google Places API non configurée' });
  }

  try {
    const suggestions = await googlePlaces.autocomplete({ input });
    return sendJson(res, 200, { ok: true, suggestions });
  } catch (err) {
    console.error('[PLACES] Autocomplete error:', err.message);
    return sendJson(res, 500, { ok: false, error: `Erreur autocomplete: ${err.message}` });
  }
}

/**
 * GET /client/places/:placeId/geometry
 * Get lat/lng + address from a Google Place ID.
 * Used after autocomplete selection.
 */
async function handleClientPlaceGeometry(req, res, placeId) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  if (!placeId) {
    return sendJson(res, 400, { ok: false, error: 'placeId is required' });
  }

  if (!googlePlaces.isConfigured()) {
    return sendJson(res, 503, { ok: false, error: 'Google Places API non configurée' });
  }

  try {
    const geo = await googlePlaces.getPlaceGeometry(placeId);
    return sendJson(res, 200, { ok: true, place: geo });
  } catch (err) {
    console.error(`[PLACES] Geometry error for ${placeId}:`, err.message);
    return sendJson(res, 500, { ok: false, error: `Erreur géométrie: ${err.message}` });
  }
}

/**
 * POST /client/competitors/configure
 * Set org lat/lng/specialty for competitor search.
 * Body: { lat, lng, specialty?, address?, googlePlaceId? }
 *
 * Security:
 * - RBAC: owner/admin only
 * - Validates lat ∈ [-90,90], lng ∈ [-180,180]
 * - Whitelist specialty against known profiles
 */
async function handleClientConfigureCompetitors(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  // RBAC: only owner/admin can configure competitor settings
  if (!checkRole(auth, ['owner', 'admin'], res)) return;

  const repos = storage.getRepos();
  if (!repos) {
    return sendJson(res, 500, { ok: false, error: 'Storage not available' });
  }

  const body = await parseBody(req);

  // Allow specialty-only update if lat/lng are already configured on the org
  const currentOrg = repos.org.getById(auth.org.id);
  const updates = {};

  if (body.lat !== undefined && body.lng !== undefined) {
    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return sendJson(res, 400, { ok: false, error: 'Coordonnées invalides (lat: -90 à 90, lng: -180 à 180)' });
    }
    updates.lat = lat;
    updates.lng = lng;
  } else if (!currentOrg?.lat || !currentOrg?.lng) {
    // lat/lng not provided and not already on org → error
    return sendJson(res, 400, { ok: false, error: 'lat and lng are required (org has no coordinates configured)' });
  }

  // Whitelist specialty against known profiles
  if (body.specialty !== undefined) {
    const validSpecialties = placesProfiles.getValidSpecialties();
    if (body.specialty !== null && body.specialty !== '' && !validSpecialties.includes(body.specialty)) {
      return sendJson(res, 400, {
        ok: false,
        error: `Spécialité invalide: "${body.specialty}". Valeurs acceptées: ${validSpecialties.join(', ')}`,
      });
    }
    updates.specialty = body.specialty || null;
  }

  // Optional: address and googlePlaceId from autocomplete selection
  if (body.address !== undefined) {
    updates.address = body.address || null;
  }
  if (body.googlePlaceId !== undefined) {
    updates.googlePlaceId = body.googlePlaceId || null;
  }

  const updatedOrg = repos.org.update(auth.org.id, updates);

  return sendJson(res, 200, {
    ok: true,
    message: 'Coordonnées mises à jour',
    org: {
      id: updatedOrg.id,
      lat: updatedOrg.lat,
      lng: updatedOrg.lng,
      specialty: updatedOrg.specialty,
      address: updatedOrg.address,
      googlePlaceId: updatedOrg.googlePlaceId,
    },
  });
}

/**
 * Format a competitor snapshot for the API response
 */
function formatCompetitorForApi(snap) {
  return {
    id: snap.id,
    placeId: snap.placeId,
    name: snap.name,
    // NOTE: address is NOT in snapshots — fetch via /client/competitors/:placeId/details
    rating: snap.rating,
    reviewsCount: snap.userRatingsTotal,
    estimated30d: snap.estimated30d ?? null,
    distanceM: snap.distanceM,
    distanceKm: Math.round((snap.distanceM / 1000) * 10) / 10,
    types: snap.types,
    source: 'google_places',
  };
}

/**
 * POST /client/competitors/sync
 * Manually trigger a competitor sync for the current org.
 * Calls Google Places API (nearbySearch + textSearch fallback)
 * and stores snapshots in the database.
 * RBAC: owner/admin only.
 */
async function handleClientSyncCompetitors(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  if (!checkRole(auth, ['owner', 'admin'], res)) return;

  const org = auth.org;
  if (!org || !org.lat || !org.lng) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Coordonnées GPS non configurées. Renseignez latitude/longitude dans les paramètres.',
    });
  }

  if (!googlePlaces.isConfigured()) {
    return sendJson(res, 503, {
      ok: false,
      error: 'Google Places API non configurée (GOOGLE_PLACES_API_KEY manquant)',
    });
  }

  try {
    const { places, method: searchMethod, snapshots, profileName } = await runCompetitorSync(org);

    return sendJson(res, 200, {
      ok: true,
      message: `Synchronisation terminée : ${snapshots.length} concurrents trouvés`,
      searchMethod,
      placesFound: places.length,
      placesStored: snapshots.length,
      profile: profileName,
    });

  } catch (err) {
    console.error('[SYNC-MANUAL] Error:', err.message);
    sentry.captureException(err, {
      route: '/client/competitors/sync',
      source: 'manual_sync',
      layer: 'api',
      status_code: '500',
    });
    return sendJson(res, 500, {
      ok: false,
      error: `Erreur lors de la synchronisation : ${err.message}`,
    });
  }
}

/**
 * POST /client/competitors/add
 * Manually add a competitor by Google Place ID.
 * Fetches place details from Google Places API and stores a snapshot.
 * RBAC: owner/admin only.
 * Body: { placeId: string, name?: string }
 */
async function handleClientAddCompetitor(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);

  if (!auth) {
    return sendJson(res, 401, {
      ok: false,
      errorCategory: 'SESSION_EXPIRED',
      errorCode: 'UNAUTHORIZED',
      message: 'Session expirée, veuillez vous reconnecter',
      action: 'LOGIN',
    });
  }

  if (!checkRole(auth, ['owner', 'admin'], res)) return;

  const org = auth.org;
  if (!org || !org.lat || !org.lng) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Coordonnées GPS non configurées.',
    });
  }

  if (!googlePlaces.isConfigured()) {
    return sendJson(res, 503, {
      ok: false,
      error: 'Google Places API non configurée (GOOGLE_PLACES_API_KEY manquant)',
    });
  }

  const body = await parseBody(req);
  if (!body || !body.placeId) {
    return sendJson(res, 400, {
      ok: false,
      error: 'placeId requis',
    });
  }

  try {
    // Fetch place details from Google to get lat/lng, rating, types, etc.
    const placeDetails = await googlePlaces.getPlaceDetails(body.placeId);

    if (!placeDetails || !placeDetails.lat || !placeDetails.lng) {
      return sendJson(res, 404, {
        ok: false,
        error: 'Lieu introuvable ou sans coordonnées',
      });
    }

    const profile = placesProfiles.getSearchProfile(org.vertical, org.specialty);
    const profileName = profile.profileName;
    const periodKey = competitorRepo.getISOWeekKey();

    const distanceM = googlePlaces.haversineDistance(org.lat, org.lng, placeDetails.lat, placeDetails.lng);

    // Build snapshot
    const snapshot = {
      orgId: org.id,
      profile: profileName,
      runPeriodKey: periodKey,
      placeId: body.placeId,
      name: placeDetails.name || body.name || 'Inconnu',
      lat: placeDetails.lat,
      lng: placeDetails.lng,
      rating: placeDetails.rating || null,
      userRatingsTotal: placeDetails.userRatingsTotal || 0,
      distanceM,
      types: placeDetails.types || [],
    };

    // Persist
    competitorRepo.upsertSnapshot(snapshot);

    // Also cache the details
    if (placeDetails) {
      try {
        competitorRepo.cachePlaceDetails(placeDetails);
      } catch (err) { console.warn('[SYNC] cachePlaceDetails failed:', err.message); }
    }

    const distanceKm = Math.round((distanceM / 1000) * 10) / 10;

    return sendJson(res, 200, {
      ok: true,
      message: `"${snapshot.name}" ajouté comme concurrent (${distanceKm} km)`,
      competitor: {
        id: `${snapshot.placeId}_${periodKey}`,
        placeId: snapshot.placeId,
        name: snapshot.name,
        rating: snapshot.rating,
        reviewsCount: snapshot.userRatingsTotal,
        distanceM,
        distanceKm,
        types: snapshot.types,
        source: 'manual',
      },
    });

  } catch (err) {
    console.error('[ADD-COMPETITOR] Error:', err.message);
    sentry.captureException(err, {
      route: '/client/competitors/add',
      source: 'manual_add',
      layer: 'api',
      status_code: '500',
    });
    return sendJson(res, 500, {
      ok: false,
      error: `Erreur lors de l'ajout : ${err.message}`,
    });
  }
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
    health_argent: 'Pack Argent (49€ HT)',
    health_or: 'Pack Platinum (99€ HT)',
    health_gold: 'Pack Platinum (99€ HT)',
    health_platinum: 'Pack Platinum (99€ HT)',
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
  // RBAC Tier 1: billing write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
  
  // Zod validation (PR-5) — validates planId ∈ {argent, or, platinum} + provider
  const v = validateBody(schemas.billingCheckout, body);
  if (!v.ok) return sendJson(res, 400, v.payload);
  const { planId, provider, billingDetails } = v.data;
  
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
  // RBAC Tier 1: billing write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
  // RBAC Tier 1: billing write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
 * GET /client/billing/invoices - List invoices for the authenticated org
 * Returns Stripe invoices with PDF download URLs
 */
async function handleBillingInvoices(req, res) {
  const data = loadData();
  const auth = getAuthUser(req, data);
  
  if (!auth || !auth.user) {
    return sendJson(res, 401, { 
      error: 'Non authentifié',
      errorCategory: 'AUTH_REQUIRED',
      action: 'LOGIN'
    });
  }
  // RBAC: owner/admin can view invoices
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
  const org = auth.org;
  if (!org) {
    return sendJson(res, 404, { 
      error: 'Organisation non trouvée',
      errorCategory: 'ORG_NOT_FOUND'
    });
  }
  
  const customerId = org.billing?.stripeCustomerId;
  
  if (!customerId) {
    // No Stripe customer yet = no invoices, return empty list (not an error)
    return sendJson(res, 200, { invoices: [] });
  }
  
  const result = await stripeBilling.listInvoices(customerId);
  
  if (result.error) {
    return sendJson(res, 500, result.error);
  }
  
  return sendJson(res, 200, { invoices: result.invoices });
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
  // RBAC Tier 1: billing write — owner/admin only
  if (!checkRole(auth, ['owner', 'admin'], res)) return;
  
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
    sentry.captureException(processResult.error, {
      route: '/webhooks/stripe',
      provider: 'stripe',
      status_code: '500',
      eventId: event.id,
      eventType: event.type,
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
      // V2: Conserver les usages déjà consommés lors d'un changement de plan
      smsUsedThisPeriod: org.subscriptionCredits?.smsUsedThisPeriod || 0,
      emailUsedThisPeriod: org.subscriptionCredits?.emailUsedThisPeriod || 0,
      aiUsedThisPeriod: org.subscriptionCredits?.aiUsedThisPeriod || 0,
      qrUsedThisPeriod: org.subscriptionCredits?.qrUsedThisPeriod || 0,
      nfcUsedThisPeriod: org.subscriptionCredits?.nfcUsedThisPeriod || 0,
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
    
    // Audit log: plan assigned by admin
    writeAudit({ orgId, actorUserId: auth.user?.id || null, action: 'billing.plan_assigned', targetType: 'org', targetId: orgId, meta: { planCode, priceCents: plan.priceCents }, req });
    
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

// ============ ROUTE HANDLERS (extracted for cognitive complexity) ============

const _API_ROUTES = [
  ['POST', '/api/send-review-request', (req, res) => { if (!applyAuthRateLimit(req, res, 'send_review', 10)) handleSendReview(req, res); }],
  ['GET',  '/api/feedbacks', handleGetFeedbacks],
  ['GET',  '/api/requests', handleGetRequests],
  ['GET',  '/api/settings', handleGetSettings],
  ['POST', '/api/settings', handleSaveSettings],
  ['GET',  '/api/settings/review-routing', handleGetReviewRouting],
  ['PUT',  '/api/settings/review-routing', handleSaveReviewRouting],
];

function routeApiLegacy(method, url, req, res) {
  const match = _API_ROUTES.find(([v, p]) => v === method && p === url);
  if (match) { match[2](req, res); return true; }
  return false;
}

const _AUTH_RATE_LIMITED = new Set(['/auth/verify', '/auth/resend-code', '/auth/login', '/auth/select-org', '/auth/accept-invite']);
const _AUTH_ROUTES = [
  ['POST', '/auth/signup', handleSignup],
  ['POST', '/auth/verify', handleVerifyEmail],
  ['POST', '/auth/resend-code', handleResendCode],
  ['POST', '/auth/login', handleLogin],
  ['POST', '/auth/select-org', handleAuthSelectOrg],
  ['POST', '/auth/accept-invite', handleAuthAcceptInvite],
  ['POST', '/auth/logout', handleLogout],
  ['GET',  '/me', handleGetMe],
];

function routeAuth(method, url, req, res) {
  const match = _AUTH_ROUTES.find(([v, p]) => v === method && p === url);
  if (!match) return false;
  if (_AUTH_RATE_LIMITED.has(url) && applyAuthRateLimit(req, res, url)) return true;
  match[2](req, res);
  return true;
}

function handleOAuthCallbackPage(req, res, url) {
  const cbParams = new URLSearchParams(url.split('?')[1] || '');
  const code = cbParams.get('code') || '';
  const state = cbParams.get('state') || '';
  const error = cbParams.get('error') || '';
  const adminUrl = process.env.ADMIN_URL || process.env.REPUTY_DOMAIN || 'http://localhost:3002';
  const adminOrigin = (() => {
    try { return new URL(adminUrl).origin; } catch (e) { return adminUrl; }
  })();
  
  const html = `<!DOCTYPE html>
<html><head><title>Connexion Google - Reputy</title></head>
<body>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;">
  ${error ? 'Erreur de connexion Google. Vous pouvez fermer cette fenêtre.' : 'Connexion réussie ! Fermeture automatique...'}
</p>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage({
        type: 'GOOGLE_OAUTH_CALLBACK',
        code: ${JSON.stringify(code)},
        state: ${JSON.stringify(state)},
        error: ${JSON.stringify(error)}
      }, ${JSON.stringify(adminOrigin)});
      setTimeout(function() { window.close(); }, 1500);
    } else {
      window.location.href = ${JSON.stringify(adminUrl)} + '/settings?google_code=' + encodeURIComponent(${JSON.stringify(code)}) + '&google_state=' + encodeURIComponent(${JSON.stringify(state)});
    }
  } catch(e) {
    document.body.innerHTML = '<p style="font-family:sans-serif;text-align:center;margin-top:40px;">Connexion terminée. Retournez dans Reputy.</p>';
  }
</script>
</body></html>`;
  
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

const _CLIENT_CORE_ROUTES = [
  ['GET',  '/client/memberships', (r, s, u) => handleClientGetMemberships(r, s)],
  ['POST', '/client/orgs/switch', (r, s) => handleClientSwitchOrg(r, s)],
  ['POST', '/client/orgs', (r, s) => handleClientCreateOrg(r, s)],
  ['GET',  '/client/api-token', (r, s) => handleClientGetApiToken(r, s)],
  ['POST', '/client/api-token/rotate', (r, s) => handleClientRotateApiToken(r, s)],
  ['GET',  '/client/team', (r, s, u) => handleClientGetTeam(r, s, u)],
  ['POST', '/client/team/invite', (r, s) => handleClientTeamInvite(r, s)],
  ['GET',  '/client/org', (r, s) => handleClientGetOrg(r, s)],
  ['GET',  '/client/usage', (r, s, u) => handleClientGetUsage(r, s, u)],
  ['GET',  '/client/settings', (r, s) => handleClientGetSettings(r, s)],
  ['GET',  '/client/lifecycle-stats', (r, s, u) => handleClientLifecycleStats(r, s, u)],
  ['POST', '/client/ai/suggest-reply', (r, s) => handleAiSuggestReply(r, s)],
];
const _CLIENT_CORE_PATTERNS = [
  [/^\/client\/orgs\/([a-f0-9]+)$/, 'DELETE', (r, s, m) => handleClientDeleteOrg(r, s, m[1])],
  [/^\/client\/team\/([a-zA-Z0-9_-]+)$/, 'PUT', (r, s, m) => handleClientTeamUpdateRole(r, s, m[1])],
  [/^\/client\/team\/([a-zA-Z0-9_-]+)$/, 'DELETE', (r, s, m) => handleClientTeamRevoke(r, s, m[1])],
];

function routeClientCore(method, pathname, req, res, urlParams) {
  const exact = _CLIENT_CORE_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res, urlParams); return true; }
  for (const [re, verb, handler] of _CLIENT_CORE_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { handler(req, res, m); return true; }
  }
  return false;
}

const _INSTALL_ROUTES = [
  ['GET',  '/client/installations', (r, s) => handleClientListInstallations(r, s)],
  ['POST', '/client/installations', (r, s) => handleClientCreateInstallation(r, s)],
];
const _INSTALL_PATTERNS = [
  [/^\/client\/installations\/([a-zA-Z0-9_-]+)\/revoke$/, 'POST', (r, s, m) => handleClientRevokeInstallation(r, s, m[1])],
  [/^\/client\/installations\/([a-zA-Z0-9_-]+)\/rotate$/, 'POST', (r, s, m) => handleClientRotateInstallation(r, s, m[1])],
];

function routeClientInstallations(method, pathname, req, res) {
  const exact = _INSTALL_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res); return true; }
  for (const [re, verb, handler] of _INSTALL_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { handler(req, res, m); return true; }
  }
  return false;
}

const _SHORTLINK_ROUTES = [
  ['GET',  '/client/shortlinks', (r, s) => handleClientListShortlinks(r, s)],
  ['POST', '/client/shortlinks', (r, s) => handleClientCreateShortlink(r, s)],
];
const _SHORTLINK_PATTERNS = [
  [/^\/client\/shortlinks\/([a-zA-Z0-9]+)\/qr$/, 'GET', (r, s, m) => handleClientGetShortlinkQR(r, s, m[1])],
  [/^\/client\/shortlinks\/([a-zA-Z0-9]+)$/, 'DELETE', (r, s, m) => handleClientDeleteShortlink(r, s, m[1])],
];

function routeClientShortlinks(method, pathname, req, res) {
  const exact = _SHORTLINK_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res); return true; }
  for (const [re, verb, handler] of _SHORTLINK_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { handler(req, res, m); return true; }
  }
  return false;
}

const _CONTACT_ROUTES = [
  ['GET',  '/client/contacts', (r, s, u) => handleClientGetContacts(r, s, u)],
  ['POST', '/client/contacts', (r, s) => handleClientCreateContact(r, s)],
  ['POST', '/client/contacts/import', (r, s) => handleClientImportContacts(r, s)],
  ['POST', '/client/contacts/sync', (r, s) => handleClientSyncContacts(r, s)],
];
const _CONTACT_PATTERNS = [
  [/^\/client\/contacts\/([a-zA-Z0-9]+)$/, 'DELETE', (r, s, m) => handleClientDeleteContact(r, s, m[1])],
];

function routeClientContacts(method, pathname, req, res, urlParams) {
  const exact = _CONTACT_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res, urlParams); return true; }
  for (const [re, verb, handler] of _CONTACT_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { handler(req, res, m); return true; }
  }
  return false;
}

const _CAMPAIGN_ROUTES = [
  ['GET',  '/client/campaigns', (r, s, u) => handleClientGetCampaigns(r, s, u)],
  ['POST', '/client/campaigns', (r, s) => handleClientCreateCampaign(r, s)],
];
const _CAMPAIGN_PATTERNS = [
  [/^\/client\/campaigns\/([a-zA-Z0-9]+)$/, 'GET', (r, s, m) => handleClientGetCampaign(r, s, m[1])],
  [/^\/client\/campaigns\/([a-zA-Z0-9]+)$/, 'PUT', (r, s, m) => handleClientUpdateCampaign(r, s, m[1])],
  [/^\/client\/campaigns\/([a-zA-Z0-9]+)$/, 'DELETE', (r, s, m) => handleClientDeleteCampaign(r, s, m[1])],
  [/^\/client\/campaigns\/([a-zA-Z0-9]+)\/recipients$/, 'POST', (r, s, m) => handleClientAddCampaignRecipients(r, s, m[1])],
  [/^\/client\/campaigns\/([a-zA-Z0-9]+)\/send$/, 'POST', (r, s, m) => handleClientSendCampaign(r, s, m[1])],
];

function routeClientCampaigns(method, pathname, req, res, urlParams) {
  const exact = _CAMPAIGN_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res, urlParams); return true; }
  for (const [re, verb, handler] of _CAMPAIGN_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { handler(req, res, m); return true; }
  }
  return false;
}

const _GOOGLE_ROUTES = [
  ['GET',  '/client/google/status', (r, s) => handleGoogleStatus(r, s)],
  ['GET',  '/client/google/auth-url', (r, s) => handleGoogleAuthUrl(r, s)],
  ['POST', '/client/google/callback', (r, s) => handleGoogleCallback(r, s)],
  ['GET',  '/client/google/accounts', (r, s) => handleGoogleListAccounts(r, s)],
  ['POST', '/client/google/select-location', (r, s) => handleGoogleSelectLocation(r, s)],
  ['POST', '/client/google/sync', (r, s) => handleGoogleSync(r, s)],
  ['POST', '/client/google/disconnect', (r, s) => handleGoogleDisconnect(r, s)],
  ['GET',  '/client/google/sync-log', (r, s, u) => handleGoogleSyncLog(r, s, u)],
  ['GET',  '/client/google/my-place', (r, s) => handleGoogleMyPlace(r, s)],
];
const _GOOGLE_PATTERNS = [
  [/^\/client\/google\/post-reply\/([a-zA-Z0-9_-]+)$/, 'POST', (r, s, m) => handleGooglePostReply(r, s, m[1])],
];

async function routeClientGoogle(method, pathname, req, res, urlParams) {
  const exact = _GOOGLE_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { await Promise.resolve(exact[2](req, res, urlParams)); return true; }
  for (const [re, verb, handler] of _GOOGLE_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { await Promise.resolve(handler(req, res, m)); return true; }
  }
  return false;
}

const _COMPETITOR_ROUTES = [
  ['GET',  '/client/competitors', (r, s, u) => handleClientGetCompetitors(r, s, u)],
  ['POST', '/client/competitors/configure', (r, s) => handleClientConfigureCompetitors(r, s)],
  ['POST', '/client/competitors/sync', (r, s) => handleClientSyncCompetitors(r, s)],
  ['POST', '/client/competitors/add', (r, s) => handleClientAddCompetitor(r, s)],
  ['GET',  '/client/places/autocomplete', (r, s, u) => handleClientPlacesAutocomplete(r, s, u)],
];
const _COMPETITOR_PATTERNS = [
  [/^\/client\/competitors\/([a-zA-Z0-9_-]+)\/details$/, 'GET', (r, s, m) => handleClientGetCompetitorDetails(r, s, m[1])],
  [/^\/client\/places\/([a-zA-Z0-9_-]+)\/geometry$/, 'GET', (r, s, m) => handleClientPlaceGeometry(r, s, m[1])],
];

async function routeClientCompetitors(method, pathname, req, res, urlParams) {
  const exact = _COMPETITOR_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { await Promise.resolve(exact[2](req, res, urlParams)); return true; }
  for (const [re, verb, handler] of _COMPETITOR_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { await Promise.resolve(handler(req, res, m)); return true; }
  }
  return false;
}

const _REVIEW_ROUTES = [
  ['GET',  '/client/reviews', (r, s, u) => handleClientListReviews(r, s, u)],
  ['GET',  '/client/reviews/stats', (r, s, u) => handleClientReviewStats(r, s, u)],
  ['GET',  '/client/reviews/analytics', (r, s, u) => handleClientReviewAnalytics(r, s, u)],
  ['POST', '/client/reviews', (r, s) => handleClientCreateReview(r, s)],
  ['POST', '/client/reviews/bulk', (r, s) => handleClientBulkImportReviews(r, s)],
];
const _REVIEW_PATTERNS = [
  [/^\/client\/reviews\/([a-zA-Z0-9_-]+)$/, 'GET', (r, s, m) => handleClientGetReview(r, s, m[1])],
  [/^\/client\/reviews\/([a-zA-Z0-9_-]+)\/reply$/, 'POST', (r, s, m) => handleClientReplyReview(r, s, m[1])],
  [/^\/client\/reviews\/([a-zA-Z0-9_-]+)\/status$/, 'POST', (r, s, m) => handleClientUpdateReviewStatus(r, s, m[1])],
];

function routeClientReviews(method, pathname, req, res, urlParams) {
  const exact = _REVIEW_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res, urlParams); return true; }
  for (const [re, verb, handler] of _REVIEW_PATTERNS) {
    const m = pathname.match(re);
    if (m && method === verb) { handler(req, res, m); return true; }
  }
  return false;
}

const _BILLING_ROUTES = [
  ['GET',  '/client/billing/status', handleBillingStatus],
  ['GET',  '/client/billing/invoices', handleBillingInvoices],
  ['POST', '/client/billing/checkout', handleBillingCheckout],
  ['POST', '/client/billing/portal', handleBillingPortal],
  ['POST', '/client/billing/pack/checkout', handlePackCheckout],
  ['POST', '/client/billing/pack/multi-checkout', handleMultiPackCheckout],
  ['POST', '/client/billing/sepa', (r, s) => { r._forceProvider = 'gocardless'; handleBillingCheckout(r, s); }],
];

function routeClientBilling(method, pathname, req, res) {
  const match = _BILLING_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (match) { match[2](req, res); return true; }
  return false;
}

const _CLIENT_SUB_ROUTERS = [
  ['/client/installations', (m, p, req, res, u) => routeClientInstallations(m, p, req, res)],
  ['/client/shortlinks', (m, p, req, res, u) => routeClientShortlinks(m, p, req, res)],
  ['/client/contacts', routeClientContacts],
  ['/client/campaigns', routeClientCampaigns],
  ['/client/google', routeClientGoogle],
  ['/client/competitors', routeClientCompetitors],
  ['/client/places', routeClientCompetitors],
  ['/client/reviews', routeClientReviews],
  ['/client/billing', (m, p, req, res, u) => routeClientBilling(m, p, req, res)],
];

async function routeClient(method, pathname, req, res, urlParams) {
  if (routeClientCore(method, pathname, req, res, urlParams)) return true;
  for (const [prefix, router] of _CLIENT_SUB_ROUTERS) {
    if (pathname.startsWith(prefix) && await router(method, pathname, req, res, urlParams)) return true;
  }
  return false;
}

const _ADMIN_ROUTES = [
  ['GET',  '/internal/admin/health', (r, s) => handleAdminHealth(r, s)],
  ['GET',  '/internal/admin/metrics', (r, s, u) => handleAdminMetrics(r, s, u)],
  ['GET',  '/internal/admin/feedbacks', (r, s) => handleAdminGetFeedbacks(r, s)],
  ['GET',  '/internal/admin/legacy-auth-stats', (r, s) => handleLegacyAuthStats(r, s)],
  ['GET',  '/internal/admin/at-risk-orgs', (r, s) => handleAdminAtRiskOrgs(r, s)],
  ['GET',  '/internal/admin/mrr-history', (r, s, u) => handleAdminMrrHistory(r, s, u)],
  ['GET',  '/api/email/admin/health', (r, s, u) => handleEmailAdminHealth(r, s, u)],
  ['GET',  '/api/email/admin/alerts', (r, s, u) => handleEmailAdminAlerts(r, s, u)],
  ['GET',  '/api/email/admin/org-stats', (r, s, u) => handleEmailAdminOrgStats(r, s, u)],
  ['POST', '/api/email/admin/pause', (r, s) => handleEmailAdminPause(r, s)],
  ['GET',  '/api/email/admin/pause-state', (r, s, u) => handleEmailAdminPauseState(r, s, u)],
  ['POST', '/api/email/admin/force-warm', (r, s) => handleEmailAdminForceWarm(r, s)],
  ['GET',  '/api/email/admin/top-risk-csv', (r, s, u) => handleEmailAdminTopRiskCsv(r, s, u)],
  ['GET',  '/internal/packs', (r, s) => handleGetPacks(r, s)],
  ['GET',  '/internal/orgs', (r, s, u) => handleListOrgs(r, s, u)],
  ['POST', '/internal/orgs', (r, s) => handleCreateOrg(r, s)],
];

const _ADMIN_ORG_ACTIONS = new Map([
  ['credits', handleAddCredits],
  ['status', handleChangeStatus],
  ['simulate-usage', handleSimulateUsage],
  ['reset-public-key', handleResetPublicKey],
  ['rotate-api-token', handleRotateApiToken],
  ['assign-plan', handleAssignPlan],
  ['apply-coupon', handleApplyCoupon],
  ['remove-coupon', handleRemoveCoupon],
]);

const _ADMIN_ORG_GET_PATTERNS = [
  [/^\/internal\/orgs\/([a-f0-9]+)\/effective-billing$/, (r, s, m, u) => handleGetEffectiveBilling(r, s, m[1])],
  [/^\/internal\/orgs\/([a-f0-9]+)\/usage$/, (r, s, m, u) => handleGetOrgUsage(r, s, m[1], u)],
  [/^\/internal\/orgs\/([a-f0-9]+)\/telemetry$/, (r, s, m, u) => handleGetOrgTelemetry(r, s, m[1], u)],
  [/^\/internal\/orgs\/([a-f0-9]+)\/api-token$/, (r, s, m) => handleGetApiToken(r, s, m[1])],
];

const _ADMIN_ORG_VERBS = new Map([['GET', handleGetOrg], ['PUT', handleUpdateOrg]]);

function _routeAdminOrgById(method, pathname, req, res, urlParams) {
  const orgMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)$/);
  if (!orgMatch) return false;
  const handler = _ADMIN_ORG_VERBS.get(method);
  if (!handler) return false;
  handler(req, res, orgMatch[1], urlParams);
  return true;
}

function routeInternalAdmin(method, pathname, req, res, urlParams) {
  const exact = _ADMIN_ROUTES.find(([v, p]) => v === method && p === pathname);
  if (exact) { exact[2](req, res, urlParams); return true; }
  if (_routeAdminOrgById(method, pathname, req, res, urlParams)) return true;

  const actionMatch = pathname.match(/^\/internal\/orgs\/([a-f0-9]+)\/([a-z-]+)$/);
  if (actionMatch && method === 'POST') {
    const handler = _ADMIN_ORG_ACTIONS.get(actionMatch[2]);
    if (handler) { handler(req, res, actionMatch[1]); return true; }
  }

  if (method !== 'GET') return false;
  for (const [re, handler] of _ADMIN_ORG_GET_PATTERNS) {
    const m = pathname.match(re);
    if (m) { handler(req, res, m, urlParams); return true; }
  }
  return false;
}

// ============ SERVER ============

function _routePublicAndWebhooks(method, pathname, req, res) {
  if (method === 'POST' && pathname === '/webhooks/stripe') { handleStripeWebhook(req, res); return true; }
  if (method === 'POST' && pathname === '/webhooks/gocardless') { handleGoCardlessWebhook(req, res); return true; }
  const publicOrgMatch = pathname.match(/^\/public\/org\/by-key\/([a-zA-Z0-9_]+)$/);
  if (publicOrgMatch && method === 'GET') { handleGetOrgByPublicKey(req, res, publicOrgMatch[1]); return true; }
  if (method === 'POST' && pathname === '/telemetry/extension') { handleExtensionTelemetry(req, res); return true; }
  return false;
}

function _routeShortlinkOrRating(method, pathname, req, res, urlParams) {
  if (pathname === '/r/review' && method === 'GET') {
    if (!applyAuthRateLimit(req, res, 'rating_page', 30)) handleEmailReviewLink(req, res, urlParams);
    return true;
  }
  if (pathname === '/r/unsubscribe' && (method === 'GET' || method === 'POST')) {
    handleEmailUnsubscribe(req, res, urlParams); return true;
  }

  const codeMatch = pathname.match(/^\/r\/([a-zA-Z0-9]+)$/);
  if (codeMatch && method === 'GET') {
    return _resolveShortlinkOrRatingGET(codeMatch[1], req, res);
  }

  const redirectMatch = pathname.match(/^\/r\/([a-f0-9]+)\/redirected$/);
  if (redirectMatch && method === 'POST') { handleTrackRedirect(redirectMatch[1], res); return true; }

  const hexMatch = pathname.match(/^\/r\/([a-f0-9]+)$/);
  if (hexMatch && method === 'POST') {
    if (!applyAuthRateLimit(req, res, 'rating_submit', 5)) handleSubmitFeedback(hexMatch[1], req, res);
    return true;
  }
  return false;
}

function _resolveShortlinkOrRatingGET(code, req, res) {
  if (/[g-zG-Z]/.test(code)) { handleShortlinkRedirect(req, res, code); return true; }
  const repos = storage.getRepos();
  if (repos) {
    const shortlink = repos.shortlink.getByCode(code);
    if (shortlink) { handleShortlinkRedirect(req, res, code); return true; }
  }
  if (/^[a-f0-9]+$/.test(code)) {
    if (!applyAuthRateLimit(req, res, 'rating_page', 30)) handleGetRatingPage(code, res);
    return true;
  }
  return false;
}

function isAuthRoute(url) {
  return url.startsWith('/auth/') || url === '/me';
}

function handleServerError(res, err, req, pathname) {
  const safeRoute = String(pathname || (req.url || '').split('?')[0] || 'unknown');
  console.error('[REPUTY][ERROR] Unhandled error in request handler:', err?.message, err?.stack);
  sentry.captureException(err, { route: safeRoute, status_code: '500', source: 'global_catch', method: req.method, layer: 'api' });
  try {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' }));
    }
  } catch (innerErr) { console.debug('[HTTP] Error response failed (already sent?):', innerErr.message); }
}

async function handleIncomingRequest(req, res) {
  const { method, url } = req;
  applySecurityHeaders(res);
  const corsResult = applyCors(req, res);
  if (corsResult === 'blocked' || corsResult === 'preflight') return { done: true };

  if (method === 'GET' && url === '/health') { handleHealth(res); return { done: true }; }
  if (method === 'GET' && url.startsWith('/google/oauth/callback')) { handleOAuthCallbackPage(req, res, url); return { done: true }; }
  if (url.startsWith('/api/') && routeApiLegacy(method, url, req, res)) return { done: true };
  if (isAuthRoute(url) && routeAuth(method, url, req, res)) return { done: true };

  const urlParts = url.split('?');
  const pathname = urlParts[0];
  const urlParams = new URLSearchParams(urlParts[1] || '');

  if (pathname.startsWith('/client/') && await routeClient(method, pathname, req, res, urlParams)) return { done: true, pathname };
  if (_routePublicAndWebhooks(method, pathname, req, res)) return { done: true, pathname };
  if (routeInternalAdmin(method, pathname, req, res, urlParams)) return { done: true, pathname };
  if (pathname.startsWith('/r/') && _routeShortlinkOrRating(method, pathname, req, res, urlParams)) return { done: true, pathname };

  return { done: false, pathname };
}

const server = http.createServer(async (req, res) => {
  try {
    const result = await handleIncomingRequest(req, res);
    if (!result.done) sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    handleServerError(res, err, req, req.url);
  }
});

// ============ SERVER STARTUP ============
try {
  // P0.1: Validate secrets before starting
  validateProductionSecrets();
  
  // Auto-initialize schema + apply pending SQL migrations (lib/migrations/*.sql)
  if (storage.USE_SQLITE) {
    const db = require('./lib/db');
    if (!db.isInitialized()) {
      console.log('[REPUTY][STARTUP] Fresh database detected — initializing schema…');
      db.initSchema();
    }
    db.runPendingMigrations();
  }
  
  server.listen(PORT, () => {
    const settings = getSettings();
    console.log(`[REPUTY][API] Serveur démarré sur http://localhost:${PORT} (version ${VERSION})`);
    console.log(`[REPUTY][API] Environment: ${NODE_ENV}`);
    console.log(`[REPUTY][API] Storage: ${storage.USE_SQLITE ? 'SQLite (reputy.db)' : 'data.json (legacy)'}`);
    console.log(`[REPUTY][API] Page de notation: ${REVIEWS_BASE_URL}/r/{id}`);
    console.log(`[REPUTY][API] Cabinet: ${settings.cabinetName}`);
    console.log(`[REPUTY][API] Google Review: ${settings.googleReviewUrl}`);
    if (MESSAGING_DISABLED) {
      console.warn(`[REPUTY][API] ⚠️  MESSAGING_DISABLED=true — all SMS/email sends are BLOCKED (kill switch active)`);
    }
  });
} catch (error) {
  console.error('[REPUTY][FATAL] Server startup failed:', error.message);
  process.exit(1);
}
