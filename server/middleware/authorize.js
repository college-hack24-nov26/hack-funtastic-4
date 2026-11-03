const { requireAuth, requireRole } = require("./authenticate");

/*
 * Authorization helpers. Ownership enforcement: controllers must filter by
 * req.user.id; this middleware verifies object ownership where the record
 * carries a userId field (checked via services).
 */
function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}

function requireStudent(req, res, next) {
  return requireRole("student")(req, res, next);
}

function requireAnyAuth(req, res, next) {
  return requireAuth(req, res, next);
}

function ownsRecord(recordUserId, req) {
  return recordUserId && String(recordUserId) === String(req.user.id);
}

module.exports = { requireAdmin, requireStudent, requireAnyAuth, ownsRecord };
