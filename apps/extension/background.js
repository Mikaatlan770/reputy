/**
 * REPUTY - Background Service Worker
 * Gère la communication avec le backend
 * Version: 1.0.0
 */

const REPUTY_VERSION = '1.0.0';
console.log(`[REPUTY][BG] Service worker loaded v${REPUTY_VERSION}`);

// Configuration par défaut
const DEFAULT_BACKEND_URL = 'https://api.reputyapp.com';

// ===== UTILITAIRES =====

/**
 * Génère un UUID v4 pour l'idempotence
 */
function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function normalizeUrl(url) {
  if (!url) return DEFAULT_BACKEND_URL;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  while (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

function firstNonEmpty(...values) {
  return values.find((v) => typeof v === 'string' && v.trim() !== '');
}

async function getSettings() {
  const keys = {
    backendUrl: null,
    apiToken: null,
    publicKey: null,
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

  const publicKey =
    firstNonEmpty(
      syncData.publicKey,
      localData.publicKey,
      ''
    )?.trim() || '';

  // Normaliser et resynchroniser pour éviter les divergences futures
  chrome.storage.sync.set({ backendUrl, apiToken, publicKey });
  chrome.storage.local.set({ backendUrl, apiToken, publicKey });

  return { backendUrl, apiToken, publicKey };
}

// ===== API CALLS =====
async function sendReviewRequest(payload) {
  const settings = await getSettings();
  const backendUrl = normalizeUrl(settings.backendUrl);
  const apiToken = settings.apiToken;
  const publicKey = settings.publicKey;
  
  if (!apiToken) {
    throw new Error('Token API non configuré. Allez dans les options de l\'extension.');
  }
  
  // Générer un requestId unique pour l'idempotence
  const requestId = generateRequestId();
  const payloadWithRequestId = {
    ...payload,
    requestId // Ajout pour anti-doublon backend
  };
  
  console.log('[REPUTY][BG] Sending review request:', { 
    backendUrl, 
    publicKey: publicKey ? 'set' : 'not set', 
    requestId,
    payload: payloadWithRequestId 
  });
  
  // Essayer d'abord l'URL configurée, puis 127.0.0.1 si localhost échoue
  const urlsToTry = [backendUrl];
  if (backendUrl.includes('localhost')) {
    urlsToTry.push(backendUrl.replace('localhost', '127.0.0.1'));
  }
  
  // Construire les headers
  // P1.3: x-api-token et x-public-key sont maintenant OBLIGATOIRES pour l'auth per-org
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiToken}`,  // Backward compat
    'x-api-token': apiToken,                 // P1.3: Primary auth header
    'X-Request-Id': requestId                // Header pour traçabilité
  };
  
  // Ajouter x-public-key (OBLIGATOIRE pour identifier l'org)
  if (publicKey && publicKey.startsWith('pub_')) {
    headers['x-public-key'] = publicKey;
  } else {
    console.warn('[REPUTY][BG] ⚠️ Pas de publicKey configurée ! Les requêtes risquent d\'échouer en production.');
  }
  
  let lastError;
  for (const url of urlsToTry) {
    try {
      const response = await fetch(`${url}/api/send-review-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadWithRequestId)
      });
      
      // Traiter la réponse même en cas d'erreur HTTP (pour QUOTA_EXCEEDED)
      const ct = response.headers.get('content-type') || '';
      let data = {};
      
      if (ct.includes('application/json')) {
        data = await response.json();
      } else {
        const t = await response.text();
        data = { error: t || `HTTP ${response.status}` };
      }
      
      // Gérer SUBSCRIPTION_INACTIVE (403)
      if (response.status === 403 && data.error === 'SUBSCRIPTION_INACTIVE') {
        console.warn('[REPUTY][BG] SUBSCRIPTION_INACTIVE:', data);
        const error = new Error('SUBSCRIPTION_INACTIVE');
        error.subscriptionInactive = true;
        error.details = data.details || {};
        error.message = data.message || 'Abonnement inactif';
        throw error;
      }
      
      // Gérer QUOTA_EXCEEDED spécifiquement (402)
      if (response.status === 402 && data.error === 'QUOTA_EXCEEDED') {
        console.warn('[REPUTY][BG] QUOTA_EXCEEDED:', data);
        // Retourner une erreur structurée pour le content script
        const error = new Error('QUOTA_EXCEEDED');
        error.quotaExceeded = true;
        error.details = data.details || {};
        error.message = data.details?.renewalMessage || data.message || 'Crédits épuisés';
        throw error;
      }
      
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      
      console.log('[REPUTY][BG] Response:', data);
      return { ...data, requestId };
      
    } catch (error) {
      console.warn(`[REPUTY][BG] Fetch failed for ${url}:`, error);
      lastError = error;
      // Si c'est une erreur QUOTA_EXCEEDED, on ne réessaie pas
      if (error.quotaExceeded) break;
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
          requestId: data.requestId,
          deduped: data.deduped || false
        });
      })
      .catch(error => {
        console.error('[REPUTY][BG] Error:', error);
        
        // Erreur structurée pour SUBSCRIPTION_INACTIVE
        if (error.subscriptionInactive) {
          sendResponse({
            success: false,
            error: 'SUBSCRIPTION_INACTIVE',
            subscriptionInactive: true,
            details: error.details || {},
            message: error.message
          });
        }
        // Erreur structurée pour QUOTA_EXCEEDED
        else if (error.quotaExceeded) {
          sendResponse({
            success: false,
            error: 'QUOTA_EXCEEDED',
            quotaExceeded: true,
            details: error.details || {},
            message: error.message
          });
        } else {
          sendResponse({
            success: false,
            error: error.message || 'Erreur inconnue'
          });
        }
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





