#!/usr/bin/env node
/**
 * P0.5 - Unit tests for SES webhooks parsing/normalization/dedup
 */

// Minimal stubs so ses-webhooks.js loads without full DB
process.env.EMAIL_SIGNING_SECRET = 'test-secret';
process.env.SES_SNS_TOPIC_ARN = 'arn:aws:sns:eu-west-3:123456789:test-topic';

const {
  parseSnsEnvelope,
  normalizeSesEvent,
  buildStringToSign,
} = require('../ses-webhooks');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
  }
}

console.log('🧪 SES Webhooks Tests\n');

// ============ SAMPLE PAYLOADS ============

const BOUNCE_SNS_MESSAGE = {
  Type: 'Notification',
  MessageId: 'msg-001',
  TopicArn: 'arn:aws:sns:eu-west-3:123456789:test-topic',
  Timestamp: '2026-02-09T12:00:00.000Z',
  Message: JSON.stringify({
    eventType: 'Bounce',
    mail: {
      messageId: 'ses-msg-abc-123',
      source: 'no-reply@reputyapp.com',
      destination: ['patient@example.com'],
      timestamp: '2026-02-09T11:59:00.000Z',
    },
    bounce: {
      bounceType: 'Permanent',
      bounceSubType: 'General',
      bouncedRecipients: [
        {
          emailAddress: 'patient@example.com',
          action: 'failed',
          status: '5.1.1',
          diagnosticCode: 'smtp; 550 5.1.1 User unknown',
        },
      ],
      timestamp: '2026-02-09T12:00:00.000Z',
    },
  }),
  SigningCertURL: 'https://sns.eu-west-3.amazonaws.com/SimpleNotificationService-xxx.pem',
  Signature: 'fake-sig-for-test',
  SignatureVersion: '1',
};

const COMPLAINT_SNS_MESSAGE = {
  Type: 'Notification',
  MessageId: 'msg-002',
  TopicArn: 'arn:aws:sns:eu-west-3:123456789:test-topic',
  Timestamp: '2026-02-09T13:00:00.000Z',
  Message: JSON.stringify({
    eventType: 'Complaint',
    mail: {
      messageId: 'ses-msg-def-456',
      source: 'no-reply@reputyapp.com',
      destination: ['angry@example.com', 'otherperson@test.com'],
      timestamp: '2026-02-09T12:55:00.000Z',
    },
    complaint: {
      complainedRecipients: [
        { emailAddress: 'angry@example.com' },
      ],
      complaintFeedbackType: 'abuse',
      complaintSubType: null,
      timestamp: '2026-02-09T13:00:00.000Z',
    },
  }),
  SigningCertURL: 'https://sns.eu-west-3.amazonaws.com/SimpleNotificationService-xxx.pem',
  Signature: 'fake-sig-for-test',
  SignatureVersion: '1',
};

const DELIVERY_SNS_MESSAGE = {
  Type: 'Notification',
  MessageId: 'msg-003',
  TopicArn: 'arn:aws:sns:eu-west-3:123456789:test-topic',
  Timestamp: '2026-02-09T14:00:00.000Z',
  Message: JSON.stringify({
    eventType: 'Delivery',
    mail: {
      messageId: 'ses-msg-ghi-789',
      source: 'no-reply@reputyapp.com',
      destination: ['happy@example.com'],
      timestamp: '2026-02-09T13:59:00.000Z',
    },
    delivery: {
      timestamp: '2026-02-09T14:00:00.000Z',
      processingTimeMillis: 123,
      recipients: ['happy@example.com'],
      smtpResponse: '250 OK',
    },
  }),
  SigningCertURL: 'https://sns.eu-west-3.amazonaws.com/SimpleNotificationService-xxx.pem',
  Signature: 'fake-sig-for-test',
  SignatureVersion: '1',
};

// ============ TESTS ============

// --- parseSnsEnvelope ---
console.log('--- parseSnsEnvelope ---');
{
  const parsed = parseSnsEnvelope(JSON.stringify(BOUNCE_SNS_MESSAGE));
  assert(parsed.Type === 'Notification', 'parses Type correctly');
  assert(parsed.MessageId === 'msg-001', 'parses MessageId correctly');
  assert(parsed.TopicArn.includes('test-topic'), 'parses TopicArn correctly');

  try {
    parseSnsEnvelope('not-json');
    assert(false, 'should throw on invalid JSON');
  } catch (e) {
    assert(e.message.includes('Invalid SNS JSON'), 'throws on invalid JSON');
  }

  try {
    parseSnsEnvelope('');
    assert(false, 'should throw on empty string');
  } catch (e) {
    assert(e.message.includes('Empty'), 'throws on empty body');
  }
}

// --- normalizeSesEvent: Bounce ---
console.log('\n--- normalizeSesEvent: Bounce ---');
{
  const event = normalizeSesEvent(BOUNCE_SNS_MESSAGE.Message);
  assert(event.type === 'bounce', 'type is "bounce"');
  assert(event.messageId === 'ses-msg-abc-123', 'messageId extracted');
  assert(event.recipients.length === 1, 'one recipient');
  assert(event.recipients[0].email === 'patient@example.com', 'email extracted');
  assert(event.recipients[0].bounceType === 'Permanent', 'bounceType = Permanent');
  assert(event.recipients[0].bounceSubType === 'General', 'bounceSubType = General');
  assert(event.recipients[0].diagnosticCode.includes('550'), 'diagnosticCode present');
  assert(event.recipients[0].status === '5.1.1', 'SMTP status code');
}

// --- normalizeSesEvent: Complaint ---
console.log('\n--- normalizeSesEvent: Complaint ---');
{
  const event = normalizeSesEvent(COMPLAINT_SNS_MESSAGE.Message);
  assert(event.type === 'complaint', 'type is "complaint"');
  assert(event.messageId === 'ses-msg-def-456', 'messageId extracted');
  assert(event.recipients.length === 1, 'one complained recipient');
  assert(event.recipients[0].email === 'angry@example.com', 'email extracted');
  assert(event.recipients[0].feedbackType === 'abuse', 'feedbackType = abuse');
}

// --- normalizeSesEvent: Delivery ---
console.log('\n--- normalizeSesEvent: Delivery ---');
{
  const event = normalizeSesEvent(DELIVERY_SNS_MESSAGE.Message);
  assert(event.type === 'delivered', 'type is "delivered"');
  assert(event.messageId === 'ses-msg-ghi-789', 'messageId extracted');
  assert(event.recipients.length === 1, 'one delivered recipient');
  assert(event.recipients[0].email === 'happy@example.com', 'email extracted');
  assert(event.recipients[0].smtpResponse === '250 OK', 'smtpResponse preserved');
}

// --- Dedupe key format ---
console.log('\n--- Dedupe key format ---');
{
  // Verify dedupe key pattern used in processSesEvent
  const event = normalizeSesEvent(BOUNCE_SNS_MESSAGE.Message);
  const r = event.recipients[0];
  const dedupeKey = `ses:${event.type}:${event.messageId}:${r.email}`;
  assert(dedupeKey === 'ses:bounce:ses-msg-abc-123:patient@example.com', 'dedupe key matches expected format');

  const event2 = normalizeSesEvent(COMPLAINT_SNS_MESSAGE.Message);
  const r2 = event2.recipients[0];
  const dk2 = `ses:${event2.type}:${event2.messageId}:${r2.email}`;
  assert(dk2 === 'ses:complaint:ses-msg-def-456:angry@example.com', 'complaint dedupe key correct');

  const event3 = normalizeSesEvent(DELIVERY_SNS_MESSAGE.Message);
  const r3 = event3.recipients[0];
  const dk3 = `ses:${event3.type}:${event3.messageId}:${r3.email}`;
  assert(dk3 === 'ses:delivered:ses-msg-ghi-789:happy@example.com', 'delivery dedupe key correct');
}

// --- buildStringToSign ---
console.log('\n--- buildStringToSign ---');
{
  const sts = buildStringToSign(BOUNCE_SNS_MESSAGE, 'Notification');
  assert(sts.includes('Message\n'), 'contains "Message\\n"');
  assert(sts.includes('MessageId\nmsg-001\n'), 'contains MessageId value');
  assert(sts.includes('TopicArn\narn:aws:sns:eu-west-3:123456789:test-topic\n'), 'contains TopicArn');
  assert(sts.includes('Type\nNotification\n'), 'contains Type');
  // Should NOT contain Subject (not present in this message)
  assert(!sts.includes('Subject\n'), 'no Subject for this message');
}

{
  const subConfirmMsg = {
    Type: 'SubscriptionConfirmation',
    Message: 'You have chosen to subscribe...',
    MessageId: 'sub-123',
    SubscribeURL: 'https://sns.amazonaws.com/confirm?token=xxx',
    Timestamp: '2026-01-01T00:00:00.000Z',
    Token: 'token-abc',
    TopicArn: 'arn:aws:sns:eu-west-3:123456789:test-topic',
  };
  const sts = buildStringToSign(subConfirmMsg, 'SubscriptionConfirmation');
  assert(sts.includes('SubscribeURL\n'), 'SubscriptionConfirmation contains SubscribeURL');
  assert(sts.includes('Token\ntoken-abc\n'), 'contains Token');
}

// --- Edge cases ---
console.log('\n--- Edge cases ---');
{
  // Unknown event type
  const unknownEvent = normalizeSesEvent(JSON.stringify({
    eventType: 'Click',
    mail: { messageId: 'mid-999', destination: ['user@test.com'] },
  }));
  assert(unknownEvent.type === 'click', 'unknown type lowercased');
  assert(unknownEvent.recipients.length === 1, 'fallback to mail.destination');
}
{
  // Missing mail object
  const noMail = normalizeSesEvent(JSON.stringify({
    notificationType: 'Bounce',
    bounce: { bouncedRecipients: [{ emailAddress: 'x@y.com' }] },
  }));
  assert(noMail.type === 'bounce', 'works without mail object');
  assert(noMail.messageId === null, 'messageId null if missing');
}

// ============ SUMMARY ============
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
