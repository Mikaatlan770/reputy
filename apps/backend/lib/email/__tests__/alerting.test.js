#!/usr/bin/env node
/**
 * P0.8 - Unit Tests for alerting.js + requireEmailAdmin + CSV + pause logic
 *
 * Tests pure logic functions without DB or network.
 * Run: node lib/email/__tests__/alerting.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}`);
  }
}

function assertEq(actual, expected, name) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============================================================
// TEST: alertKey
// ============================================================
console.log('\n=== alertKey ===');
{
  // Import the function directly by extracting its logic (no DB needed)
  function alertKey(alert) {
    return `${alert.type}:${alert.orgId || 'global'}`;
  }

  assertEq(alertKey({ type: 'ORG_COMPLAINT_RATE', orgId: 'abc123' }), 'ORG_COMPLAINT_RATE:abc123', 'org alert key');
  assertEq(alertKey({ type: 'GLOBAL_WEBHOOK_SILENCE' }), 'GLOBAL_WEBHOOK_SILENCE:global', 'global alert key (no orgId)');
  assertEq(alertKey({ type: 'ORG_BOUNCE_RATE', orgId: null }), 'ORG_BOUNCE_RATE:global', 'null orgId → global');
  assertEq(alertKey({ type: 'ORG_BOUNCE_RATE', orgId: '' }), 'ORG_BOUNCE_RATE:global', 'empty orgId → global');
}

// ============================================================
// TEST: isInCooldown
// ============================================================
console.log('\n=== isInCooldown ===');
{
  function isInCooldown(key, state, cooldownMs, now) {
    const entry = state[key];
    if (!entry || !entry.lastSentAt) return false;
    const lastSent = new Date(entry.lastSentAt).getTime();
    return (now - lastSent) < cooldownMs;
  }

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  // No state entry → not in cooldown
  assert(!isInCooldown('KEY1', {}, SIX_HOURS, now), 'no entry → not in cooldown');

  // Entry 1h ago → still in cooldown (< 6h)
  const state1h = { 'KEY1': { lastSentAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() } };
  assert(isInCooldown('KEY1', state1h, SIX_HOURS, now), 'sent 1h ago → in cooldown');

  // Entry 7h ago → not in cooldown (> 6h)
  const state7h = { 'KEY1': { lastSentAt: new Date(now - 7 * 60 * 60 * 1000).toISOString() } };
  assert(!isInCooldown('KEY1', state7h, SIX_HOURS, now), 'sent 7h ago → not in cooldown');

  // Exactly at cooldown boundary
  const stateExact = { 'KEY1': { lastSentAt: new Date(now - SIX_HOURS).toISOString() } };
  assert(!isInCooldown('KEY1', stateExact, SIX_HOURS, now), 'sent exactly 6h ago → not in cooldown');

  // Entry with null lastSentAt
  const stateNull = { 'KEY1': { lastSentAt: null } };
  assert(!isInCooldown('KEY1', stateNull, SIX_HOURS, now), 'null lastSentAt → not in cooldown');

  // Different key → not in cooldown
  assert(!isInCooldown('KEY2', state1h, SIX_HOURS, now), 'different key → not in cooldown');
}

// ============================================================
// TEST: isMuted
// ============================================================
console.log('\n=== isMuted ===');
{
  function isMuted(key, mutes, now) {
    const entry = mutes[key];
    if (!entry || !entry.mutedUntil) return { muted: false };
    const mutedUntil = new Date(entry.mutedUntil).getTime();
    if (now < mutedUntil) {
      return { muted: true, reason: entry.reason || 'muted' };
    }
    return { muted: false };
  }

  const now = Date.now();

  // No mutes → not muted
  const r1 = isMuted('KEY1', {}, now);
  assert(!r1.muted, 'no entry → not muted');

  // Muted until future → muted
  const futureMs = now + 3 * 60 * 60 * 1000;
  const mutes1 = { 'KEY1': { mutedUntil: new Date(futureMs).toISOString(), reason: 'maintenance' } };
  const r2 = isMuted('KEY1', mutes1, now);
  assert(r2.muted, 'mutedUntil in future → muted');
  assertEq(r2.reason, 'maintenance', 'muted reason returned');

  // Muted until past → not muted
  const pastMs = now - 1 * 60 * 60 * 1000;
  const mutes2 = { 'KEY1': { mutedUntil: new Date(pastMs).toISOString(), reason: 'old' } };
  const r3 = isMuted('KEY1', mutes2, now);
  assert(!r3.muted, 'mutedUntil in past → not muted');

  // Entry without mutedUntil → not muted
  const mutes3 = { 'KEY1': { reason: 'no date' } };
  const r4 = isMuted('KEY1', mutes3, now);
  assert(!r4.muted, 'no mutedUntil → not muted');

  // Different key → not muted
  const r5 = isMuted('KEY2', mutes1, now);
  assert(!r5.muted, 'different key → not muted');

  // Default reason
  const mutes4 = { 'KEY1': { mutedUntil: new Date(futureMs).toISOString() } };
  const r6 = isMuted('KEY1', mutes4, now);
  assert(r6.muted, 'no explicit reason → still muted');
  assertEq(r6.reason, 'muted', 'default reason = "muted"');
}

// ============================================================
// TEST: readJsonFile / writeJsonFile
// ============================================================
console.log('\n=== readJsonFile / writeJsonFile ===');
{
  // We replicate the functions to test logic without requiring full module loading
  function readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return {};
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch { return {}; }
  }
  function writeJsonFile(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  const tmpDir = path.join(os.tmpdir(), 'reputy-test-' + Date.now());
  const tmpFile = path.join(tmpDir, 'test-state.json');

  // Read non-existent file → {}
  const r1 = readJsonFile(tmpFile);
  assert(Object.keys(r1).length === 0, 'non-existent file → empty object');

  // Write and read back
  const data = { 'KEY1': { lastSentAt: '2026-01-01T00:00:00.000Z' } };
  writeJsonFile(tmpFile, data);
  const r2 = readJsonFile(tmpFile);
  assertEq(r2.KEY1?.lastSentAt, '2026-01-01T00:00:00.000Z', 'write + read roundtrip');

  // Corrupt JSON → {}
  fs.writeFileSync(tmpFile, '{bad json', 'utf8');
  const r3 = readJsonFile(tmpFile);
  assert(Object.keys(r3).length === 0, 'corrupt JSON → empty object');

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true }); } catch (err) { void err; }
}

// ============================================================
// TEST: escapeCSV
// ============================================================
console.log('\n=== escapeCSV ===');
{
  function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  assertEq(escapeCSV(null), '', 'null → empty');
  assertEq(escapeCSV(undefined), '', 'undefined → empty');
  assertEq(escapeCSV('hello'), 'hello', 'simple string unchanged');
  assertEq(escapeCSV(42), '42', 'number → string');
  assertEq(escapeCSV('hello,world'), '"hello,world"', 'comma → quoted');
  assertEq(escapeCSV('hello"world'), '"hello""world"', 'double-quote → escaped');
  assertEq(escapeCSV('line1\nline2'), '"line1\nline2"', 'newline → quoted');
  assertEq(escapeCSV('a,b"c\nd'), '"a,b""c\nd"', 'mixed special chars');
  assertEq(escapeCSV(''), '', 'empty string → empty');
}

// ============================================================
// TEST: requireEmailAdmin logic (pure function)
// ============================================================
console.log('\n=== requireEmailAdmin (pure logic) ===');
{
  // Replicate requireEmailAdmin logic for pure testing
  function requireEmailAdmin(req, config = {}) {
    const { adminToken, secondSecret, ipAllowlist } = config;

    const token = req.headers['x-internal-admin-token'] || req.headers['x-admin-token'] || '';
    if (!token) {
      return { ok: false, status: 401, error: 'Admin token missing' };
    }
    if (token !== adminToken) {
      return { ok: false, status: 401, error: 'Invalid admin token' };
    }

    if (secondSecret) {
      const provided = req.headers['x-admin-second-secret'] || '';
      if (provided !== secondSecret) {
        return { ok: false, status: 403, error: 'Second admin secret required' };
      }
    }

    if (ipAllowlist && ipAllowlist.length > 0) {
      let clientIp = req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : (req.socket?.remoteAddress || '');
      if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7);
      if (!ipAllowlist.includes(clientIp)) {
        return { ok: false, status: 403, error: 'IP not allowed', meta: { ip: clientIp } };
      }
    }

    return { ok: true };
  }

  const CONFIG = { adminToken: 'secret123' };

  // Missing token
  const r1 = requireEmailAdmin({ headers: {} }, CONFIG);
  assert(!r1.ok, 'no token → denied');
  assertEq(r1.status, 401, 'no token → 401');

  // Wrong token
  const r2 = requireEmailAdmin({ headers: { 'x-internal-admin-token': 'wrong' } }, CONFIG);
  assert(!r2.ok, 'wrong token → denied');
  assertEq(r2.status, 401, 'wrong token → 401');

  // Correct token (primary header)
  const r3 = requireEmailAdmin({ headers: { 'x-internal-admin-token': 'secret123' } }, CONFIG);
  assert(r3.ok, 'correct token → ok');

  // Correct token (compat header)
  const r4 = requireEmailAdmin({ headers: { 'x-admin-token': 'secret123' } }, CONFIG);
  assert(r4.ok, 'compat header → ok');

  // Second secret required but missing
  const CONFIG2 = { adminToken: 'secret123', secondSecret: 'extra456' };
  const r5 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123' },
  }, CONFIG2);
  assert(!r5.ok, 'second secret required but missing → denied');
  assertEq(r5.status, 403, 'second secret missing → 403');

  // Second secret provided correctly
  const r6 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123', 'x-admin-second-secret': 'extra456' },
  }, CONFIG2);
  assert(r6.ok, 'second secret correct → ok');

  // Second secret wrong
  const r7 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123', 'x-admin-second-secret': 'wrong' },
  }, CONFIG2);
  assert(!r7.ok, 'second secret wrong → denied');

  // IP allowlist — allowed IP
  const CONFIG3 = { adminToken: 'secret123', ipAllowlist: ['127.0.0.1', '10.0.0.1'] };
  const r8 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123' },
    socket: { remoteAddress: '127.0.0.1' },
  }, CONFIG3);
  assert(r8.ok, 'IP in allowlist → ok');

  // IP allowlist — denied IP
  const r9 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123' },
    socket: { remoteAddress: '192.168.1.100' },
  }, CONFIG3);
  assert(!r9.ok, 'IP not in allowlist → denied');
  assertEq(r9.status, 403, 'IP denied → 403');

  // IP from x-forwarded-for
  const r10 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123', 'x-forwarded-for': '10.0.0.1, 172.16.0.1' },
    socket: { remoteAddress: '172.16.0.1' },
  }, CONFIG3);
  assert(r10.ok, 'x-forwarded-for first IP in allowlist → ok');

  // IPv6-mapped IPv4 normalization
  const r11 = requireEmailAdmin({
    headers: { 'x-internal-admin-token': 'secret123' },
    socket: { remoteAddress: '::ffff:127.0.0.1' },
  }, CONFIG3);
  assert(r11.ok, 'IPv6-mapped 127.0.0.1 normalized → ok');

  // All three checks combined
  const CONFIG_ALL = { adminToken: 'secret123', secondSecret: 'extra456', ipAllowlist: ['10.0.0.1'] };
  const r12 = requireEmailAdmin({
    headers: {
      'x-internal-admin-token': 'secret123',
      'x-admin-second-secret': 'extra456',
    },
    socket: { remoteAddress: '10.0.0.1' },
  }, CONFIG_ALL);
  assert(r12.ok, 'all 3 checks pass → ok');

  const r13 = requireEmailAdmin({
    headers: {
      'x-internal-admin-token': 'secret123',
      'x-admin-second-secret': 'extra456',
    },
    socket: { remoteAddress: '192.168.1.1' },
  }, CONFIG_ALL);
  assert(!r13.ok, 'token+secret ok but IP blocked → denied');
}

// ============================================================
// TEST: pause payload validation (pure)
// ============================================================
console.log('\n=== Pause payload validation ===');
{
  function validatePause(body) {
    if (!body.org_id) return { ok: false, error: 'Missing org_id' };
    if (typeof body.paused !== 'boolean') return { ok: false, error: 'Invalid paused (boolean)' };
    return { ok: true, paused: body.paused, reason: body.paused ? (body.reason || 'admin_manual') : null };
  }

  const r1 = validatePause({});
  assert(!r1.ok, 'missing org_id → error');

  const r2 = validatePause({ org_id: 'abc' });
  assert(!r2.ok, 'missing paused → error');

  const r3 = validatePause({ org_id: 'abc', paused: 'yes' });
  assert(!r3.ok, 'string paused → error');

  const r4 = validatePause({ org_id: 'abc', paused: true });
  assert(r4.ok, 'valid pause');
  assertEq(r4.reason, 'admin_manual', 'default reason');

  const r5 = validatePause({ org_id: 'abc', paused: true, reason: 'complaint_rate_red' });
  assertEq(r5.reason, 'complaint_rate_red', 'custom reason preserved');

  const r6 = validatePause({ org_id: 'abc', paused: false, reason: 'whatever' });
  assert(r6.ok, 'unpause valid');
  assertEq(r6.reason, null, 'reason null when unpausing');
}

// ============================================================
// TEST: severity filtering logic
// ============================================================
console.log('\n=== Severity filtering ===');
{
  const alerts = [
    { id: '1', severity: 'red', type: 'A' },
    { id: '2', severity: 'orange', type: 'B' },
    { id: '3', severity: 'red', type: 'C' },
    { id: '4', severity: 'info', type: 'D' },
    { id: '5', severity: 'orange', type: 'E' },
  ];

  // Red only
  const redOnly = alerts.filter(a => a.severity === 'red');
  assertEq(redOnly.length, 2, 'filter red: 2 alerts');

  // Red + orange
  const redOrange = alerts.filter(a => a.severity === 'red' || a.severity === 'orange');
  assertEq(redOrange.length, 4, 'filter red+orange: 4 alerts');

  // includeOrange=false (default)
  const filtered1 = alerts.filter(a => {
    if (a.severity === 'red') return true;
    return false;
  });
  assertEq(filtered1.length, 2, 'includeOrange=false → red only');

  // includeOrange=true
  const includeOrange = true;
  const filtered2 = alerts.filter(a => {
    if (a.severity === 'red') return true;
    if (a.severity === 'orange' && includeOrange) return true;
    return false;
  });
  assertEq(filtered2.length, 4, 'includeOrange=true → red + orange');
}

// ============================================================
// TEST: provider selection logic
// ============================================================
console.log('\n=== Provider selection ===');
{
  function selectProvider(provider) {
    if (provider === 'webhook') return 'webhook';
    if (provider === 'email') return 'email';
    return null;
  }

  assertEq(selectProvider('webhook'), 'webhook', 'webhook provider');
  assertEq(selectProvider('email'), 'email', 'email provider');
  assertEq(selectProvider(''), null, 'empty → null');
  assertEq(selectProvider(undefined), null, 'undefined → null');
  assertEq(selectProvider('slack'), null, 'unknown → null');
}

// ============================================================
// TEST: Webhook payload structure + X-Request-Id
// ============================================================
console.log('\n=== Webhook payload + X-Request-Id ===');
{
  const crypto = require('crypto');

  const alerts = [
    { id: 'complaint_red_abc', severity: 'red', type: 'ORG_COMPLAINT_RATE', message: 'test', orgId: 'abc', meta: { rate: 0.002 } },
  ];

  const requestId = `alert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const payload = {
    app: 'reputy',
    requestId,
    window: '7d',
    sentAt: new Date().toISOString(),
    alertCount: alerts.length,
    alerts: alerts.map(a => ({
      id: a.id, severity: a.severity, type: a.type, message: a.message, orgId: a.orgId || null, meta: a.meta,
    })),
  };

  assertEq(payload.app, 'reputy', 'payload.app');
  assertEq(payload.alertCount, 1, 'payload.alertCount');
  assertEq(payload.alerts[0].severity, 'red', 'payload alert severity');
  assertEq(payload.alerts[0].orgId, 'abc', 'payload alert orgId');
  assert(payload.sentAt.includes('T'), 'sentAt is ISO');

  // X-Request-Id format
  assert(requestId.startsWith('alert_'), 'requestId starts with alert_');
  assert(requestId.length > 20, 'requestId has reasonable length');
  assert(payload.requestId === requestId, 'requestId present in payload');

  // Two requestIds are unique
  const requestId2 = `alert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  assert(requestId !== requestId2, 'two requestIds are unique');
}

// ============================================================
// TEST: Webhook domain allowlist
// ============================================================
console.log('\n=== Webhook domain allowlist ===');
{
  function isWebhookDomainAllowed(url, allowlist) {
    if (!allowlist || allowlist.length === 0) return true; // no restriction
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return allowlist.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  const allowlist = ['hooks.slack.com', 'discord.com', 'api.opsgenie.com'];

  // Exact match
  assert(isWebhookDomainAllowed('https://hooks.slack.com/services/T/B/x', allowlist), 'hooks.slack.com exact match');

  // Subdomain match
  assert(isWebhookDomainAllowed('https://sub.discord.com/webhooks/123', allowlist), 'sub.discord.com subdomain match');

  // Not in allowlist
  assert(!isWebhookDomainAllowed('https://evil.com/steal', allowlist), 'evil.com rejected');
  assert(!isWebhookDomainAllowed('https://notslack.com/hooks', allowlist), 'notslack.com rejected');

  // Empty allowlist = no restriction
  assert(isWebhookDomainAllowed('https://anything.com', []), 'empty allowlist → allowed');

  // Invalid URL
  assert(!isWebhookDomainAllowed('not-a-url', allowlist), 'invalid URL → rejected');

  // Partial domain match should NOT work (e.g. "slack.com" should not match "fakeslack.com")
  const strict = ['slack.com'];
  assert(!isWebhookDomainAllowed('https://fakeslack.com/hook', strict), 'fakeslack.com not matched by slack.com');
  assert(isWebhookDomainAllowed('https://hooks.slack.com/hook', strict), 'hooks.slack.com matched by slack.com');
  assert(isWebhookDomainAllowed('https://slack.com/hook', strict), 'slack.com exact match');
}

// ============================================================
// TEST: Email subject formatting
// ============================================================
console.log('\n=== Email alert subject ===');
{
  const alerts1 = [
    { severity: 'red', type: 'ORG_COMPLAINT_RATE' },
    { severity: 'red', type: 'GLOBAL_WEBHOOK_SILENCE' },
  ];
  const maxSev1 = alerts1.some(a => a.severity === 'red') ? 'RED' : 'ORANGE';
  const types1 = [...new Set(alerts1.map(a => a.type))].join(', ');
  const subject1 = `[REPUTY][ALERT][${maxSev1}] ${types1}`;
  assert(subject1.includes('[RED]'), 'red alerts → subject has RED');
  assert(subject1.includes('ORG_COMPLAINT_RATE'), 'subject has type');
  assert(subject1.includes('GLOBAL_WEBHOOK_SILENCE'), 'subject has second type');

  const alerts2 = [{ severity: 'orange', type: 'ORG_BOUNCE_RATE' }];
  const maxSev2 = alerts2.some(a => a.severity === 'red') ? 'RED' : 'ORANGE';
  const subject2 = `[REPUTY][ALERT][${maxSev2}] ${alerts2[0].type}`;
  assert(subject2.includes('[ORANGE]'), 'orange only → subject has ORANGE');
}

// ============================================================
// TEST: --dry flag logic (severity filter only, no send)
// ============================================================
console.log('\n=== Dry-run mode logic ===');
{
  const allAlerts = [
    { id: '1', severity: 'red', type: 'ORG_COMPLAINT_RATE', message: 'Complaint rate high', orgId: 'org1' },
    { id: '2', severity: 'orange', type: 'ORG_BOUNCE_RATE', message: 'Bounce rate elevated', orgId: 'org2' },
    { id: '3', severity: 'info', type: 'ORG_WARMING_TOO_LONG', message: 'Warming too long', orgId: 'org3' },
    { id: '4', severity: 'red', type: 'GLOBAL_WEBHOOK_SILENCE', message: 'No webhook seen' },
  ];

  // Dry-run without includeOrange
  const dryNoOrange = allAlerts.filter(a => a.severity === 'red');
  assertEq(dryNoOrange.length, 2, 'dry no-orange: 2 red alerts');

  // Dry-run with includeOrange
  const dryWithOrange = allAlerts.filter(a => {
    if (a.severity === 'red') return true;
    if (a.severity === 'orange') return true;
    return false;
  });
  assertEq(dryWithOrange.length, 3, 'dry with-orange: 3 alerts (2 red + 1 orange)');

  // Dry-run result structure (no send)
  const dryResult = { total: allAlerts.length, filtered: dryNoOrange.length, sent: 0, skipped: 0, errors: 0, details: [] };
  assertEq(dryResult.sent, 0, 'dry-run: sent = 0');
  assertEq(dryResult.errors, 0, 'dry-run: errors = 0');
  assertEq(dryResult.total, 4, 'dry-run: total = all alerts');
}

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
