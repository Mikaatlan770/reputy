/**
 * Sentry integration — optional, no-op if SENTRY_DSN is absent.
 *
 * Usage:
 *   const sentry = require('./lib/sentry');
 *   // Init is automatic on require if SENTRY_DSN is set.
 *   sentry.captureException(err, { route: '/client/ai/suggest-reply', orgId });
 *   await sentry.flush();   // best-effort flush (e.g. before process.exit)
 */

let Sentry = null;
let isEnabled = false;

// ============ INIT ============

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[SENTRY] No SENTRY_DSN found — Sentry disabled (no-op).');
    return;
  }

  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // Keep it lightweight — no performance tracing for now
      tracesSampleRate: 0,
      // Scrub sensitive data from breadcrumbs / events
      beforeSend(event) {
        // Remove request body to avoid leaking sensitive data
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
        }
        return event;
      },
    });
    isEnabled = true;
    console.log('[SENTRY] Initialized successfully (env:', process.env.NODE_ENV || 'development', ')');
  } catch (err) {
    console.error('[SENTRY] Failed to initialize:', err.message);
    Sentry = null;
    isEnabled = false;
  }
}

// Auto-init on require
init();

// ============ CAPTURE ============

/**
 * Capture an exception in Sentry (no-op if Sentry is not enabled).
 * IMPORTANT: Never include sensitive data (reviewText, passwords, tokens) in context.
 *
 * @param {Error} err - The error to capture
 * @param {object} context - Extra context (route, orgId, userId, errorCode, etc.)
 */
function captureException(err, context = {}) {
  if (!isEnabled || !Sentry) return;

  try {
    Sentry.captureException(err, {
      extra: context,
    });
  } catch (_) {
    // Sentry itself failed — don't crash the app
    console.error('[SENTRY] captureException failed silently');
  }
}

// ============ FLUSH ============

/**
 * Best-effort flush of pending Sentry events.
 * Call before process.exit() in graceful shutdown.
 *
 * @param {number} timeoutMs - Max time to wait (default 2000ms)
 * @returns {Promise<boolean>}
 */
async function flush(timeoutMs = 2000) {
  if (!isEnabled || !Sentry) return true;

  try {
    return await Sentry.flush(timeoutMs);
  } catch (_) {
    return false;
  }
}

// ============ EXPORTS ============

module.exports = {
  captureException,
  flush,
  get isEnabled() { return isEnabled; },
};
