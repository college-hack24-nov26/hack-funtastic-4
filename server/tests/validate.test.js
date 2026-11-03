const assert = require("assert");
const { validate } = require("../middleware/validate");

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}

async function run() {
  await ok("validates a clean object and returns coerced values", () => {
    const clean = validate(
      { email: "  Arya@example.com  ", age: "12", agree: "true", tags: "a" },
      { email: { type: "string", required: true, min: 3 }, age: { type: "number", required: true }, agree: { type: "boolean", required: true }, tags: { type: "array", required: false } },
    );
    assert.strictEqual(clean.email, "Arya@example.com");
    assert.strictEqual(clean.age, 12);
    assert.strictEqual(clean.agree, true);
    assert.deepStrictEqual(clean.tags, ["a"]);
  });
  await ok("reports required missing fields", () => {
    try { validate({}, { name: { type: "string", required: true } }); assert.fail("should have thrown"); }
    catch (err) {
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, "VALIDATION_ERROR");
      assert.strictEqual(err.details[0].field, "name");
    }
  });
  await ok("reports type mismatches and string constraints", () => {
    try {
      validate({ name: 42, bio: "x".repeat(200) }, { name: { type: "string", required: true }, bio: { type: "string", max: 50 } });
      assert.fail("should have thrown");
    } catch (err) {
      assert.strictEqual(err.status, 422);
      const fields = err.details.map((d) => d.field);
      assert.ok(fields.includes("name"));
      assert.ok(fields.includes("bio"));
    }
  });
  await ok("applies defaults for optional missing fields", () => {
    const clean = validate({ role: "student" }, { role: { type: "string", enum: ["student", "admin"], default: "student" }, ageGroup: { type: "string", default: "9-12" } });
    assert.strictEqual(clean.role, "student");
    assert.strictEqual(clean.ageGroup, "9-12");
  });
  await ok("rejects enum violations", () => {
    try { validate({ role: "god" }, { role: { type: "string", enum: ["student", "admin"] } }); assert.fail("should have thrown"); }
    catch (err) {
      assert.strictEqual(err.status, 422);
      assert.ok(err.details[0].message.includes("one of"));
    }
  });
  console.log("validate.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
