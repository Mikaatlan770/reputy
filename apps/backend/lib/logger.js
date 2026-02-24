/**
 * P1.4 - Structured Logger for Reputy Backend
 * 
 * Provides JSON-structured logging for sensitive actions.
 * Compatible with Datadog, CloudWatch, and other log aggregators.
 * 
 * SECURITY: Never logs passwords, tokens, or PII in clear text.
 */

const { createHash, randomBytes } = require('crypto');

// ============ CONFIGURATION ============
const SERVICE_NAME = 'reputy-backend';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Try to get version from server.js context (will be set at runtime)
let BACKEND_VERSION = '0.6.3';

/**
 * Set the backend version (called from server.js)
 */
function setVersion(version) {
  BACKEND_VERSION = version;
}

// ============ HELPERS ============

/**
 * Get current timestamp in ISO format
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Generate a simple request ID if none provided
 */
function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return randomBytes(16).toString('hex');
}

/**
 * Hash email for logging (SHA256, lowercase, 32 chars for collision resistance)
 * NEVER log email in clear text
 */
function hashEmail(email) {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex').substring(0, 32);
}

/**
 * Get client IP from request (handles proxies)
 * Priority: x-forwarded-for > x-real-ip > socket.remoteAddress
 */
function getClientIp(req) {
  if (!req) return 'unknown';
  
  // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }
  
  const realIp = req.headers?.['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Extract request ID from various sources
 */
function extractRequestId(req, body) {
  // Priority: header > body > generate
  const headerRequestId = req?.headers?.['x-request-id'];
  if (headerRequestId) return headerRequestId;
  
  const bodyRequestId = body?.requestId;
  if (bodyRequestId) return bodyRequestId;
  
  return generateRequestId();
}

/**
 * Determine actor type from request context
 */
function determineActor(req, isAdmin = false) {
  if (isAdmin) return 'super-admin';
  
  // Check for extension headers
  if (req?.headers?.['x-public-key'] || req?.headers?.['x-api-token']) {
    return 'extension';
  }
  
  // Check for client auth
  if (req?.headers?.['authorization']?.startsWith('Bearer ')) {
    return 'client';
  }
  
  return 'anonymous';
}

/**
 * Determine source from actor or explicit override
 * Source: "web" | "admin" | "extension" | "api"
 */
function determineSource(actor, explicitSource) {
  if (explicitSource) return explicitSource;
  
  switch (actor) {
    case 'super-admin': return 'admin';
    case 'extension': return 'extension';
    case 'client': return 'web';
    default: return 'api';
  }
}

// ============ MAIN LOGGER ============

/**
 * Log a structured JSON entry
 * 
 * @param {'info' | 'warn' | 'error' | 'audit'} level - Log level
 * @param {string} type - Event type (e.g., 'LOGIN_SUCCESS', 'SEND_REVIEW')
 * @param {string} message - Human-readable message
 * @param {object} meta - Additional metadata (all extra data goes here)
 */
function structuredLog(level, type, message, meta = {}) {
  const entry = {
    ts: nowISO(),
    level,
    type,
    message,
    env: NODE_ENV,
    service: SERVICE_NAME,
    version: BACKEND_VERSION,
    meta: { ...meta }
  };
  
  // In production, remove stack traces from meta
  if (IS_PRODUCTION && meta.errorStack) {
    delete entry.meta.errorStack;
  }
  
  // Output as single-line JSON
  console.log(JSON.stringify(entry));
}

// ============ CONVENIENCE METHODS ============

/**
 * Log info level
 */
function logInfo(type, message, meta = {}) {
  structuredLog('info', type, message, meta);
}

/**
 * Log warning level
 */
function logWarn(type, message, meta = {}) {
  structuredLog('warn', type, message, meta);
}

/**
 * Log error level
 */
function logError(type, message, meta = {}) {
  structuredLog('error', type, message, meta);
}

/**
 * Log audit level (for security-sensitive actions)
 */
function logAudit(type, message, meta = {}) {
  structuredLog('audit', type, message, meta);
}

/**
 * P0.2: Log fatal level (process about to exit)
 * Used by uncaughtException / unhandledRejection handlers.
 * Writes to stderr to ensure visibility even if stdout is buffered.
 */
function logFatal(type, message, meta = {}) {
  const entry = {
    ts: nowISO(),
    level: 'fatal',
    type,
    message,
    env: NODE_ENV,
    service: SERVICE_NAME,
    version: BACKEND_VERSION,
    meta: { ...meta }
  };
  console.error(JSON.stringify(entry));
}

// ============ SPECIALIZED LOGGERS ============

/**
 * Log HTTP request completion
 */
function logHttpRequest(req, statusCode, durationMs, extra = {}) {
  const meta = {
    requestId: extra.requestId || extractRequestId(req),
    route: req?.url?.split('?')[0] || 'unknown',
    method: req?.method || 'unknown',
    status: statusCode,
    durationMs,
    actor: extra.actor || determineActor(req),
    ...extra
  };
  
  // Only include IP for sensitive routes
  if (extra.includeIp) {
    meta.ip = getClientIp(req);
  }
  
  let level = 'info';
  if (statusCode >= 500) level = 'error';
  else if (statusCode >= 400) level = 'warn';
  structuredLog(level, 'HTTP_REQUEST', `${req?.method} ${req?.url} ${statusCode}`, meta);
}

/**
 * Log authentication event
 */
function logAuth(type, success, req, extra = {}) {
  const actor = extra.actor || 'client';
  const meta = {
    requestId: extra.requestId || extractRequestId(req),
    route: req?.url?.split('?')[0] || 'unknown',
    method: 'POST',
    status: success ? 200 : (extra.status || 401),
    actor,
    source: determineSource(actor, extra.source),
    ip: getClientIp(req),
    ...extra
  };
  
  // Hash email if provided
  if (extra.email) {
    meta.emailHash = hashEmail(extra.email);
    delete meta.email;
  }
  
  // Clean up duplicate source if passed in extra
  if (extra.source) delete meta.source;
  meta.source = determineSource(actor, extra.source);
  
  logAudit(type, success ? 'Authentication successful' : 'Authentication failed', meta);
}

/**
 * Log rate limit event
 */
function logRateLimit(req, route, retryAfterSec) {
  const actor = determineActor(req);
  const meta = {
    ip: getClientIp(req),
    route,
    method: req?.method || 'unknown',
    retryAfterSec,
    actor,
    source: determineSource(actor)
  };
  
  logWarn('RATE_LIMIT_BLOCKED', 'Rate limit exceeded', meta);
}

/**
 * Log internal admin action
 */
function logInternalAction(type, req, extra = {}) {
  const meta = {
    requestId: extra.requestId || extractRequestId(req),
    route: req?.url?.split('?')[0] || 'unknown',
    method: req?.method || 'unknown',
    status: extra.status || 200,
    actor: 'super-admin',
    source: 'admin',
    ip: getClientIp(req),
    ...extra
  };
  
  logAudit(type, extra.message || 'Internal action', meta);
}

/**
 * Log extension action
 */
function logExtensionAction(type, success, req, extra = {}) {
  const meta = {
    requestId: extra.requestId || extractRequestId(req),
    route: req?.url?.split('?')[0] || 'unknown',
    method: req?.method || 'POST',
    status: success ? 200 : (extra.status || 500),
    durationMs: extra.durationMs,
    actor: 'extension',
    source: 'extension',
    orgId: extra.orgId,
    channel: extra.channel,
    ...extra
  };
  
  // Remove sensitive data
  delete meta.patientName;
  delete meta.patientEmail;
  delete meta.patientPhone;
  
  const level = success ? 'info' : 'error';
  structuredLog(level, type, success ? 'Extension action successful' : 'Extension action failed', meta);
}

// ============ EXPORTS ============

module.exports = {
  // Core
  structuredLog,
  setVersion,
  
  // Convenience
  logInfo,
  logWarn,
  logError,
  logFatal,
  logAudit,
  
  // Specialized
  logHttpRequest,
  logAuth,
  logRateLimit,
  logInternalAction,
  logExtensionAction,
  
  // Helpers
  hashEmail,
  getClientIp,
  extractRequestId,
  generateRequestId,
  determineActor,
  determineSource,
  nowISO
};
