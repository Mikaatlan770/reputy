#!/usr/bin/env node
/**
 * Backfill Memberships Script
 * 
 * Creates 1 active membership for each existing user → org relationship.
 * Uses db.generateId() for consistent ID format.
 * Safe to run multiple times (idempotent via UNIQUE(user_id, org_id)).
 * 
 * Usage: node apps/backend/lib/scripts/backfill-memberships.js
 */

const db = require('../db');

console.log('='.repeat(60));
console.log('BACKFILL MEMBERSHIPS');
console.log('='.repeat(60));

function run() {
  // 1. Verify memberships table exists
  const tableExists = db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memberships'"
  );
  if (!tableExists) {
    console.error('\n❌ Table "memberships" does not exist. Run migrations first:');
    console.error('   npm run db:migrate-v2');
    process.exit(1);
  }

  // 2. Get all users
  const users = db.all('SELECT id, org_id, role, created_at FROM users');
  console.log(`\nFound ${users.length} user(s) in database.`);

  if (users.length === 0) {
    console.log('No users to backfill. Done.');
    return;
  }

  // 3. Check existing memberships
  const existingCount = db.get('SELECT COUNT(*) as count FROM memberships');
  console.log(`Existing memberships: ${existingCount.count}`);

  // 4. Backfill
  let created = 0;
  let skipped = 0;
  let errors = 0;

  const now = db.nowISO();

  const insertStmt = db.getDb().prepare(`
    INSERT OR IGNORE INTO memberships (
      id, user_id, org_id, role, status,
      accepted_at, created_at, updated_at
    ) VALUES (
      $id, $userId, $orgId, $role, 'active',
      $acceptedAt, $createdAt, $updatedAt
    )
  `);

  const transaction = db.getDb().transaction(() => {
    for (const user of users) {
      // Check if membership already exists
      const existing = db.get(
        'SELECT 1 FROM memberships WHERE user_id = $userId AND org_id = $orgId',
        { userId: user.id, orgId: user.org_id }
      );

      if (existing) {
        skipped++;
        continue;
      }

      try {
        const id = db.generateId();
        insertStmt.run({
          id,
          userId: user.id,
          orgId: user.org_id,
          role: user.role || 'owner',
          acceptedAt: user.created_at || now,
          createdAt: user.created_at || now,
          updatedAt: now,
        });
        created++;
        console.log(`  ✓ Created membership: user=${user.id} → org=${user.org_id} (${user.role})`);
      } catch (err) {
        errors++;
        console.error(`  ❌ Error for user=${user.id}: ${err.message}`);
      }
    }
  });

  transaction();

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Created: ${created}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Errors:  ${errors}`);

  const finalCount = db.get('SELECT COUNT(*) as count FROM memberships');
  console.log(`\nTotal memberships: ${finalCount.count}`);

  if (errors === 0) {
    console.log('\n✅ Backfill completed successfully!');
  } else {
    console.log('\n⚠️  Backfill completed with errors.');
    process.exit(1);
  }
}

try {
  run();
} catch (err) {
  console.error('\n❌ Backfill error:', err.message);
  process.exit(1);
}
