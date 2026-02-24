/**
 * Cron Locks Repository
 *
 * Advisory locks via SQLite to prevent double-run of cron workers.
 *
 * Usage:
 *   const cronLocks = require('./cron-locks.repo');
 *   const owner = cronLocks.makeOwner();              // "hostname:pid"
 *   const acquired = cronLocks.acquire('email_worker', 600, owner);
 *   if (!acquired) process.exit(0);                   // another run in progress
 *   // ... do work ...
 *   cronLocks.release('email_worker', owner);
 */

'use strict';

const os = require('node:os');
const db = require('../db');

/**
 * Build a unique owner string for the current process.
 * @returns {string} e.g. "macbook-pro:12345"
 */
function makeOwner() {
  return `${os.hostname()}:${process.pid}`;
}

/**
 * Try to acquire a named lock.
 *
 * Rules:
 *   1. If no lock exists → insert → acquired.
 *   2. If lock exists but expired (locked_until < now) → overwrite → acquired.
 *   3. If lock exists and still valid → NOT acquired.
 *
 * @param {string} name       - lock name (e.g. 'email_worker')
 * @param {number} ttlSeconds - how long the lock is valid (default 600 = 10 min)
 * @param {string} owner      - caller identity (from makeOwner())
 * @returns {boolean} true if lock was acquired
 */
function acquire(name, ttlSeconds = 600, owner) {
  const now = db.nowISO();
  const lockedUntil = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Try to insert (no existing lock)
  const existing = db.get('SELECT * FROM cron_locks WHERE name = $name', { name });

  if (!existing) {
    // No lock → insert
    db.run(`
      INSERT INTO cron_locks (name, locked_at, locked_until, owner, updated_at)
      VALUES ($name, $now, $lockedUntil, $owner, $now)
    `, { name, now, lockedUntil, owner });
    return true;
  }

  // Lock exists — check if expired
  const expiry = new Date(existing.locked_until).getTime();
  if (Date.now() >= expiry) {
    // Expired → overwrite (steal the lock)
    db.run(`
      UPDATE cron_locks
      SET locked_at = $now, locked_until = $lockedUntil, owner = $owner, updated_at = $now
      WHERE name = $name
    `, { name, now, lockedUntil, owner });
    return true;
  }

  // Lock is still valid and held by someone else (or same owner re-running)
  return false;
}

/**
 * Release a named lock (best-effort).
 * Only releases if the lock is still owned by `owner` (avoids releasing a stolen lock).
 *
 * @param {string} name  - lock name
 * @param {string} owner - caller identity
 * @returns {boolean} true if released, false if lock was not ours
 */
function release(name, owner) {
  const result = db.run(
    'DELETE FROM cron_locks WHERE name = $name AND owner = $owner',
    { name, owner }
  );
  return (result?.changes || 0) > 0;
}

/**
 * Get info about a specific lock (for debugging / /health).
 * @param {string} name
 * @returns {{ name, lockedAt, lockedUntil, owner, isExpired } | null}
 */
function getInfo(name) {
  const row = db.get('SELECT * FROM cron_locks WHERE name = $name', { name });
  if (!row) return null;

  return {
    name: row.name,
    lockedAt: row.locked_at,
    lockedUntil: row.locked_until,
    owner: row.owner,
    isExpired: Date.now() >= new Date(row.locked_until).getTime(),
  };
}

/**
 * Get all locks (for debugging).
 * @returns {Array}
 */
function getAll() {
  const rows = db.all('SELECT * FROM cron_locks ORDER BY name');
  return rows.map(row => ({
    name: row.name,
    lockedAt: row.locked_at,
    lockedUntil: row.locked_until,
    owner: row.owner,
    isExpired: Date.now() >= new Date(row.locked_until).getTime(),
  }));
}

/**
 * Clean up expired locks (housekeeping).
 * @returns {number} number of expired locks removed
 */
function cleanExpired() {
  const now = db.nowISO();
  const result = db.run(
    'DELETE FROM cron_locks WHERE locked_until < $now',
    { now }
  );
  return result?.changes || 0;
}

module.exports = {
  makeOwner,
  acquire,
  release,
  getInfo,
  getAll,
  cleanExpired,
};
