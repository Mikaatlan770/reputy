#!/usr/bin/env node
/**
 * Reputy Migration Script: data.json → SQLite
 * 
 * Usage: node lib/migrate-json-to-sqlite.js
 * 
 * This script is IDEMPOTENT - can be run multiple times safely.
 * It uses INSERT OR IGNORE to avoid duplicates.
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

// ============================================================
// Configuration
// ============================================================

const DATA_JSON_PATH = path.join(__dirname, '..', 'data.json');

// ============================================================
// Migration Stats
// ============================================================

const stats = {
  orgs: { migrated: 0, skipped: 0 },
  users: { migrated: 0, skipped: 0 },
  sessions: { migrated: 0, skipped: 0 },
  review_requests: { migrated: 0, skipped: 0 },
  feedbacks: { migrated: 0, skipped: 0 },
  usage_ledger: { migrated: 0, skipped: 0 },
  telemetry_events: { migrated: 0, skipped: 0 },
  email_verifications: { migrated: 0, skipped: 0 },
  // emailOutbox intentionally NOT migrated
};

// ============================================================
// Helper Functions
// ============================================================

function loadDataJson() {
  if (!fs.existsSync(DATA_JSON_PATH)) {
    throw new Error(`data.json not found at: ${DATA_JSON_PATH}`);
  }
  
  const raw = fs.readFileSync(DATA_JSON_PATH, 'utf8');
  return JSON.parse(raw);
}

function insertOrIgnore(table, sql, params, statKey) {
  try {
    const result = db.run(sql, params);
    if (result.changes > 0) {
      stats[statKey].migrated++;
    } else {
      stats[statKey].skipped++;
    }
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      stats[statKey].skipped++;
    } else {
      console.error(`[MIGRATE] Error inserting into ${table}:`, err.message);
      throw err;
    }
  }
}

// ============================================================
// Migration Functions
// ============================================================

function migrateOrgs(data) {
  console.log('\n[MIGRATE] Migrating orgs...');
  
  const orgs = data.orgs || [];
  
  for (const org of orgs) {
    // Hash the API token
    const apiTokenHash = org.apiToken ? db.hashToken(org.apiToken) : db.hashToken(db.generateId());
    const apiTokenPreviousHash = org.apiTokenPrevious ? db.hashToken(org.apiTokenPrevious) : null;
    
    // Merge old settings singleton into options_json if this org matches
    // (For now, we just preserve existing options)
    const optionsJson = {
      ...(org.options || {}),
      // If there was a global settings, it should be manually assigned to the right org
      // We preserve reviewRouting from options
    };
    
    // If global settings exist and this is the "main" org, merge them
    if (data.settings && org.id === data.orgs[0]?.id) {
      optionsJson.googleReviewUrl = data.settings.googleReviewUrl || optionsJson.googleReviewUrl;
      optionsJson.cabinetName = data.settings.cabinetName || optionsJson.cabinetName;
      if (data.settings.reviewRouting) {
        optionsJson.reviewRouting = data.settings.reviewRouting;
      }
    }
    
    insertOrIgnore('orgs', `
      INSERT OR IGNORE INTO orgs (
        id, public_key, name, email, vertical, status,
        api_token_hash, api_token_created_at, api_token_last_rotated_at,
        api_token_previous_hash, api_token_previous_expires_at,
        billing_json, plan_json, negotiated_json, options_json,
        quotas_json, balances_json, subscription_credits_json,
        created_at, updated_at
      ) VALUES (
        $id, $publicKey, $name, $email, $vertical, $status,
        $apiTokenHash, $apiTokenCreatedAt, $apiTokenLastRotatedAt,
        $apiTokenPreviousHash, $apiTokenPreviousExpiresAt,
        $billingJson, $planJson, $negotiatedJson, $optionsJson,
        $quotasJson, $balancesJson, $subscriptionCreditsJson,
        $createdAt, $updatedAt
      )
    `, {
      id: org.id,
      publicKey: org.publicKey,
      name: org.name || 'Unknown',
      email: org.email || null,
      vertical: org.vertical || 'health',
      status: org.status || 'active',
      apiTokenHash,
      apiTokenCreatedAt: org.apiTokenCreatedAt || null,
      apiTokenLastRotatedAt: org.apiTokenLastRotatedAt || null,
      apiTokenPreviousHash,
      apiTokenPreviousExpiresAt: org.apiTokenPreviousExpiresAt || null,
      billingJson: db.toJson(org.billing),
      planJson: db.toJson(org.plan),
      negotiatedJson: db.toJson(org.negotiated),
      optionsJson: db.toJson(optionsJson),
      quotasJson: db.toJson(org.quotas),
      balancesJson: db.toJson(org.packWallet || org.balances || {}),
      subscriptionCreditsJson: db.toJson(org.subscriptionCredits || {}),
      createdAt: org.createdAt || db.nowISO(),
      updatedAt: org.updatedAt || db.nowISO()
    }, 'orgs');
  }
}

function migrateUsers(data) {
  console.log('[MIGRATE] Migrating users...');
  
  const users = data.users || [];
  
  for (const user of users) {
    insertOrIgnore('users', `
      INSERT OR IGNORE INTO users (
        id, org_id, email, password_hash, role, name,
        email_verified, last_login_at, created_at, updated_at
      ) VALUES (
        $id, $orgId, $email, $passwordHash, $role, $name,
        $emailVerified, $lastLoginAt, $createdAt, $updatedAt
      )
    `, {
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role || 'owner',
      name: user.name || null,
      emailVerified: user.emailVerified ? 1 : 0,
      lastLoginAt: user.lastLoginAt || null,
      createdAt: user.createdAt || db.nowISO(),
      updatedAt: user.updatedAt || db.nowISO()
    }, 'users');
  }
}

function migrateSessions(data) {
  console.log('[MIGRATE] Migrating sessions...');
  
  const sessions = data.sessions || [];
  
  for (const session of sessions) {
    insertOrIgnore('sessions', `
      INSERT OR IGNORE INTO sessions (
        token, user_id, org_id, expires_at
      ) VALUES (
        $token, $userId, $orgId, $expiresAt
      )
    `, {
      token: session.token,
      userId: session.userId,
      orgId: session.orgId,
      expiresAt: session.expiresAt
    }, 'sessions');
  }
}

function migrateRequests(data) {
  console.log('[MIGRATE] Migrating requests → review_requests...');
  
  const requests = data.requests || {};
  
  // Requests in data.json is an object keyed by ID
  for (const [requestId, req] of Object.entries(requests)) {
    // Determine org_id - may be in meta or we need to guess from context
    // For legacy data, we might need to assign to a default org
    let orgId = req.orgId || req.meta?.orgId;
    
    // If no orgId, try to find it from the first org (legacy single-tenant)
    if (!orgId && data.orgs && data.orgs.length > 0) {
      orgId = data.orgs[0].id;
    }
    
    if (!orgId) {
      console.warn(`[MIGRATE] Skipping request ${requestId}: no org_id found`);
      stats.review_requests.skipped++;
      continue;
    }
    
    insertOrIgnore('review_requests', `
      INSERT OR IGNORE INTO review_requests (
        id, idempotency_key, org_id, channel, status,
        patient_json, feedback_url, meta_json, created_at, updated_at
      ) VALUES (
        $id, $idempotencyKey, $orgId, $channel, $status,
        $patientJson, $feedbackUrl, $metaJson, $createdAt, $updatedAt
      )
    `, {
      id: db.generateId(),  // New internal ID
      idempotencyKey: requestId,  // Original ID becomes idempotency key
      orgId,
      channel: req.channel || 'email',
      status: req.status || 'created',
      patientJson: db.toJson(req.patient),
      feedbackUrl: req.feedbackUrl || null,
      metaJson: db.toJson(req.meta),
      createdAt: req.createdAt || db.nowISO(),
      updatedAt: req.updatedAt || req.createdAt || db.nowISO()
    }, 'review_requests');
  }
}

function migrateFeedbacks(data) {
  console.log('[MIGRATE] Migrating feedbacks...');
  
  const feedbacks = data.feedbacks || {};
  const database = db.getDb();
  
  // Feedbacks in data.json is an object keyed by request ID
  for (const [requestId, feedback] of Object.entries(feedbacks)) {
    // Find the review_request by idempotency_key
    const reviewRequest = database.prepare(
      'SELECT id FROM review_requests WHERE idempotency_key = ?'
    ).get(requestId);
    
    if (!reviewRequest) {
      console.warn(`[MIGRATE] Skipping feedback for request ${requestId}: request not found`);
      stats.feedbacks.skipped++;
      continue;
    }
    
    insertOrIgnore('feedbacks', `
      INSERT OR IGNORE INTO feedbacks (
        id, request_db_id, rating, comment, source, created_at
      ) VALUES (
        $id, $requestDbId, $rating, $comment, $source, $createdAt
      )
    `, {
      id: feedback.id || db.generateId(),
      requestDbId: reviewRequest.id,
      rating: feedback.rating || null,
      comment: feedback.comment || null,
      source: feedback.source || null,
      createdAt: feedback.createdAt || db.nowISO()
    }, 'feedbacks');
  }
}

function migrateUsageLedger(data) {
  console.log('[MIGRATE] Migrating usage_ledger...');
  
  const ledger = data.usageLedger || [];
  
  for (const entry of ledger) {
    insertOrIgnore('usage_ledger', `
      INSERT OR IGNORE INTO usage_ledger (
        id, org_id, type, qty, details_json, created_at
      ) VALUES (
        $id, $orgId, $type, $qty, $detailsJson, $createdAt
      )
    `, {
      id: entry.id,
      orgId: entry.orgId,
      type: entry.type,
      qty: entry.qty || entry.amount || 1,
      detailsJson: db.toJson({
        source: entry.source,
        reason: entry.reason,
        requestId: entry.requestId,
        ...entry.details
      }),
      createdAt: entry.createdAt || db.nowISO()
    }, 'usage_ledger');
  }
}

function migrateTelemetry(data) {
  console.log('[MIGRATE] Migrating telemetry → telemetry_events...');
  
  const telemetry = data.telemetry || [];
  
  for (const event of telemetry) {
    insertOrIgnore('telemetry_events', `
      INSERT OR IGNORE INTO telemetry_events (
        id, org_id, source, level, data_json, created_at
      ) VALUES (
        $id, $orgId, $source, $level, $dataJson, $createdAt
      )
    `, {
      id: event.id,
      orgId: event.orgId || null,
      source: event.source || 'unknown',
      level: event.level || 'info',
      dataJson: db.toJson({
        action: event.action,
        publicKey: event.publicKey,
        ...event.data
      }),
      createdAt: event.createdAt || db.nowISO()
    }, 'telemetry_events');
  }
}

function migrateEmailVerifications(data) {
  console.log('[MIGRATE] Migrating email_verifications...');
  
  const verifications = data.emailVerifications || [];
  
  for (const verif of verifications) {
    insertOrIgnore('email_verifications', `
      INSERT OR IGNORE INTO email_verifications (
        id, email, code, org_id, expires_at, created_at
      ) VALUES (
        $id, $email, $code, $orgId, $expiresAt, $createdAt
      )
    `, {
      id: verif.id,
      email: verif.email,
      code: verif.code,
      orgId: verif.orgId || null,
      expiresAt: verif.expiresAt || null,
      createdAt: verif.createdAt || db.nowISO()
    }, 'email_verifications');
  }
}

// ============================================================
// Main Migration
// ============================================================

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  
  let totalMigrated = 0;
  let totalSkipped = 0;
  
  for (const [table, counts] of Object.entries(stats)) {
    console.log(`  ${table.padEnd(20)} : ${counts.migrated} migrated, ${counts.skipped} skipped`);
    totalMigrated += counts.migrated;
    totalSkipped += counts.skipped;
  }
  
  console.log('-'.repeat(60));
  console.log(`  ${'TOTAL'.padEnd(20)} : ${totalMigrated} migrated, ${totalSkipped} skipped`);
  console.log('='.repeat(60));
  
  // Verify table counts
  console.log('\nFinal table counts:');
  const counts = db.getTableCounts();
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(20)} : ${count}`);
  }
  
  // Check foreign key integrity
  const fkViolations = db.checkForeignKeys();
  if (fkViolations.length > 0) {
    console.error('\n⚠️  FOREIGN KEY VIOLATIONS DETECTED:');
    for (const v of fkViolations) {
      console.error(`  - ${v.table}: row ${v.rowid} → ${v.parent}`);
    }
  } else {
    console.log('\n✅ Foreign key integrity: OK');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('REPUTY MIGRATION: data.json → SQLite');
  console.log('='.repeat(60));
  console.log(`Source: ${DATA_JSON_PATH}`);
  console.log(`Target: ${db.DB_PATH}`);
  
  // Initialize schema
  console.log('\n[MIGRATE] Initializing schema...');
  db.initSchema();
  
  // Load data.json
  console.log('[MIGRATE] Loading data.json...');
  const data = loadDataJson();
  
  // Run migrations in a transaction for atomicity
  console.log('[MIGRATE] Starting migration...');
  
  db.transaction(() => {
    // Order matters due to foreign keys!
    migrateOrgs(data);
    migrateUsers(data);
    migrateSessions(data);
    migrateRequests(data);
    migrateFeedbacks(data);
    migrateUsageLedger(data);
    migrateTelemetry(data);
    migrateEmailVerifications(data);
    // emailOutbox intentionally NOT migrated (debug data)
  });
  
  printSummary();
  
  console.log('\n✅ Migration complete!');
  console.log('   data.json is now READ-ONLY (backup)');
  console.log('   SQLite database is ready for use');
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
