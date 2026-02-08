#!/usr/bin/env node
/**
 * Initialize SQLite Database
 * 
 * Usage: npm run db:init
 * 
 * Creates the database file and applies the schema.
 */

const db = require('../db');

console.log('='.repeat(50));
console.log('REPUTY DATABASE INITIALIZATION');
console.log('='.repeat(50));

try {
  console.log(`\nDatabase path: ${db.DB_PATH}`);
  
  // Initialize schema
  console.log('\nInitializing schema...');
  db.initSchema();
  
  // Verify
  console.log('\nVerifying tables...');
  const counts = db.getTableCounts();
  
  console.log('\nTables created:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ✓ ${table.padEnd(20)} (${count} rows)`);
  }
  
  // Check foreign keys
  const fkViolations = db.checkForeignKeys();
  if (fkViolations.length > 0) {
    console.error('\n⚠️  Foreign key violations:', fkViolations);
  } else {
    console.log('\n✓ Foreign key integrity: OK');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Database initialized successfully!');
  console.log('='.repeat(50));
  
} catch (err) {
  console.error('\n❌ Initialization failed:', err.message);
  process.exit(1);
}
