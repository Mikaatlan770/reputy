#!/usr/bin/env node
/**
 * P0.4 - Unit tests for email signer
 * Usage: node lib/email/__tests__/signer.test.js
 */

// Deterministic secret for tests
process.env.EMAIL_SIGNING_SECRET = 'test-secret-for-unit-tests-32chars!';

const signer = require('../signer');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✅ ${name}`); passed++; }
  else           { console.error(`  ❌ ${name}`); failed++; }
}

console.log('🧪 Signer Tests\n');

// 1: Sign and verify roundtrip
{
  const token = signer.signToken({ foo: 'bar', n: 42 });
  assert(typeof token === 'string', 'signToken returns string');
  assert(token.includes('.'), 'token has dot separator');
  const r = signer.verifyToken(token);
  assert(r.valid === true, 'verifyToken valid=true');
  assert(r.payload.foo === 'bar', 'payload.foo preserved');
  assert(r.payload.n === 42, 'payload.n preserved');
}

// 2: Tampered token rejected
{
  const token = signer.signToken({ test: true });
  const tampered = token.slice(0, -2) + 'XX';
  const r = signer.verifyToken(tampered);
  assert(r.valid === false, 'tampered token rejected');
  assert(r.error === 'invalid_signature', 'error = invalid_signature');
}

// 3: Missing / null / empty / no-dot
{
  assert(signer.verifyToken(null).valid === false, 'null rejected');
  assert(signer.verifyToken('').valid === false, 'empty rejected');
  assert(signer.verifyToken('nodot').valid === false, 'no-dot rejected');
}

// 4: Expired token
{
  const token = signer.signToken({ type: 'test', exp: Date.now() - 1000 });
  const r = signer.verifyToken(token);
  assert(r.valid === false, 'expired token rejected');
  assert(r.error === 'token_expired', 'error = token_expired');
}

// 5: Non-expired token
{
  const token = signer.signToken({ type: 'test', exp: Date.now() + 60000 });
  assert(signer.verifyToken(token).valid === true, 'non-expired accepted');
}

// 6: Unsubscribe token
{
  const token = signer.createUnsubscribeToken('org123', 'Test@Example.com');
  const r = signer.verifyToken(token);
  assert(r.valid === true, 'unsub token valid');
  assert(r.payload.type === 'unsubscribe', 'type=unsubscribe');
  assert(r.payload.org_id === 'org123', 'org_id preserved');
  assert(r.payload.email === 'test@example.com', 'email lowercased');
}

// 7: Review token with expiration
{
  const token = signer.createReviewToken('orgABC', 'patient@test.fr', 'out_99');
  const r = signer.verifyToken(token);
  assert(r.valid === true, 'review token valid');
  assert(r.payload.type === 'review', 'type=review');
  assert(r.payload.outbox_id === 'out_99', 'outbox_id preserved');
  assert(r.payload.exp > Date.now(), 'expires in the future');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
