/**
 * Reputy RBAC — Role-Based Access Control (minimal)
 *
 * Applicable ONLY on endpoints using getAuthUser() (session auth).
 * NOT applicable on requireAdmin (static token) or extension auth (publicKey/apiToken).
 *
 * Usage (imperative, not middleware):
 *   const auth = getAuthUser(req, data);
 *   if (!auth) { return sendJson(res, 401, ...); }
 *   if (!checkRole(auth, ['owner', 'admin'], res)) return;
 */

/**
 * Check if the authenticated user has one of the allowed roles.
 * If authorized → returns true (caller continues).
 * If not → sends 403 JSON response and returns false (caller must return).
 *
 * @param {object} auth - Result of getAuthUser(req, data): { user, org, session }
 * @param {string[]} allowedRoles - e.g. ['owner', 'admin']
 * @param {object} res - HTTP response object
 * @returns {boolean}
 */
function checkRole(auth, allowedRoles, res) {
  const role = auth?.user?.role || 'agent';
  if (allowedRoles.includes(role)) return true;

  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: false,
    error: 'FORBIDDEN',
    message: `Rôle "${role}" non autorisé pour cette action`,
    requiredRoles: allowedRoles,
  }));
  return false;
}

module.exports = { checkRole };
