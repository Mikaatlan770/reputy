#!/usr/bin/env node
/**
 * Database Migration Script v2
 * 
 * Applies incremental migrations to existing databases.
 * Safe to run multiple times (idempotent).
 * 
 * Usage: npm run db:migrate-v2
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

console.log('='.repeat(60));
console.log('REPUTY DATABASE MIGRATIONS v2');
console.log('='.repeat(60));

/**
 * Get list of migration files sorted by name
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`\nNo migrations directory found at ${MIGRATIONS_DIR}`);
    return [];
  }
  
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  return files;
}

/**
 * Get already applied migrations from DB
 */
function getAppliedMigrations() {
  try {
    const rows = db.all('SELECT name FROM migrations ORDER BY applied_at');
    return rows.map(r => r.name);
  } catch (err) {
    // migrations table might not exist yet
    return [];
  }
}

/**
 * Apply a single migration
 */
function applyMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');
  const migrationName = filename.replace('.sql', '');
  
  console.log(`\n📦 Applying: ${filename}`);
  
  try {
    // If migration contains ALTER TABLE, execute statement by statement
    // to handle "duplicate column name" errors gracefully (ALTER TABLE
    // ADD COLUMN is NOT idempotent in SQLite, unlike CREATE TABLE IF NOT EXISTS).
    if (sql.includes('ALTER TABLE')) {
      executeWithAlterTolerance(sql);
    } else {
      db.exec(sql);
    }
    
    // Record migration as applied
    recordMigration(migrationName);
    
    console.log(`   ✓ Migration applied successfully`);
    return true;
  } catch (err) {
    console.error(`   ❌ Migration failed: ${err.message}`);
    return false;
  }
}

/**
 * Execute SQL statements individually, tolerating "duplicate column name"
 * errors from ALTER TABLE ADD COLUMN (which is not idempotent in SQLite).
 */
function executeWithAlterTolerance(sql) {
  // Split on semicolons, filtering out empty/comment-only fragments
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      // Remove lines that are only comments or whitespace
      const meaningful = s.split('\n').filter(l => {
        const trimmed = l.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      });
      return meaningful.length > 0;
    });
  
  for (const stmt of statements) {
    try {
      db.exec(stmt + ';');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        const col = stmt.match(/ADD COLUMN\s+(\w+)/i);
        console.log(`   ⏭  Skipped (column already exists): ${col ? col[1] : '?'}`);
      } else {
        throw err; // Re-throw non-duplicate errors
      }
    }
  }
}

/**
 * Record a migration as applied in the migrations table
 */
function recordMigration(name) {
  const database = db.getDb();
  database.prepare(
    'INSERT OR IGNORE INTO migrations (name, applied_at) VALUES (?, ?)'
  ).run(name, new Date().toISOString());
}

/**
 * Main migration runner
 */
function runMigrations() {
  console.log(`\nDatabase: ${db.DB_PATH}`);
  
  // Check if DB is initialized
  if (!db.isInitialized()) {
    console.log('\n⚠️  Database not initialized. Run "npm run db:init" first.');
    console.log('   Or run migrations anyway to create tables...\n');
  }
  
  // Get migration files
  const migrationFiles = getMigrationFiles();
  console.log(`\nFound ${migrationFiles.length} migration file(s)`);
  
  if (migrationFiles.length === 0) {
    console.log('No migrations to apply.');
    return;
  }
  
  // Get already applied migrations
  const appliedMigrations = getAppliedMigrations();
  console.log(`Already applied: ${appliedMigrations.length}`);
  
  // Filter pending migrations
  const pendingMigrations = migrationFiles.filter(f => {
    const name = f.replace('.sql', '');
    return !appliedMigrations.includes(name);
  });
  
  if (pendingMigrations.length === 0) {
    console.log('\n✅ All migrations already applied. Database is up to date.');
    return;
  }
  
  console.log(`\nPending migrations: ${pendingMigrations.length}`);
  
  // Apply pending migrations
  let applied = 0;
  let failed = 0;
  
  for (const file of pendingMigrations) {
    const success = applyMigration(file);
    if (success) {
      applied++;
    } else {
      failed++;
      // Stop on first failure
      console.log('\n⚠️  Stopping due to migration failure.');
      break;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Applied: ${applied}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${pendingMigrations.length - applied - failed}`);
  
  // Verify tables
  console.log('\nVerifying tables...');
  const counts = db.getTableCounts();
  
  for (const [table, count] of Object.entries(counts)) {
    const status = count === 'N/A' ? '⚠️ ' : '✓ ';
    console.log(`  ${status}${table.padEnd(20)} (${count} rows)`);
  }
  
  // Check foreign keys
  const fkViolations = db.checkForeignKeys();
  if (fkViolations.length > 0) {
    console.error('\n⚠️  Foreign key violations found:', fkViolations);
  } else {
    console.log('\n✓ Foreign key integrity: OK');
  }
  
  if (failed === 0) {
    console.log('\n✅ All migrations completed successfully!');
  } else {
    console.log('\n❌ Some migrations failed. Please fix and retry.');
    process.exit(1);
  }
}

// Run
try {
  runMigrations();
} catch (err) {
  console.error('\n❌ Migration error:', err.message);
  process.exit(1);
}
