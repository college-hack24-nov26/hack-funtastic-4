const assert = require("assert");
const mongoose = require("mongoose");
const { errorHandler } = require("../middleware/errorHandler");

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
  await ok("HttpError maps to status, code, message", () => {
    const HttpError = require("../utils/httpError");
    const err = new HttpError(409, "DUPLICATE", "exists", { field: "email" });
    const r = {}, s = makeRes();
    errorHandler(err, r, s, () => assert.fail());
    assert.strictEqual(s.statusCode, 409);
    assert.strictEqual(s.body.error.code, "DUPLICATE");
    assert.strictEqual(s.body.error.message, "exists");
    assert.deepStrictEqual(s.body.error.details, { field: "email" });
  });
  await ok("generic Error becomes 500", () => {
    const err = new Error("boom");
    const r = {}, s = makeRes();
    errorHandler(err, r, s, () => assert.fail());
    assert.strictEqual(s.statusCode, 500);
    assert.strictEqual(s.body.error.code, "INTERNAL_ERROR");
    assert.strictEqual(s.body.error.message, "boom");
  });
  await ok("duplicate key (11000) becomes 409 DUPLICATE", () => {
    const err = new Error("E11000 duplicate key");
    err.code = 11000;
    const r = {}, s = makeRes();
    errorHandler(err, r, s, () => assert.fail());
    assert.strictEqual(s.statusCode, 409);
    assert.strictEqual(s.body.error.code, "DUPLICATE");
  });
  await ok("CastError becomes 400 INVALID_ID", () => {
    const err = new mongoose.Error.CastError("ObjectId", "not-an-id", "_id");
    const r = {}, s = makeRes();
    errorHandler(err, r, s, () => assert.fail());
    assert.strictEqual(s.statusCode, 400);
    assert.strictEqual(s.body.error.code, "INVALID_ID");
  });
  await ok("mongoose ValidationError becomes 422 with field details", () => {
    const err = new mongoose.Error.ValidationError({});
    err.addError("email", new mongoose.Error.ValidatorError({ path: "email", message: "bad email" }));
    const r = {}, s = makeRes();
    errorHandler(err, r, s, () => assert.fail());
    assert.strictEqual(s.statusCode, 422);
    assert.strictEqual(s.body.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(s.body.error.details));
    assert.strictEqual(s.body.error.details[0].field, "email");
  });
  console.log("errorHandler.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
