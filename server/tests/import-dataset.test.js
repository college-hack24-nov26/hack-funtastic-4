const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}

async function run() {
  await ok("import-dataset script module loads and exposes importDataset", () => {
    const mod = require("../scripts/import-dataset");
    assert.strictEqual(typeof mod.importDataset, "function");
    assert.strictEqual(typeof mod.defaultDatasetDir, "string");
  });
  await ok("importDataset with empty dataset dir creates nothing and reports zero", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-empty-"));
    const mod = require("../scripts/import-dataset");
    const report = await mod.importDataset({ datasetDir: emptyDir, dryRun: false });
    assert.ok(report);
    assert.strictEqual(report.imported, 0);
    assert.strictEqual(report.skipped, 0);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
  await ok("importDataset dryRun does not write to the database", async () => {
    const TEST_URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/mythoverse_test";
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-fixture-"));
    fs.writeFileSync(path.join(fixtureDir, "library.json"), JSON.stringify([
      { slug: "fix-1", title: "Fixture One", category: "ref", summary: "summary", body: "body", status: "published" },
    ]));
    const mod = require("../scripts/import-dataset");
    const report = await mod.importDataset({ datasetDir: fixtureDir, dryRun: true });
    assert.strictEqual(report.imported, 0, "dry run must not import");
    assert.ok(report.actions.length > 0, "dry run must record intended actions");
    const count = await mongoose.model("LibraryEntry").countDocuments({ slug: "fix-1" });
    assert.strictEqual(count, 0, "dry run must not persist");
    await mongoose.disconnect();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });
  await ok("importDataset imports isolated fixtures and skips invalid records", async () => {
    const TEST_URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/mythoverse_test";
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-import-"));
    fs.writeFileSync(path.join(fixtureDir, "library.json"), JSON.stringify([
      { slug: "fix-good", title: "Fixture Good", category: "ref", summary: "summary", body: "body", status: "published" },
      { title: "Missing Slug", category: "ref", summary: "summary", body: "body" },
    ]));
    const mod = require("../scripts/import-dataset");
    const report = await mod.importDataset({ datasetDir: fixtureDir, dryRun: false });
    assert.strictEqual(report.imported, 1);
    assert.strictEqual(report.skipped, 1);
    const found = await mongoose.model("LibraryEntry").findOne({ slug: "fix-good" });
    assert.ok(found);
    assert.strictEqual(found.title, "Fixture Good");
    await mongoose.disconnect();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });
  console.log("import-dataset.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
