/**
 * User Repository
 */

const db = require('../db');

// ============================================================
// Read Operations
// ============================================================

/**
 * Get user by ID
 * @param {string} id - User ID
 * @returns {object|null}
 */
function getById(id) {
  const row = db.get('SELECT * FROM users WHERE id = $id', { id });
  return row ? parseUserRow(row) : null;
}

/**
 * Get user by email
 * @param {string} email - Email address
 * @returns {object|null}
 */
function getByEmail(email) {
  const row = db.get('SELECT * FROM users WHERE email = $email', { email: email.toLowerCase() });
  return row ? parseUserRow(row) : null;
}

/**
 * Get users by organization
 * @param {string} orgId - Organization ID
 * @returns {array}
 */
function getByOrgId(orgId) {
  const rows = db.all('SELECT * FROM users WHERE org_id = $orgId ORDER BY created_at', { orgId });
  return rows.map(parseUserRow);
}

/**
 * Check if email exists
 * @param {string} email - Email to check
 * @returns {boolean}
 */
function emailExists(email) {
  const result = db.get(
    'SELECT 1 FROM users WHERE email = $email',
    { email: email.toLowerCase() }
  );
  return !!result;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Create a new user
 * @param {object} data - User data
 * @returns {object} Created user
 */
function create(data) {
  const id = data.id || db.generateId();
  const now = db.nowISO();
  
  db.run(`
    INSERT INTO users (
      id, org_id, email, password_hash, role, name,
      email_verified, last_login_at, created_at, updated_at
    ) VALUES (
      $id, $orgId, $email, $passwordHash, $role, $name,
      $emailVerified, $lastLoginAt, $createdAt, $updatedAt
    )
  `, {
    id,
    orgId: data.orgId,
    email: data.email.toLowerCase(),
    passwordHash: data.passwordHash,
    role: data.role || 'owner',
    name: data.name || null,
    emailVerified: data.emailVerified ? 1 : 0,
    lastLoginAt: data.lastLoginAt || null,
    createdAt: now,
    updatedAt: now
  });
  
  return getById(id);
}

/**
 * Update user
 * @param {string} id - User ID
 * @param {object} updates - Fields to update
 * @returns {object|null}
 */
function update(id, updates) {
  const user = getById(id);
  if (!user) return null;
  
  const fields = [];
  const params = { id };
  
  if (updates.email !== undefined) {
    fields.push('email = $email');
    params.email = updates.email.toLowerCase();
  }
  if (updates.passwordHash !== undefined) {
    fields.push('password_hash = $passwordHash');
    params.passwordHash = updates.passwordHash;
  }
  if (updates.role !== undefined) {
    fields.push('role = $role');
    params.role = updates.role;
  }
  if (updates.name !== undefined) {
    fields.push('name = $name');
    params.name = updates.name;
  }
  if (updates.emailVerified !== undefined) {
    fields.push('email_verified = $emailVerified');
    params.emailVerified = updates.emailVerified ? 1 : 0;
  }
  if (updates.lastLoginAt !== undefined) {
    fields.push('last_login_at = $lastLoginAt');
    params.lastLoginAt = updates.lastLoginAt;
  }
  
  if (fields.length === 0) return user;
  
  fields.push('updated_at = $updatedAt');
  params.updatedAt = db.nowISO();
  
  db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = $id`, params);
  
  return getById(id);
}

/**
 * Mark user email as verified
 * @param {string} id - User ID
 * @returns {object|null}
 */
function verifyEmail(id) {
  return update(id, { emailVerified: true });
}

/**
 * Update last login timestamp
 * @param {string} id - User ID
 * @returns {object|null}
 */
function updateLastLogin(id) {
  return update(id, { lastLoginAt: db.nowISO() });
}

/**
 * Delete user
 * @param {string} id - User ID
 * @returns {boolean}
 */
function deleteUser(id) {
  const result = db.run('DELETE FROM users WHERE id = $id', { id });
  return result.changes > 0;
}

// ============================================================
// Helper Functions
// ============================================================

function parseUserRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    name: row.name,
    emailVerified: row.email_verified === 1,
    mustChangePassword: row.must_change_password === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getById,
  getByEmail,
  getByOrgId,
  emailExists,
  create,
  update,
  verifyEmail,
  updateLastLogin,
  delete: deleteUser
};
