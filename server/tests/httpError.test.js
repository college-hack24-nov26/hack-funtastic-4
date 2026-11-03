const assert = require("assert");
const HttpError = require("../utils/httpError");

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}

async function run() {
  await ok("HttpError carries status, code, message, details", () => {
    const err = new HttpError(404, "NOT_FOUND", "missing item", { field: "slug" });
    assert.strictEqual(err.status, 404);
    assert.strictEqual(err.code, "NOT_FOUND");
    assert.strictEqual(err.message, "missing item");
    assert.deepStrictEqual(err.details, { field: "slug" });
    assert.ok(err instanceof Error);
  });
  await ok("HttpError with no details", () => {
    const err = new HttpError(401, "UNAUTHENTICATED", "sign in required");
    assert.strictEqual(err.details, undefined);
  });
  console.log("httpError.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
