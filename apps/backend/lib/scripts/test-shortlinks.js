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
    
    // Handle binary/image responses
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

async function runTests() {
  console.log('='.repeat(60));
  console.log('SHORTLINKS API TESTS (QR/NFC)');
  console.log('='.repeat(60));
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Auth: Bearer ${AUTH_TOKEN.substring(0, 8)}...`);
  console.log('');
  
  let createdCode = null;
  let passed = 0;
  let failed = 0;
  
  // TEST 1: List shortlinks
  console.log('📋 TEST 1: Lister les shortlinks');
  const listRes = await request('GET', '/client/shortlinks');
  console.log(`   Status: ${listRes.status}`);
  if (listRes.status === 200) {
    console.log(`   Count: ${listRes.data.shortlinks?.length || 0}`);
    console.log(`   Stats: QR=${listRes.data.stats?.totalQr || 0}, NFC=${listRes.data.stats?.totalNfc || 0}, Clicks=${listRes.data.stats?.totalClicks || 0}`);
    console.log('   ✅ PASS');
    passed++;
  } else {
    console.log(`   Error: ${listRes.data.message || listRes.data.error}`);
    console.log('   ❌ FAIL');
    failed++;
  }
  
  // TEST 2: Create QR shortlink
  console.log('\n📦 TEST 2: Créer un shortlink QR');
  const createRes = await request('POST', '/client/shortlinks', { 
    type: 'qr',
    label: 'Test QR - ' + Date.now(),
    targetUrl: 'https://www.google.com/maps/place/?q=test'
  });
  console.log(`   Status: ${createRes.status}`);
  if (createRes.status === 201 && createRes.data.shortlink) {
    createdCode = createRes.data.shortlink.code;
    console.log(`   Code: ${createdCode}`);
    console.log(`   Short URL: ${createRes.data.shortlink.shortUrl}`);
    console.log('   ✅ PASS');
    passed++;
  } else if (createRes.status === 402) {
    console.log(`   ⚠️ Quota QR atteint: ${createRes.data.message}`);
    console.log('   ⏭️ SKIP (quota)');
  } else {
    console.log(`   Error: ${createRes.data.message || createRes.data.error}`);
    console.log('   ❌ FAIL');
    failed++;
  }
  
  // TEST 3: Verify creation in list
  if (createdCode) {
    console.log('\n📋 TEST 3: Vérifier la création dans la liste');
    const listRes2 = await request('GET', '/client/shortlinks');
    const found = listRes2.data.shortlinks?.find(s => s.code === createdCode);
    if (found) {
      console.log(`   Trouvé: ${found.label}`);
      console.log(`   Clicks: ${found.clicks}`);
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log('   Shortlink non trouvé dans la liste');
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 4: Public redirect (GET /r/:code)
  if (createdCode) {
    console.log('\n🔗 TEST 4: Redirection publique /r/:code');
    try {
      // Don't follow redirects
      const res = await fetch(`${BACKEND_URL}/r/${createdCode}`, { 
        redirect: 'manual',
        headers: {} // No auth for public route
      });
      console.log(`   Status: ${res.status}`);
      const location = res.headers.get('location');
      console.log(`   Location: ${location || 'N/A'}`);
      if (res.status === 302 && location) {
        console.log('   ✅ PASS');
        passed++;
      } else {
        console.log('   ❌ FAIL (attendu 302 redirect)');
        failed++;
      }
    } catch (err) {
      console.log(`   Error: ${err.message}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 5: Verify click increment
  if (createdCode) {
    console.log('\n📊 TEST 5: Vérifier l\'incrémentation des clics');
    const listRes3 = await request('GET', '/client/shortlinks');
    const found = listRes3.data.shortlinks?.find(s => s.code === createdCode);
    if (found && found.clicks >= 1) {
      console.log(`   Clicks: ${found.clicks}`);
      console.log(`   Last clicked: ${found.lastClickedAt || 'N/A'}`);
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log(`   Clicks: ${found?.clicks || 0}`);
      console.log('   ❌ FAIL (clics non incrémentés)');
      failed++;
    }
  }
  
  // TEST 6: Get QR code PNG
  if (createdCode) {
    console.log('\n🖼️  TEST 6: Télécharger QR code (PNG)');
    const qrPngRes = await request('GET', `/client/shortlinks/${createdCode}/qr?format=png`);
    console.log(`   Status: ${qrPngRes.status}`);
    if (qrPngRes.status === 200 && qrPngRes.isImage) {
      console.log(`   Content-Type: ${qrPngRes.contentType}`);
      console.log(`   Size: ${qrPngRes.data.size} bytes`);
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log(`   Error: ${qrPngRes.data?.message || 'Unexpected response'}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 7: Get QR code SVG
  if (createdCode) {
    console.log('\n🖼️  TEST 7: Télécharger QR code (SVG)');
    const qrSvgRes = await request('GET', `/client/shortlinks/${createdCode}/qr?format=svg`);
    console.log(`   Status: ${qrSvgRes.status}`);
    if (qrSvgRes.status === 200 && qrSvgRes.isImage) {
      console.log(`   Content-Type: ${qrSvgRes.contentType}`);
      console.log(`   Size: ${qrSvgRes.data.size} bytes`);
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log(`   Error: ${qrSvgRes.data?.message || 'Unexpected response'}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 8: Invalid QR format
  if (createdCode) {
    console.log('\n❌ TEST 8: Format QR invalide (doit échouer)');
    const invalidRes = await request('GET', `/client/shortlinks/${createdCode}/qr?format=webp`);
    console.log(`   Status: ${invalidRes.status}`);
    if (invalidRes.status === 400) {
      console.log('   ✅ PASS (correctement rejeté)');
      passed++;
    } else {
      console.log(`   Attendu 400, reçu ${invalidRes.status}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 9: Delete shortlink
  if (createdCode) {
    console.log('\n🗑️  TEST 9: Supprimer le shortlink');
    const deleteRes = await request('DELETE', `/client/shortlinks/${createdCode}`);
    console.log(`   Status: ${deleteRes.status}`);
    if (deleteRes.status === 200) {
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log(`   Error: ${deleteRes.data.message}`);
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 10: Verify deletion
  if (createdCode) {
    console.log('\n📋 TEST 10: Vérifier la suppression');
    const listRes4 = await request('GET', '/client/shortlinks');
    const found = listRes4.data.shortlinks?.find(s => s.code === createdCode);
    if (!found) {
      console.log('   Shortlink non trouvé (comme attendu)');
      console.log('   ✅ PASS');
      passed++;
    } else {
      console.log('   Shortlink encore présent!');
      console.log('   ❌ FAIL');
      failed++;
    }
  }
  
  // TEST 11: Test quota consumption (create multiple)
  console.log('\n💰 TEST 11: Test consommation quota');
  console.log('   (Note: Bronze = 1 QR max)');
  
  // First, check current quota
  const initialList = await request('GET', '/client/shortlinks');
  const initialQrCount = initialList.data.stats?.totalQr || 0;
  console.log(`   QR existants: ${initialQrCount}`);
  
  // Try to create one more QR
  const quotaTestRes = await request('POST', '/client/shortlinks', {
    type: 'qr',
    label: 'Quota Test',
    targetUrl: 'https://test.com'
  });
  
  if (quotaTestRes.status === 201) {
    console.log('   Création réussie, quota pas encore atteint');
    // Clean up
    if (quotaTestRes.data.shortlink?.code) {
      await request('DELETE', `/client/shortlinks/${quotaTestRes.data.shortlink.code}`);
    }
    console.log('   ✅ PASS');
    passed++;
  } else if (quotaTestRes.status === 402) {
    console.log(`   Quota atteint: ${quotaTestRes.data.message}`);
    console.log(`   Action suggérée: ${quotaTestRes.data.action}`);
    console.log('   ✅ PASS (quota correctement vérifié)');
    passed++;
  } else {
    console.log(`   Status inattendu: ${quotaTestRes.status}`);
    console.log('   ❌ FAIL');
    failed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
  console.log('='.repeat(60));
  
  if (failed === 0) {
    console.log('✅ Tous les tests sont passés!');
  } else {
    console.log('⚠️ Certains tests ont échoué.');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Erreur test:', err);
  process.exit(1);
});
