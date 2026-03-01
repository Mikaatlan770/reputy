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

const path = require('node:path');
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

// ============ LOGGING HELPERS ============

function log(msg) {
  if (!JSON_MODE) console.log(msg);
}

function logError(msg) {
  if (!JSON_MODE) console.error(msg);
}

// ============ ICON / SEVERITY HELPERS ============

const WORKER_ICONS = { ok: '✅', stale: '⚠️ ' };
const CB_STATE_ICONS = { closed: '✅', half: '⚠️ ' };
const SEVERITY_ICONS = { critical: '🔴', error: '🟠' };
const STATUS_ICONS = { healthy: '✅', degraded: '⚠️ ' };

function getWorkerIcon(status) {
  return WORKER_ICONS[status] || '❌';
}

function getCbIcon(state) {
  return CB_STATE_ICONS[state] || '❌';
}

function getSeverityIcon(severity) {
  return SEVERITY_ICONS[severity] || '🟡';
}

function getWorkerSeverity(status) {
  return (status === 'down' || status === 'never_seen') ? 'error' : 'warning';
}

// ============ DIRECT DB MODE — HELPERS ============

function checkDbConnection(db) {
  try {
    db.get('SELECT 1 AS ok');
    log('✅ Database: OK');
    return { check: true, issue: null };
  } catch (e) {
    logError(`❌ Database: ${e.message}`);
    return { check: false, issue: { severity: 'critical', component: 'database', error: e.message } };
  }
}

function formatWorkerCheck(w) {
  return {
    name: w.workerName,
    status: w.status,
    lastOkAt: w.lastOkAt,
    lastError: w.lastError,
    itemsProcessed: w.itemsProcessed,
    durationMs: w.runDurationMs,
  };
}

function logWorker(w) {
  log(`${getWorkerIcon(w.status)} Worker ${w.workerName}: ${w.status} (last OK: ${w.lastOkAt || 'never'})`);
  if (w.lastError) log(`   └─ Last error: ${w.lastError}`);
}

function buildUnhealthyWorkerIssue(uw) {
  return {
    severity: getWorkerSeverity(uw.status),
    component: `worker:${uw.workerName}`,
    error: uw.status,
    lastOkAt: uw.lastOkAt,
    lastError: uw.lastError,
  };
}

function checkWorkerHeartbeats(heartbeatRepo) {
  const workers = [];
  const issues = [];

  try {
    const unhealthy = heartbeatRepo.getUnhealthy();
    const all = heartbeatRepo.getAll();

    if (all.length === 0) {
      log('⚠️  Workers: No heartbeats recorded yet');
      issues.push({ severity: 'warning', component: 'workers', error: 'no_heartbeats' });
      return { workers, issues };
    }

    for (const w of all) {
      workers.push(formatWorkerCheck(w));
      logWorker(w);
    }
    for (const uw of unhealthy) {
      issues.push(buildUnhealthyWorkerIssue(uw));
    }
  } catch (e) {
    logError(`⚠️  Worker heartbeats: ${e.message}`);
  }

  return { workers, issues };
}

// ============ DIRECT DB MODE ============

async function checkViaDb() {
  const db = require('../db');
  const heartbeatRepo = require('../repositories/worker-heartbeat.repo');

  const issues = [];
  const checks = {};

  const dbResult = checkDbConnection(db);
  checks.database = dbResult.check;
  if (dbResult.issue) issues.push(dbResult.issue);

  const workerResult = checkWorkerHeartbeats(heartbeatRepo);
  checks.workers = workerResult.workers;
  issues.push(...workerResult.issues);

  checks.circuitBreakers = {};
  log('ℹ️  Circuit breakers: N/A in standalone DB mode (check /health HTTP)');

  db.closeDb();
  return { issues, checks };
}

// ============ HTTP MODE — HELPERS ============

async function fetchHealthData(healthUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(healthUrl, {
    signal: controller.signal,
    headers: { 'Accept': 'application/json' },
  });
  clearTimeout(timeout);
  return response.json();
}

function logOverallStatus(data) {
  const icon = STATUS_ICONS[data.status] || '❌';
  log(`${icon} Overall: ${data.status} (v${data.version})`);
  log(`   Uptime: ${data.uptime}s | Storage: ${data.storage}`);
}

function checkHttpDatabase(data) {
  const dbOk = !!data.checks?.database;
  if (dbOk) {
    log('✅ Database: OK');
  } else {
    logError('❌ Database: DOWN');
  }
  return { check: dbOk, issue: dbOk ? null : { severity: 'critical', component: 'database' } };
}

function logHttpWorkers(workers) {
  if (workers.length === 0) {
    log('⚠️  Workers: No data');
    return;
  }
  for (const w of workers) {
    log(`${getWorkerIcon(w.status)} Worker ${w.name}: ${w.status} (last OK: ${w.lastOkAt || 'never'})`);
    if (w.lastError) log(`   └─ Error: ${w.lastError}`);
  }
}

function collectWorkerIssues(workers) {
  return workers
    .filter(w => w.status !== 'ok')
    .map(w => ({
      severity: getWorkerSeverity(w.status),
      component: `worker:${w.name}`,
      error: w.status,
    }));
}

function logHttpCircuitBreakers(circuitBreakers) {
  const cbNames = Object.keys(circuitBreakers);
  if (cbNames.length === 0) {
    log('✅ Circuit breakers: All closed (no activity yet)');
    return;
  }
  for (const name of cbNames) {
    const cb = circuitBreakers[name];
    log(`${getCbIcon(cb.state)} Circuit ${name}: ${cb.state} (${cb.failures} failures)`);
  }
}

function collectCbIssues(circuitBreakers) {
  return Object.entries(circuitBreakers)
    .filter(([, cb]) => cb.state !== 'closed')
    .map(([name, cb]) => ({
      severity: cb.state === 'open' ? 'error' : 'warning',
      component: `circuit:${name}`,
      error: `${cb.state} (${cb.failures} failures)`,
    }));
}

function processHealthData(data) {
  const issues = [];
  const checks = {};

  logOverallStatus(data);

  const dbResult = checkHttpDatabase(data);
  checks.database = dbResult.check;
  if (dbResult.issue) issues.push(dbResult.issue);

  checks.workers = data.checks?.workers || [];
  logHttpWorkers(checks.workers);
  issues.push(...collectWorkerIssues(checks.workers));

  checks.circuitBreakers = data.checks?.circuitBreakers || {};
  logHttpCircuitBreakers(checks.circuitBreakers);
  issues.push(...collectCbIssues(checks.circuitBreakers));

  return { issues, checks };
}

// ============ HTTP MODE ============

async function checkViaHttp() {
  const healthUrl = `${BASE_URL}/health`;
  try {
    const data = await fetchHealthData(healthUrl);
    return processHealthData(data);
  } catch (err) {
    logError(`❌ Cannot reach ${healthUrl}: ${err.message}`);
    return {
      issues: [{ severity: 'critical', component: 'server', error: err.message }],
      checks: {},
    };
  }
}

// ============ ALERT ============

async function sendEmailAlert(issues, status) {
  const apiKey = process.env.BREVO_API_KEY;
  const to = process.env.WATCHDOG_ALERT_EMAIL;
  if (!apiKey || !to) return;

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const subject = criticalCount > 0
    ? `🔴 [CRITIQUE] Reputy Backend — ${criticalCount} problème(s) critique(s)`
    : `🟠 [ALERTE] Reputy Backend — ${issues.length} problème(s) détecté(s)`;

  const rows = issues.map(i =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:bold;color:${i.severity === 'critical' ? '#d32f2f' : '#e65100'}">${i.severity.toUpperCase()}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.component}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.error || 'inconnu'}</td>
    </tr>`
  ).join('');

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d32f2f">🚨 Watchdog Reputy — ${status.toUpperCase()}</h2>
      <p><strong>Détecté à :</strong> ${new Date().toISOString()}</p>
      <p><strong>Serveur :</strong> vps-01e17ded</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 12px;text-align:left">Sévérité</th>
            <th style="padding:8px 12px;text-align:left">Composant</th>
            <th style="padding:8px 12px;text-align:left">Erreur</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:24px;padding:12px;background:#fff3e0;border-radius:4px">
        <strong>Action rapide :</strong><br/>
        <code>ssh ubuntu@vps-01e17ded</code><br/>
        <code>pm2 status && pm2 logs --lines 30</code>
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Reputy Watchdog', email: 'noreply@reputyapp.com' },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logError(`⚠️  Watchdog email failed (${res.status}): ${body}`);
    }
  } catch (e) {
    logError(`⚠️  Watchdog email error: ${e.message}`);
  }
}

async function sendSlackAlert(issues, status) {
  const webhookUrl = process.env.WATCHDOG_SLACK_WEBHOOK;
  if (!webhookUrl) return;

  const color = status === 'critical' ? '#d32f2f' : '#e65100';
  const fields = issues.map(i => ({
    title: `[${i.severity.toUpperCase()}] ${i.component}`,
    value: i.error || 'inconnu',
    short: false,
  }));

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [{
          color,
          title: `🚨 Reputy Watchdog — ${status.toUpperCase()}`,
          title_link: 'https://api.reputyapp.com/health',
          fields,
          footer: `vps-01e17ded | ${new Date().toISOString()}`,
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logError(`⚠️  Watchdog Slack failed (${res.status}): ${body}`);
    }
  } catch (e) {
    logError(`⚠️  Watchdog Slack error: ${e.message}`);
  }
}

async function alertIfNeeded(issues, status) {
  if (issues.length === 0) return;

  console.log();
  console.log('='.repeat(60));
  console.log(`🚨 ${issues.length} ISSUE(S) DETECTED`);
  console.log('='.repeat(60));

  for (const issue of issues) {
    const icon = getSeverityIcon(issue.severity);
    console.log(`${icon} [${issue.severity.toUpperCase()}] ${issue.component}: ${issue.error || 'unknown'}`);
  }

  await Promise.allSettled([
    sendEmailAlert(issues, status),
    sendSlackAlert(issues, status),
  ]);
}

// ============ MAIN — HELPERS ============

function computeExitStatus(issues) {
  const hasCritical = issues.some(i => i.severity === 'critical');
  const hasErrors = issues.some(i => i.severity === 'error');
  let exitCode = 0;
  if (hasCritical) exitCode = 2;
  else if (hasErrors) exitCode = 1;

  let status = 'healthy';
  if (hasCritical) status = 'critical';
  else if (hasErrors) status = 'degraded';
  else if (issues.length > 0) status = 'warning';
  return { hasCritical, hasErrors, exitCode, status };
}

function outputJsonResult(status, exitCode, issues, checks) {
  console.log(JSON.stringify({
    status,
    exitCode,
    ts: new Date().toISOString(),
    issueCount: issues.length,
    issues,
    checks,
  }, null, 2));
}

function logHumanExitStatus(issues, hasCritical, hasErrors) {
  if (hasCritical) {
    console.log('\n🔴 CRITICAL — exit 2');
  } else if (hasErrors) {
    console.log('\n🟠 DEGRADED — exit 1');
  } else if (issues.length > 0) {
    console.log('\n🟡 WARNINGS — exit 0');
  } else {
    console.log('\n✅ ALL HEALTHY — exit 0');
  }
}

function handleFatalError(err) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ status: 'fatal', error: err.message, exitCode: 2, ts: new Date().toISOString() }));
  } else {
    console.error(`\n❌ Watchdog fatal: ${err.message}`);
  }
  process.exit(2);
}

// ============ MAIN ============

(async () => {
  try {
    const { issues, checks } = DB_MODE ? await checkViaDb() : await checkViaHttp();
    const { hasCritical, hasErrors, exitCode, status } = computeExitStatus(issues);

    if (JSON_MODE) {
      outputJsonResult(status, exitCode, issues, checks);
      process.exit(exitCode);
      return;
    }

    console.log();
    await alertIfNeeded(issues, status);
    logHumanExitStatus(issues, hasCritical, hasErrors);
    process.exit(exitCode);
  } catch (err) {
    handleFatalError(err);
  }
})();
