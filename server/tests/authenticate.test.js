const assert = require("assert");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/authenticate");

process.env.JWT_SECRET = "unit-test-secret-not-for-production";

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}

async function run() {
  await ok("hashPassword and verifyPassword round-trip", async () => {
    const hash = await auth.hashPassword("Str0ngPassw0rd!");
    assert.ok(hash);
    assert.ok(await auth.verifyPassword("Str0ngPassw0rd!", hash));
    assert.strictEqual(await auth.verifyPassword("wrong", hash), false);
  });
  await ok("signSession issues a verifiable JWT", async () => {
    const user = { _id: "64e000000000000000000001", role: "student", displayName: "Arya" };
    const token = auth.signSession(user);
    assert.ok(typeof token === "string" && token.split(".").length === 3);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.strictEqual(decoded.sub, String(user._id));
    assert.strictEqual(decoded.role, "student");
  });
  await ok("attachUser with no token leaves req.user undefined and calls next", async () => {
    let called = false;
    const req = { cookies: {} };
    const res = {};
    auth.attachUser(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(req.user, undefined);
  });
  await ok("attachUser with invalid token treats as anonymous", async () => {
    let called = false;
    const req = { cookies: { mv_session: "not.a.valid.token" } };
    const res = {};
    auth.attachUser(req, res, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(req.user, undefined);
  });
  await ok("requireAuth returns 401 when unauthenticated", async () => {
    const req = {};
    const res = { status: (s) => { res.statusCode = s; return res; }, json: (o) => { res.body = o; return res; } };
    auth.requireAuth(req, res, () => { assert.fail("should not call next"); });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error.code, "UNAUTHENTICATED");
  });
  await ok("requireRole returns 403 for wrong role", async () => {
    const req = { user: { role: "student" } };
    const res = { status: (s) => { res.statusCode = s; return res; }, json: (o) => { res.body = o; return res; } };
    auth.requireRole("admin")(req, res, () => { assert.fail("should not call next"); });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error.code, "FORBIDDEN");
  });
  await ok("requireRole calls next for matching role", async () => {
    let called = false;
    const req = { user: { role: "admin" } };
    const res = {};
    auth.requireRole("admin")(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
  console.log("authenticate.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
