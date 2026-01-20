// Backend Reputy - Extension Chrome Doctolib
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
const { randomBytes, createHash, createHmac } = require('crypto');
const bcrypt = require('bcryptjs');

// P1.4: Structured logging
const logger = require('./lib/logger');

// ============ ENVIRONMENT ============
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

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
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN || DEV_FALLBACKS.INTERNAL_ADMIN_TOKEN;
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || DEV_FALLBACKS.ADMIN_COOKIE_SECRET;
const REVIEWS_BASE_URL = process.env.REVIEWS_BASE_URL || `http://127.0.0.1:${PORT}`;
const VERSION = '0.6.3'; // P1.4: Structured logging

// P1.4: Set version in logger
logger.setVersion(VERSION);

// ============ AUTH CONFIG ============
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACKS.JWT_SECRET;
const SESSION_EXPIRY_DAYS = 7;
const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const BCRYPT_ROUNDS = 10;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001,http://localhost:3000,http://127.0.0.1:3001').split(',');

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
const PLAN_DEFAULTS = {
  health_basic: { smsIncluded: 50, emailIncluded: 50, aiIncluded: 20 },
  health_pro: { smsIncluded: 200, emailIncluded: 200, aiIncluded: 100 },
  food_basic: { smsIncluded: 100, emailIncluded: 100, aiIncluded: 30 },
  food_pro: { smsIncluded: 300, emailIncluded: 300, aiIncluded: 150 },
  business_basic: { smsIncluded: 30, emailIncluded: 200, aiIncluded: 20 },
  business_pro: { smsIncluded: 100, emailIncluded: 500 },
};

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
  
  // Calculate prorata ratio
  const ratio = calculateProrataRatio(periodStart, periodEnd);
  const isProrata = ratio < 1;
  
  // Apply prorata to included credits
  const smsIncludedThisPeriod = isProrata ? Math.round(smsMonthlyBase * ratio) : smsMonthlyBase;
  const emailIncludedThisPeriod = isProrata ? Math.round(emailMonthlyBase * ratio) : emailMonthlyBase;
  const aiIncludedThisPeriod = isProrata ? Math.round(aiMonthlyBase * ratio) : aiMonthlyBase;
  
  if (isProrata) {
    console.log(`[BILLING] 📊 Prorata applied: ratio=${(ratio * 100).toFixed(1)}%, SMS: ${smsMonthlyBase} → ${smsIncludedThisPeriod}, Email: ${emailMonthlyBase} → ${emailIncludedThisPeriod}, AI: ${aiMonthlyBase} → ${aiIncludedThisPeriod}`);
  }
  
  return {
    // Base monthly values (for reference)
    smsMonthlyBase,
    emailMonthlyBase,
    aiMonthlyBase,
    // Prorated values for this period
    smsIncludedMonthly: smsIncludedThisPeriod,
    emailIncludedMonthly: emailIncludedThisPeriod,
    aiIncludedMonthly: aiIncludedThisPeriod,
    // Gift credits (always 0 at init, added via backoffice)
    smsGiftMonthly: 0,
    emailGiftMonthly: 0,
    aiGiftMonthly: 0,
    // Usage tracking
    smsUsedThisPeriod: 0,
    emailUsedThisPeriod: 0,
    aiUsedThisPeriod: 0,
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
    aiRemaining: 0
  };
}

/**
 * Ensure org has proper billing structure (migration douce)
 */
function ensureOrgBilling(org) {
  const startedAt = org.billing?.startedAt || org.createdAt || nowISO();
  const period = computePeriod(new Date(), startedAt);
  
  org.billing = {
    provider: org.billing?.provider || 'none',
    stripeCustomerId: org.billing?.stripeCustomerId || null,
    gocardlessMandateId: org.billing?.gocardlessMandateId || null,
    startedAt,
    status: org.billing?.status || org.status || 'active',
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    anchor: 'calendar_month'
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
  return {
    sms: Math.max(0, smsTotal - (sub.smsUsedThisPeriod || 0)),
    email: Math.max(0, emailTotal - (sub.emailUsedThisPeriod || 0)),
    ai: Math.max(0, aiTotal - (sub.aiUsedThisPeriod || 0)),
    smsTotal,
    emailTotal,
    aiTotal,
    smsUsed: sub.smsUsedThisPeriod || 0,
    emailUsed: sub.emailUsedThisPeriod || 0,
    aiUsed: sub.aiUsedThisPeriod || 0
  };
}

/**
 * Get remaining pack credits for an org
 */
function getPackRemaining(org) {
  return {
    sms: org.packWallet?.smsRemaining || 0,
    email: org.packWallet?.emailRemaining || 0,
    ai: org.packWallet?.aiRemaining || 0
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
    }
    return { success: true, debitedFrom: 'pack' };
  }
  
  // No credits remaining
  const total = getTotalRemaining(org);
  return { 
    success: false, 
    reason: 'QUOTA_EXCEEDED',
    smsRemaining: total.sms,
    emailRemaining: total.email,
    aiRemaining: total.ai,
    subscriptionRemaining: { sms: sub.sms, email: sub.email, ai: sub.ai },
    packRemaining: { sms: pack.sms, email: pack.email, ai: pack.ai },
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
  
  // Prorata info from subscriptionCredits
  const isProrata = org.subscriptionCredits?.isProrata || false;
  const ratio = org.subscriptionCredits?.ratio || 1;
  const smsMonthlyBase = org.subscriptionCredits?.smsMonthlyBase || org.quotas?.smsIncluded || 0;
  const emailMonthlyBase = org.subscriptionCredits?.emailMonthlyBase || org.quotas?.emailIncluded || 0;
  const aiMonthlyBase = org.subscriptionCredits?.aiMonthlyBase || org.quotas?.aiIncluded || 0;
  
  // Build credits computed with NEW structure
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
      // Base monthly values (before prorata)
      smsMonthlyBase,
      emailMonthlyBase,
      aiMonthlyBase,
      // Prorated included values for this period
      smsIncludedMonthly: org.subscriptionCredits?.smsIncludedMonthly || 0,
      emailIncludedMonthly: org.subscriptionCredits?.emailIncludedMonthly || 0,
      aiIncludedMonthly: org.subscriptionCredits?.aiIncludedMonthly || 0,
      // Gift credits
      smsGiftMonthly: org.subscriptionCredits?.smsGiftMonthly || 0,
      emailGiftMonthly: org.subscriptionCredits?.emailGiftMonthly || 0,
      aiGiftMonthly: org.subscriptionCredits?.aiGiftMonthly || 0,
      // Totals and usage
      smsTotal: sub.smsTotal,
      emailTotal: sub.emailTotal,
      aiTotal: sub.aiTotal,
      smsUsed: sub.smsUsed,
      emailUsed: sub.emailUsed,
      aiUsed: sub.aiUsed,
      smsRemaining: sub.sms,
      emailRemaining: sub.email,
      aiRemaining: sub.ai,
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
    
    // Totals
    total: {
      smsRemaining: total.sms,
      emailRemaining: total.email,
      aiRemaining: total.ai
    },
    
    // Status check
    canSend: org.status === 'active' && (total.sms > 0 || total.email > 0),
    subscriptionActive: org.status === 'active'
  };
  
  // Legacy billingComputed for backward compat with old UI
  const billingComputed = {
    periodStart: org.billing.periodStart,
    periodEnd: org.billing.periodEnd,
    ratio,
    isProrata,
    
    smsUsed: sub.smsUsed,
    smsAllocated: sub.smsTotal + pack.sms,
    smsRemaining: total.sms,
    emailUsed: sub.emailUsed,
    emailAllocated: sub.emailTotal + pack.email,
    emailRemaining: total.email,
    
    // Monthly base vs prorated
    smsMonthlyBase,
    emailMonthlyBase,
    smsIncludedMonthly: org.subscriptionCredits?.smsIncludedMonthly || 0,
    emailIncludedMonthly: org.subscriptionCredits?.emailIncludedMonthly || 0,
    smsIncludedThisPeriod: org.subscriptionCredits?.smsIncludedMonthly || 0,
    emailIncludedThisPeriod: org.subscriptionCredits?.emailIncludedMonthly || 0,
    
    breakdown: {
      included: { sms: org.subscriptionCredits?.smsIncludedMonthly || 0, email: org.subscriptionCredits?.emailIncludedMonthly || 0 },
      gift: { sms: org.subscriptionCredits?.smsGiftMonthly || 0, email: org.subscriptionCredits?.emailGiftMonthly || 0 },
      pack: { sms: pack.sms, email: pack.email }
    },
    
    // Legacy allocations (empty since we use new system)
    allocations: [],
    
    // Pricing - apply prorata to price if applicable
    priceBaseCents: pricing.basePriceCents,
    priceMonthlyFinalCents: pricing.finalPriceCents,
    priceThisPeriodCents: isProrata ? Math.round(pricing.finalPriceCents * ratio) : pricing.finalPriceCents,
    discountPercent: pricing.discountPercent,
    isNegotiated: pricing.isNegotiated,
    currency: pricing.currency,
    
    noRollover: true
  };
  
  return {
    ...org,
    creditsComputed,  // NEW
    billingComputed,  // Legacy compat
    // Legacy fields for backward compat
    usage30d: {
      smsUsed: sub.smsUsed,
      emailUsed: sub.emailUsed,
      total: sub.smsUsed + sub.emailUsed
    },
    allocation: {
      smsAllocated: sub.smsTotal + pack.sms,
      emailAllocated: sub.emailTotal + pack.email
    },
    remaining: {
      sms: total.sms,
      email: total.email
    },
    pricing
  };
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
  const session = getSessionByToken(data, token);
  if (!session) return null;
  
  const user = data.users.find(u => u.id === session.userId);
  if (!user) return null;
  
  return { user, session };
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

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Apply schema migration
      return ensureSchema(raw);
    }
  } catch (err) {
    console.error('[REPUTY] Error loading data:', err);
  }
  // Return empty structure with all required collections
  return ensureSchema({});
}

// ============ AUTH MIDDLEWARES ============

/**
 * LEGACY: Validate global cabinet token (deprecated, kept for backward compat)
 */
function validateAuth(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return { ok: false, error: 'Token manquant' };
  }
  if (token !== CABINET_API_TOKEN) {
    return { ok: false, error: 'Token invalide' };
  }
  return { ok: true };
}

/**
 * P1.3: Validate extension request with publicKey + apiToken
 * 
 * SECURITY PRINCIPLE:
 * 1) Org is resolved ONLY via publicKey (never by token lookup)
 * 2) Token is verified AGAINST that specific org only
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
  
  // 6) Verify token against THIS org's apiToken
  const now = Date.now();
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

function requireAdmin(req) {
  const token = req.headers['x-admin-token'] || '';
  if (!token) {
    return { ok: false, error: 'Admin token manquant', status: 401 };
  }
  if (token !== INTERNAL_ADMIN_TOKEN) {
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
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[REPUTY] Error saving data:', err);
  }
}

// ============ HTTP HELPERS ============

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
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
  sendJson(res, 200, { ok: true, version: VERSION });
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
  
  // Vérifier statut org
  if (org.status !== 'active') {
    recordTelemetry(data, orgId, 'warn', 'SUBSCRIPTION_INACTIVE', 
      `Tentative d'envoi sur compte ${org.status}`, { source: 'extension', publicKey });
    saveData(data);
    
    // P1.4: Log extension subscription inactive
    logger.logExtensionAction('EXTENSION_SEND_REVIEW_FAILED', false, req, {
      requestId: reqId,
      orgId,
      durationMs: Date.now() - startTime,
      status: 403,
      errorCode: 'SUBSCRIPTION_INACTIVE',
      orgStatus: org.status
    });
    
    return sendJson(res, 403, {
      ok: false,
      error: 'SUBSCRIPTION_INACTIVE',
      message: 'Abonnement inactif. Les envois sont désactivés.',
      details: {
        status: org.status,
        orgName: org.name,
        message: 'Contactez votre administrateur pour réactiver votre abonnement.'
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

  // ============ NOUVELLE REQUEST ============
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
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const data = loadData();
  const feedbacks = Object.values(data.feedbacks).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  return sendJson(res, 200, { feedbacks });
}

// ============ REQUESTS API (Traçabilité) ============

function handleGetRequests(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const data = loadData();
  
  // Enrichir chaque request avec son statut de feedback
  const requests = Object.values(data.requests || {}).map(request => {
    const feedback = data.feedbacks?.[request.id];
    const isExpired = isRequestExpired(request);
    
    // Déterminer le statut
    let status = 'pending'; // En attente de réponse
    if (feedback) {
      status = 'completed'; // Feedback reçu
    } else if (isExpired) {
      status = 'expired'; // Expiré sans réponse
    }
    
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
  
  // Stats globales
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    completed: requests.filter(r => r.status === 'completed').length,
    expired: requests.filter(r => r.status === 'expired').length,
    conversionRate: requests.length > 0 
      ? Math.round((requests.filter(r => r.status === 'completed').length / requests.length) * 100) 
      : 0
  };
  
  return sendJson(res, 200, { requests, stats });
}

function handleGetSettings(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const settings = getSettings();
  return sendJson(res, 200, settings);
}

async function handleSaveSettings(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const data = loadData();
  const currentSettings = data.settings || {};
  
  // Update settings (merge with existing, especially reviewRouting)
  data.settings = {
    googleReviewUrl: (body.googleReviewUrl || '').trim() || currentSettings.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
    cabinetName: (body.cabinetName || '').trim() || currentSettings.cabinetName || DEFAULT_SETTINGS.cabinetName,
    reviewRouting: currentSettings.reviewRouting || DEFAULT_SETTINGS.reviewRouting
  };
  
  saveData(data);
  
  console.log('[REPUTY][SETTINGS] Settings updated:', data.settings);
  
  return sendJson(res, 200, { success: true, settings: data.settings });
}

// ============ REVIEW ROUTING API ============

function handleGetReviewRouting(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const settings = getSettings();
  return sendJson(res, 200, settings.reviewRouting);
}

async function handleSaveReviewRouting(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
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
  
  const data = loadData();
  
  // Ensure settings exists
  if (!data.settings) {
    data.settings = { ...DEFAULT_SETTINGS };
  }
  
  // Update reviewRouting
  data.settings.reviewRouting = {
    enabled: enabled === true || enabled === 'true',
    threshold: validThreshold,
    publicTarget: validPublicTarget
  };
  
  saveData(data);
  
  console.log('[REPUTY][SETTINGS] Review routing updated:', data.settings.reviewRouting);
  
  // Tests de validation rapides (logs)
  console.log('[REPUTY][ROUTING TEST] stars=5, threshold=4 =>', determineReviewRouting(5));
  console.log('[REPUTY][ROUTING TEST] stars=3, threshold=4 =>', determineReviewRouting(3));
  
  return sendJson(res, 200, { 
    success: true, 
    reviewRouting: data.settings.reviewRouting 
  });
}

// ============ INTERNAL BACKOFFICE API (Super Admin) ============

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
    return enrichOrg(data, org);
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
  const quotas = PLAN_DEFAULTS[planCode] || { smsIncluded: 50, emailIncluded: 50, aiIncluded: 20 };
  
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
  
  return sendJson(res, 201, { org: newOrg });
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
      org: enrichedOrg,
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
    
    // Quotas
    if (body.quotas) {
      if (body.quotas.smsIncluded !== undefined) org.quotas.smsIncluded = body.quotas.smsIncluded;
      if (body.quotas.emailIncluded !== undefined) org.quotas.emailIncluded = body.quotas.emailIncluded;
      if (body.quotas.aiIncluded !== undefined) org.quotas.aiIncluded = body.quotas.aiIncluded;
    }
    
    org.updatedAt = nowISO();
    saveData(data);
    
    console.log('[REPUTY][INTERNAL] Org updated:', orgId);
    
    return sendJson(res, 200, { org });
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
      org: enrichOrg(data, org),
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
    
    // Update org in data
    const orgIndex = data.orgs.findIndex(o => o.id === orgId);
    if (orgIndex >= 0) {
      data.orgs[orgIndex] = org;
    }
    
    saveData(data);
    
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
      org: enrichOrg(data, org), 
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
 * POST /auth/signup - Inscription client
 * Body: { email, password, orgName, vertical? }
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
  
  const { email, password, orgName, vertical = 'health' } = body;
  
  // Validation
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
  
  const data = loadData();
  
  // Check if email already exists
  if (getUserByEmail(data, email)) {
    return sendJson(res, 409, { error: 'EMAIL_ALREADY_EXISTS', message: 'Un compte existe déjà avec cet email' });
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Create org (status = pending until email verified)
  const orgId = generateId();
  const publicKey = generatePublicKey();
  const planCode = `${vertical}_basic`;
  
  const org = {
    id: orgId,
    publicKey,
    name: orgName,
    email: email.toLowerCase(),
    vertical,
    status: 'pending', // Will be "active" after email verification
    createdAt: nowISO(),
    updatedAt: nowISO(),
    billing: {
      provider: 'none',
      stripeCustomerId: null,
      gocardlessMandateId: null,
      startedAt: nowISO(),
      periodStart: null,
      periodEnd: null
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
    quotas: {
      smsIncluded: PLAN_DEFAULTS[planCode]?.smsIncluded || 50,
      emailIncluded: PLAN_DEFAULTS[planCode]?.emailIncluded || 50,
      aiIncluded: PLAN_DEFAULTS[planCode]?.aiIncluded || 20
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
    name: orgName, // Use org name as default user name
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
  
  // P1.4: Log signup
  logger.logAuth('SIGNUP', true, req, {
    requestId,
    email,
    userId,
    orgId,
    orgName,
    vertical,
    durationMs: Date.now() - startTime,
    status: 201
  });
  
  return sendJson(res, 201, {
    ok: true,
    next: 'verify',
    email: email.toLowerCase(),
    message: 'Un code de vérification a été envoyé à votre email'
  });
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
  
  // Create session
  const session = createSession(data, user.id, user.orgId);
  
  saveData(data);
  
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
  
  // Remove session
  const sessionIndex = data.sessions.findIndex(s => s.token === auth.session.token);
  if (sessionIndex >= 0) {
    data.sessions.splice(sessionIndex, 1);
  }
  
  saveData(data);
  
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

  if (method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

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

  // Rating page
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
    console.log(`[REPUTY][API] Page de notation: ${REVIEWS_BASE_URL}/r/{id}`);
    console.log(`[REPUTY][API] Cabinet: ${settings.cabinetName}`);
    console.log(`[REPUTY][API] Google Review: ${settings.googleReviewUrl}`);
  });
} catch (error) {
  console.error('[REPUTY][FATAL] Server startup failed:', error.message);
  process.exit(1);
}
