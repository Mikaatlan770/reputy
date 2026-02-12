/**
 * Organization Repository
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get organization by ID
 * @param {string} id - Organization ID
 * @returns {object|null} Organization with parsed JSON fields
 */
function getById(id) {
  const row = db.get('SELECT * FROM orgs WHERE id = $id', { id });
  return row ? parseOrgRow(row) : null;
}

/**
 * Get organization by public key
 * @param {string} publicKey - Public key (pub_xxx)
 * @returns {object|null} Organization with parsed JSON fields
 */
function getByPublicKey(publicKey) {
  const row = db.get('SELECT * FROM orgs WHERE public_key = $publicKey', { publicKey });
  return row ? parseOrgRow(row) : null;
}

/**
 * Get organization by API token hash
 * @param {string} tokenHash - SHA256 hash of the token
 * @returns {object|null} Organization with parsed JSON fields
 */
function getByApiTokenHash(tokenHash) {
  const row = db.get(`
    SELECT * FROM orgs 
    WHERE api_token_hash = $tokenHash 
       OR (api_token_previous_hash = $tokenHash 
           AND api_token_previous_expires_at > $now)
  `, { 
    tokenHash, 
    now: db.nowISO() 
  });
  return row ? parseOrgRow(row) : null;
}

/**
 * Get all organizations
 * @param {object} options - { status, vertical, limit, offset }
 * @returns {array} List of organizations
 */
function getAll(options = {}) {
  let sql = 'SELECT * FROM orgs WHERE 1=1';
  const params = {};
  
  if (options.status) {
    sql += ' AND status = $status';
    params.status = options.status;
  }
  if (options.vertical) {
    sql += ' AND vertical = $vertical';
    params.vertical = options.vertical;
  }
  
  sql += ' ORDER BY created_at DESC';
  
  if (options.limit) {
    sql += ' LIMIT $limit';
    params.limit = options.limit;
  }
  if (options.offset) {
    sql += ' OFFSET $offset';
    params.offset = options.offset;
  }
  
  const rows = db.all(sql, params);
  return rows.map(parseOrgRow);
}

/**
 * Count organizations
 * @param {object} options - { status, vertical }
 * @returns {number}
 */
function count(options = {}) {
  let sql = 'SELECT COUNT(*) as count FROM orgs WHERE 1=1';
  const params = {};
  
  if (options.status) {
    sql += ' AND status = $status';
    params.status = options.status;
  }
  if (options.vertical) {
    sql += ' AND vertical = $vertical';
    params.vertical = options.vertical;
  }
  
  const result = db.get(sql, params);
  return result?.count || 0;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new organization
 * @param {object} data - Organization data
 * @returns {object} Created organization
 */
function create(data) {
  const id = data.id || db.generateId();
  const publicKey = data.publicKey || generatePublicKey();
  const apiToken = data.apiToken || generateApiToken();
  const apiTokenHash = db.hashToken(apiToken);
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO orgs (
      id, public_key, name, email, vertical, status,
      api_token_hash, api_token_created_at,
      billing_json, plan_json, negotiated_json, options_json,
      quotas_json, balances_json, subscription_credits_json,
      created_at, updated_at
    ) VALUES (
      $id, $publicKey, $name, $email, $vertical, $status,
      $apiTokenHash, $apiTokenCreatedAt,
      $billingJson, $planJson, $negotiatedJson, $optionsJson,
      $quotasJson, $balancesJson, $subscriptionCreditsJson,
      $createdAt, $updatedAt
    )
  `, {
    id,
    publicKey,
    name: data.name || 'New Organization',
    email: data.email || null,
    vertical: data.vertical || 'health',
    status: data.status || 'active',
    apiTokenHash,
    apiTokenCreatedAt: now,
    billingJson: db.toJson(data.billing || getDefaultBilling()),
    planJson: db.toJson(data.plan || getDefaultPlan(data.vertical)),
    negotiatedJson: db.toJson(data.negotiated || {}),
    optionsJson: db.toJson(data.options || getDefaultOptions()),
    quotasJson: db.toJson(data.quotas || getDefaultQuotas()),
    balancesJson: db.toJson(data.balances || {}),
    subscriptionCreditsJson: db.toJson(data.subscriptionCredits || {}),
    createdAt: now,
    updatedAt: now
  });
  
  // Return created org (including plain token for initial display)
  const org = getById(id);
  org._plainApiToken = apiToken; // Only available on creation!
  return org;
}

/**
 * Update organization
 * @param {string} id - Organization ID
 * @param {object} updates - Fields to update
 * @returns {object|null} Updated organization
 */
function update(id, updates) {
  const org = getById(id);
  if (!org) return null;
  
  const now = db.nowISO();
  const fields = [];
  const params = { id };
  
  // Simple fields
  if (updates.name !== undefined) {
    fields.push('name = $name');
    params.name = updates.name;
  }
  if (updates.email !== undefined) {
    fields.push('email = $email');
    params.email = updates.email;
  }
  if (updates.vertical !== undefined) {
    fields.push('vertical = $vertical');
    params.vertical = updates.vertical;
  }
  if (updates.status !== undefined) {
    fields.push('status = $status');
    params.status = updates.status;
  }
  
  // JSON fields
  if (updates.billing !== undefined) {
    fields.push('billing_json = $billingJson');
    params.billingJson = db.toJson(updates.billing);
  }
  if (updates.plan !== undefined) {
    fields.push('plan_json = $planJson');
    params.planJson = db.toJson(updates.plan);
  }
  if (updates.negotiated !== undefined) {
    fields.push('negotiated_json = $negotiatedJson');
    params.negotiatedJson = db.toJson(updates.negotiated);
  }
  if (updates.options !== undefined) {
    fields.push('options_json = $optionsJson');
    params.optionsJson = db.toJson(updates.options);
  }
  if (updates.quotas !== undefined) {
    fields.push('quotas_json = $quotasJson');
    params.quotasJson = db.toJson(updates.quotas);
  }
  if (updates.balances !== undefined) {
    fields.push('balances_json = $balancesJson');
    params.balancesJson = db.toJson(updates.balances);
  }
  if (updates.subscriptionCredits !== undefined) {
    fields.push('subscription_credits_json = $subscriptionCreditsJson');
    params.subscriptionCreditsJson = db.toJson(updates.subscriptionCredits);
  }
  
  if (fields.length === 0) return org;
  
  fields.push('updated_at = $updatedAt');
  params.updatedAt = now;
  
  db.run(`UPDATE orgs SET ${fields.join(', ')} WHERE id = $id`, params);
  
  return getById(id);
}

/**
 * Update organization options (settings per org)
 * @param {string} id - Organization ID
 * @param {object} optionsUpdate - Partial options to merge
 * @returns {object|null} Updated organization
 */
function updateOptions(id, optionsUpdate) {
  const org = getById(id);
  if (!org) return null;
  
  const newOptions = { ...org.options, ...optionsUpdate };
  return update(id, { options: newOptions });
}

/**
 * Rotate API token
 * @param {string} id - Organization ID
 * @param {number} gracePeriodHours - Hours to keep old token valid (default 24)
 * @returns {object} { org, newToken }
 */
function rotateApiToken(id, gracePeriodHours = 24) {
  const org = getById(id);
  if (!org) throw new Error('Organization not found');
  
  const newToken = generateApiToken();
  const newTokenHash = db.hashToken(newToken);
  const now = db.nowISO();
  
  // Get current hash to set as previous
  const currentRow = db.get('SELECT api_token_hash FROM orgs WHERE id = $id', { id });
  
  // Calculate expiration for old token
  const expiresAt = new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000).toISOString();
  
  db.run(`
    UPDATE orgs SET
      api_token_hash = $newTokenHash,
      api_token_last_rotated_at = $now,
      api_token_previous_hash = $previousHash,
      api_token_previous_expires_at = $expiresAt,
      updated_at = $now
    WHERE id = $id
  `, {
    id,
    newTokenHash,
    now,
    previousHash: currentRow?.api_token_hash || null,
    expiresAt
  });
  
  return {
    org: getById(id),
    newToken // Plain token, only shown once!
  };
}

/**
 * Delete organization (will fail if has review_requests due to RESTRICT)
 * @param {string} id - Organization ID
 * @returns {boolean} Success
 */
function deleteOrg(id) {
  const result = db.run('DELETE FROM orgs WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

function parseOrgRow(row) {
  return {
    id: row.id,
    publicKey: row.public_key,
    name: row.name,
    email: row.email,
    vertical: row.vertical,
    status: row.status,
    // Token hashes for verification (SQLite mode)
    apiTokenHash: row.api_token_hash,
    apiTokenPreviousHash: row.api_token_previous_hash || null,
    apiTokenPreviousExpiresAt: row.api_token_previous_expires_at || null,
    apiTokenCreatedAt: row.api_token_created_at,
    apiTokenLastRotatedAt: row.api_token_last_rotated_at,
    billing: db.parseJson(row.billing_json),
    plan: db.parseJson(row.plan_json),
    negotiated: db.parseJson(row.negotiated_json),
    options: db.parseJson(row.options_json),
    quotas: db.parseJson(row.quotas_json),
    balances: db.parseJson(row.balances_json),
    subscriptionCredits: db.parseJson(row.subscription_credits_json),
    activatedAt: row.activated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function generatePublicKey() {
  const crypto = require('crypto');
  return 'pub_' + crypto.randomBytes(15).toString('base64url');
}

function generateApiToken() {
  const crypto = require('crypto');
  return 'rpt_' + crypto.randomBytes(32).toString('base64url');
}

function getDefaultBilling() {
  return {
    provider: 'none',
    status: 'active',
    startedAt: db.nowISO(),
    anchor: 'calendar_month'
  };
}

function getDefaultPlan(vertical = 'health') {
  return {
    code: `${vertical}_basic`,
    basePriceCents: 4900,
    currency: 'EUR',
    billingCycle: 'monthly'
  };
}

function getDefaultQuotas() {
  return {
    smsIncluded: 50,
    emailIncluded: 50,
    aiIncluded: 20
  };
}

function getDefaultOptions() {
  return {
    reviewRouting: true,
    routingThreshold: 4,
    googleReviewUrl: null,
    templates: {}
  };
}

// ============================================================
// Billing Operations
// ============================================================

/**
 * Patch billing fields (merge, not replace)
 * @param {string} id - Organization ID
 * @param {object} billingPatch - Partial billing fields to merge
 * @returns {object|null} Updated organization
 */
function patchBilling(id, billingPatch) {
  const org = getById(id);
  if (!org) return null;
  
  const newBilling = { ...org.billing, ...billingPatch };
  return update(id, { billing: newBilling });
}

/**
 * Assign a plan to organization (atomic update)
 * Updates plan code, price, quotas, and resets monthly credits
 * @param {string} id - Organization ID
 * @param {object} params
 * @param {string} params.planCode - New plan code
 * @param {number} params.priceCents - New price in cents
 * @param {object} params.quotas - New quotas
 * @param {object} [params.subscriptionCredits] - New subscription credits
 * @returns {object|null} Updated organization
 */
function assignPlan(id, { planCode, priceCents, quotas, subscriptionCredits }) {
  const org = getById(id);
  if (!org) return null;
  
  const updates = {};
  
  // Update plan
  updates.plan = {
    ...(org.plan || {}),
    code: planCode,
    basePriceCents: priceCents,
    currency: 'EUR',
    billingCycle: 'monthly',
  };
  
  // Update quotas
  if (quotas) {
    updates.quotas = {
      ...(org.quotas || {}),
      ...quotas,
    };
  }
  
  // Update subscription credits
  if (subscriptionCredits) {
    updates.subscriptionCredits = subscriptionCredits;
  }
  
  return update(id, updates);
}

/**
 * Update subscription credits (for period rollover)
 * @param {string} id - Organization ID
 * @param {object} subscriptionCredits - New subscription credits
 * @returns {object|null} Updated organization
 */
function updateSubscriptionCredits(id, subscriptionCredits) {
  return update(id, { subscriptionCredits });
}

// ============================================================
// Token Verification
// ============================================================

/**
 * Verify an API token and return the org
 * @param {string} token - Plain API token
 * @returns {object|null} Organization if valid, null otherwise
 */
function verifyApiToken(token) {
  if (!token) return null;
  
  const tokenHash = db.hashToken(token);
  return getByApiTokenHash(tokenHash);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  getByPublicKey,
  getByApiTokenHash,
  getAll,
  count,
  create,
  update,
  updateOptions,
  rotateApiToken,
  delete: deleteOrg,
  verifyApiToken,
  // Billing operations
  patchBilling,
  assignPlan,
  updateSubscriptionCredits,
  // Helpers exposed for testing
  generatePublicKey,
  generateApiToken
};
