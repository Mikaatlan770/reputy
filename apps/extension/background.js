/**
 * REPUTY - Background Service Worker
 * Gère la communication avec le backend
 * Version: 1.0.0
 */

const REPUTY_VERSION = '1.0.0';
console.log(`[REPUTY][BG] Service worker loaded v${REPUTY_VERSION}`);

// Configuration par défaut
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8787';

// ===== UTILITAIRES =====
function normalizeUrl(url) {
  if (!url) return DEFAULT_BACKEND_URL;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  // Supprimer le trailing slash
  return url.replace(/\/+$/, '');
}

function firstNonEmpty(...values) {
  return values.find((v) => typeof v === 'string' && v.trim() !== '');
}

async function getSettings() {
  const keys = {
    backendUrl: null,
    apiToken: null,
    apiBaseUrl: null,
    token: null
  };

  const [syncData, localData] = await Promise.all([
    new Promise((resolve) => chrome.storage.sync.get(keys, resolve)),
    new Promise((resolve) => chrome.storage.local.get(keys, resolve))
  ]);

  const backendUrl = normalizeUrl(
    firstNonEmpty(
      syncData.backendUrl,
      syncData.apiBaseUrl,
      localData.backendUrl,
      localData.apiBaseUrl,
      DEFAULT_BACKEND_URL
    )
  );

  const apiToken =
    firstNonEmpty(
      syncData.apiToken,
      syncData.token,
      localData.apiToken,
      localData.token,
      ''
    )?.trim() || '';

  // Normaliser et resynchroniser pour éviter les divergences futures
  chrome.storage.sync.set({ backendUrl, apiToken });
  chrome.storage.local.set({ backendUrl, apiToken });

  return { backendUrl, apiToken };
}

// ===== API CALLS =====
async function sendReviewRequest(payload) {
  const settings = await getSettings();
  const backendUrl = normalizeUrl(settings.backendUrl);
  const apiToken = settings.apiToken;
  
  if (!apiToken) {
    throw new Error('Token API non configuré. Allez dans les options de l\'extension.');
  }
  
  console.log('[REPUTY][BG] Sending review request:', { backendUrl, payload });
  
  // Essayer d'abord l'URL configurée, puis 127.0.0.1 si localhost échoue
  const urlsToTry = [backendUrl];
  if (backendUrl.includes('localhost')) {
    urlsToTry.push(backendUrl.replace('localhost', '127.0.0.1'));
  }
  
  let lastError;
  for (const url of urlsToTry) {
    try {
      const response = await fetch(`${url}/api/send-review-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await response.json();
            msg = j?.error || msg;
          } else {
            const t = await response.text();
            if (t) msg = t;
          }
        } catch (_) {}
        throw new Error(msg);
      }
      
      
      const data = await response.json();
      console.log('[REPUTY][BG] Response:', data);
      return data;
      
    } catch (error) {
      console.warn(`[REPUTY][BG] Fetch failed for ${url}:`, error);
      lastError = error;
    }
  }
  
  throw lastError || new Error('Impossible de contacter le backend');
}

// ===== MESSAGE HANDLER =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[REPUTY][BG] Message received:', message);
  
  if (message.type === 'SEND_REVIEW_REQUEST') {
    sendReviewRequest(message.payload)
      .then(data => {
        sendResponse({
          success: true,
          reviewUrl: data.reviewUrl,
          requestId: data.requestId
        });
      })
      .catch(error => {
        console.error('[REPUTY][BG] Error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Erreur inconnue'
        });
      });
    
    // Return true pour indiquer une réponse asynchrone
    return true;
  }
  
  if (message.type === 'GET_SETTINGS') {
    getSettings().then(settings => {
      sendResponse(settings);
    });
    return true;
  }
  
  if (message.type === 'PING') {
    sendResponse({ pong: true, version: REPUTY_VERSION });
    return true;
  }
  
});

// ===== INSTALLATION =====
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[REPUTY][BG] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Ouvrir la page d'options à la première installation
    chrome.runtime.openOptionsPage();
  }
});

// ===== ACTION CLICK =====
chrome.action.onClicked.addListener((tab) => {
  // Ouvrir les options quand on clique sur l'icône
  chrome.runtime.openOptionsPage();
});





