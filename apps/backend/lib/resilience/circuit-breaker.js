/**
 * Circuit Breaker — Brevo (Email + SMS)
 *
 * Prevents hammering Brevo when it's returning errors (429/5xx).
 * In-memory, per-service, per-process.
 *
 * States:
 *   CLOSED  → normal operation (default)
 *   OPEN    → fail fast, don't call Brevo, jobs stay in outbox/queue
 *   HALF    → try one request; if ok → CLOSED, if fail → OPEN
 *
 * Only circuit-relevant errors (5xx, 429, network/timeout) trip the breaker.
 * 4xx validation errors (400, 401, 403, 404, 422) are ignored.
 *
 * Usage:
 *   const cb = require('./circuit-breaker');
 *   if (!cb.canCall('brevo_email')) throw new Error('Circuit open — retrying later');
 *   try { await brevoSend(); cb.recordSuccess('brevo_email'); }
 *   catch(e) { cb.recordFailure('brevo_email', e); throw e; }
 */

'use strict';

const logger = require('../logger');

// ============ CONFIG ============
const FAILURE_THRESHOLD = parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10);
const OPEN_DURATION_MS = parseInt(process.env.CB_OPEN_DURATION_MS || String(10 * 60 * 1000), 10); // 10 min
const JITTER_MS = parseInt(process.env.CB_JITTER_MS || '30000', 10); // ±30s jitter
const HALF_OPEN_MAX = 1; // Allow 1 probe request in HALF state

// ============ HELPERS ============

/**
 * Generate a random jitter value in [-JITTER_MS, +JITTER_MS].
 * Prevents thundering-herd when multiple processes reopen simultaneously.
 * @returns {number}
 */
function randomJitter() {
  return Math.floor((Math.random() * 2 - 1) * JITTER_MS);
}

/**
 * Check if an HTTP status code is circuit-relevant.
 * @param {number} status
 * @returns {boolean|null} true=relevant, false=ignore, null=inconclusive
 */
function classifyHttpStatus(status) {
  if (typeof status !== 'number') return null;
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status >= 400) return false;
  return null;
}

/**
 * Determine if an error should count toward the circuit breaker.
 *
 * Count:  5xx, 429 (rate limit), network errors, timeouts.
 * Ignore: 4xx validation (400, 401, 403, 404, 422).
 *
 * @param {Error} err
 * @returns {boolean} true if this error should affect the circuit
 */
function isCircuitRelevantError(err) {
  if (!err) return true;

  const explicitResult = classifyHttpStatus(err.status || err.statusCode);
  if (explicitResult !== null) return explicitResult;

  const msgMatch = err.message?.match(/\((\d{3})\)/);
  if (msgMatch) {
    const parsed = classifyHttpStatus(parseInt(msgMatch[1], 10));
    if (parsed !== null) return parsed;
  }

  return true;
}

// ============ STATE ============

/**
 * @type {Map<string, {
 *   state: 'closed'|'open'|'half',
 *   failures: number,
 *   successes: number,
 *   lastFailureAt: number|null,
 *   openedAt: number|null,
 *   openUntil: number|null,
 *   halfProbes: number
 * }>}
 */
const circuits = new Map();

function getCircuit(service) {
  if (!circuits.has(service)) {
    circuits.set(service, {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      openedAt: null,
      openUntil: null,
      halfProbes: 0,
    });
  }
  return circuits.get(service);
}

// ============ PUBLIC API ============

/**
 * Check if a call to the service is allowed.
 *
 * @param {string} service - e.g. 'brevo_email', 'brevo_sms'
 * @returns {boolean} true if allowed (CLOSED or HALF with probes left)
 */
function canCall(service) {
  const c = getCircuit(service);

  if (c.state === 'closed') return true;

  if (c.state === 'open') {
    // Check if open duration (with jitter) has elapsed → transition to HALF
    if (Date.now() >= (c.openUntil || 0)) {
      c.state = 'half';
      c.halfProbes = 0;
      const elapsed = Date.now() - (c.openedAt || 0);
      logger.logInfo('CIRCUIT_BREAKER', `${service}: OPEN → HALF (probe allowed)`, {
        service, elapsedSec: Math.round(elapsed / 1000),
      });
      return true; // Allow one probe
    }
    return false; // Still open — fail fast
  }

  if (c.state === 'half') {
    // Allow limited probes
    if (c.halfProbes < HALF_OPEN_MAX) {
      c.halfProbes++;
      return true;
    }
    return false; // Wait for probe result
  }

  return true;
}

/**
 * Record a successful call → reset circuit to CLOSED.
 *
 * @param {string} service
 */
function recordSuccess(service) {
  const c = getCircuit(service);
  const prev = c.state;
  c.state = 'closed';
  c.failures = 0;
  c.successes++;
  c.halfProbes = 0;
  c.openUntil = null;

  if (prev !== 'closed') {
    logger.logInfo('CIRCUIT_BREAKER', `${service}: ${prev.toUpperCase()} → CLOSED (recovered)`, {
      service, successes: c.successes,
    });
  }
}

/**
 * Record a failed call → increment counter, open if threshold reached.
 * Only counts circuit-relevant errors (5xx, 429, network/timeout).
 *
 * @param {string} service
 * @param {Error} [err] - the error (for logging)
 */
function recordFailure(service, err) {
  // Filter: only circuit-relevant errors trip the breaker
  if (!isCircuitRelevantError(err)) {
    return; // 4xx validation error → ignore
  }

  const c = getCircuit(service);
  c.failures++;
  c.lastFailureAt = Date.now();

  // HALF → immediate re-open (probe failed)
  if (c.state === 'half') {
    c.state = 'open';
    c.openedAt = Date.now();
    c.openUntil = Date.now() + OPEN_DURATION_MS + randomJitter();
    c.halfProbes = 0;
    logger.logWarn('CIRCUIT_BREAKER', `${service}: HALF → OPEN (probe failed)`, {
      service, failures: c.failures, error: err?.message,
    });
    return;
  }

  // CLOSED → check threshold
  if (c.state === 'closed' && c.failures >= FAILURE_THRESHOLD) {
    c.state = 'open';
    c.openedAt = Date.now();
    c.openUntil = Date.now() + OPEN_DURATION_MS + randomJitter();
    logger.logWarn('CIRCUIT_BREAKER', `${service}: CLOSED → OPEN (${c.failures} consecutive failures)`, {
      service, failures: c.failures,
      threshold: FAILURE_THRESHOLD,
      openDurationMs: OPEN_DURATION_MS,
      openUntil: new Date(c.openUntil).toISOString(),
      error: err?.message,
    });
  }
}

/**
 * Get current state for all circuits (for /health).
 *
 * @returns {Object<string, { state, failures, lastFailureAt, openedAt, openUntil }>}
 */
function getStatus() {
  const result = {};
  for (const [service, c] of circuits) {
    result[service] = {
      state: c.state,
      failures: c.failures,
      successes: c.successes,
      lastFailureAt: c.lastFailureAt ? new Date(c.lastFailureAt).toISOString() : null,
      openedAt: c.openedAt ? new Date(c.openedAt).toISOString() : null,
      openUntil: c.openUntil ? new Date(c.openUntil).toISOString() : null,
    };
  }
  return result;
}

/**
 * Force-reset a circuit (admin action).
 * @param {string} service
 */
function reset(service) {
  circuits.delete(service);
  logger.logInfo('CIRCUIT_BREAKER', `${service}: force-reset to CLOSED`, { service });
}

/**
 * Force-reset all circuits.
 */
function resetAll() {
  circuits.clear();
  logger.logInfo('CIRCUIT_BREAKER', 'All circuits force-reset to CLOSED');
}

module.exports = {
  canCall,
  recordSuccess,
  recordFailure,
  isCircuitRelevantError,
  getStatus,
  reset,
  resetAll,
  // Config (exported for testing / /health)
  FAILURE_THRESHOLD,
  OPEN_DURATION_MS,
  JITTER_MS,
};
