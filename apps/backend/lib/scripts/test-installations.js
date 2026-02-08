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

async function runTests() {
  console.log('='.repeat(60));
  console.log('INSTALLATIONS API TESTS');
  console.log('='.repeat(60));
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Auth: Bearer ${AUTH_TOKEN.substring(0, 8)}...`);
  console.log('');
  
  let createdId = null;
  let createdToken = null;
  let passed = 0;
  let failed = 0;
  
  // TEST 1: List
  console.log('📋 TEST 1: Lister les installations');
  const listRes = await request('GET', '/client/installations');
  console.log(`   Status: ${listRes.status}`);
  if (listRes.status === 200) {
    console.log(`   Count: ${listRes.data.installations?.length || 0}`);
    console.log('   ✅ PASS');
    passed++;
  } else {
    console.log(`   Error: ${listRes.data.message || listRes.data.error}`);
    console.log('   ❌ FAIL');
    failed++;
  }
  
  // TEST 2: Create
  console.log('\n📦 TEST 2: Créer une installation');
  const testLabel = 'Test-' + Date.now();
  const createRes = await request('POST', '/client/installations', { label: testLabel });
  console.log(`   Status: ${createRes.status}`);
  if (createRes.status === 201 && createRes.data.token) {
    createdId = createRes.data.installation?.id;
    createdToken = createRes.data.token;
    console.log(`   ID: ${createdId}`);
    console.log(`   Token: ${createdToken.substring(0, 12)}... (affiché 1 seule fois)`);
    console.log('   ✅ PASS');
    passed++;
  } else {
    console.log(`   Error: ${createRes.data.message || createRes.data.error}`);
    console.log('   ❌ FAIL');
    failed++;
  }
  
  // TEST 3: List again
  if (createdId) {
    console.log('\n📋 TEST 3: Vérifier la création dans la liste');
    const listRes2 = await request('GET', '/client/installations');
    const found = listRes2.data.installations?.find(i => i.id === createdId);
    if (found) {
      console.log(`   Trouvé: ${found.label}`);
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log('   Installation non trouvée dans la liste');
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 4: Rotate
  if (createdId) {
    console.log('\n🔄 TEST 4: Rotation du token');
    const rotateRes = await request('POST', `/client/installations/${createdId}/rotate`);
    console.log(`   Status: ${rotateRes.status}`);
    if (rotateRes.status === 200 && rotateRes.data.token) {
      const newToken = rotateRes.data.token;
      const changed = newToken !== createdToken;
      console.log(`   New Token: ${newToken.substring(0, 12)}...`);
      console.log(`   Token différent: ${changed ? 'OUI' : 'NON'}`);
      if (changed) {
        console.log('   ✅ PASS');
        passed++;
      } else {
        console.log('   ❌ FAIL (token identique)');
        failed++;
      }
    } else {
      console.log(`   Error: ${rotateRes.data.message}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 5: Revoke
  if (createdId) {
    console.log('\n🗑️  TEST 5: Révoquer l\'installation');
    const revokeRes = await request('POST', `/client/installations/${createdId}/revoke`);
    console.log(`   Status: ${revokeRes.status}`);
    if (revokeRes.status === 200) {
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log(`   Error: ${revokeRes.data.message}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 6: Rotate revoked (should fail)
  if (createdId) {
    console.log('\n❌ TEST 6: Rotation après révocation (doit échouer)');
    const rotateRevokedRes = await request('POST', `/client/installations/${createdId}/rotate`);
    console.log(`   Status: ${rotateRevokedRes.status}`);
    if (rotateRevokedRes.status === 409) {
      console.log('   ✅ PASS (correctement rejeté)');
      passed++;
    } else {
      console.log(`   Attendu 409, reçu ${rotateRevokedRes.status}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
  console.log('='.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Erreur test:', err);
  process.exit(1);
});
