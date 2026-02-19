/**
 * Sentry integration — optional, no-op if SENTRY_DSN is absent.
 *
 * Usage:
 *   const sentry = require('./lib/sentry');
 *   // Init is automatic on require if SENTRY_DSN is set.
 *   sentry.captureException(err, { route: '/client/ai/suggest-reply', orgId });
 *   sentry.setTag('worker', 'email_worker');  // per-worker tag
 *   await sentry.flush();   // best-effort flush (e.g. before process.exit)
 *
 * Environment variables:
 *   SENTRY_DSN           — required to enable Sentry
 *   SENTRY_ENVIRONMENT   — default: NODE_ENV || 'development'
 *   SENTRY_RELEASE       — default: 'unknown'
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
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || 'unknown',
      // Keep it lightweight — no performance tracing for now
      tracesSampleRate: 0,
      // Global tags for all events
      initialScope: {
        tags: {
          service: 'reputy-backend',
          provider_email: 'brevo',
          provider_sms: 'brevo',
        },
      },
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
    console.log('[SENTRY] Initialized successfully (env:',
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      ', release:', process.env.SENTRY_RELEASE || 'unknown', ')');
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
 * @param {object} context - Extra context (route, orgId, userId, errorCode, worker, etc.)
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

// ============ TAGS ============

/**
 * Set a tag on the current scope (e.g. worker name).
 * Useful for per-worker tags added at script startup.
 *
 * @param {string} key   - tag name (e.g. 'worker')
 * @param {string} value - tag value (e.g. 'email_worker')
 */
function setTag(key, value) {
  if (!isEnabled || !Sentry) return;

  try {
    Sentry.getCurrentScope().setTag(key, value);
  } catch (_) {
    // no-op
  }
}

/**
 * Set multiple tags at once.
 * @param {Object<string, string>} tags
 */
function setTags(tags) {
  if (!isEnabled || !Sentry) return;

  try {
    const scope = Sentry.getCurrentScope();
    for (const [key, value] of Object.entries(tags)) {
      scope.setTag(key, value);
    }
  } catch (_) {
    // no-op
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
  setTag,
  setTags,
  get isEnabled() { return isEnabled; },
};
