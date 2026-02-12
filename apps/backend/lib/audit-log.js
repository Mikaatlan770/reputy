/**
 * Reputy Audit Log Helper
 *
 * Writes a single row to audit_log.
 * Uses db.generateId(), db.nowISO(), db.run() — no other pattern.
 */

const db = require('./db');

/**
 * Write an audit log entry.
 *
 * @param {object} opts
 * @param {string|null}  opts.orgId        - Organisation concerned (nullable for system actions)
 * @param {string|null}  opts.actorUserId  - User who performed the action (nullable for system/cron)
 * @param {string}       opts.action       - Action name, e.g. 'login', 'billing.change', 'admin.impersonate'
 * @param {string|null}  opts.targetType   - Entity type, e.g. 'org', 'user', 'review_request'
 * @param {string|null}  opts.targetId     - Entity id
 * @param {object|null}  opts.meta         - Arbitrary metadata (will be JSON-stringified)
 * @param {object|null}  opts.req          - HTTP request object (to extract ip + user-agent)
 */
function writeAudit({ orgId = null, actorUserId = null, action, targetType = null, targetId = null, meta = null, req = null }) {
  const id = db.generateId();
  const ts = db.nowISO();
  const metaJson = JSON.stringify(meta ?? null);

  // Extract IP
  let ip = null;
  if (req) {
    const forwarded = req.headers && req.headers['x-forwarded-for'];
    if (forwarded) {
      ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null;
    }
    if (!ip) {
      ip = (req.connection && req.connection.remoteAddress)
        || (req.socket && req.socket.remoteAddress)
        || null;
    }
  }

  // Extract User-Agent
  let userAgent = null;
  if (req && req.headers) {
    userAgent = req.headers['user-agent'] || null;
  }

  db.run(`
    INSERT INTO audit_log (id, ts, org_id, actor_user_id, action, target_type, target_id, meta_json, ip, user_agent)
    VALUES ($id, $ts, $orgId, $actorUserId, $action, $targetType, $targetId, $metaJson, $ip, $userAgent)
  `, {
    id,
    ts,
    orgId,
    actorUserId,
    action,
    targetType,
    targetId,
    metaJson,
    ip,
    userAgent
  });

  return { id, ts };
}

module.exports = { writeAudit };
