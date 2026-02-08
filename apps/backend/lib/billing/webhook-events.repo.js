/**
 * Webhook Events Repository
 * 
 * Manages idempotence for Stripe/GoCardless webhooks.
 * Prevents double-processing of the same event.
 */

const db = require('../db');
const logger = require('../logger');

// ============================================================
// Event Management
// ============================================================

/**
 * Check if an event has already been processed
 * @param {string} eventId - Provider's event ID
 * @returns {{exists: boolean, processed: boolean}}
 */
function checkEvent(eventId) {
  try {
    const row = db.get(
      'SELECT id, processed_at FROM webhook_events WHERE id = ?',
      [eventId]
    );
    
    if (!row) {
      return { exists: false, processed: false };
    }
    
    return {
      exists: true,
      processed: !!row.processed_at
    };
  } catch (err) {
    logger.logError('WEBHOOK_EVENT_CHECK_ERROR', {
      eventId,
      error: err.message
    });
    // On error, assume not exists to be safe (will try to insert)
    return { exists: false, processed: false };
  }
}

/**
 * Record a received webhook event (not yet processed)
 * @param {object} options
 * @param {string} options.eventId - Provider's event ID
 * @param {string} options.provider - 'stripe' | 'gocardless'
 * @param {string} options.eventType - Event type (e.g., 'invoice.paid')
 * @param {string} [options.orgId] - Associated org ID (optional)
 * @param {object} [options.payload] - Raw event payload
 * @returns {boolean} - True if inserted, false if already exists
 */
function recordEvent({ eventId, provider, eventType, orgId, payload }) {
  try {
    const payloadJson = payload ? JSON.stringify(payload) : null;
    
    db.run(`
      INSERT OR IGNORE INTO webhook_events 
      (id, provider, event_type, org_id, payload_json, processed_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `, [eventId, provider, eventType, orgId || null, payloadJson]);
    
    return true;
  } catch (err) {
    // SQLITE_CONSTRAINT means duplicate - that's expected
    if (err.code === 'SQLITE_CONSTRAINT') {
      return false;
    }
    
    logger.logError('WEBHOOK_EVENT_RECORD_ERROR', {
      eventId,
      provider,
      eventType,
      error: err.message
    });
    throw err;
  }
}

/**
 * Mark an event as processed
 * @param {string} eventId - Provider's event ID
 * @returns {boolean} - True if updated
 */
function markProcessed(eventId) {
  try {
    const now = new Date().toISOString();
    const result = db.run(
      'UPDATE webhook_events SET processed_at = ? WHERE id = ? AND processed_at IS NULL',
      [now, eventId]
    );
    
    return result.changes > 0;
  } catch (err) {
    logger.logError('WEBHOOK_EVENT_MARK_ERROR', {
      eventId,
      error: err.message
    });
    return false;
  }
}

/**
 * Get unprocessed events (for retry/replay)
 * @param {string} [provider] - Filter by provider
 * @param {number} [limit] - Max events to return
 * @returns {Array}
 */
function getUnprocessedEvents(provider = null, limit = 100) {
  try {
    let sql = `
      SELECT id, provider, event_type, org_id, payload_json, created_at
      FROM webhook_events 
      WHERE processed_at IS NULL
    `;
    const params = [];
    
    if (provider) {
      sql += ' AND provider = ?';
      params.push(provider);
    }
    
    sql += ' ORDER BY created_at ASC LIMIT ?';
    params.push(limit);
    
    const rows = db.all(sql, params);
    
    return rows.map(row => ({
      id: row.id,
      provider: row.provider,
      eventType: row.event_type,
      orgId: row.org_id,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      createdAt: row.created_at
    }));
  } catch (err) {
    logger.logError('WEBHOOK_EVENT_LIST_ERROR', { error: err.message });
    return [];
  }
}

/**
 * Process an event with idempotence check
 * @param {object} event - Event object with id, type, etc.
 * @param {string} provider - 'stripe' | 'gocardless'
 * @param {function} processor - Async function to process the event
 * @returns {Promise<{processed: boolean, skipped: boolean, error?: Error}>}
 */
async function processWithIdempotence(event, provider, processor) {
  const eventId = event.id;
  const eventType = event.type;
  
  // Check if already processed
  const { exists, processed } = checkEvent(eventId);
  
  if (processed) {
    logger.logAudit('WEBHOOK_EVENT_SKIPPED', {
      eventId,
      provider,
      eventType,
      reason: 'already_processed'
    });
    return { processed: false, skipped: true };
  }
  
  // Record the event (if not exists)
  if (!exists) {
    recordEvent({
      eventId,
      provider,
      eventType,
      orgId: event.data?.object?.metadata?.orgId,
      payload: event
    });
  }
  
  // Process the event
  try {
    await processor(event);
    
    // Mark as processed
    markProcessed(eventId);
    
    logger.logAudit('WEBHOOK_EVENT_PROCESSED', {
      eventId,
      provider,
      eventType
    });
    
    return { processed: true, skipped: false };
  } catch (err) {
    logger.logError('WEBHOOK_EVENT_PROCESSING_ERROR', {
      eventId,
      provider,
      eventType,
      error: err.message,
      stack: err.stack
    });
    
    // Don't mark as processed - will be retried
    return { processed: false, skipped: false, error: err };
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  checkEvent,
  recordEvent,
  markProcessed,
  getUnprocessedEvents,
  processWithIdempotence
};
