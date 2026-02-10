#!/usr/bin/env node
/**
 * P0.7 - Unit tests for email monitoring & alerting logic
 *
 * Tests pure logic functions (safeRate, parseWindow, computeAlerts thresholds).
 * computeAlerts is tested with injected data (no DB required).
 */

process.env.EMAIL_WARMUP_ENABLED = 'true';
process.env.EMAIL_SIGNING_SECRET = 'test-secret';

const {
  safeRate,
  roundRate,
  parseWindow,
  ALERT_THRESHOLDS,
  computeAlerts,
} = require('../monitoring');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
  }
}

console.log('🧪 Monitoring Tests\n');

// ============================================================
// safeRate
// ============================================================
console.log('--- safeRate ---');
{
  assert(safeRate(0, 0) === 0, 'safeRate(0, 0) = 0');
  assert(safeRate(5, 0) === 0, 'safeRate(5, 0) = 0');
  assert(safeRate(0, -1) === 0, 'safeRate(0, -1) = 0');
  assert(safeRate(1, 100) === 0.01, 'safeRate(1, 100) = 0.01');
  assert(safeRate(3, 1000) === 0.003, 'safeRate(3, 1000) = 0.003');
  assert(safeRate(0, 100) === 0, 'safeRate(0, 100) = 0');
  assert(safeRate(100, 100) === 1, 'safeRate(100, 100) = 1');
  assert(safeRate(null, 100) === 0, 'safeRate(null, 100) = 0');
  assert(safeRate(undefined, 100) === 0, 'safeRate(undefined, 100) = 0 (NaN->0 implicit)');
}

// ============================================================
// roundRate
// ============================================================
console.log('\n--- roundRate ---');
{
  assert(roundRate(0.001234567, 6) === 0.001235, 'roundRate 6 decimals');
  assert(roundRate(0, 6) === 0, 'roundRate 0');
  assert(roundRate(1, 6) === 1, 'roundRate 1');
  assert(roundRate(0.123456789, 4) === 0.1235, 'roundRate 4 decimals');
}

// ============================================================
// parseWindow
// ============================================================
console.log('\n--- parseWindow ---');
{
  const h24 = parseWindow('24h');
  assert(h24.window === '24h', '24h → window=24h');
  assert(typeof h24.sinceISO === 'string', '24h → sinceISO is string');
  const diff24 = Date.now() - new Date(h24.sinceISO).getTime();
  assert(Math.abs(diff24 - 24 * 3600 * 1000) < 1000, '24h → ~24h ago');

  const d7 = parseWindow('7d');
  assert(d7.window === '7d', '7d → window=7d');
  const diff7 = Date.now() - new Date(d7.sinceISO).getTime();
  assert(Math.abs(diff7 - 7 * 24 * 3600 * 1000) < 1000, '7d → ~7 days ago');

  const d30 = parseWindow('30d');
  assert(d30.window === '30d', '30d → window=30d');

  const bad = parseWindow('invalid');
  assert(bad.window === '7d', 'invalid → default 7d');

  const empty = parseWindow('');
  assert(empty.window === '7d', 'empty → default 7d');

  const undef = parseWindow(undefined);
  assert(undef.window === '7d', 'undefined → default 7d');
}

// ============================================================
// computeAlerts — with injected data (no DB)
// ============================================================
console.log('\n--- computeAlerts: complaint rate thresholds ---');
{
  // Org with complaint rate > red (0.1%)
  const topRisk = [
    { orgId: 'org1', orgName: 'Org Red', sentCount: 1000, bounceCount: 10, complaintCount: 2, deliveredCount: 988, bounceRate: 0.01, complaintRate: 0.002, deliveryRate: 0.988 },
  ];
  const globalStats = { sentCount: 1000, bounceCount: 10, complaintCount: 2, deliveredCount: 988, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 0 }; // no 24h traffic → no webhook silence
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 1 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const complaintAlert = alerts.find(a => a.type === 'ORG_COMPLAINT_RATE');
  assert(complaintAlert !== undefined, 'complaint alert exists');
  assert(complaintAlert.severity === 'red', 'complaint rate 0.2% → red');
  assert(complaintAlert.orgId === 'org1', 'complaint alert orgId correct');
}

console.log('\n--- computeAlerts: complaint rate orange ---');
{
  const topRisk = [
    { orgId: 'org2', orgName: 'Org Orange', sentCount: 10000, bounceCount: 50, complaintCount: 6, deliveredCount: 9944, bounceRate: 0.005, complaintRate: 0.0006, deliveryRate: 0.9944 },
  ];
  const globalStats = { sentCount: 10000, bounceCount: 50, complaintCount: 6, deliveredCount: 9944, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 0 };
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 0.5 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const complaintAlert = alerts.find(a => a.type === 'ORG_COMPLAINT_RATE');
  assert(complaintAlert !== undefined, 'orange complaint alert exists');
  assert(complaintAlert.severity === 'orange', 'complaint rate 0.06% → orange');
}

console.log('\n--- computeAlerts: complaint rate OK (no alert) ---');
{
  const topRisk = [
    { orgId: 'org3', orgName: 'Org OK', sentCount: 10000, bounceCount: 10, complaintCount: 1, deliveredCount: 9989, bounceRate: 0.001, complaintRate: 0.0001, deliveryRate: 0.9989 },
  ];
  const globalStats = { sentCount: 10000, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 0 };
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 0.1 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const complaintAlert = alerts.find(a => a.type === 'ORG_COMPLAINT_RATE');
  assert(complaintAlert === undefined, 'complaint rate 0.01% → no alert');
}

console.log('\n--- computeAlerts: bounce rate thresholds ---');
{
  // Bounce rate 6% → red
  const topRisk = [
    { orgId: 'orgB', orgName: 'Org Bounce Red', sentCount: 1000, bounceCount: 60, complaintCount: 0, deliveredCount: 940, bounceRate: 0.06, complaintRate: 0, deliveryRate: 0.94 },
  ];
  const globalStats = { sentCount: 1000, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 0 };
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 0.1 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const bounceAlert = alerts.find(a => a.type === 'ORG_BOUNCE_RATE');
  assert(bounceAlert !== undefined, 'bounce alert exists');
  assert(bounceAlert.severity === 'red', 'bounce rate 6% → red');
}

{
  // Bounce rate 3% → orange
  const topRisk = [
    { orgId: 'orgB2', orgName: 'Org Bounce Orange', sentCount: 1000, bounceCount: 30, complaintCount: 0, deliveredCount: 970, bounceRate: 0.03, complaintRate: 0, deliveryRate: 0.97 },
  ];
  const globalStats = { sentCount: 1000, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 0 };
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 0.1 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const bounceAlert = alerts.find(a => a.type === 'ORG_BOUNCE_RATE');
  assert(bounceAlert !== undefined, 'bounce orange alert exists');
  assert(bounceAlert.severity === 'orange', 'bounce rate 3% → orange');
}

{
  // Bounce rate 1% → no alert
  const topRisk = [
    { orgId: 'orgB3', orgName: 'Org Bounce OK', sentCount: 1000, bounceCount: 10, complaintCount: 0, deliveredCount: 990, bounceRate: 0.01, complaintRate: 0, deliveryRate: 0.99 },
  ];
  const globalStats = { sentCount: 1000, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 0 };
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 0.1 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const bounceAlert = alerts.find(a => a.type === 'ORG_BOUNCE_RATE');
  assert(bounceAlert === undefined, 'bounce rate 1% → no alert');
}

// ============================================================
// computeAlerts: webhook silence
// ============================================================
console.log('\n--- computeAlerts: webhook silence ---');
{
  // Trafic 24h > 0 + lastSeen > 24h → red
  const topRisk = [];
  const globalStats = { sentCount: 100, sinceISO: '2026-01-01' };
  const globalStats24h = { sentCount: 5 }; // trafic récent
  const lastSes = { lastSeenAt: '2026-02-07T00:00:00.000Z', hoursSince: 50 };

  const alerts = computeAlerts('7d', { globalStats, lastSesWebhook: lastSes, topRiskOrgs: topRisk, globalStats24h });
  const whAlert = alerts.find(a => a.type === 'GLOBAL_WEBHOOK_SILENCE');
  assert(whAlert !== undefined, 'webhook silence alert exists (traffic + 50h silence)');
  assert(whAlert.severity === 'red', 'webhook silence 50h → red');
}

{
  // Trafic 24h > 0 + lastSeen > 12h < 24h → orange
  const globalStats24h = { sentCount: 3 };
  const lastSes = { lastSeenAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(), hoursSince: 14 };

  const alerts = computeAlerts('7d', {
    globalStats: { sentCount: 50, sinceISO: '2026-01-01' },
    lastSesWebhook: lastSes,
    topRiskOrgs: [],
    globalStats24h,
  });
  const whAlert = alerts.find(a => a.type === 'GLOBAL_WEBHOOK_SILENCE');
  assert(whAlert !== undefined, 'webhook silence alert exists (14h)');
  assert(whAlert.severity === 'orange', 'webhook silence 14h → orange');
}

{
  // Trafic 24h = 0 → PAS d'alerte webhook silence
  const globalStats24h = { sentCount: 0 };
  const lastSes = { lastSeenAt: '2025-01-01T00:00:00.000Z', hoursSince: 9999 };

  const alerts = computeAlerts('7d', {
    globalStats: { sentCount: 0, sinceISO: '2026-01-01' },
    lastSesWebhook: lastSes,
    topRiskOrgs: [],
    globalStats24h,
  });
  const whAlert = alerts.find(a => a.type === 'GLOBAL_WEBHOOK_SILENCE');
  assert(whAlert === undefined, 'no webhook silence alert if sent24h=0');
}

{
  // Trafic 24h > 0 + lastSeen=null → red (jamais reçu)
  const globalStats24h = { sentCount: 10 };
  const lastSes = { lastSeenAt: null, hoursSince: null };

  const alerts = computeAlerts('7d', {
    globalStats: { sentCount: 50, sinceISO: '2026-01-01' },
    lastSesWebhook: lastSes,
    topRiskOrgs: [],
    globalStats24h,
  });
  const whAlert = alerts.find(a => a.type === 'GLOBAL_WEBHOOK_SILENCE');
  assert(whAlert !== undefined, 'webhook silence alert exists (never received)');
  assert(whAlert.severity === 'red', 'never received + traffic → red');
}

{
  // Trafic 24h > 0 + lastSeen recent (< 12h) → no alert
  const globalStats24h = { sentCount: 10 };
  const lastSes = { lastSeenAt: new Date().toISOString(), hoursSince: 2 };

  const alerts = computeAlerts('7d', {
    globalStats: { sentCount: 50, sinceISO: '2026-01-01' },
    lastSesWebhook: lastSes,
    topRiskOrgs: [],
    globalStats24h,
  });
  const whAlert = alerts.find(a => a.type === 'GLOBAL_WEBHOOK_SILENCE');
  assert(whAlert === undefined, 'recent webhook (2h) + traffic → no alert');
}

// ============================================================
// computeAlerts: alert sorting
// ============================================================
console.log('\n--- computeAlerts: sorting ---');
{
  const topRisk = [
    { orgId: 'orgR', orgName: 'Red Org', sentCount: 1000, bounceCount: 60, complaintCount: 2, deliveredCount: 938, bounceRate: 0.06, complaintRate: 0.002, deliveryRate: 0.938 },
    { orgId: 'orgO', orgName: 'Orange Org', sentCount: 1000, bounceCount: 30, complaintCount: 0, deliveredCount: 970, bounceRate: 0.03, complaintRate: 0, deliveryRate: 0.97 },
  ];
  const globalStats24h = { sentCount: 5 };
  const lastSes = { lastSeenAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString(), hoursSince: 30 };

  const alerts = computeAlerts('7d', {
    globalStats: { sentCount: 2000, sinceISO: '2026-01-01' },
    lastSesWebhook: lastSes,
    topRiskOrgs: topRisk,
    globalStats24h,
  });

  assert(alerts.length >= 3, `at least 3 alerts (got ${alerts.length})`);
  assert(alerts[0].severity === 'red', 'first alert is red');
  // All reds before oranges
  const lastRedIdx = alerts.map(a => a.severity).lastIndexOf('red');
  const firstOrangeIdx = alerts.map(a => a.severity).indexOf('orange');
  assert(firstOrangeIdx === -1 || lastRedIdx < firstOrangeIdx, 'all reds before oranges');
}

// ============================================================
// computeAlerts: empty data → no crash
// ============================================================
console.log('\n--- computeAlerts: empty data ---');
{
  const alerts = computeAlerts('7d', {
    globalStats: { sentCount: 0, sinceISO: '2026-01-01' },
    lastSesWebhook: { lastSeenAt: null, hoursSince: null },
    topRiskOrgs: [],
    globalStats24h: { sentCount: 0 },
  });
  assert(Array.isArray(alerts), 'returns array');
  assert(alerts.length === 0, 'no alerts with empty data and no traffic');
}

// ============================================================
// ALERT_THRESHOLDS sanity
// ============================================================
console.log('\n--- ALERT_THRESHOLDS ---');
{
  const T = ALERT_THRESHOLDS;
  assert(T.complaintRateOrange === 0.0005, 'complaintRateOrange = 0.0005');
  assert(T.complaintRateRed === 0.001, 'complaintRateRed = 0.001');
  assert(T.hardBounceOrange === 0.02, 'hardBounceOrange = 0.02');
  assert(T.hardBounceRed === 0.05, 'hardBounceRed = 0.05');
  assert(T.webhookSilenceOrangeHours === 12, 'webhookSilenceOrangeHours = 12');
  assert(T.webhookSilenceRedHours === 24, 'webhookSilenceRedHours = 24');
  assert(T.warmingTooLongDaysOrange === 10, 'warmingTooLongDaysOrange = 10');
}

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
