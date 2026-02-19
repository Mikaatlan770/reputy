#!/usr/bin/env node
/**
 * Watchdog — Health Monitoring Script
 *
 * Checks the /health endpoint (or directly queries DB if running standalone)
 * and reports issues: stale workers, open circuit breakers, DB down.
 *
 * Usage:
 *   cd apps/backend
 *   node lib/scripts/watchdog.js                 # check local server
 *   node lib/scripts/watchdog.js --url=https://api.reputyapp.com  # check remote
 *   node lib/scripts/watchdog.js --db             # direct DB check (no HTTP)
 *   node lib/scripts/watchdog.js --json           # structured JSON output
 *   WATCHDOG_JSON=true node lib/scripts/watchdog.js  # same via env
 *
 * Designed to be called by cron every 5-10 minutes.
 * Exit code: 0 = healthy, 1 = degraded/issues found, 2 = critical
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// ============ CLI ARGS ============
const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url='));
const BASE_URL = urlArg
  ? urlArg.split('=').slice(1).join('=')
  : `http://127.0.0.1:${process.env.PORT || 8787}`;
const DB_MODE = args.includes('--db');
const JSON_MODE = args.includes('--json')
  || (process.env.WATCHDOG_JSON || '').toLowerCase() === 'true';

// Only print banner in human mode
if (!JSON_MODE) {
  console.log('='.repeat(60));
  console.log('🔍 REPUTY WATCHDOG');
  console.log('='.repeat(60));
  console.log(`Mode:    ${DB_MODE ? 'Direct DB' : `HTTP → ${BASE_URL}/health`}`);
  console.log(`Time:    ${new Date().toISOString()}`);
  console.log();
}

// ============ DIRECT DB MODE ============

async function checkViaDb() {
  const db = require('../db');
  const heartbeatRepo = require('../repositories/worker-heartbeat.repo');

  const issues = [];
  const checks = {};

  // 1) DB check
  try {
    db.get('SELECT 1 AS ok');
    checks.database = true;
    if (!JSON_MODE) console.log('✅ Database: OK');
  } catch (e) {
    checks.database = false;
    if (!JSON_MODE) console.error(`❌ Database: ${e.message}`);
    issues.push({ severity: 'critical', component: 'database', error: e.message });
  }

  // 2) Worker heartbeats
  checks.workers = [];
  try {
    const unhealthy = heartbeatRepo.getUnhealthy();
    const all = heartbeatRepo.getAll();

    if (all.length === 0) {
      if (!JSON_MODE) console.log('⚠️  Workers: No heartbeats recorded yet');
      issues.push({ severity: 'warning', component: 'workers', error: 'no_heartbeats' });
    } else {
      for (const w of all) {
        checks.workers.push({
          name: w.workerName,
          status: w.status,
          lastOkAt: w.lastOkAt,
          lastError: w.lastError,
          itemsProcessed: w.itemsProcessed,
          durationMs: w.runDurationMs,
        });
        if (!JSON_MODE) {
          const icon = w.status === 'ok' ? '✅' : w.status === 'stale' ? '⚠️ ' : '❌';
          console.log(`${icon} Worker ${w.workerName}: ${w.status} (last OK: ${w.lastOkAt || 'never'})`);
          if (w.lastError) console.log(`   └─ Last error: ${w.lastError}`);
        }
      }
      for (const uw of unhealthy) {
        issues.push({
          severity: uw.status === 'down' || uw.status === 'never_seen' ? 'error' : 'warning',
          component: `worker:${uw.workerName}`,
          error: uw.status,
          lastOkAt: uw.lastOkAt,
          lastError: uw.lastError,
        });
      }
    }
  } catch (e) {
    if (!JSON_MODE) console.error(`⚠️  Worker heartbeats: ${e.message}`);
  }

  // 3) Circuit breakers (in-process — always clean for a standalone script)
  checks.circuitBreakers = {};
  if (!JSON_MODE) console.log('ℹ️  Circuit breakers: N/A in standalone DB mode (check /health HTTP)');

  db.closeDb();
  return { issues, checks };
}

// ============ HTTP MODE ============

async function checkViaHttp() {
  const issues = [];
  const checks = {};
  const healthUrl = `${BASE_URL}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    const data = await response.json();

    // Overall
    if (!JSON_MODE) {
      const statusIcon = data.status === 'healthy' ? '✅' : data.status === 'degraded' ? '⚠️ ' : '❌';
      console.log(`${statusIcon} Overall: ${data.status} (v${data.version})`);
      console.log(`   Uptime: ${data.uptime}s | Storage: ${data.storage}`);
    }

    // Database
    checks.database = !!data.checks?.database;
    if (!JSON_MODE) {
      if (checks.database) {
        console.log('✅ Database: OK');
      } else {
        console.error('❌ Database: DOWN');
      }
    }
    if (!checks.database) {
      issues.push({ severity: 'critical', component: 'database' });
    }

    // Workers
    checks.workers = data.checks?.workers || [];
    if (!JSON_MODE) {
      if (checks.workers.length > 0) {
        for (const w of checks.workers) {
          const icon = w.status === 'ok' ? '✅' : w.status === 'stale' ? '⚠️ ' : '❌';
          console.log(`${icon} Worker ${w.name}: ${w.status} (last OK: ${w.lastOkAt || 'never'})`);
          if (w.lastError) console.log(`   └─ Error: ${w.lastError}`);
        }
      } else {
        console.log('⚠️  Workers: No data');
      }
    }
    for (const w of checks.workers) {
      if (w.status !== 'ok') {
        issues.push({
          severity: w.status === 'down' || w.status === 'never_seen' ? 'error' : 'warning',
          component: `worker:${w.name}`,
          error: w.status,
        });
      }
    }

    // Circuit breakers
    checks.circuitBreakers = data.checks?.circuitBreakers || {};
    if (!JSON_MODE) {
      const cbNames = Object.keys(checks.circuitBreakers);
      if (cbNames.length === 0) {
        console.log('✅ Circuit breakers: All closed (no activity yet)');
      } else {
        for (const name of cbNames) {
          const cb = checks.circuitBreakers[name];
          const icon = cb.state === 'closed' ? '✅' : cb.state === 'half' ? '⚠️ ' : '❌';
          console.log(`${icon} Circuit ${name}: ${cb.state} (${cb.failures} failures)`);
        }
      }
    }
    for (const [name, cb] of Object.entries(checks.circuitBreakers)) {
      if (cb.state !== 'closed') {
        issues.push({
          severity: cb.state === 'open' ? 'error' : 'warning',
          component: `circuit:${name}`,
          error: `${cb.state} (${cb.failures} failures)`,
        });
      }
    }

  } catch (err) {
    if (!JSON_MODE) console.error(`❌ Cannot reach ${healthUrl}: ${err.message}`);
    issues.push({ severity: 'critical', component: 'server', error: err.message });
  }

  return { issues, checks };
}

// ============ ALERT (stub — plug in Slack/email/PagerDuty) ============

function alertIfNeeded(issues) {
  if (issues.length === 0) return;

  console.log();
  console.log('='.repeat(60));
  console.log(`🚨 ${issues.length} ISSUE(S) DETECTED`);
  console.log('='.repeat(60));

  for (const issue of issues) {
    const icon = issue.severity === 'critical' ? '🔴'
      : issue.severity === 'error' ? '🟠'
      : '🟡';
    console.log(`${icon} [${issue.severity.toUpperCase()}] ${issue.component}: ${issue.error || 'unknown'}`);
  }
}

// ============ MAIN ============

(async () => {
  try {
    const { issues, checks } = DB_MODE ? await checkViaDb() : await checkViaHttp();

    const hasCritical = issues.some(i => i.severity === 'critical');
    const hasErrors = issues.some(i => i.severity === 'error');
    const exitCode = hasCritical ? 2 : hasErrors ? 1 : 0;
    const overallStatus = hasCritical ? 'critical'
      : hasErrors ? 'degraded'
      : issues.length > 0 ? 'warning'
      : 'healthy';

    // ── JSON mode: single JSON object, no extra output ──
    if (JSON_MODE) {
      const output = {
        status: overallStatus,
        exitCode,
        ts: new Date().toISOString(),
        issueCount: issues.length,
        issues,
        checks,
      };
      console.log(JSON.stringify(output, null, 2));
      process.exit(exitCode);
      return;
    }

    // ── Human-readable mode ──
    console.log();
    alertIfNeeded(issues);

    if (hasCritical) {
      console.log('\n🔴 CRITICAL — exit 2');
    } else if (hasErrors) {
      console.log('\n🟠 DEGRADED — exit 1');
    } else if (issues.length > 0) {
      console.log('\n🟡 WARNINGS — exit 0');
    } else {
      console.log('\n✅ ALL HEALTHY — exit 0');
    }
    process.exit(exitCode);

  } catch (err) {
    if (JSON_MODE) {
      console.log(JSON.stringify({ status: 'fatal', error: err.message, exitCode: 2, ts: new Date().toISOString() }));
    } else {
      console.error(`\n❌ Watchdog fatal: ${err.message}`);
    }
    process.exit(2);
  }
})();
