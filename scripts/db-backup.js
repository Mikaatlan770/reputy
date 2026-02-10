#!/usr/bin/env node
/**
 * P0.5 — SQLite Backup Script (WAL-safe)
 *
 * Uses better-sqlite3's .backup() which wraps SQLite's Online Backup API.
 * This guarantees a consistent snapshot even with WAL mode active.
 *
 * Env vars:
 *   REPUTY_DB_PATH  — path to the live database (default: apps/backend/reputy.db)
 *   BACKUP_DIR      — directory to store backups  (default: ./backups)
 *   BACKUP_KEEP     — number of backups to retain  (default: 14)
 *
 * ⚠️  Run from the REPO ROOT (avis-doctolib/).
 *
 * Usage:
 *   node scripts/db-backup.js
 *   npm run db:backup
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// ──────────────────────────────────────────────
// Configuration (all from env, with safe defaults)
// ──────────────────────────────────────────────

const DB_PATH = process.env.REPUTY_DB_PATH
  || path.resolve(__dirname, '..', 'apps', 'backend', 'reputy.db');

const BACKUP_DIR = process.env.BACKUP_DIR
  || path.resolve(__dirname, '..', 'backups');

const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP, 10) || 14;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Stable 14-char UTC timestamp: YYYYMMDDHHMMSS */
function ts14() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function log(msg) {
  console.log(`[DB-BACKUP] ${new Date().toISOString()} — ${msg}`);
}

function logError(msg) {
  console.error(`[DB-BACKUP] ❌ ${new Date().toISOString()} — ${msg}`);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  log('Starting backup…');
  log(`  Source DB : ${DB_PATH}`);
  log(`  Backup dir: ${BACKUP_DIR}`);
  log(`  Retention : ${BACKUP_KEEP} backups`);

  // 1. Validate source DB exists
  if (!fs.existsSync(DB_PATH)) {
    logError(`Source database not found: ${DB_PATH}`);
    process.exit(1);
  }

  // 2. Ensure backup directory exists
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // 3. Build destination path
  const destFile = `reputy-${ts14()}.db`;
  const destPath = path.join(BACKUP_DIR, destFile);

  // 4. Perform WAL-safe backup using SQLite Online Backup API
  //    Opened in readwrite (default) — some better-sqlite3 builds
  //    may not support .backup() on a readonly handle.
  let db;
  try {
    db = new Database(DB_PATH, { fileMustExist: true });
    log('Opened source DB. Running backup…');
    await db.backup(destPath);
    log(`Backup written: ${destPath}`);
  } catch (err) {
    logError(`Backup failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (db) db.close();
  }

  // 5. Verify backup is non-empty and valid
  const stat = fs.statSync(destPath);
  if (stat.size === 0) {
    logError('Backup file is empty! Aborting.');
    fs.unlinkSync(destPath);
    process.exit(1);
  }
  log(`Backup size: ${(stat.size / 1024).toFixed(1)} KB`);

  // Quick integrity check on the backup
  let verifyDb;
  try {
    verifyDb = new Database(destPath, { readonly: true, fileMustExist: true });
    const row = verifyDb.prepare('SELECT 1 AS ok').get();
    if (row?.ok !== 1) throw new Error('SELECT 1 returned unexpected result');
    const tables = verifyDb.prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table'"
    ).get();
    log(`Backup verified ✓ (${tables.cnt} tables, SELECT 1 OK)`);
  } catch (err) {
    logError(`Backup verification failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (verifyDb) verifyDb.close();
  }

  // 6. Rotation — keep only BACKUP_KEEP most recent
  const allBackups = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^reputy-\d{14}\.db$/.test(f))
    .sort()
    .reverse(); // newest first

  let deleted = 0;
  if (allBackups.length > BACKUP_KEEP) {
    const toDelete = allBackups.slice(BACKUP_KEEP);
    for (const old of toDelete) {
      const oldPath = path.join(BACKUP_DIR, old);
      fs.unlinkSync(oldPath);
      log(`Rotated out: ${old}`);
      deleted++;
    }
  }

  const kept = Math.min(allBackups.length, BACKUP_KEEP);
  log(`Backup complete ✅ (${kept} backup(s) retained, ${deleted} rotated out)`);
  process.exit(0);
}

main().catch(err => {
  logError(`Unexpected error: ${err.message}`);
  process.exit(1);
});
