/**
 * Storage Bridge Module
 * 
 * Provides a unified interface for data access that can switch between:
 * - SQLite (USE_SQLITE=1) - recommended for production
 * - data.json (USE_SQLITE=0 or not set) - legacy fallback
 * 
 * This allows progressive migration without breaking existing code.
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

const USE_SQLITE = process.env.USE_SQLITE === '1'
  || process.env.REPUTY_STORAGE === 'sqlite';
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// SQLite modules (lazy loaded)
let db = null;
let repos = null;

if (USE_SQLITE) {
  db = require('./db');
  repos = require('./repositories');
  console.log('[STORAGE] Mode: SQLite');
} else {
  console.log('[STORAGE] Mode: data.json (legacy)');
}

// ============================================================
// Legacy JSON Functions (for backwards compatibility)
// ============================================================

/**
 * Load data from JSON file
 * @deprecated Use repositories directly when USE_SQLITE=1
 */
function loadDataFromJson() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[STORAGE] Error loading JSON:', err);
  }
  return getEmptyData();
}

/**
 * Save data to JSON file
 * @deprecated Use repositories directly when USE_SQLITE=1
 */
function saveDataToJson(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[STORAGE] Error saving JSON:', err);
  }
}

function getEmptyData() {
  return {
    requests: {},
    feedbacks: {},
    settings: {},
    orgs: [],
    users: [],
    sessions: [],
    emailVerifications: [],
    usageLedger: [],
    telemetry: [],
    emailOutbox: []
  };
}

// ============================================================
// Unified Data Loading (Bridge)
// ============================================================

/**
 * Load all data (bridge between JSON and SQLite)
 * 
 * When USE_SQLITE=1:
 * - Returns a compatible data structure built from SQLite
 * - Modifying this object does NOT auto-save (use repos instead)
 * 
 * When USE_SQLITE=0:
 * - Returns the full JSON data (legacy behavior)
 */
function loadData() {
  if (!USE_SQLITE) {
    return loadDataFromJson();
  }
  
  // Build compatible structure from SQLite
  return buildDataFromSqlite();
}

/**
 * Build a data.json-compatible structure from SQLite
 * This is a READ-ONLY snapshot for backwards compatibility
 */
function buildDataFromSqlite() {
  const data = getEmptyData();
  
  // Orgs
  data.orgs = repos.org.getAll().map(org => ({
    ...org,
    // Token hashes for SQLite verification (apiTokenHash, apiTokenPreviousHash, apiTokenPreviousExpiresAt already in org from repo)
    // Legacy field (cannot recover plain token from hash)
    apiToken: '[HASHED]',
    apiTokenPrevious: null, // Cannot recover from hash
    apiTokenCreatedAt: org.apiTokenCreatedAt,
    apiTokenLastRotatedAt: org.apiTokenLastRotatedAt,
    billing: org.billing,
    plan: org.plan,
    negotiated: org.negotiated,
    options: org.options,
    quotas: org.quotas,
    balances: org.balances,
    subscriptionCredits: org.subscriptionCredits
  }));
  
  // Users
  data.users = repos.user.getByOrgId ? [] : []; // Need to fetch all users
  const allOrgs = repos.org.getAll();
  for (const org of allOrgs) {
    const orgUsers = db.all(
      'SELECT * FROM users WHERE org_id = $orgId',
      { orgId: org.id }
    );
    for (const u of orgUsers) {
      data.users.push({
        id: u.id,
        orgId: u.org_id,
        email: u.email,
        passwordHash: u.password_hash,
        role: u.role,
        name: u.name,
        emailVerified: u.email_verified === 1,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        updatedAt: u.updated_at
      });
    }
  }
  
  // Sessions
  const sessions = db.all('SELECT * FROM sessions WHERE expires_at > $now', {
    now: new Date().toISOString()
  });
  data.sessions = sessions.map(s => ({
    token: s.token,
    userId: s.user_id,
    orgId: s.org_id,
    expiresAt: s.expires_at
  }));
  
  // Review Requests (as dict keyed by idempotencyKey for legacy compatibility)
  const requests = db.all('SELECT * FROM review_requests');
  data.requests = {};
  for (const r of requests) {
    data.requests[r.idempotency_key] = {
      id: r.idempotency_key, // Legacy uses idempotencyKey as id
      _dbId: r.id,
      orgId: r.org_id,
      channel: r.channel,
      status: r.status,
      patient: db.parseJson(r.patient_json),
      feedbackUrl: r.feedback_url,
      meta: db.parseJson(r.meta_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
  
  // Feedbacks (as dict keyed by request idempotencyKey)
  // Join with review_requests to get patient info and channel
  const feedbacks = db.all(`
    SELECT f.*, r.idempotency_key, r.channel, r.patient_json 
    FROM feedbacks f 
    JOIN review_requests r ON f.request_db_id = r.id
  `);
  data.feedbacks = {};
  for (const f of feedbacks) {
    const patient = db.parseJson(f.patient_json) || {};
    data.feedbacks[f.idempotency_key] = {
      id: f.id,
      requestId: f.idempotency_key,
      rating: f.rating,
      comment: f.comment,
      source: f.source,
      channel: f.channel,
      patient: patient,
      createdAt: f.created_at
    };
  }
  
  // Usage Ledger
  const ledger = db.all('SELECT * FROM usage_ledger ORDER BY created_at DESC');
  data.usageLedger = ledger.map(l => ({
    id: l.id,
    orgId: l.org_id,
    type: l.type,
    qty: l.qty,
    ...db.parseJson(l.details_json),
    createdAt: l.created_at
  }));
  
  // Telemetry
  const telemetry = db.all('SELECT * FROM telemetry_events ORDER BY created_at DESC LIMIT 1000');
  data.telemetry = telemetry.map(t => ({
    id: t.id,
    orgId: t.org_id,
    source: t.source,
    level: t.level,
    ...db.parseJson(t.data_json),
    createdAt: t.created_at
  }));
  
  // Email Verifications
  const verifications = db.all('SELECT * FROM email_verifications');
  data.emailVerifications = verifications.map(v => ({
    id: v.id,
    email: v.email,
    code: v.code,
    orgId: v.org_id,
    expiresAt: v.expires_at,
    createdAt: v.created_at
  }));
  
  // Settings (from first org or empty)
  if (data.orgs.length > 0) {
    const mainOrg = data.orgs[0];
    data.settings = {
      googleReviewUrl: mainOrg.options?.googleReviewUrl || '',
      cabinetName: mainOrg.options?.cabinetName || mainOrg.name,
      reviewRouting: mainOrg.options?.reviewRouting || { enabled: true, threshold: 4 }
    };
  }
  
  return data;
}

/**
 * Save data (bridge)
 * 
 * When USE_SQLITE=1:
 * - This is a NO-OP warning! Use repositories directly.
 * 
 * When USE_SQLITE=0:
 * - Saves to data.json (legacy behavior)
 */
function saveData(data) {
  if (!USE_SQLITE) {
    return saveDataToJson(data);
  }
  
  // SQLite mode: warn that this shouldn't be called
  console.warn('[STORAGE] saveData() called in SQLite mode - use repositories instead!');
  // We could sync back to SQLite here, but it's better to migrate handlers
}

// ============================================================
// Repository Access (for progressive migration)
// ============================================================

/**
 * Get the repositories object (only in SQLite mode)
 * @returns {object|null} Repositories or null if not using SQLite
 */
function getRepos() {
  return USE_SQLITE ? repos : null;
}

/**
 * Get the database instance (only in SQLite mode)
 * @returns {object|null} DB instance or null if not using SQLite
 */
function getDb() {
  return USE_SQLITE ? db : null;
}

/**
 * Check if using SQLite
 * @returns {boolean}
 */
function isUsingSqlite() {
  return USE_SQLITE;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Main bridge functions
  loadData,
  saveData,
  
  // Mode detection
  isUsingSqlite,
  USE_SQLITE,
  
  // Direct access (for progressive migration)
  getRepos,
  getDb,
  
  // Legacy (deprecated)
  loadDataFromJson,
  saveDataToJson
};
