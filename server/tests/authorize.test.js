const assert = require("assert");
const { requireAdmin, requireStudent, requireAnyAuth, ownsRecord } = require("../middleware/authorize");

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}
function makeRes() {
  const r = { statusCode: null, body: null };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (o) => { r.body = o; return r; };
  return r;
}

async function run() {
  await ok("requireAnyAuth returns 401 when unauthenticated", () => {
    const r = {};
    const s = makeRes();
    requireAnyAuth(r, s, () => assert.fail("no next"));
    assert.strictEqual(s.statusCode, 401);
    assert.strictEqual(s.body.error.code, "UNAUTHENTICATED");
  });
  await ok("requireAnyAuth calls next when authenticated", () => {
    let called = false;
    const r = { user: { id: "1", role: "student" } };
    const s = {};
    requireAnyAuth(r, s, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok("requireAdmin returns 403 for non-admin", () => {
    const r = { user: { role: "student" } };
    const s = makeRes();
    requireAdmin(r, s, () => assert.fail("no next"));
    assert.strictEqual(s.statusCode, 403);
    assert.strictEqual(s.body.error.code, "FORBIDDEN");
  });
  await ok("requireAdmin calls next for admin", () => {
    let called = false;
    const r = { user: { role: "admin" } };
    const s = {};
    requireAdmin(r, s, () => { called = true; });
    assert.strictEqual(called, true);
  });
  await ok("requireStudent returns 403 for non-student", () => {
    const r = { user: { role: "admin" } };
    const s = makeRes();
    requireStudent(r, s, () => assert.fail("no next"));
    assert.strictEqual(s.statusCode, 403);
  });
  await ok("ownsRecord matches same user", () => {
    assert.strictEqual(ownsRecord("abc", { user: { id: "abc" } }), true);
    assert.strictEqual(ownsRecord("abc", { user: { id: "def" } }), false);
    assert.strictEqual(!ownsRecord(null, { user: { id: "abc" } }), true);
    assert.strictEqual(!ownsRecord(undefined, { user: { id: "abc" } }), true);
  });
  console.log("authorize.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
