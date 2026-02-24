#!/usr/bin/env node
/**
 * P0.8 - Email Health Ping (Cron Script)
 *
 * Computes email deliverability alerts and sends notifications
 * via the configured alerting provider (webhook or email).
 *
 * Usage:
 *   cd apps/backend
 *   node lib/scripts/email-health-ping.js
 *   node lib/scripts/email-health-ping.js --window=7d --includeOrange=false --cooldownHours=6
 *
 * Crontab example (every 6 hours):
 *   0 0,6,12,18 * * * cd /path/to/apps/backend && node lib/scripts/email-health-ping.js --window=7d
 *
 * Dry-run mode (shows what would be sent, without sending):
 *   node lib/scripts/email-health-ping.js --window=7d --dry
 *
 * Exit codes:
 *   0 = success (alerts sent or nothing to send)
 *   1 = provider send failed
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../db');
const logger = require('../logger');
const alerting = require('../email/alerting');

// ============ CLI ARGS ============
const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultVal;
}

const window = getArg('window', '7d');
const includeOrange = getArg('includeOrange', 'false') === 'true';
const cooldownHours = parseInt(getArg('cooldownHours', '6'), 10);
const DRY_RUN = args.includes('--dry');

console.log('='.repeat(60));
console.log('🏥 REPUTY EMAIL HEALTH PING');
console.log('='.repeat(60));
console.log(`Window:         ${window}`);
console.log(`Include orange: ${includeOrange}`);
console.log(`Cooldown:       ${cooldownHours}h`);
console.log(`Provider:       ${process.env.ALERTING_PROVIDER || '(none)'}`);
console.log(`Dry-run:        ${DRY_RUN}`);
console.log(`Time:           ${new Date().toISOString()}`);
console.log();

// ============ INIT DB ============
if (!db.isInitialized()) {
  console.error('❌ Database not initialized. Run "npm run db:init && npm run db:migrate-v2" first.');
  process.exit(1);
}

// ============ HELPERS ============

function printAlertLine(a) {
  console.log(`  [${a.severity.toUpperCase()}] ${a.type}${a.orgId ? ` (org: ${a.orgId})` : ''}`);
  console.log(`    ${a.message}`);
  if (a.meta) {
    const metaStr = Object.entries(a.meta).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`    Meta: ${metaStr}`);
  }
}

function runDryMode() {
  const monitoring = require('../email/monitoring');
  const allAlerts = monitoring.computeAlerts(window);

  const filtered = allAlerts.filter(a =>
    a.severity === 'red' || (a.severity === 'orange' && includeOrange)
  );

  console.log('🔍 DRY-RUN MODE — no notifications will be sent\n');
  console.log(`Total alerts computed: ${allAlerts.length}`);
  console.log(`Would send:           ${filtered.length}\n`);

  if (filtered.length > 0) {
    console.log('Alerts that WOULD be sent:');
    filtered.forEach(printAlertLine);
  } else {
    console.log('✅ No actionable alerts — nothing to send.');
  }

  return { total: allAlerts.length, filtered: filtered.length, sent: 0, skipped: 0, errors: 0, details: [] };
}

function printSummary(result) {
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total alerts computed: ${result.total}`);
  console.log(`Filtered (eligible):  ${result.filtered}`);
  console.log(`Sent:                 ${result.sent}`);
  console.log(`Skipped (cooldown/mute): ${result.skipped}`);
  console.log(`Errors:               ${result.errors}`);

  if (result.details.length > 0) {
    console.log('\nDetails:');
    for (const d of result.details) {
      console.log(`  ${d.key}: ${d.status}${d.error ? ` (${d.error})` : ''}${d.nextEligibleAt ? ` (next: ${d.nextEligibleAt})` : ''}`);
    }
  }
}

// ============ MAIN ============
async function main() {
  if (DRY_RUN) return runDryMode();

  const result = await alerting.runAlerting({ window, includeOrange, cooldownHours });
  printSummary(result);
  return result;
}

main()
  .then(result => {
    console.log('\n✅ Health ping complete.');
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    logger.logError('HEALTH_PING_FATAL', err.message, { error: err.message, stack: err.stack });
    process.exit(1);
  });
