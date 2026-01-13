// Backend minimal pour l’extension Chrome
// Endpoints :
//  - GET  /health                      -> statut du serveur
//  - POST /api/send-review-request     -> crée une demande d'avis (mock)
//
// Configuration via variables d'environnement :
//  - PORT                (défaut : 8787)
//  - CABINET_API_TOKEN   (token attendu par l'extension)
//  - REVIEWS_BASE_URL    (défaut : http://localhost:PORT)

const http = require('http');
const { randomBytes } = require('crypto');

const PORT = process.env.PORT || 8787;
const CABINET_API_TOKEN = process.env.CABINET_API_TOKEN || 'dev-token';
const REVIEWS_BASE_URL =
process.env.REVIEWS_BASE_URL || `http://127.0.0.1:${PORT}`;
const VERSION = '0.1.0';

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
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
        resolve(body ? JSON.parse(body) : {});
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

  const requestId = randomBytes(12).toString('hex');
  const reviewUrl = `${REVIEWS_BASE_URL}/r/${requestId}`;

  console.log('[REPUTY][API] Nouvelle demande', {
    requestId,
    channel: body.channel,
    patientName: body.patientName,
    patientPhone: body.patientPhone,
    patientEmail: body.patientEmail
  });

  // Mock : ici on brancherait SMS provider / nodemailer
  return sendJson(res, 200, { reviewUrl, requestId });
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (method === 'GET' && url === '/health') {
    return handleHealth(res);
  }

  if (method === 'POST' && url === '/api/send-review-request') {
    return handleSendReview(req, res);
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(
    `[REPUTY][API] Serveur démarré sur http://localhost:${PORT} console.log(`[REPUTY][API] Serveur démarré sur http://localhost:${PORT} (version ${VERSION})`);

  );
});

