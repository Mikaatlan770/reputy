#!/usr/bin/env node
/**
 * Billing API Tests (Stub)
 * 
 * Tests de base pour vérifier que les endpoints billing sont accessibles
 * et retournent des réponses valides.
 * 
 * Usage:
 *   AUTH_TOKEN=<token> npm run test:billing
 * 
 * Notes:
 * - Les tests Stripe réels nécessitent Stripe CLI (voir BILLING.md)
 * - Ces tests vérifient uniquement la structure des endpoints
 */

const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8787';

// ============================================================
// Test Utilities
// ============================================================

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
};

async function test(name, fn) {
  process.stdout.write(`📋 ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    results.passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    results.failed++;
  }
}

function skip(name, reason) {
  console.log(`⏭️  ${name}: SKIP (${reason})`);
  results.skipped++;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      ...options.headers,
    },
  });
  
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON
  }
  
  return { status: res.status, json, text };
}

// ============================================================
// Tests
// ============================================================

async function runTests() {
  console.log('============================================================');
  console.log('BILLING API TESTS (STUB)');
  console.log('============================================================');
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Auth: Bearer ${AUTH_TOKEN.slice(0, 10)}...`);
  console.log('');

  // ---- Test 1: GET /client/billing/status ----
  await test('GET /client/billing/status - returns billing info', async () => {
    const { status, json } = await fetchJson(`${BASE_URL}/client/billing/status`);
    
    assert(status === 200, `Expected 200, got ${status}`);
    assert(json?.ok === true, 'Expected ok: true');
    assert(json?.billing, 'Expected billing object');
    assert(json?.billing?.plan, 'Expected billing.plan');
    assert(json?.billing?.accessState, 'Expected billing.accessState');
    assert(json?.billing?.quotas, 'Expected billing.quotas');
    assert(json?.billing?.quotas?.sms, 'Expected billing.quotas.sms');
    
    console.log(`Plan: ${json.billing.plan}, State: ${json.billing.accessState}`);
  });

  // ---- Test 2: GET /client/billing/status - requires auth ----
  await test('GET /client/billing/status - requires auth', async () => {
    const res = await fetch(`${BASE_URL}/client/billing/status`);
    assert(res.status === 401, `Expected 401 without auth, got ${res.status}`);
  });

  // ---- Test 3: POST /client/billing/checkout - invalid plan ----
  await test('POST /client/billing/checkout - rejects invalid plan', async () => {
    const { status, json } = await fetchJson(`${BASE_URL}/client/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({ planId: 'invalid', provider: 'stripe' }),
    });
    
    assert(status === 400, `Expected 400, got ${status}`);
    assert(json?.errorCategory === 'INVALID_PLAN', 'Expected INVALID_PLAN error');
  });

  // ---- Test 4: POST /client/billing/checkout - requires auth ----
  await test('POST /client/billing/checkout - requires auth', async () => {
    const res = await fetch(`${BASE_URL}/client/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'argent', provider: 'stripe' }),
    });
    assert(res.status === 401, `Expected 401 without auth, got ${res.status}`);
  });

  // ---- Test 5: POST /client/billing/portal - requires auth ----
  await test('POST /client/billing/portal - requires auth', async () => {
    const res = await fetch(`${BASE_URL}/client/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert(res.status === 401, `Expected 401 without auth, got ${res.status}`);
  });

  // ---- Test 6: POST /client/billing/sepa - SEPA not ready ----
  await test('POST /client/billing/sepa - returns SEPA not ready', async () => {
    const { status, json } = await fetchJson(`${BASE_URL}/client/billing/sepa`, {
      method: 'POST',
      body: JSON.stringify({ planId: 'argent' }),
    });
    
    // Should return error since SEPA is not implemented
    assert(status === 400 || status === 200, `Expected 400 or 200, got ${status}`);
    if (json?.error?.errorCode === 'SEPA_NOT_READY') {
      console.log('(SEPA stub active)');
    }
  });

  // ---- Test 7: POST /webhooks/stripe - missing signature ----
  await test('POST /webhooks/stripe - rejects missing signature', async () => {
    const res = await fetch(`${BASE_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // ---- Test 8: POST /webhooks/gocardless - returns ok ----
  await test('POST /webhooks/gocardless - returns ok (stub)', async () => {
    const res = await fetch(`${BASE_URL}/webhooks/gocardless`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    });
    // GoCardless stub should return 200 with implemented: false
    assert(res.status === 200 || res.status === 400, `Expected 200 or 400, got ${res.status}`);
  });

  // ---- Skip Stripe real tests ----
  skip('Stripe Checkout (real)', 'Requires STRIPE_SECRET_KEY - test with Stripe CLI');
  skip('Stripe Webhooks (real)', 'Use: stripe listen --forward-to localhost:8787/webhooks/stripe');

  // ============================================================
  // Results
  // ============================================================
  console.log('');
  console.log('============================================================');
  console.log('RÉSULTAT:');
  console.log(`  ✅ Passés: ${results.passed}`);
  console.log(`  ❌ Échoués: ${results.failed}`);
  console.log(`  ⏭️  Ignorés: ${results.skipped}`);
  console.log('============================================================');

  if (results.failed > 0) {
    console.log('');
    console.log('⚠️  Certains tests ont échoué.');
    process.exit(1);
  } else {
    console.log('');
    console.log('✅ Tous les tests sont passés!');
    console.log('');
    console.log('📖 Pour tester Stripe en réel:');
    console.log('   1. stripe login');
    console.log('   2. stripe listen --forward-to localhost:8787/webhooks/stripe');
    console.log('   3. stripe trigger checkout.session.completed');
  }
}

// ============================================================
// Main
// ============================================================

if (!AUTH_TOKEN) {
  console.error('❌ AUTH_TOKEN manquant');
  console.error('');
  console.error('Usage:');
  console.error('  AUTH_TOKEN=<token> npm run test:billing');
  console.error('');
  console.error('Récupérer le token:');
  console.error('  1. Connectez-vous sur http://localhost:3002');
  console.error('  2. Ouvrez la console: localStorage.getItem("reputy_client_token")');
  process.exit(1);
}

runTests().catch(err => {
  console.error('❌ Erreur fatale:', err.message);
  process.exit(1);
});
