#!/usr/bin/env node
/**
 * Database Health Check
 * 
 * Usage: npm run db:check
 * 
 * Checks database integrity, counts, and foreign key constraints.
 */

const fs = require('fs');
const db = require('../db');

console.log('='.repeat(60));
console.log('REPUTY DATABASE HEALTH CHECK');
console.log('='.repeat(60));

try {
  // Check if database exists
  if (!fs.existsSync(db.DB_PATH)) {
    console.error(`\n❌ Database not found: ${db.DB_PATH}`);
    console.log('   Run: npm run db:init');
    process.exit(1);
  }
  
  console.log(`\nDatabase: ${db.DB_PATH}`);
  const stats = fs.statSync(db.DB_PATH);
  console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`Modified: ${stats.mtime.toISOString()}`);
  
  // Check if initialized
  console.log('\n--- Tables ---');
  const counts = db.getTableCounts();
  let totalRows = 0;
  
  for (const [table, count] of Object.entries(counts)) {
    const status = count === 'N/A' ? '❌' : '✓';
    console.log(`  ${status} ${table.padEnd(20)} : ${count} rows`);
    if (typeof count === 'number') totalRows += count;
  }
  console.log(`  ${'─'.repeat(30)}`);
  console.log(`    ${'TOTAL'.padEnd(18)} : ${totalRows} rows`);
  
  // Check foreign key integrity
  console.log('\n--- Foreign Keys ---');
  const fkViolations = db.checkForeignKeys();
  if (fkViolations.length > 0) {
    console.error('  ❌ Violations found:');
    for (const v of fkViolations) {
      console.error(`     - ${v.table}: row ${v.rowid} → ${v.parent}`);
    }
  } else {
    console.log('  ✓ Integrity OK');
  }
  
  // Check WAL mode
  console.log('\n--- Configuration ---');
  const database = db.getDb();
  const journalMode = database.pragma('journal_mode', { simple: true });
  const foreignKeys = database.pragma('foreign_keys', { simple: true });
  const synchronous = database.pragma('synchronous', { simple: true });
  
  console.log(`  Journal mode: ${journalMode} ${journalMode === 'wal' ? '✓' : '⚠️'}`);
  console.log(`  Foreign keys: ${foreignKeys ? 'ON ✓' : 'OFF ❌'}`);
  console.log(`  Synchronous: ${synchronous}`);
  
  // Check idempotency key uniqueness
  console.log('\n--- Idempotency Check ---');
  const dupes = database.prepare(`
    SELECT idempotency_key, COUNT(*) as cnt 
    FROM review_requests 
    GROUP BY idempotency_key 
    HAVING cnt > 1
  `).all();
  
  if (dupes.length > 0) {
    console.error('  ❌ Duplicate idempotency keys found:');
    for (const d of dupes) {
      console.error(`     - ${d.idempotency_key}: ${d.cnt} times`);
    }
  } else {
    console.log('  ✓ No duplicate idempotency keys');
  }
  
  // Check for orphaned records
  console.log('\n--- Orphan Check ---');
  const orphanUsers = database.prepare(`
    SELECT COUNT(*) as cnt FROM users u 
    WHERE NOT EXISTS (SELECT 1 FROM orgs o WHERE o.id = u.org_id)
  `).get();
  
  const orphanSessions = database.prepare(`
    SELECT COUNT(*) as cnt FROM sessions s 
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)
  `).get();
  
  console.log(`  Users without org: ${orphanUsers.cnt} ${orphanUsers.cnt === 0 ? '✓' : '⚠️'}`);
  console.log(`  Sessions without user: ${orphanSessions.cnt} ${orphanSessions.cnt === 0 ? '✓' : '⚠️'}`);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  
  const hasIssues = fkViolations.length > 0 || dupes.length > 0;
  if (hasIssues) {
    console.log('⚠️  Database has issues that need attention');
  } else {
    console.log('✅ Database health check passed!');
  }
  console.log('='.repeat(60));
  
  process.exit(hasIssues ? 1 : 0);
  
} catch (err) {
  console.error('\n❌ Health check failed:', err.message);
  process.exit(1);
}
