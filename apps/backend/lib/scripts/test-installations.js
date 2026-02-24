#!/usr/bin/env node
/**
 * Test script for Installations API
 * 
 * PRÉREQUIS:
 *   1. Backend démarré avec USE_SQLITE=1
 *   2. Se connecter via l'UI admin (localhost:3002)
 *   3. Ouvrir DevTools > Application > Local Storage
 *   4. Copier la valeur de "reputy_client_token" (c'est le token de SESSION)
 * 
 * Usage:
 *   AUTH_TOKEN=<session_token> node lib/scripts/test-installations.js
 * 
 * Note: AUTH_TOKEN = token de SESSION (pas token d'installation!)
 *       C'est le token créé au login, utilisé pour toutes les requêtes /client/*
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8787';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ AUTH_TOKEN requis (token de SESSION, pas d\'installation)');
  console.log('');
  console.log('Comment l\'obtenir:');
  console.log('  1. Démarrez le backend: USE_SQLITE=1 node server.js');
  console.log('  2. Connectez-vous sur http://localhost:3002');
  console.log('  3. Ouvrez DevTools (F12) > Application > Local Storage');
  console.log('  4. Copiez la valeur de "reputy_client_token"');
  console.log('');
  console.log('Usage:');
  console.log('  AUTH_TOKEN=<votre_session_token> node lib/scripts/test-installations.js');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json'
};

async function request(method, path, body = null) {
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, options);
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
}

// ============ TEST RESULT HELPERS ============

function tally(result, counters) {
  if (result.pass === true) counters.passed++;
  else if (result.pass === false) counters.failed++;
}

// ============ INDIVIDUAL TESTS ============

async function testListInstallations() {
  console.log('📋 TEST 1: Lister les installations');
  const res = await request('GET', '/client/installations');
  console.log(`   Status: ${res.status}`);
  if (res.status !== 200) {
    console.log(`   Error: ${res.data.message || res.data.error}`);
    console.log('   ❌ FAIL');
    return { pass: false };
  }
  console.log(`   Count: ${res.data.installations?.length || 0}`);
  console.log('   ✅ PASS');
  return { pass: true };
}

async function testCreateInstallation() {
  console.log('\n📦 TEST 2: Créer une installation');
  const testLabel = 'Test-' + Date.now();
  const res = await request('POST', '/client/installations', { label: testLabel });
  console.log(`   Status: ${res.status}`);
  if (res.status !== 201 || !res.data.token) {
    console.log(`   Error: ${res.data.message || res.data.error}`);
    console.log('   ❌ FAIL');
    return { pass: false, data: null };
  }
  const id = res.data.installation?.id;
  const token = res.data.token;
  console.log(`   ID: ${id}`);
  console.log(`   Token: ${token.substring(0, 12)}... (affiché 1 seule fois)`);
  console.log('   ✅ PASS');
  return { pass: true, data: { id, token } };
}

async function testVerifyCreation(createdId) {
  console.log('\n📋 TEST 3: Vérifier la création dans la liste');
  const res = await request('GET', '/client/installations');
  const found = res.data.installations?.find(i => i.id === createdId);
  if (found) {
    console.log(`   Trouvé: ${found.label}`);
    console.log('   ✅ PASS');
    return { pass: true };
  }
  console.log('   Installation non trouvée dans la liste');
  console.log('   ❌ FAIL');
  return { pass: false };
}

async function testRotateToken(createdId, createdToken) {
  console.log('\n🔄 TEST 4: Rotation du token');
  const res = await request('POST', `/client/installations/${createdId}/rotate`);
  console.log(`   Status: ${res.status}`);
  if (res.status !== 200 || !res.data.token) {
    console.log(`   Error: ${res.data.message}`);
    console.log('   ❌ FAIL');
    return { pass: false };
  }
  const newToken = res.data.token;
  const changed = newToken !== createdToken;
  console.log(`   New Token: ${newToken.substring(0, 12)}...`);
  console.log(`   Token différent: ${changed ? 'OUI' : 'NON'}`);
  if (!changed) {
    console.log('   ❌ FAIL (token identique)');
    return { pass: false };
  }
  console.log('   ✅ PASS');
  return { pass: true };
}

async function testRevokeInstallation(createdId) {
  console.log('\n🗑️  TEST 5: Révoquer l\'installation');
  const res = await request('POST', `/client/installations/${createdId}/revoke`);
  console.log(`   Status: ${res.status}`);
  if (res.status !== 200) {
    console.log(`   Error: ${res.data.message}`);
    console.log('   ❌ FAIL');
    return { pass: false };
  }
  console.log('   ✅ PASS');
  return { pass: true };
}

async function testRotateAfterRevoke(createdId) {
  console.log('\n❌ TEST 6: Rotation après révocation (doit échouer)');
  const res = await request('POST', `/client/installations/${createdId}/rotate`);
  console.log(`   Status: ${res.status}`);
  if (res.status === 409) {
    console.log('   ✅ PASS (correctement rejeté)');
    return { pass: true };
  }
  console.log(`   Attendu 409, reçu ${res.status}`);
  console.log('   ❌ FAIL');
  return { pass: false };
}

// ============ TEST GROUP ============

async function runCreatedInstallationTests(id, token, c) {
  tally(await testVerifyCreation(id), c);
  tally(await testRotateToken(id, token), c);
  tally(await testRevokeInstallation(id), c);
  tally(await testRotateAfterRevoke(id), c);
}

// ============ MAIN ============

async function runTests() {
  console.log('='.repeat(60));
  console.log('INSTALLATIONS API TESTS');
  console.log('='.repeat(60));
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Auth: Bearer ${AUTH_TOKEN.substring(0, 8)}...`);
  console.log('');
  
  const c = { passed: 0, failed: 0 };
  
  tally(await testListInstallations(), c);
  
  const createResult = await testCreateInstallation();
  tally(createResult, c);
  
  if (createResult.data) {
    await runCreatedInstallationTests(createResult.data.id, createResult.data.token, c);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`RÉSULTAT: ${c.passed} passés, ${c.failed} échoués`);
  console.log('='.repeat(60));
  
  process.exit(c.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Erreur test:', err);
  process.exit(1);
});
