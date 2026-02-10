#!/usr/bin/env node
/**
 * P0.5 — SQLite Restore Script
 *
 * Restores a backup file to the live DB location.
 * Safety: refuses if PM2 process is running, backs up current DB as .bak,
 *         cleans WAL/SHM, and verifies restored DB.
 *
 * Env vars:
 *   REPUTY_DB_PATH       — path to the live database  (default: apps/backend/reputy.db)
 *   PM2_APP_NAME          — PM2 process name to check  (default: reputy-backend)
 *   REPUTY_BACKEND_PORT   — backend port to check      (fallback: PORT, then 8787)
 *
 * ⚠️  Run from the REPO ROOT (avis-doctolib/).
 *
 * Usage:
 *   node scripts/db-restore.js <path-to-backup.db>
 *   npm run db:restore -- backups/reputy-20260210143055.db
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const DB_PATH = process.env.REPUTY_DB_PATH
  || path.resolve(__dirname, '..', 'apps', 'backend', 'reputy.db');

const PM2_NAME = process.env.PM2_APP_NAME || 'reputy-backend';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function log(msg) {
  console.log(`[DB-RESTORE] ${new Date().toISOString()} — ${msg}`);
}

function logError(msg) {
  console.error(`[DB-RESTORE] ❌ ${new Date().toISOString()} — ${msg}`);
}

function isServerRunning() {
  // Check PM2 for the configured app name
  try {
    const output = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8' });
    const processes = JSON.parse(output);
    const app = processes.find(p => p.name === PM2_NAME);
    if (app && app.pm2_env?.status === 'online') {
      return true;
    }
  } catch {
    // PM2 not available or not running — that's fine
  }

  // Fallback: check if backend port is in use
  try {
    const port = process.env.REPUTY_BACKEND_PORT || process.env.PORT || '8787';
    execSync(`lsof -i :${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

function main() {
  // 1. Parse arguments
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error('Usage: node scripts/db-restore.js <path-to-backup.db>');
    console.error('  e.g. node scripts/db-restore.js backups/reputy-20260210143055.db');
    process.exit(1);
  }

  const resolvedBackup = path.resolve(backupPath);

  log('Starting restore…');
  log(`  Backup source: ${resolvedBackup}`);
  log(`  Target DB    : ${DB_PATH}`);
  log(`  PM2 app name : ${PM2_NAME}`);

  // 2. Validate backup file exists and is non-empty
  if (!fs.existsSync(resolvedBackup)) {
    logError(`Backup file not found: ${resolvedBackup}`);
    process.exit(1);
  }

  const backupStat = fs.statSync(resolvedBackup);
  if (backupStat.size === 0) {
    logError('Backup file is empty!');
    process.exit(1);
  }

  // 3. Verify backup is a valid SQLite DB
  let verifyDb;
  try {
    verifyDb = new Database(resolvedBackup, { readonly: true, fileMustExist: true });
    const row = verifyDb.prepare('SELECT 1 AS ok').get();
    if (row?.ok !== 1) throw new Error('SELECT 1 failed');
    log('Backup file verified ✓ (valid SQLite DB)');
  } catch (err) {
    logError(`Backup file is not a valid SQLite database: ${err.message}`);
    process.exit(1);
  } finally {
    if (verifyDb) verifyDb.close();
  }

  // 4. Check if server is running — refuse
  if (isServerRunning()) {
    logError(
      `Server appears to be RUNNING (PM2 "${PM2_NAME}" or port in use).\n` +
      '         Stop the server first:  npm run pm2:stop\n' +
      '         Then retry the restore.'
    );
    process.exit(1);
  }
  log('Server not running ✓');

  // 5. Backup current DB as .bak (safety net)
  if (fs.existsSync(DB_PATH)) {
    const bakPath = DB_PATH + '.pre-restore.bak';
    fs.copyFileSync(DB_PATH, bakPath);
    log(`Current DB saved as: ${bakPath}`);
  } else {
    log('No existing DB to back up (first restore?)');
  }

  // 6. Remove WAL/SHM files (they belong to old DB state)
  const walPath = DB_PATH + '-wal';
  const shmPath = DB_PATH + '-shm';

  for (const sidecar of [walPath, shmPath]) {
    if (fs.existsSync(sidecar)) {
      fs.unlinkSync(sidecar);
      log(`Removed sidecar: ${path.basename(sidecar)}`);
    }
  }

  // 7. Copy backup to target DB path
  fs.copyFileSync(resolvedBackup, DB_PATH);
  log('Backup copied to target path ✓');

  // 8. Post-restore verification
  let restoredDb;
  try {
    restoredDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const row = restoredDb.prepare('SELECT 1 AS ok').get();
    if (row?.ok !== 1) throw new Error('SELECT 1 failed after restore');

    const tables = restoredDb.prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table'"
    ).get();

    // Best-effort: log orgs count if table exists
    let orgsInfo = '';
    const hasOrgs = restoredDb.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='orgs'"
    ).get();
    if (hasOrgs) {
      const orgs = restoredDb.prepare('SELECT COUNT(*) AS cnt FROM orgs').get();
      orgsInfo = `, ${orgs.cnt} orgs`;
    }

    log(`Restored DB verified ✓ (${tables.cnt} tables${orgsInfo})`);
  } catch (err) {
    logError(`Post-restore verification FAILED: ${err.message}`);
    logError('The .pre-restore.bak file can be used to revert manually.');
    process.exit(1);
  } finally {
    if (restoredDb) restoredDb.close();
  }

  log('Restore complete ✅');
  log('You can now start the server:  npm run pm2:start');
  process.exit(0);
}

main();
