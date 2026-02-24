/**
 * P0.5 - SES Webhooks via Amazon SNS
 *
 * Handles:
 * - SubscriptionConfirmation (auto-confirm)
 * - Notification: Bounce / Complaint / Delivery events from SES
 *
 * For each event:
 * - Dedup via webhook_events table (id = "ses:{type}:{messageId}:{email}")
 * - Link to email_outbox via provider_message_id
 * - Auto-suppress bounced/complained emails in email_unsubscribes
 * - Record email_events for tracking
 */

const { createVerify } = require('crypto');
const logger = require('../logger');
const db = require('../db');
const emailOutboxRepo = require('../repositories/email-outbox.repo');

// ============ CONFIG ============
const SES_SNS_TOPIC_ARN = process.env.SES_SNS_TOPIC_ARN || '';
const IS_PRODUCTION = (process.env.NODE_ENV || 'development') === 'production';

// ============ CERT CACHE (in-memory, TTL 1h) ============
const certCache = new Map();
const CERT_TTL_MS = 60 * 60 * 1000; // 1 hour

// ============================================================
// SNS MESSAGE PARSING
// ============================================================

/**
 * Parse raw SNS body string into structured message
 * @param {string} rawBody - Raw JSON string from SNS
 * @returns {object} Parsed SNS envelope
 */
function parseSnsEnvelope(rawBody) {
  if (!rawBody || typeof rawBody !== 'string') {
    throw new Error('Empty or invalid SNS body');
  }
  try {
    return JSON.parse(rawBody);
  } catch (err) {
    throw new Error(`Invalid SNS JSON: ${err.message}`);
  }
}

// ============================================================
// SNS SIGNATURE VALIDATION
// ============================================================

/**
 * @param {string} topicArn
 * @returns {{ valid: boolean, error: string } | null}
 */
function validateTopicArn(topicArn) {
  if (SES_SNS_TOPIC_ARN) {
    if (topicArn !== SES_SNS_TOPIC_ARN) {
      return { valid: false, error: `topic_arn_mismatch: got ${topicArn}` };
    }
  } else if (IS_PRODUCTION) {
    logger.logError('SES_WEBHOOK', 'SES_SNS_TOPIC_ARN not configured in production', { topicArn });
    return { valid: false, error: 'topic_arn_not_configured' };
  } else {
    logger.logWarn('SES_WEBHOOK', 'SES_SNS_TOPIC_ARN not configured — accepting in dev mode', { topicArn });
  }
  return null;
}

function validateCertUrl(certUrl) {
  if (!certUrl) return { valid: false, error: 'missing_signing_cert_url' };
  try {
    const url = new URL(certUrl);
    if (url.protocol !== 'https:') return { valid: false, error: 'signing_cert_not_https' };
    if (!url.hostname.endsWith('.amazonaws.com')) return { valid: false, error: `signing_cert_invalid_host: ${url.hostname}` };
  } catch (err) {
    return { valid: false, error: 'signing_cert_url_invalid' };
  }
  return null;
}

/**
 * Validate SNS message authenticity:
 * TopicArn allowlist, SigningCertURL domain, RSA signature via AWS cert.
 *
 * @param {object} snsMessage - Parsed SNS envelope
 * @param {object} headers - Request headers
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
async function validateSnsMessage(snsMessage, headers) {
  const messageType = headers['x-amz-sns-message-type'];
  if (!messageType) return { valid: false, error: 'missing_sns_message_type_header' };

  const arnError = validateTopicArn(snsMessage.TopicArn);
  if (arnError) return arnError;

  const certUrl = snsMessage.SigningCertURL || snsMessage.SigningCertUrl;
  const certError = validateCertUrl(certUrl);
  if (certError) return certError;

  const signature = snsMessage.Signature;
  if (!signature) return { valid: false, error: 'missing_signature' };

  try {
    const stringToSign = buildStringToSign(snsMessage, messageType);
    const cert = await fetchCertificate(certUrl);
    const algo = snsMessage.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
    const verifier = createVerify(algo);
    verifier.update(stringToSign, 'utf8');
    if (!verifier.verify(cert, signature, 'base64')) {
      return { valid: false, error: 'signature_verification_failed' };
    }
  } catch (err) {
    if (!IS_PRODUCTION) {
      logger.logWarn('SES_WEBHOOK', `Signature verification error (dev mode, continuing): ${err.message}`);
      return { valid: true };
    }
    return { valid: false, error: `signature_error: ${err.message}` };
  }

  return { valid: true };
}

/**
 * Build the SNS "string to sign" per AWS specification
 * @see https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */
function buildStringToSign(msg, messageType) {
  const pairs = [];

  if (messageType === 'Notification') {
    pairs.push('Message', msg.Message);
    pairs.push('MessageId', msg.MessageId);
    if (msg.Subject) {
      pairs.push('Subject', msg.Subject);
    }
    pairs.push('Timestamp', msg.Timestamp);
    pairs.push('TopicArn', msg.TopicArn);
    pairs.push('Type', msg.Type);
  } else {
    // SubscriptionConfirmation / UnsubscribeConfirmation
    pairs.push('Message', msg.Message);
    pairs.push('MessageId', msg.MessageId);
    pairs.push('SubscribeURL', msg.SubscribeURL);
    pairs.push('Timestamp', msg.Timestamp);
    pairs.push('Token', msg.Token);
    pairs.push('TopicArn', msg.TopicArn);
    pairs.push('Type', msg.Type);
  }

  // Format: "Key\nValue\nKey\nValue\n..."
  return pairs.map(v => v ?? '').join('\n') + '\n';
}

/**
 * Fetch and cache SNS signing certificate
 */
async function fetchCertificate(certUrl) {
  const now = Date.now();
  const cached = certCache.get(certUrl);
  if (cached && (now - cached.fetchedAt) < CERT_TTL_MS) {
    return cached.pem;
  }

  const response = await fetch(certUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch SNS certificate: ${response.status}`);
  }
  const pem = await response.text();

  certCache.set(certUrl, { pem, fetchedAt: now });

  // Evict old entries
  if (certCache.size > 10) {
    for (const [key, val] of certCache) {
      if ((now - val.fetchedAt) > CERT_TTL_MS) certCache.delete(key);
    }
  }

  return pem;
}

// ============================================================
// SNS SUBSCRIPTION CONFIRMATION
// ============================================================

/**
 * Auto-confirm SNS subscription by fetching the SubscribeURL
 */
async function confirmSubscription(subscribeURL) {
  if (!subscribeURL) {
    throw new Error('Missing SubscribeURL');
  }

  // Validate URL is AWS
  const url = new URL(subscribeURL);
  if (!url.hostname.endsWith('.amazonaws.com')) {
    throw new Error(`Suspicious SubscribeURL hostname: ${url.hostname}`);
  }

  logger.logInfo('SES_WEBHOOK', `Confirming SNS subscription: ${subscribeURL.substring(0, 80)}...`);

  const response = await fetch(subscribeURL);
  if (!response.ok) {
    throw new Error(`SNS subscription confirmation failed: ${response.status}`);
  }

  logger.logInfo('SES_WEBHOOK', 'SNS subscription confirmed successfully');
  return true;
}

// ============================================================
// SES EVENT NORMALIZATION
// ============================================================

/**
 * Normalize SES event JSON into a structured format
 * @param {string|object} messageJson - The Message field from SNS (SES event)
 * @returns {{ type: string, messageId: string | null, recipients: Array<{email, status?, diagnosticCode?, feedbackType?}>, timestamp: string, raw: object }}
 */
function normalizeSesEvent(messageJson) {
  const msg = typeof messageJson === 'string' ? JSON.parse(messageJson) : messageJson;

  const eventType = msg.eventType || msg.notificationType;
  const mail = msg.mail || {};
  const messageId = mail.messageId || msg.messageId || null;

  const result = {
    type: null,
    messageId,
    recipients: [],
    timestamp: mail.timestamp || msg.timestamp || new Date().toISOString(),
    raw: msg,
  };

  switch ((eventType || '').toLowerCase()) {
    case 'bounce': {
      result.type = 'bounce';
      const bounce = msg.bounce || {};
      const bouncedRecipients = bounce.bouncedRecipients || [];
      result.recipients = bouncedRecipients.map(r => ({
        email: (r.emailAddress || '').toLowerCase().trim(),
        status: r.status || null,
        diagnosticCode: r.diagnosticCode || null,
        action: r.action || null,
        bounceType: bounce.bounceType || null,
        bounceSubType: bounce.bounceSubType || null,
      }));
      break;
    }

    case 'complaint': {
      result.type = 'complaint';
      const complaint = msg.complaint || {};
      const complainedRecipients = complaint.complainedRecipients || [];
      result.recipients = complainedRecipients.map(r => ({
        email: (r.emailAddress || '').toLowerCase().trim(),
        feedbackType: complaint.complaintFeedbackType || null,
        complaintSubType: complaint.complaintSubType || null,
      }));
      break;
    }

    case 'delivery': {
      result.type = 'delivered';
      const delivery = msg.delivery || {};
      const destinations = delivery.recipients || mail.destination || [];
      result.recipients = destinations.map(email => ({
        email: (email || '').toLowerCase().trim(),
        processingTimeMillis: delivery.processingTimeMillis || null,
        smtpResponse: delivery.smtpResponse || null,
      }));
      break;
    }

    default: {
      // Unknown event type — still record it
      result.type = eventType ? eventType.toLowerCase() : 'unknown';
      const destinations = mail.destination || [];
      result.recipients = destinations.map(email => ({
        email: (email || '').toLowerCase().trim(),
      }));
    }
  }

  return result;
}

// ============================================================
// EVENT PROCESSING (DEDUP + PERSIST + SUPPRESS)
// ============================================================

function isBounceOrComplaint(type) {
  return type === 'bounce' || type === 'complaint';
}

function insertWebhookEvent(dedupeKey, type, orgId, recipient, messageId, raw) {
  db.run(`
    INSERT INTO webhook_events (id, provider, event_type, org_id, payload_json, created_at, processed_at)
    VALUES ($id, $provider, $eventType, $orgId, $payloadJson, $createdAt, $processedAt)
  `, {
    id: dedupeKey,
    provider: 'ses',
    eventType: type,
    orgId,
    payloadJson: db.toJson({ recipient, messageId, raw: summarizeRaw(raw) }),
    createdAt: db.nowISO(),
    processedAt: db.nowISO(),
  });
}

function recordOutboxEvent(outbox, type, messageId, email, recipient) {
  emailOutboxRepo.addEvent(outbox.id, type, {
    sesMessageId: messageId,
    email,
    ...recipient,
  });

  if (isBounceOrComplaint(type)) {
    emailOutboxRepo.updateStatus(outbox.id, 'failed', {
      error: `ses:${type}${recipient.bounceType ? ':' + recipient.bounceType : ''}${recipient.feedbackType ? ':' + recipient.feedbackType : ''}`,
    });
  }
}

function suppressIfNeeded(type, orgId, email, messageId, recipient) {
  if (!isBounceOrComplaint(type)) return;

  if (orgId) {
    emailOutboxRepo.addUnsubscribe(orgId, email, type, null);
    logger.logInfo('SES_WEBHOOK', `Auto-suppressed ${email} for org ${orgId} (${type})`, {
      bounceType: recipient.bounceType, feedbackType: recipient.feedbackType,
    });
  } else {
    logger.logWarn('SES_WEBHOOK', `Cannot suppress ${email}: no org_id found (messageId: ${messageId})`, {
      type, messageId, email,
    });
  }
}

function processSingleRecipient(type, messageId, recipient, raw) {
  const email = recipient.email;
  if (!email || !email.includes('@')) {
    logger.logWarn('SES_WEBHOOK', `Skipping invalid email in ${type} event`, { email });
    return 'skipped';
  }

  const dedupeKey = `ses:${type}:${messageId || 'unknown'}:${email}`;
  const existing = db.get('SELECT id FROM webhook_events WHERE id = $id', { id: dedupeKey });
  if (existing) {
    logger.logInfo('SES_WEBHOOK', `Dedup: already processed ${dedupeKey}`);
    return 'skipped';
  }

  try {
    const outbox = messageId ? emailOutboxRepo.getByProviderMessageId(messageId) : null;
    const orgId = outbox?.orgId || null;

    insertWebhookEvent(dedupeKey, type, orgId, recipient, messageId, raw);
    if (outbox) recordOutboxEvent(outbox, type, messageId, email, recipient);
    suppressIfNeeded(type, orgId, email, messageId, recipient);

    logger.logInfo('SES_WEBHOOK', `Processed ${type} for ${email}`, {
      dedupeKey, outboxId: outbox?.id || null, orgId,
    });
    return 'processed';
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return 'skipped';
    logger.logError('SES_WEBHOOK', `Error processing ${type} for ${email}: ${err.message}`, {
      dedupeKey, error: err.message,
    });
    return 'error';
  }
}

/**
 * Process a normalized SES event
 * - Dedup via webhook_events (id = dedupe_key)
 * - Record email_events if outbox found
 * - Suppress email (add to email_unsubscribes) if bounce/complaint
 * - Update outbox status if bounce/complaint
 *
 * @param {object} event - Output from normalizeSesEvent()
 * @returns {{ processed: number, skipped: number, errors: number }}
 */
function processSesEvent(event) {
  const { type, messageId, recipients, raw } = event;
  const STATUS_MAP = { processed: 'processed', skipped: 'skipped', error: 'errors' };
  const counters = { processed: 0, skipped: 0, errors: 0 };

  for (const recipient of recipients) {
    const result = processSingleRecipient(type, messageId, recipient, raw);
    counters[STATUS_MAP[result]]++;
  }

  return counters;
}

/**
 * Summarize raw SES event for storage (avoid storing huge payloads)
 */
function summarizeRaw(raw) {
  if (!raw) return null;
  return {
    eventType: raw.eventType || raw.notificationType,
    mail: raw.mail ? {
      messageId: raw.mail.messageId,
      source: raw.mail.source,
      destination: raw.mail.destination,
      timestamp: raw.mail.timestamp,
    } : undefined,
    // Keep bounce/complaint/delivery sub-objects
    bounce: raw.bounce,
    complaint: raw.complaint,
    delivery: raw.delivery ? {
      timestamp: raw.delivery.timestamp,
      processingTimeMillis: raw.delivery.processingTimeMillis,
      recipients: raw.delivery.recipients,
    } : undefined,
  };
}

// ============================================================
// MAIN HANDLER (called from server.js)
// ============================================================

async function handleSubscriptionConfirmation(snsMessage) {
  try {
    await confirmSubscription(snsMessage.SubscribeURL);
    return { status: 200, body: { ok: true, action: 'subscription_confirmed' } };
  } catch (err) {
    logger.logError('SES_WEBHOOK', `Subscription confirmation failed: ${err.message}`);
    return { status: 500, body: { ok: false, error: err.message } };
  }
}

function handleNotification(snsMessage) {
  const sesEvent = normalizeSesEvent(snsMessage.Message);
  if (!sesEvent.type) {
    logger.logWarn('SES_WEBHOOK', 'Unknown SES event type', { raw: snsMessage.Message?.substring?.(0, 200) });
    return { status: 200, body: { ok: true, action: 'ignored_unknown_type' } };
  }

  const result = processSesEvent(sesEvent);
  logger.logInfo('SES_WEBHOOK', `Processed SNS Notification: ${sesEvent.type}`, {
    messageId: sesEvent.messageId, recipientCount: sesEvent.recipients.length, ...result,
  });

  return {
    status: 200,
    body: { ok: true, action: 'notification_processed', type: sesEvent.type, messageId: sesEvent.messageId, ...result },
  };
}

/**
 * Handle incoming SNS webhook request
 * @param {string} rawBody - Raw request body (string, not parsed)
 * @param {object} headers - Request headers (lowercased keys)
 * @returns {Promise<{ status: number, body: object }>}
 */
async function handleSnsRequest(rawBody, headers) {
  let snsMessage;
  try {
    snsMessage = parseSnsEnvelope(rawBody);
  } catch (err) {
    return { status: 400, body: { ok: false, error: `parse_error: ${err.message}` } };
  }

  const messageType = headers['x-amz-sns-message-type'] || snsMessage.Type;
  const validation = await validateSnsMessage(snsMessage, headers);
  if (!validation.valid) {
    logger.logError('SES_WEBHOOK', `SNS validation failed: ${validation.error}`, { messageType, topicArn: snsMessage.TopicArn });
    return { status: 401, body: { ok: false, error: validation.error } };
  }

  if (messageType === 'SubscriptionConfirmation') {
    return handleSubscriptionConfirmation(snsMessage);
  }

  if (messageType === 'UnsubscribeConfirmation') {
    logger.logWarn('SES_WEBHOOK', 'Received UnsubscribeConfirmation — SNS topic unsubscribed', { topicArn: snsMessage.TopicArn });
    return { status: 200, body: { ok: true, action: 'unsubscribe_acknowledged' } };
  }

  if (messageType === 'Notification') {
    try {
      return handleNotification(snsMessage);
    } catch (err) {
      logger.logError('SES_WEBHOOK', `Error processing notification: ${err.message}`, { error: err.message, stack: err.stack?.substring(0, 300) });
      return { status: 500, body: { ok: false, error: err.message } };
    }
  }

  logger.logWarn('SES_WEBHOOK', `Unknown SNS message type: ${messageType}`);
  return { status: 200, body: { ok: true, action: 'ignored_unknown_message_type' } };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Main handler
  handleSnsRequest,
  // Sub-functions (for testing)
  parseSnsEnvelope,
  validateSnsMessage,
  confirmSubscription,
  normalizeSesEvent,
  processSesEvent,
  buildStringToSign,
};
