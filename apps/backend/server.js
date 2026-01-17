// Backend Reputy - Extension Chrome Doctolib
// Endpoints :
//  - GET  /health                      -> statut du serveur
//  - POST /api/send-review-request     -> crée une demande d'avis
//  - GET  /r/:id                       -> page de notation patient
//  - POST /r/:id                       -> soumettre un feedback
//  - GET  /api/feedbacks               -> liste des feedbacks (admin)
//  - GET  /api/settings                -> récupérer les settings
//  - POST /api/settings                -> sauvegarder les settings
//
// Configuration via variables d'environnement :
//  - PORT                (défaut : 8787)
//  - CABINET_API_TOKEN   (token attendu par l'extension)
//  - REVIEWS_BASE_URL    (défaut : http://localhost:PORT)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomBytes, createHash } = require('crypto');

const PORT = process.env.PORT || 8787;
const CABINET_API_TOKEN = process.env.CABINET_API_TOKEN || 'dev-token';
const REVIEWS_BASE_URL = process.env.REVIEWS_BASE_URL || `http://127.0.0.1:${PORT}`;
const VERSION = '0.4.0';

// ============ ANTI-DOUBLON CONFIG ============
const DUPLICATE_WINDOW_HOURS = 24;        // Fenêtre anti-doublon (heures)
const REQUEST_EXPIRY_DAYS = 30;           // Expiration des requests (jours)
const MAX_SEND_COUNT = 3;                 // Nombre max de renvois autorisés

// Default settings (overridden by data.json)
const DEFAULT_SETTINGS = {
  googleReviewUrl: 'https://g.page/r/YOUR_GOOGLE_ID/review',
  cabinetName: 'Cabinet Médical'
};

const DATA_FILE = path.join(__dirname, 'data.json');

// ============ IDEMPOTENCY HELPERS ============
// NOTE: Pour migration future vers DB, créer un UNIQUE INDEX sur idempotencyKey

/**
 * Génère une clé d'idempotence basée sur les données métier
 * Format: sha256(channel|phone|email|appointmentDate|locationId)
 */
function generateIdempotencyKey(body) {
  const parts = [
    body.channel || '',
    (body.patientPhone || '').replace(/\D/g, ''),  // Normaliser téléphone
    (body.patientEmail || '').toLowerCase().trim(),
    body.appointmentDate || '',  // Date du RDV si disponible
    body.locationId || 'default'
  ];
  const raw = parts.join('|');
  return createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

/**
 * Cherche une request existante avec la même idempotencyKey
 * dans la fenêtre temporelle configurée
 */
function findDuplicateRequest(data, idempotencyKey) {
  const windowMs = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [id, req] of Object.entries(data.requests || {})) {
    if (req.idempotencyKey === idempotencyKey) {
      const createdAt = new Date(req.createdAt).getTime();
      if (now - createdAt < windowMs) {
        return { id, request: req };
      }
    }
  }
  return null;
}

/**
 * Vérifie si une request est expirée
 */
function isRequestExpired(request) {
  if (!request.createdAt) return false;
  const expiryMs = REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const createdAt = new Date(request.createdAt).getTime();
  return Date.now() - createdAt > expiryMs;
}

// ============ DATA LAYER ============

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Ensure settings exist with defaults
      if (!data.settings) {
        data.settings = { ...DEFAULT_SETTINGS };
      }
      return data;
    }
  } catch (err) {
    console.error('[REPUTY] Error loading data:', err);
  }
  return { requests: {}, feedbacks: {}, users: {}, sessions: {}, settings: { ...DEFAULT_SETTINGS } };
}

function getSettings() {
  const data = loadData();
  return {
    googleReviewUrl: data.settings?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl,
    cabinetName: data.settings?.cabinetName || DEFAULT_SETTINGS.cabinetName
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[REPUTY] Error saving data:', err);
  }
}

// ============ HTTP HELPERS ============

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(html);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    const MAX = 1024 * 1024; // 1MB

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        // Handle both JSON and form data
        if (req.headers['content-type']?.includes('application/json')) {
          resolve(body ? JSON.parse(body) : {});
        } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [key, value] of params) {
            obj[key] = value;
          }
          resolve(obj);
        } else {
          resolve(body ? JSON.parse(body) : {});
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function validateAuth(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return { ok: false, error: 'Token manquant' };
  }
  if (token !== CABINET_API_TOKEN) {
    return { ok: false, error: 'Token invalide' };
  }
  return { ok: true };
}

function validatePayload(body) {
  const { patientName, patientPhone, patientEmail, channel } = body || {};
  if (!patientName || !channel) {
    return 'Nom du patient ou canal manquant.';
  }
  if (channel === 'sms' && !patientPhone) {
    return 'Numéro de téléphone requis pour un SMS.';
  }
  if (channel === 'email' && !patientEmail) {
    return 'Email requis pour un envoi par email.';
  }
  return null;
}

// ============ PAGE HTML PATIENT ============

function generateRatingPage(requestId, request, existingFeedback, settings) {
  const patientName = request?.patient?.name || 'Patient';
  const patientFirstName = request?.patient?.firstName || '';
  const patientLastName = request?.patient?.lastName || '';
  // Afficher Prénom + Nom si disponibles, sinon fallback sur name
  const displayName = patientFirstName && patientLastName 
    ? `${patientFirstName} ${patientLastName}`
    : patientName;
  const firstName = patientFirstName || patientName.split(' ')[0]; // Pour le message de remerciement
  const CABINET_NAME = settings?.cabinetName || DEFAULT_SETTINGS.cabinetName;
  const GOOGLE_REVIEW_URL = settings?.googleReviewUrl || DEFAULT_SETTINGS.googleReviewUrl;
  
  // Si feedback déjà soumis
  if (existingFeedback) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merci ! - ${CABINET_NAME}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: #9ca3af;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #f3f4f6;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      border: 2px solid #111827;
    }
    .logo {
      width: 80px;
      margin: 0 auto 12px;
      text-align: center;
    }
    .logo svg {
      width: 60px;
      height: 60px;
    }
    .logo-text {
      display: block;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-weight: 500;
      font-size: 14px;
      color: #242c34;
      margin-top: 4px;
    }
    .slogan {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: 15px;
      color: #242c34;
      margin-bottom: 24px;
      letter-spacing: 0.3px;
    }
    h1 { font-size: 28px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    p { color: #1f2937; font-size: 16px; line-height: 1.6; }
    .rating-display {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin: 24px 0;
    }
    .star { font-size: 32px; }
    .star.filled { color: #fbbf24; }
    .star.empty { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="70 155 60 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" fill="#242c34"/>
      </svg>
      <span class="logo-text">health</span>
    </div>
    <p class="slogan">La réputation qui inspire confiance</p>
    <h1>Merci ${displayName} !</h1>
    <p>Votre avis a déjà été enregistré. Nous vous remercions pour votre retour.</p>
    <div class="rating-display">
      ${[1,2,3,4,5].map(i => `<span class="star ${i <= existingFeedback.rating ? 'filled' : 'empty'}">★</span>`).join('')}
    </div>
  </div>
</body>
</html>`;
  }

  // Page de notation
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Donnez votre avis - ${CABINET_NAME}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: #9ca3af;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #f3f4f6;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      border: 2px solid #111827;
    }
    .logo {
      width: 80px;
      margin: 0 auto 12px;
      text-align: center;
    }
    .logo svg {
      width: 60px;
      height: 60px;
    }
    .logo-text {
      display: block;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-weight: 500;
      font-size: 14px;
      color: #242c34;
      margin-top: 4px;
    }
    .slogan {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: 15px;
      color: #242c34;
      margin-bottom: 28px;
      letter-spacing: 0.3px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .cabinet-name {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 32px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .question {
      font-size: 16px;
      color: #1f2937;
      margin-bottom: 24px;
    }
    .stars {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .star {
      font-size: 48px;
      cursor: pointer;
      transition: all 0.2s ease;
      color: #e5e7eb;
      user-select: none;
    }
    .star:hover { transform: scale(1.15); }
    .star.active { color: #fbbf24; }
    .star.hover { color: #fcd34d; }
    .comment-section {
      display: none;
      margin-bottom: 24px;
    }
    .comment-section.visible { display: block; }
    .comment-section label {
      display: block;
      text-align: left;
      font-size: 14px;
      font-weight: 500;
      color: #1f2937;
      margin-bottom: 8px;
    }
    textarea {
      width: 100%;
      min-height: 100px;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      transition: border-color 0.2s;
    }
    textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .btn {
      display: none;
      width: 100%;
      padding: 16px 24px;
      border: none;
      border-radius: 12px;
      font-family: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn.visible { display: block; }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px -5px rgba(102, 126, 234, 0.4);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .btn-google {
      background: white;
      border: 2px solid #e5e7eb;
      color: #374151;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .btn-google:hover {
      border-color: #4285f4;
      background: #f8fafc;
    }
    .btn-google svg { width: 24px; height: 24px; }
    .success-message {
      display: none;
      padding: 16px;
      background: #ecfdf5;
      border-radius: 12px;
      color: #059669;
      font-weight: 500;
    }
    .success-message.visible { display: block; }
    .privacy {
      margin-top: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .loading { opacity: 0.7; pointer-events: none; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="logo">
      <svg viewBox="70 155 60 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" fill="#242c34"/>
      </svg>
      <span class="logo-text">health</span>
    </div>
    <p class="slogan">La réputation qui inspire confiance</p>
    <h1>Votre avis compte</h1>
    <p class="cabinet-name">${CABINET_NAME}</p>
    
    <p class="greeting">Bonjour ${displayName},</p>
    <p class="question">Comment s'est passée votre visite ?</p>
    
    <div class="stars" id="stars">
      <span class="star" data-value="1">★</span>
      <span class="star" data-value="2">★</span>
      <span class="star" data-value="3">★</span>
      <span class="star" data-value="4">★</span>
      <span class="star" data-value="5">★</span>
    </div>
    
    <div class="comment-section" id="commentSection">
      <label for="comment">Un commentaire ? (optionnel)</label>
      <textarea id="comment" placeholder="Partagez votre expérience..."></textarea>
    </div>
    
    <button class="btn btn-primary" id="submitBtn" onclick="submitFeedback()">
      Envoyer mon avis
    </button>
    
    <a href="${GOOGLE_REVIEW_URL}" target="_blank" class="btn btn-google" id="googleBtn" style="display:none;text-decoration:none;">
      <svg viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Laisser un avis sur Google
    </a>
    
    <div class="success-message" id="successMessage">
      ✓ Merci pour votre retour !
    </div>
    
    <p class="privacy">Vos données sont traitées de manière confidentielle.</p>
  </div>

  <script>
    const requestId = '${requestId}';
    const STORAGE_KEY = 'reputy_submitted_' + requestId;
    let selectedRating = 0;
    let isSubmitting = false;
    
    // Anti double-clic: vérifier si déjà soumis via localStorage
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      showAlreadySubmitted();
    }
    
    // Star rating
    const stars = document.querySelectorAll('.star');
    const commentSection = document.getElementById('commentSection');
    const submitBtn = document.getElementById('submitBtn');
    const googleBtn = document.getElementById('googleBtn');
    
    stars.forEach(star => {
      star.addEventListener('click', () => {
        if (isSubmitting) return;
        selectedRating = parseInt(star.dataset.value);
        updateStars();
        
        // Show comment section
        commentSection.classList.add('visible');
        
        // Show appropriate button
        if (selectedRating >= 4) {
          submitBtn.classList.remove('visible');
          googleBtn.style.display = 'flex';
          // Auto-submit for positive ratings
          submitFeedbackSilent();
        } else {
          submitBtn.classList.add('visible');
          googleBtn.style.display = 'none';
        }
      });
      
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value);
        stars.forEach((s, i) => {
          s.classList.toggle('hover', i < val);
        });
      });
      
      star.addEventListener('mouseleave', () => {
        stars.forEach(s => s.classList.remove('hover'));
      });
    });
    
    function updateStars() {
      stars.forEach((star, i) => {
        star.classList.toggle('active', i < selectedRating);
      });
    }
    
    function showAlreadySubmitted() {
      document.getElementById('stars').style.display = 'none';
      document.getElementById('commentSection').style.display = 'none';
      document.getElementById('submitBtn').style.display = 'none';
      document.querySelector('.question').style.display = 'none';
      const msg = document.getElementById('successMessage');
      msg.textContent = '✓ Merci, votre avis a déjà été enregistré.';
      msg.classList.add('visible');
      document.querySelector('.greeting').textContent = 'Merci !';
    }
    
    async function submitFeedbackSilent() {
      if (isSubmitting) return;
      isSubmitting = true;
      
      try {
        const comment = document.getElementById('comment').value;
        const response = await fetch('/r/${requestId}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: selectedRating, comment })
        });
        
        // Marquer comme soumis même si 409 (déjà fait)
        if (response.ok || response.status === 409) {
          localStorage.setItem(STORAGE_KEY, 'true');
        }
      } catch (e) {
        console.error('Silent submit error:', e);
      }
      
      isSubmitting = false;
    }
    
    async function submitFeedback() {
      if (isSubmitting) return;
      
      const card = document.getElementById('card');
      const comment = document.getElementById('comment').value;
      
      if (!selectedRating) {
        alert('Veuillez sélectionner une note');
        return;
      }
      
      isSubmitting = true;
      card.classList.add('loading');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi...';
      
      try {
        const response = await fetch('/r/${requestId}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: selectedRating, comment })
        });
        
        const result = await response.json();
        
        // Gérer le 409 Conflict (déjà soumis)
        if (response.status === 409) {
          localStorage.setItem(STORAGE_KEY, 'true');
          showAlreadySubmitted();
          card.classList.remove('loading');
          return;
        }
        
        if (result.success || result.ok) {
          localStorage.setItem(STORAGE_KEY, 'true');
          
          // Hide form elements
          document.getElementById('stars').style.display = 'none';
          commentSection.style.display = 'none';
          submitBtn.style.display = 'none';
          document.querySelector('.question').style.display = 'none';
          
          // Show success
          document.getElementById('successMessage').classList.add('visible');
          document.querySelector('.greeting').textContent = 'Merci ${firstName} !';
        } else {
          alert(result.error || 'Une erreur est survenue');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Envoyer mon avis';
          isSubmitting = false;
        }
      } catch (e) {
        console.error('Submit error:', e);
        alert('Erreur de connexion');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Envoyer mon avis';
        isSubmitting = false;
      }
      
      card.classList.remove('loading');
    }
  </script>
</body>
</html>`;
}

function generate404Page() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lien invalide</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }
    .icon {
      width: 72px;
      height: 72px;
      background: #fef2f2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 32px;
    }
    h1 { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    p { color: #6b7280; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔗</div>
    <h1>Lien invalide</h1>
    <p>Ce lien de feedback n'existe pas. Veuillez contacter le cabinet si vous pensez qu'il s'agit d'une erreur.</p>
  </div>
</body>
</html>`;
}

function generateExpiredPage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lien expiré</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }
    .icon {
      width: 72px;
      height: 72px;
      background: #fef3c7;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 32px;
    }
    h1 { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    p { color: #6b7280; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <h1>Lien expiré</h1>
    <p>Ce lien de feedback a expiré (validité ${REQUEST_EXPIRY_DAYS} jours). Veuillez contacter le cabinet pour recevoir un nouveau lien.</p>
  </div>
</body>
</html>`;
}

// ============ ROUTE HANDLERS ============

function handleHealth(res) {
  sendJson(res, 200, { ok: true, version: VERSION });
}

async function handleSendReview(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }

  const validationError = validatePayload(body);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }

  const data = loadData();
  const idempotencyKey = generateIdempotencyKey(body);
  
  // ============ ANTI-DOUBLON: Vérifier si request existe déjà ============
  const duplicate = findDuplicateRequest(data, idempotencyKey);
  
  if (duplicate) {
    const { id, request: existingRequest } = duplicate;
    
    // Incrémenter le compteur de renvoi (si inférieur au max)
    if ((existingRequest.sendCount || 1) < MAX_SEND_COUNT) {
      existingRequest.sendCount = (existingRequest.sendCount || 1) + 1;
      existingRequest.lastSentAt = new Date().toISOString();
      saveData(data);
      
      console.log('[REPUTY][API] Demande dupliquée (renvoi autorisé)', {
        requestId: id,
        sendCount: existingRequest.sendCount
      });
    }
    
    return sendJson(res, 200, {
      ok: true,
      requestId: id,
      feedbackUrl: existingRequest.feedbackUrl,
      duplicate: true,
      sendCount: existingRequest.sendCount || 1,
      reason: `Demande déjà créée il y a moins de ${DUPLICATE_WINDOW_HOURS}h`
    });
  }

  // ============ NOUVELLE REQUEST ============
  const requestId = randomBytes(12).toString('hex');
  const reviewUrl = `${REVIEWS_BASE_URL}/r/${requestId}`;
  const now = new Date().toISOString();

  data.requests[requestId] = {
    id: requestId,
    idempotencyKey,
    createdAt: now,
    lastSentAt: now,
    sendCount: 1,
    channel: body.channel,
    patient: {
      name: body.patientName,
      firstName: body.patientFirstName || '',
      lastName: body.patientLastName || '',
      email: body.patientEmail || '',
      phone: body.patientPhone || ''
    },
    feedbackUrl: reviewUrl,
    meta: {
      source: body.source || 'chrome-extension',
      pageUrl: body.pageUrl || '',
      appointmentDate: body.appointmentDate || '',
      locationId: body.locationId || ''
    }
  };
  saveData(data);

  console.log('[REPUTY][API] Nouvelle demande', {
    requestId,
    channel: body.channel,
    patientName: body.patientName,
    idempotencyKey: idempotencyKey.substring(0, 8) + '...'
  });

  return sendJson(res, 200, {
    ok: true,
    requestId,
    feedbackUrl: reviewUrl,
    duplicate: false
  });
}

function handleGetRatingPage(requestId, res) {
  const data = loadData();
  const request = data.requests[requestId];
  
  // Request inexistante
  if (!request) {
    return sendHtml(res, 404, generate404Page());
  }
  
  // Request expirée
  if (isRequestExpired(request)) {
    return sendHtml(res, 410, generateExpiredPage());
  }
  
  const existingFeedback = data.feedbacks[requestId];
  const settings = getSettings();
  return sendHtml(res, 200, generateRatingPage(requestId, request, existingFeedback, settings));
}

async function handleSubmitFeedback(requestId, req, res) {
  const data = loadData();
  const request = data.requests[requestId];
  
  // ============ VALIDATION: Request existe? ============
  if (!request) {
    return sendJson(res, 404, { ok: false, error: 'REQUEST_NOT_FOUND' });
  }
  
  // ============ VALIDATION: Request expirée? ============
  if (isRequestExpired(request)) {
    return sendJson(res, 410, { ok: false, error: 'REQUEST_EXPIRED' });
  }
  
  // ============ ANTI-DOUBLON: Feedback déjà soumis? (409 Conflict) ============
  if (data.feedbacks[requestId]) {
    console.log('[REPUTY][FEEDBACK] Tentative de double soumission bloquée', { requestId });
    return sendJson(res, 409, { ok: false, error: 'ALREADY_SUBMITTED' });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_BODY' });
  }
  
  const rating = parseInt(body.rating);
  if (!rating || rating < 1 || rating > 5) {
    return sendJson(res, 400, { ok: false, error: 'INVALID_RATING' });
  }
  
  // ============ ENREGISTRER LE FEEDBACK ============
  // NOTE: Pour migration DB, créer UNIQUE INDEX sur requestId dans feedbacks
  const now = new Date().toISOString();
  
  data.feedbacks[requestId] = {
    requestId,
    submittedAt: now,
    createdAt: now,  // Backward compat
    rating,
    comment: (body.comment || '').trim(),
    channel: request.channel,
    patient: request.patient,
    // Metadata anti-abus (optionnel)
    meta: {
      userAgent: req.headers['user-agent'] || '',
      // Note: Pour ipHash, utiliser req.connection.remoteAddress avec hash
    }
  };
  saveData(data);
  
  console.log('[REPUTY][FEEDBACK] Nouveau feedback', {
    requestId,
    rating,
    hasComment: !!body.comment
  });
  
  const settings = getSettings();
  return sendJson(res, 200, { 
    ok: true,
    success: true,  // Backward compat
    redirectToGoogle: rating >= 4,
    googleUrl: settings.googleReviewUrl
  });
}

function handleGetFeedbacks(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const data = loadData();
  const feedbacks = Object.values(data.feedbacks).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  return sendJson(res, 200, { feedbacks });
}

function handleGetSettings(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  const settings = getSettings();
  return sendJson(res, 200, settings);
}

async function handleSaveSettings(req, res) {
  const auth = validateAuth(req);
  if (!auth.ok) {
    return sendJson(res, 401, { error: auth.error });
  }
  
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: 'Corps JSON invalide' });
  }
  
  const data = loadData();
  
  // Update settings
  data.settings = {
    googleReviewUrl: (body.googleReviewUrl || '').trim() || DEFAULT_SETTINGS.googleReviewUrl,
    cabinetName: (body.cabinetName || '').trim() || DEFAULT_SETTINGS.cabinetName
  };
  
  saveData(data);
  
  console.log('[REPUTY][SETTINGS] Settings updated:', data.settings);
  
  return sendJson(res, 200, { success: true, settings: data.settings });
}

// ============ SERVER ============

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  if (method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  // Health check
  if (method === 'GET' && url === '/health') {
    return handleHealth(res);
  }

  // Send review request (from extension)
  if (method === 'POST' && url === '/api/send-review-request') {
    return handleSendReview(req, res);
  }

  // Get feedbacks list (admin)
  if (method === 'GET' && url === '/api/feedbacks') {
    return handleGetFeedbacks(req, res);
  }

  // Settings (admin)
  if (method === 'GET' && url === '/api/settings') {
    return handleGetSettings(req, res);
  }
  if (method === 'POST' && url === '/api/settings') {
    return handleSaveSettings(req, res);
  }

  // Rating page
  const ratingMatch = url.match(/^\/r\/([a-f0-9]+)$/);
  if (ratingMatch) {
    const requestId = ratingMatch[1];
    if (method === 'GET') {
      return handleGetRatingPage(requestId, res);
    }
    if (method === 'POST') {
      return handleSubmitFeedback(requestId, req, res);
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  const settings = getSettings();
  console.log(`[REPUTY][API] Serveur démarré sur http://localhost:${PORT} (version ${VERSION})`);
  console.log(`[REPUTY][API] Page de notation: ${REVIEWS_BASE_URL}/r/{id}`);
  console.log(`[REPUTY][API] Cabinet: ${settings.cabinetName}`);
  console.log(`[REPUTY][API] Google Review: ${settings.googleReviewUrl}`);
});
