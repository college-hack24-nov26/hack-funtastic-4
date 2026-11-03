const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}

async function run() {
  await ok("every backend JS file passes node --check", () => {
    const files = [];
    function collect(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full);
        else if (entry.name.endsWith(".js")) files.push(full);
      }
    }
    collect("server");
    let fail = 0;
    for (const p of files) {
      try { execFileSync("node", ["--check", p], { stdio: "pipe" }); }
      catch (err) { fail++; console.log("SYNTAX_FAIL", p, String(err.stderr).split("\n")[0]); }
    }
    assert.strictEqual(fail, 0);
  });
  await ok("all backend modules load without missing imports", () => {
    const modules = [
      "server/utils/httpError.js", "server/middleware/authenticate.js", "server/middleware/authorize.js",
      "server/middleware/validate.js", "server/middleware/errorHandler.js", "server/models/user.js",
      "server/models/learning.js", "server/models/library.js", "server/models/mission.js", "server/models/quest.js",
      "server/models/quiz.js", "server/models/rewards.js", "server/models/story.js", "server/models/study.js",
      "server/models/teacherChamber.js", "server/models/video.js", "server/routes/health.js", "server/routes/auth.js",
      "server/routes/student.js", "server/routes/content.js", "server/routes/contentAuth.js", "server/routes/admin.js",
      "server/server.js",
    ];
    for (const m of modules) require(path.resolve(m));
  });
  await ok("HttpError class identity is shared across all consumers", () => {
    const HttpError = require(path.resolve("server/utils/httpError.js"));
    const eh = require(path.resolve("server/middleware/errorHandler.js"));
    assert.strictEqual(eh.HttpError, HttpError);
  });
  await ok("routers export valid Express routers", () => {
    const contentAuth = require(path.resolve("server/routes/contentAuth.js"));
    const admin = require(path.resolve("server/routes/admin.js"));
    const student = require(path.resolve("server/routes/student.js"));
    const auth = require(path.resolve("server/routes/auth.js"));
    const content = require(path.resolve("server/routes/content.js"));
    const health = require(path.resolve("server/routes/health.js"));
    for (const r of [contentAuth, admin, student, auth, content, health]) {
      assert.ok(typeof r.use === "function" && typeof r.handle === "function");
    }
  });
  await ok("server.js exports app, start, stop", () => {
    const srv = require(path.resolve("server/server.js"));
    assert.ok(srv.app);
    assert.strictEqual(typeof srv.start, "function");
    assert.strictEqual(typeof srv.stop, "function");
  });
  console.log("module-load.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
