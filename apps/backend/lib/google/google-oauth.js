/**
 * Google OAuth 2.0 for Google Business Profile
 * 
 * Handles:
 * - Authorization URL generation
 * - Token exchange (authorization code → access + refresh tokens)
 * - Token refresh (using refresh token when access token expires)
 * - Token encryption/decryption (AES-256-GCM at rest)
 * 
 * Required env vars:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REDIRECT_URI (e.g. http://localhost:8787/client/google/callback)
 * - GOOGLE_ENCRYPTION_KEY (32-byte hex key for AES-256-GCM)
 */

const https = require('https');
const crypto = require('crypto');
const logger = require('../logger');

// ============================================================
// Configuration
// ============================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8787/google/oauth/callback';
const GOOGLE_ENCRYPTION_KEY = process.env.GOOGLE_ENCRYPTION_KEY || '';

// OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Scopes for Google Business Profile management
const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

// ============================================================
// Token Encryption (AES-256-GCM)
// ============================================================

/**
 * Encrypt a token for storage
 * @param {string} plaintext - Token to encrypt
 * @returns {string} Encrypted token (iv:authTag:ciphertext, hex-encoded)
 */
function encryptToken(plaintext) {
  if (!GOOGLE_ENCRYPTION_KEY) {
    // In development without key, store as-is (NOT for production)
    return `plain:${plaintext}`;
  }

  const key = Buffer.from(GOOGLE_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a stored token
 * @param {string} encrypted - Encrypted token string
 * @returns {string} Decrypted token
 */
function decryptToken(encrypted) {
  if (!encrypted) return null;

  // Handle plaintext tokens (development mode)
  if (encrypted.startsWith('plain:')) {
    return encrypted.slice(6);
  }

  if (!GOOGLE_ENCRYPTION_KEY) {
    throw new Error('GOOGLE_ENCRYPTION_KEY is required to decrypt tokens');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = Buffer.from(GOOGLE_ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// ============================================================
// HTTPS Request Helper
// ============================================================

/**
 * Make an HTTPS request and return parsed JSON
 * @param {string} url - Full URL
 * @param {object} options - { method, headers, body }
 * @returns {Promise<object>} Parsed JSON response
 */
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('error', reject);
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            const errMsg = json.error_description || json.error?.message || json.error?.status || (typeof json.error === 'string' ? json.error : null) || `HTTP ${res.statusCode}`;
            const err = new Error(`${errMsg} (HTTP ${res.statusCode})`);
            err.statusCode = res.statusCode;
            err.body = json;
            reject(err);
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// ============================================================
// OAuth Flow
// ============================================================

/**
 * Generate Google OAuth authorization URL
 * @param {string} orgId - Organization ID (passed in state for CSRF)
 * @returns {string} Authorization URL to redirect user to
 */
function getAuthUrl(orgId) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(16).toString('hex') + ':' + orgId;
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  });

  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state,
  };
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Google
 * @returns {Promise<object>} { accessToken, refreshToken, expiresIn, tokenType }
 */
async function exchangeCode(code) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString();

  const result = await httpsRequest(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresIn: result.expires_in,
    tokenType: result.token_type,
    scope: result.scope,
  };
}

/**
 * Refresh an access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<object>} { accessToken, expiresIn }
 */
async function refreshAccessToken(refreshToken) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  }).toString();

  const result = await httpsRequest(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return {
    accessToken: result.access_token,
    expiresIn: result.expires_in,
  };
}

// ============================================================
// Token Storage Helpers
// ============================================================

/**
 * Build google_oauth_json from tokens and account info
 * @param {object} params - { accessToken, refreshToken, expiresIn, accountId, locationId, locationName }
 * @returns {string} JSON string for storage
 */
function buildOAuthJson(params) {
  const now = new Date();
  const expiryDate = new Date(now.getTime() + (params.expiresIn || 3600) * 1000);

  return JSON.stringify({
    accessToken: encryptToken(params.accessToken),
    refreshToken: encryptToken(params.refreshToken),
    tokenExpiry: expiryDate.toISOString(),
    accountId: params.accountId || null,
    locationId: params.locationId || null,
    locationName: params.locationName || null,
    connectedAt: params.connectedAt || now.toISOString(),
    lastSyncAt: params.lastSyncAt || null,
    syncStatus: params.syncStatus || 'idle',
  });
}

/**
 * Parse stored google_oauth_json and decrypt tokens
 * @param {string} oauthJson - JSON string from database
 * @returns {object|null} Parsed object with decrypted tokens
 */
function parseOAuthJson(oauthJson) {
  if (!oauthJson) return null;

  try {
    const data = JSON.parse(oauthJson);
    return {
      accessToken: decryptToken(data.accessToken),
      refreshToken: decryptToken(data.refreshToken),
      tokenExpiry: data.tokenExpiry,
      accountId: data.accountId,
      locationId: data.locationId,
      locationName: data.locationName,
      connectedAt: data.connectedAt,
      lastSyncAt: data.lastSyncAt,
      syncStatus: data.syncStatus,
    };
  } catch (err) {
    logger.logError('GOOGLE_OAUTH_PARSE_ERROR', err.message);
    return null;
  }
}

/**
 * Check if an access token needs refreshing
 * @param {string} tokenExpiry - ISO 8601 expiry date
 * @returns {boolean} True if token is expired or expiring within 5 minutes
 */
function isTokenExpired(tokenExpiry) {
  if (!tokenExpiry) return true;
  const expiry = new Date(tokenExpiry);
  const now = new Date();
  // Refresh 5 minutes before expiry
  return now.getTime() >= expiry.getTime() - 5 * 60 * 1000;
}

/**
 * Check if Google OAuth is configured (env vars present)
 * @returns {boolean}
 */
function isConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // OAuth flow
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  
  // Token helpers
  encryptToken,
  decryptToken,
  buildOAuthJson,
  parseOAuthJson,
  isTokenExpired,
  
  // HTTP
  httpsRequest,
  
  // Config check
  isConfigured,
  
  // Constants
  SCOPES,
};
