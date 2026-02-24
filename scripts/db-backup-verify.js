#!/usr/bin/env node
/**
 * P0.5 — List & Verify Backups
 *
 * Lists all backup files with size, date, and basic integrity check.
 *
 * Env vars:
 *   BACKUP_DIR — directory containing backups (default: ./backups)
 *
 * ⚠️  Run from the REPO ROOT (avis-doctolib/).
 *
 * Usage:
 *   node scripts/db-backup-verify.js
 *   npm run db:backup:verify
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const BACKUP_DIR = process.env.BACKUP_DIR
  || path.resolve(__dirname, '..', 'backups');

function main() {
  console.log('='.repeat(60));
  console.log('REPUTY BACKUP INVENTORY');
  console.log('='.repeat(60));
  console.log(`\nBackup directory: ${BACKUP_DIR}\n`);

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('⚠️  Backup directory does not exist. No backups found.');
    process.exit(0);
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^reputy-\d{14}\.db$/.test(f))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('⚠️  No backup files found.');
    process.exit(0);
  }

  console.log(`Found ${files.length} backup(s):\n`);
  console.log(`${'#'.padStart(3)}  ${'Filename'.padEnd(30)}  ${'Size'.padStart(10)}  ${'Date'.padEnd(20)}  Status`);
  console.log('─'.repeat(80));

  for (const [i, f] of files.entries()) {
    const fullPath = path.join(BACKUP_DIR, f);
    const stat = fs.statSync(fullPath);
    const sizeKB = (stat.size / 1024).toFixed(1) + ' KB';
    const date = stat.mtime.toISOString().replace('T', ' ').substring(0, 19);

    let status = '?';
    try {
      const db = new Database(fullPath, { readonly: true, fileMustExist: true });
      const row = db.prepare('SELECT 1 AS ok').get();
      db.close();
      status = row?.ok === 1 ? '✓ OK' : '⚠️ SELECT 1 failed';
    } catch (err) {
      status = `❌ ${err.message.substring(0, 30)}`;
    }

    console.log(
      `${String(i + 1).padStart(3)}  ${f.padEnd(30)}  ${sizeKB.padStart(10)}  ${date.padEnd(20)}  ${status}`
    );
  }

  console.log('\n' + '='.repeat(60));
  process.exit(0);
}

main();
