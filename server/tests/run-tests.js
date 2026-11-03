process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
process.env.SESSION_TTL_HOURS = "1";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/mythoverse_test";
process.env.MONGODB_URI_TEST = "mongodb://127.0.0.1:27017/mythoverse_test";
process.env.PORT = "0";
process.env.ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";

const testFiles = [
  "./module-load.test",
  "./httpError.test",
  "./validate.test",
  "./authenticate.test",
  "./authorize.test",
  "./errorHandler.test",
  "./db.test",
  "./import-dataset.test",
];

let totalPassed = 0;
let totalFailed = 0;
let results = [];

async function main() {
  for (const file of testFiles) {
    let mod;
    try { mod = require(file); } catch (err) {
      console.log("LOAD_FAIL  " + file + " :: " + err.message);
      totalFailed++;
      results.push({ file, passed: 0, failed: 1, error: err.message });
      continue;
    }
    if (!mod || typeof mod.run !== "function") {
      console.log("SKIP_NO_RUN  " + file);
      continue;
    }
    let res;
    try { res = await mod.run(); } catch (err) {
      console.log("RUN_FAIL  " + file + " :: " + err.message);
      totalFailed++;
      results.push({ file, passed: 0, failed: 1, error: err.message });
      continue;
    }
    totalPassed += res.passed;
    totalFailed += res.failed;
    results.push({ file, ...res });
  }
  console.log("");
  console.log("================ TEST SUMMARY ================");
  for (const r of results) {
    const status = r.failed === 0 ? "PASS" : "FAIL";
    console.log(`${status.padEnd(4)} ${r.file}  ${r.passed} passed, ${r.failed} failed${r.error ? " :: " + r.error : ""}`);
  }
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("RUNNER_ERROR", err.message);
  process.exit(2);
});
