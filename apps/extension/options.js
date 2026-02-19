/**
 * REPUTY - Options Page Script
 * Gère la configuration de l'extension
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settings-form');
  const backendUrlInput = document.getElementById('backend-url');
  const apiTokenInput = document.getElementById('api-token');
  const publicKeyInput = document.getElementById('public-key');
  const toggleTokenBtn = document.getElementById('toggle-token');
  const alertSuccess = document.getElementById('alert-success');
  const alertError = document.getElementById('alert-error');
  const errorMessage = document.getElementById('error-message');
  const connectionStatus = document.getElementById('connection-status');
  
  // Charger les paramètres existants (sync + local, clés héritées)
  loadSettings().then((items) => {
    backendUrlInput.value = items.backendUrl;
    apiTokenInput.value = items.apiToken;
    publicKeyInput.value = items.publicKey || '';
    checkConnection(items.backendUrl, items.publicKey);
  });
  
  // Toggle password visibility
  toggleTokenBtn.addEventListener('click', () => {
    const isPassword = apiTokenInput.type === 'password';
    apiTokenInput.type = isPassword ? 'text' : 'password';
    toggleTokenBtn.innerHTML = isPassword 
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });
  
  // Sauvegarder les paramètres
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let backendUrl = backendUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();
    let publicKey = publicKeyInput.value.trim();
    
    // Normaliser l'URL
    backendUrl = normalizeUrl(backendUrl);
    backendUrlInput.value = backendUrl;
    
    // Validation
    if (!backendUrl) {
      showError('Veuillez entrer l\'URL du backend.');
      return;
    }
    
    if (!apiToken) {
      showError('Veuillez entrer le token API de votre organisation.');
      return;
    }
    
    // Validation publicKey (OBLIGATOIRE pour l'auth per-org)
    if (!publicKey) {
      showError('La Public Key est requise pour identifier votre organisation.');
      return;
    }
    
    if (!publicKey.startsWith('pub_')) {
      showError('La Public Key doit commencer par "pub_".');
      return;
    }
    
    // Sauvegarder (sync + local pour éviter les divergences)
    const payload = { backendUrl, apiToken, publicKey };
    Promise.all([
      chrome.storage.sync.set(payload),
      chrome.storage.local.set(payload)
    ]).then(() => {
      hideAlerts();
      alertSuccess.classList.remove('hidden');
      
      // Vérifier la connexion
      checkConnection(backendUrl, publicKey);
      
      // Masquer après 3s
      setTimeout(() => {
        alertSuccess.classList.add('hidden');
      }, 3000);
    });
  });
  
  // Vérifier la connexion au backend et valider la publicKey
  async function checkConnection(url, publicKey) {
    if (!url) {
      updateConnectionStatus('unknown', 'Non configuré');
      return;
    }
    
    updateConnectionStatus('unknown', 'Vérification...');
    
    try {
      // Vérifier d'abord la connexion au serveur
      const healthResponse = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!healthResponse.ok) {
        updateConnectionStatus('disconnected', `Erreur HTTP ${healthResponse.status}`);
        return;
      }
      
      const healthData = await healthResponse.json();
      if (!healthData.ok) {
        updateConnectionStatus('disconnected', 'Réponse inattendue');
        return;
      }
      
      // Si publicKey fournie, vérifier qu'elle est valide
      if (publicKey && publicKey.startsWith('pub_')) {
        try {
          const orgResponse = await fetch(`${url}/public/org/by-key/${publicKey}`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });
          
          if (orgResponse.ok) {
            const orgData = await orgResponse.json();
            updateConnectionStatus('connected', `Connecté • ${orgData.name}`);
          } else if (orgResponse.status === 404) {
            updateConnectionStatus('disconnected', 'Public Key invalide');
          } else {
            updateConnectionStatus('connected', 'Connecté (clé non vérifiée)');
          }
        } catch (keyError) {
          console.warn('PublicKey check failed:', keyError);
          updateConnectionStatus('connected', 'Connecté (clé non vérifiée)');
        }
      } else {
        updateConnectionStatus('connected', 'Connecté au serveur');
      }
      
    } catch (error) {
      console.error('Connection check failed:', error);
      updateConnectionStatus('disconnected', 'Impossible de joindre le serveur');
    }
  }
  
  function updateConnectionStatus(status, text) {
    const dot = connectionStatus.querySelector('.status-dot');
    const label = connectionStatus.querySelector('span:last-child');
    
    dot.className = 'status-dot ' + status;
    label.textContent = text;
  }
  
  function showError(message) {
    hideAlerts();
    errorMessage.textContent = message;
    alertError.classList.remove('hidden');
  }
  
  function hideAlerts() {
    alertSuccess.classList.add('hidden');
    alertError.classList.add('hidden');
  }

  function firstNonEmpty(...values) {
    return values.find((v) => typeof v === 'string' && v.trim() !== '');
  }

  function normalizeUrl(url) {
    const DEFAULT_URL = 'https://api.reputyapp.com';
    if (!url) return DEFAULT_URL;
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    return url.replace(/\/+$/, '');
  }

  function loadSettings() {
    const keys = {
      backendUrl: null,
      apiToken: null,
      publicKey: null,
      apiBaseUrl: null,
      token: null
    };

    return Promise.all([
      new Promise((resolve) => chrome.storage.sync.get(keys, resolve)),
      new Promise((resolve) => chrome.storage.local.get(keys, resolve))
    ]).then(([syncData, localData]) => {
      const backendUrl = normalizeUrl(
        firstNonEmpty(
          syncData.backendUrl,
          syncData.apiBaseUrl,
          localData.backendUrl,
          localData.apiBaseUrl,
          'https://api.reputyapp.com'
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

      // Resynchroniser les clés normalisées pour éviter les écarts
      const payload = { backendUrl, apiToken, publicKey };
      chrome.storage.sync.set(payload);
      chrome.storage.local.set(payload);

      return { backendUrl, apiToken, publicKey };
    });
  }
});





