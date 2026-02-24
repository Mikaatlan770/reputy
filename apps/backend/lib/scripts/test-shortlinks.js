#!/usr/bin/env node
/**
 * Test script for Shortlinks API (QR/NFC)
 * 
 * PRÉREQUIS:
 *   1. Backend démarré avec USE_SQLITE=1
 *   2. Se connecter via l'UI admin (localhost:3002)
 *   3. Ouvrir DevTools > Application > Local Storage
 *   4. Copier la valeur de "reputy_client_token" (c'est le token de SESSION)
 * 
 * Usage:
 *   AUTH_TOKEN=<session_token> node lib/scripts/test-shortlinks.js
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
  console.log('  AUTH_TOKEN=<votre_session_token> node lib/scripts/test-shortlinks.js');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json'
};

async function request(method, path, body = null, customHeaders = null) {
  const reqHeaders = customHeaders || headers;
  const options = { method, headers: reqHeaders };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, options);
    const contentType = res.headers.get('content-type') || '';
    
    if (contentType.includes('image/')) {
      const buffer = await res.arrayBuffer();
      return { 
        status: res.status, 
        contentType,
        data: { size: buffer.byteLength },
        isImage: true
      };
    }
    
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

async function testListShortlinks() {
  console.log('📋 TEST 1: Lister les shortlinks');
  const res = await request('GET', '/client/shortlinks');
  console.log(`   Status: ${res.status}`);
  if (res.status !== 200) {
    console.log(`   Error: ${res.data.message || res.data.error}`);
    console.log('   ❌ FAIL');
    return { pass: false };
  }
  console.log(`   Count: ${res.data.shortlinks?.length || 0}`);
  console.log(`   Stats: QR=${res.data.stats?.totalQr || 0}, NFC=${res.data.stats?.totalNfc || 0}, Clicks=${res.data.stats?.totalClicks || 0}`);
  console.log('   ✅ PASS');
  return { pass: true };
}

async function testCreateQrShortlink() {
  console.log('\n📦 TEST 2: Créer un shortlink QR');
  const res = await request('POST', '/client/shortlinks', { 
    type: 'qr',
    label: 'Test QR - ' + Date.now(),
    targetUrl: 'https://www.google.com/maps/place/?q=test'
  });
  console.log(`   Status: ${res.status}`);
  if (res.status === 201 && res.data.shortlink) {
    console.log(`   Code: ${res.data.shortlink.code}`);
    console.log(`   Short URL: ${res.data.shortlink.shortUrl}`);
    console.log('   ✅ PASS');
    return { pass: true, data: res.data.shortlink.code };
  }
  if (res.status === 402) {
    console.log(`   ⚠️ Quota QR atteint: ${res.data.message}`);
    console.log('   ⏭️ SKIP (quota)');
    return { pass: null, data: null };
  }
  console.log(`   Error: ${res.data.message || res.data.error}`);
  console.log('   ❌ FAIL');
  return { pass: false, data: null };
}

async function testVerifyCreation(code) {
  console.log('\n📋 TEST 3: Vérifier la création dans la liste');
  const res = await request('GET', '/client/shortlinks');
  const found = res.data.shortlinks?.find(s => s.code === code);
  if (found) {
    console.log(`   Trouvé: ${found.label}`);
    console.log(`   Clicks: ${found.clicks}`);
    console.log('   ✅ PASS');
    return { pass: true };
  }
  console.log('   Shortlink non trouvé dans la liste');
  console.log('   ❌ FAIL');
  return { pass: false };
}

async function testPublicRedirect(code) {
  console.log('\n🔗 TEST 4: Redirection publique /r/:code');
  try {
    const res = await fetch(`${BACKEND_URL}/r/${code}`, { 
      redirect: 'manual',
      headers: {}
    });
    console.log(`   Status: ${res.status}`);
    const location = res.headers.get('location');
    console.log(`   Location: ${location || 'N/A'}`);
    if (res.status === 302 && location) {
      console.log('   ✅ PASS');
      return { pass: true };
    }
    console.log('   ❌ FAIL (attendu 302 redirect)');
    return { pass: false };
  } catch (err) {
    console.log(`   Error: ${err.message}`);
    console.log('   ❌ FAIL');
    return { pass: false };
  }
}

async function testVerifyClicks(code) {
  console.log('\n📊 TEST 5: Vérifier l\'incrémentation des clics');
  const res = await request('GET', '/client/shortlinks');
  const found = res.data.shortlinks?.find(s => s.code === code);
  if (found && found.clicks >= 1) {
    console.log(`   Clicks: ${found.clicks}`);
    console.log(`   Last clicked: ${found.lastClickedAt || 'N/A'}`);
    console.log('   ✅ PASS');
    return { pass: true };
  }
  console.log(`   Clicks: ${found?.clicks || 0}`);
  console.log('   ❌ FAIL (clics non incrémentés)');
  return { pass: false };
}

async function testQrCodeFormat(code, format, testNum) {
  const label = format.toUpperCase();
  console.log(`\n🖼️  TEST ${testNum}: Télécharger QR code (${label})`);
  const res = await request('GET', `/client/shortlinks/${code}/qr?format=${format}`);
  console.log(`   Status: ${res.status}`);
  if (res.status === 200 && res.isImage) {
    console.log(`   Content-Type: ${res.contentType}`);
    console.log(`   Size: ${res.data.size} bytes`);
    console.log('   ✅ PASS');
    return { pass: true };
  }
  console.log(`   Error: ${res.data?.message || 'Unexpected response'}`);
  console.log('   ❌ FAIL');
  return { pass: false };
}

async function testInvalidQrFormat(code) {
  console.log('\n❌ TEST 8: Format QR invalide (doit échouer)');
  const res = await request('GET', `/client/shortlinks/${code}/qr?format=webp`);
  console.log(`   Status: ${res.status}`);
  if (res.status === 400) {
    console.log('   ✅ PASS (correctement rejeté)');
    return { pass: true };
  }
  console.log(`   Attendu 400, reçu ${res.status}`);
  console.log('   ❌ FAIL');
  return { pass: false };
}

async function testDeleteShortlink(code) {
  console.log('\n🗑️  TEST 9: Supprimer le shortlink');
  const res = await request('DELETE', `/client/shortlinks/${code}`);
  console.log(`   Status: ${res.status}`);
  if (res.status === 200) {
    console.log('   ✅ PASS');
    return { pass: true };
  }
  console.log(`   Error: ${res.data.message}`);
  console.log('   ❌ FAIL');
  return { pass: false };
}

async function testVerifyDeletion(code) {
  console.log('\n📋 TEST 10: Vérifier la suppression');
  const res = await request('GET', '/client/shortlinks');
  const found = res.data.shortlinks?.find(s => s.code === code);
  if (!found) {
    console.log('   Shortlink non trouvé (comme attendu)');
    console.log('   ✅ PASS');
    return { pass: true };
  }
  console.log('   Shortlink encore présent!');
  console.log('   ❌ FAIL');
  return { pass: false };
}

async function testQuotaConsumption() {
  console.log('\n💰 TEST 11: Test consommation quota');
  console.log('   (Note: Bronze = 1 QR max)');
  
  const initialList = await request('GET', '/client/shortlinks');
  const initialQrCount = initialList.data.stats?.totalQr || 0;
  console.log(`   QR existants: ${initialQrCount}`);
  
  const res = await request('POST', '/client/shortlinks', {
    type: 'qr', label: 'Quota Test', targetUrl: 'https://test.com'
  });
  
  if (res.status === 201) {
    console.log('   Création réussie, quota pas encore atteint');
    if (res.data.shortlink?.code) {
      await request('DELETE', `/client/shortlinks/${res.data.shortlink.code}`);
    }
    console.log('   ✅ PASS');
    return { pass: true };
  }
  if (res.status === 402) {
    console.log(`   Quota atteint: ${res.data.message}`);
    console.log(`   Action suggérée: ${res.data.action}`);
    console.log('   ✅ PASS (quota correctement vérifié)');
    return { pass: true };
  }
  console.log(`   Status inattendu: ${res.status}`);
  console.log('   ❌ FAIL');
  return { pass: false };
}

// ============ TEST GROUPS ============

async function runCreatedCodeTests(code, c) {
  tally(await testVerifyCreation(code), c);
  tally(await testPublicRedirect(code), c);
  tally(await testVerifyClicks(code), c);
  tally(await testQrCodeFormat(code, 'png', 6), c);
  tally(await testQrCodeFormat(code, 'svg', 7), c);
  tally(await testInvalidQrFormat(code), c);
  tally(await testDeleteShortlink(code), c);
  tally(await testVerifyDeletion(code), c);
}

// ============ MAIN ============

async function runTests() {
  console.log('='.repeat(60));
  console.log('SHORTLINKS API TESTS (QR/NFC)');
  console.log('='.repeat(60));
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Auth: Bearer ${AUTH_TOKEN.substring(0, 8)}...`);
  console.log('');
  
  const c = { passed: 0, failed: 0 };
  
  tally(await testListShortlinks(), c);
  
  const createResult = await testCreateQrShortlink();
  tally(createResult, c);
  
  if (createResult.data) {
    await runCreatedCodeTests(createResult.data, c);
  }
  
  tally(await testQuotaConsumption(), c);
  
  console.log('\n' + '='.repeat(60));
  console.log(`RÉSULTAT: ${c.passed} passés, ${c.failed} échoués`);
  console.log('='.repeat(60));
  
  if (c.failed === 0) {
    console.log('✅ Tous les tests sont passés!');
  } else {
    console.log('⚠️ Certains tests ont échoué.');
  }
  
  process.exit(c.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Erreur test:', err);
  process.exit(1);
});
