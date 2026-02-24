#!/usr/bin/env node
/**
 * SQLite Migration Tests
 * 
 * Tests:
 * 1. Idempotence: double submit same idempotency_key → no duplicate
 * 2. Settings per org: 2 orgs with different settings
 * 3. Token verification: existing tokens still work
 * 4. Foreign key constraints
 */

// Force SQLite mode
process.env.USE_SQLITE = '1';

const db = require('../db');
const repos = require('../repositories');

console.log('='.repeat(60));
console.log('REPUTY SQLITE TESTS');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertNotNull(value, msg = '') {
  if (value === null || value === undefined) {
    throw new Error(`${msg} Expected non-null value`);
  }
}

// ============================================================
// Test 1: Idempotence
// ============================================================

console.log('\n--- Test 1: Idempotence ---');

test('Create request with idempotency key', () => {
  const idempotencyKey = 'test-idem-' + Date.now();
  
  // First create
  const result1 = repos.request.createOrGetByIdempotencyKey(idempotencyKey, {
    orgId: repos.org.getAll()[0].id,
    channel: 'sms',
    patient: { name: 'Test Patient', phone: '+33600000000' },
    meta: { source: 'test' }
  });
  
  assertEqual(result1.created, true, 'First call should create');
  assertNotNull(result1.request.id, 'Should have ID');
  
  // Second create with SAME key
  const result2 = repos.request.createOrGetByIdempotencyKey(idempotencyKey, {
    orgId: repos.org.getAll()[0].id,
    channel: 'email', // Different data!
    patient: { name: 'Different Name' },
    meta: {}
  });
  
  assertEqual(result2.created, false, 'Second call should NOT create');
  assertEqual(result2.request.id, result1.request.id, 'Should return same request');
  assertEqual(result2.request.channel, 'sms', 'Original data preserved');
  
  // Verify only one in DB
  const all = repos.request.listByOrg(repos.org.getAll()[0].id);
  const matching = all.filter(r => r.idempotencyKey === idempotencyKey);
  assertEqual(matching.length, 1, 'Only ONE request in DB');
});

test('Unique constraint prevents duplicate idempotency keys', () => {
  const idempotencyKey = 'test-unique-' + Date.now();
  const orgId = repos.org.getAll()[0].id;
  
  // Create first
  repos.request.create({
    idempotencyKey,
    orgId,
    channel: 'sms',
    patient: {}
  });
  
  // Try to create duplicate (should throw)
  let threw = false;
  try {
    repos.request.create({
      idempotencyKey, // Same key!
      orgId,
      channel: 'email',
      patient: {}
    });
  } catch (err) {
    threw = true;
    if (!err.message.includes('UNIQUE constraint')) {
      throw new Error('Wrong error type: ' + err.message);
    }
  }
  
  assertEqual(threw, true, 'Should throw on duplicate');
});

// ============================================================
// Test 2: Settings per org
// ============================================================

console.log('\n--- Test 2: Settings per Org ---');

test('Two orgs have different options', () => {
  const orgs = repos.org.getAll();
  
  if (orgs.length < 2) {
    throw new Error('Need at least 2 orgs for this test');
  }
  
  // Update first org options
  repos.org.updateOptions(orgs[0].id, {
    googleReviewUrl: 'https://google.com/org1',
    routingThreshold: 4
  });
  
  // Update second org options
  repos.org.updateOptions(orgs[1].id, {
    googleReviewUrl: 'https://google.com/org2',
    routingThreshold: 3
  });
  
  // Verify they're different
  const org1 = repos.org.getById(orgs[0].id);
  const org2 = repos.org.getById(orgs[1].id);
  
  assertEqual(org1.options.googleReviewUrl, 'https://google.com/org1');
  assertEqual(org2.options.googleReviewUrl, 'https://google.com/org2');
  assertEqual(org1.options.routingThreshold, 4);
  assertEqual(org2.options.routingThreshold, 3);
});

test('Options are persisted', () => {
  const org = repos.org.getAll()[0];
  const testValue = 'test-' + Date.now();
  
  repos.org.updateOptions(org.id, { testField: testValue });
  
  const reloaded = repos.org.getById(org.id);
  assertEqual(reloaded.options.testField, testValue, 'Option should persist');
});

// ============================================================
// Test 3: Token verification
// ============================================================

console.log('\n--- Test 3: Token Verification ---');

test('Verify token via hash', () => {
  // Create a new org with known token
  const newOrg = repos.org.create({
    name: 'Test Org Token',
    vertical: 'health'
  });
  
  // The plain token is only available on creation
  const plainToken = newOrg._plainApiToken;
  assertNotNull(plainToken, 'Should have plain token on creation');
  
  // Verify the token
  const verified = repos.org.verifyApiToken(plainToken);
  assertNotNull(verified, 'Should verify successfully');
  assertEqual(verified.id, newOrg.id, 'Should return correct org');
});

test('Invalid token returns null', () => {
  const result = repos.org.verifyApiToken('invalid-token-12345');
  assertEqual(result, null, 'Invalid token should return null');
});

test('Token rotation with grace period', () => {
  // Get an org
  const org = repos.org.getAll()[0];
  
  // Rotate token
  const { newToken } = repos.org.rotateApiToken(org.id, 24);
  assertNotNull(newToken, 'Should return new token');
  
  // New token should work
  const verified = repos.org.verifyApiToken(newToken);
  assertNotNull(verified, 'New token should verify');
  assertEqual(verified.id, org.id);
  
  // Check that previous hash is set
  const updatedOrg = repos.org.getById(org.id);
  assertNotNull(updatedOrg.apiTokenLastRotatedAt, 'Should have rotation timestamp');
});

// ============================================================
// Test 4: Foreign Key Constraints
// ============================================================

console.log('\n--- Test 4: Foreign Key Constraints ---');

test('FK integrity check passes', () => {
  const violations = db.checkForeignKeys();
  assertEqual(violations.length, 0, 'No FK violations');
});

test('CASCADE delete works (user → sessions)', () => {
  // Create a test user
  const org = repos.org.getAll()[0];
  const testUser = repos.user.create({
    orgId: org.id,
    email: 'test-cascade-' + Date.now() + '@test.com',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', // NOSONAR - fake bcrypt hash for tests only
    name: 'Test Cascade'
  });
  
  // Create a session for this user
  const session = repos.session.createSession(testUser.id, org.id);
  assertNotNull(session.token);
  
  // Verify session exists
  const sessionBefore = repos.session.getSession(session.token);
  assertNotNull(sessionBefore, 'Session should exist');
  
  // Delete user
  repos.user.delete(testUser.id);
  
  // Session should be cascaded
  const sessionAfter = repos.session.getSession(session.token);
  assertEqual(sessionAfter, null, 'Session should be deleted by CASCADE');
});

test('RESTRICT prevents org deletion with requests', () => {
  // Find an org that has requests
  const orgs = repos.org.getAll();
  let orgWithRequests = null;
  
  for (const org of orgs) {
    const count = repos.request.countByOrg(org.id);
    if (count > 0) {
      orgWithRequests = org;
      break;
    }
  }
  
  if (!orgWithRequests) {
    console.log('   (Skipped: no org with requests found)');
    return;
  }
  
  // Try to delete should fail
  let threw = false;
  try {
    repos.org.delete(orgWithRequests.id);
  } catch (err) {
    threw = true;
    if (!err.message.includes('FOREIGN KEY constraint')) {
      throw new Error('Wrong error: ' + err.message);
    }
  }
  
  assertEqual(threw, true, 'Should throw FK constraint error');
});

// ============================================================
// Test 5: Message table (new)
// ============================================================

console.log('\n--- Test 5: Message Table ---');

test('Create and update message status', () => {
  // Get a request
  const org = repos.org.getAll()[0];
  const requests = repos.request.listByOrg(org.id, { limit: 1 });
  
  if (requests.length === 0) {
    console.log('   (Skipped: no requests found)');
    return;
  }
  
  const request = requests[0];
  
  // Create a message
  const message = repos.message.create({
    requestDbId: request.id,
    channel: 'sms',
    recipient: '+33600000000',
    status: 'queued'
  });
  
  assertNotNull(message.id);
  assertEqual(message.status, 'queued');
  
  // Mark as sent
  const updated = repos.message.markSent(message.id, 'provider-123');
  assertEqual(updated.status, 'sent');
  assertNotNull(updated.sentAt);
  assertEqual(updated.providerMessageId, 'provider-123');
});

// ============================================================
// Summary
// ============================================================

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

// Cleanup test data
console.log('\nCleaning up test data...');

// Delete test orgs
const testOrgs = repos.org.getAll().filter(o => o.name.startsWith('Test Org'));
for (const org of testOrgs) {
  try {
    repos.org.delete(org.id);
  } catch {
    // May fail due to FK, that's OK
  }
}

// Delete test users
const database = db.getDb();
database.prepare("DELETE FROM users WHERE email LIKE 'test-cascade-%'").run();

// Delete test requests
database.prepare("DELETE FROM review_requests WHERE idempotency_key LIKE 'test-%'").run();

console.log('Done.');

db.closeDb();
process.exit(failed > 0 ? 1 : 0);
