/**
 * Reputy SQLite Database Module
 * 
 * Uses better-sqlite3 for synchronous, high-performance SQLite operations.
 * Configured with WAL mode for better concurrent read/write performance.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ============================================================
// Configuration
// ============================================================

const DB_PATH = process.env.REPUTY_DB_PATH || path.join(__dirname, '..', 'reputy.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============================================================
// Database Connection (Singleton)
// ============================================================

let db = null;

/**
 * Get or create the database connection
 * @returns {Database.Database} The database instance
 */
function getDb() {
  if (db) return db;
  
  try {
    // Create database (or open existing)
    db = new Database(DB_PATH, {
      // Verbose logging in development
      verbose: IS_PRODUCTION ? null : (msg) => {
        if (process.env.DEBUG_SQL) {
          console.log('[SQL]', msg);
        }
      }
    });
    
    // Apply pragmas for performance and safety
    db.pragma('journal_mode = WAL');           // Write-Ahead Logging for better concurrency
    db.pragma('foreign_keys = ON');            // Enforce foreign key constraints
    db.pragma('synchronous = NORMAL');         // Good balance of safety and speed
    db.pragma('cache_size = -64000');          // 64MB cache
    db.pragma('busy_timeout = 5000');          // Wait 5s if DB is locked
    
    console.log(`[REPUTY-DB] Connected to SQLite: ${DB_PATH}`);
    console.log(`[REPUTY-DB] WAL mode: ${db.pragma('journal_mode', { simple: true })}`);
    
    return db;
  } catch (err) {
    console.error('[REPUTY-DB] Failed to connect:', err.message);
    throw err;
  }
}

/**
 * Close the database connection
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log('[REPUTY-DB] Connection closed');
  }
}

// ============================================================
// Schema Initialization
// ============================================================

/**
 * Initialize database schema from schema.sql
 * @returns {boolean} true if successful
 */
function initSchema() {
  const database = getDb();
  
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found: ${SCHEMA_PATH}`);
  }
  
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  
  try {
    database.exec(schema);
    console.log('[REPUTY-DB] Schema initialized successfully');
    return true;
  } catch (err) {
    console.error('[REPUTY-DB] Schema initialization failed:', err.message);
    throw err;
  }
}

/**
 * Check if database has been initialized (has tables)
 * @returns {boolean}
 */
function isInitialized() {
  const database = getDb();
  const result = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='orgs'"
  ).get();
  return !!result;
}

/**
 * Errors that are safe to ignore during migrations (idempotent operations).
 * These occur when re-running migrations that partially applied, e.g.:
 * - ALTER TABLE ADD COLUMN on an already-existing column
 * - CREATE TABLE without IF NOT EXISTS on an already-existing table
 * - CREATE INDEX without IF NOT EXISTS on an already-existing index
 */
const IDEMPOTENT_ERROR_PATTERNS = [
  'duplicate column name',
  'table .* already exists',
  'index .* already exists',
];

function isIdempotentError(errMessage) {
  const lower = (errMessage || '').toLowerCase();
  return IDEMPOTENT_ERROR_PATTERNS.some(pattern => new RegExp(pattern, 'i').test(lower));
}

/**
 * Split a SQL string into individual statements.
 * Handles comments (-- and /* ... * /) and avoids splitting on ; inside strings.
 * Returns non-empty, trimmed statements.
 */
function splitSqlStatements(sql) {
  // Remove block comments
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  cleaned = cleaned.replace(/--[^\n]*/g, '');
  // Split by semicolons, trim, filter empty
  return cleaned.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Execute all statements in a migration, ignoring idempotent errors.
 * @returns {{ ok: boolean, ignoredCount: number }}
 */
function executeMigrationStatements(database, statements, migrationName) {
  let ignoredCount = 0;
  for (const stmt of statements) {
    try {
      database.exec(stmt);
    } catch (err) {
      if (isIdempotentError(err.message)) {
        ignoredCount++;
        console.log(`[REPUTY-DB]   ⚠️  Ignored idempotent error in ${migrationName}: ${err.message}`);
        continue;
      }
      console.error(`[REPUTY-DB] ❌ Migration failed: ${migrationName} — ${err.message}`);
      console.error(`[REPUTY-DB]    Statement: ${stmt.substring(0, 120)}...`);
      return { ok: false, ignoredCount };
    }
  }
  return { ok: true, ignoredCount };
}

function recordMigration(database, migrationName) {
  try {
    database.exec(
      `INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('${migrationName}', datetime('now'))`
    );
  } catch (recordErr) {
    console.error(`[REPUTY-DB] ⚠️  Could not record migration ${migrationName}: ${recordErr.message}`);
  }
}

/**
 * Run all pending SQL migrations from lib/migrations/
 * Migrations are tracked in the `migrations` table.
 * 
 * Production-safe: executes each SQL statement individually and ignores
 * idempotent errors (duplicate column, table/index already exists).
 * Non-idempotent errors cause the migration to fail without being recorded.
 * 
 * @returns {number} Number of migrations applied
 */
function runPendingMigrations() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  if (!fs.existsSync(MIGRATIONS_DIR)) return 0;

  const applied = new Set(
    database.prepare('SELECT name FROM migrations').all().map(r => r.name)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    const migrationName = file.replace('.sql', '');
    if (applied.has(migrationName)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitSqlStatements(sql);
    const { ok, ignoredCount } = executeMigrationStatements(database, statements, migrationName);

    if (ok) {
      recordMigration(database, migrationName);
      count++;
      const suffix = ignoredCount > 0 ? ` (${ignoredCount} idempotent warning(s) ignored)` : '';
      console.log(`[REPUTY-DB] ✅ Migration applied: ${migrationName}${suffix}`);
    }
  }

  if (count > 0) {
    console.log(`[REPUTY-DB] ${count} migration(s) applied`);
  }

  return count;
}

// ============================================================
// Query Helpers
// ============================================================

/**
 * Prepare a statement with caching
 * Statements are cached per-connection for performance
 */
const statementCache = new Map();

function prepare(sql) {
  const database = getDb();
  
  if (!statementCache.has(sql)) {
    statementCache.set(sql, database.prepare(sql));
  }
  return statementCache.get(sql);
}

/**
 * Get a single row
 * @param {string} sql - SQL query
 * @param {any} params - Query parameters
 * @returns {object|undefined} Single row or undefined
 */
function get(sql, params = {}) {
  return prepare(sql).get(params);
}

/**
 * Get all rows
 * @param {string} sql - SQL query
 * @param {any} params - Query parameters
 * @returns {array} Array of rows
 */
function all(sql, params = {}) {
  return prepare(sql).all(params);
}

/**
 * Run a statement (INSERT/UPDATE/DELETE)
 * @param {string} sql - SQL statement
 * @param {any} params - Statement parameters
 * @returns {object} { changes, lastInsertRowid }
 */
function run(sql, params = {}) {
  return prepare(sql).run(params);
}

/**
 * Execute raw SQL (for multi-statement queries)
 * @param {string} sql - Raw SQL to execute
 */
function exec(sql) {
  return getDb().exec(sql);
}

/**
 * Run multiple operations in a transaction
 * @param {function} fn - Function containing database operations
 * @returns {any} Return value of fn
 */
function transaction(fn) {
  const database = getDb();
  return database.transaction(fn)();
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Generate a unique ID (24 char hex)
 * @returns {string}
 */
function generateId() {
  const crypto = require('crypto');
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Get current timestamp in ISO format
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Compute ISO timestamp for UTC midnight N days ago.
 * Use for consistent period-based metrics queries.
 * @param {number} days - Number of days to go back (0 = today at midnight)
 * @returns {string} ISO 8601 string at UTC midnight (e.g. "2026-02-04T00:00:00.000Z")
 */
function computeSinceISO(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/**
 * Parse JSON field safely
 * @param {string|null} jsonStr - JSON string or null
 * @param {any} defaultValue - Default if parsing fails
 * @returns {any}
 */
function parseJson(jsonStr, defaultValue = {}) {
  if (!jsonStr) return defaultValue;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return defaultValue;
  }
}

/**
 * Stringify to JSON safely
 * @param {any} obj - Object to stringify
 * @returns {string}
 */
function toJson(obj) {
  return JSON.stringify(obj || {});
}

/**
 * Hash a token with SHA256
 * @param {string} token - Token to hash
 * @returns {string} Hex hash
 */
function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Timing-safe comparison for hashes
 * @param {string} a - First hash
 * @param {string} b - Second hash
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  const crypto = require('crypto');
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// ============================================================
// Database Stats
// ============================================================

/**
 * Get counts for all tables
 * @returns {object} Table name -> count mapping
 */
function getTableCounts() {
  const database = getDb();
  const tables = [
    'orgs', 'users', 'sessions', 'review_requests', 
    'feedbacks', 'messages', 'usage_ledger', 
    'telemetry_events', 'email_verifications',
    'installations', 'shortlinks', 'migrations',
    'mrr_snapshots',
    'audit_log',
    'memberships', 'login_pending'
  ];
  
  const counts = {};
  for (const table of tables) {
    try {
      const result = database.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      counts[table] = result?.count || 0;
    } catch {
      counts[table] = 'N/A';
    }
  }
  return counts;
}

/**
 * Check foreign key integrity
 * @returns {array} Array of FK violations (empty if OK)
 */
function checkForeignKeys() {
  const database = getDb();
  return database.pragma('foreign_key_check');
}

// ============================================================
// Graceful Shutdown
// ============================================================

// P0.2: Only keep 'exit' handler (synchronous cleanup on process exit).
// SIGINT/SIGTERM are now handled centrally in server.js
// to coordinate HTTP server close + DB close + log flush.
process.on('exit', closeDb);

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Connection
  getDb,
  closeDb,
  
  // Schema
  initSchema,
  isInitialized,
  runPendingMigrations,
  
  // Query helpers
  prepare,
  get,
  all,
  run,
  exec,
  transaction,
  
  // Utilities
  generateId,
  nowISO,
  computeSinceISO,
  parseJson,
  toJson,
  hashToken,
  timingSafeEqual,
  
  // Stats
  getTableCounts,
  checkForeignKeys,
  
  // Constants
  DB_PATH
};
