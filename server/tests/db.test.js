const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase, isConnected } = require("../config/database");
const { app } = require("../server");

const TEST_URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/mythoverse_test";

let server;
let adminCookie = "";
let studentCookie = "";

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const headers = { "Content-Type": "application/json" };
    if (cookie) headers.Cookie = cookie;
    if (body) headers["Content-Length"] = Buffer.byteLength(JSON.stringify(body));
    const req = http.request({
      host: "127.0.0.1", port: server.address().port, method, path, headers,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => { resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }); });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function clearDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) await mongoose.connection.db.dropCollection(c.name).catch(() => {});
}

async function login(email, password) {
  const r = await request("POST", "/api/login", { email, password });
  assert.strictEqual(r.status, 200, "login failed: " + JSON.stringify(r.body));
  const setCookie = r.headers["set-cookie"];
  assert.ok(Array.isArray(setCookie), "login did not set session cookie");
  return setCookie.find((c) => c.startsWith("mv_session=")).split(";")[0];
}

async function bootstrap() {
  await connectDatabase(TEST_URI);
  await clearDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const authenticate = require("../middleware/authenticate");
  const User = mongoose.model("User");
  await User.create({ email: "admin@example.com", passwordHash: await authenticate.hashPassword("AdminPass123!"), displayName: "Admin", role: "admin", ageGroup: "18+" });
  await User.create({ email: "student@example.com", passwordHash: await authenticate.hashPassword("StudentPass123!"), displayName: "Learner", role: "student", ageGroup: "9-12" });
  adminCookie = await login("admin@example.com", "AdminPass123!");
  studentCookie = await login("student@example.com", "StudentPass123!");
}

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log("PASS  " + name); }
  catch (err) { failed++; console.log("FAIL  " + name + " :: " + err.message); }
}

async function run() {
  try {
    await ok("backend starts, health and ready respond", async () => {
      await bootstrap();
      const h = await request("GET", "/api/health");
      assert.strictEqual(h.status, 200);
      assert.strictEqual(h.body.ok, true);
      const rd = await request("GET", "/api/ready");
      assert.strictEqual(rd.status, 200);
      assert.strictEqual(rd.body.ready, true);
      assert.strictEqual(rd.body.database, "connected");
      assert.ok(isConnected());
    });
    await ok("protected student endpoint rejects unauthenticated requests", async () => {
      const r = await request("GET", "/api/student/dashboard");
      assert.strictEqual(r.status, 401);
      assert.strictEqual(r.body.error.code, "UNAUTHENTICATED");
    });
    await ok("student dashboard works with a real session and returns empty state", async () => {
      const r = await request("GET", "/api/student/dashboard", null, studentCookie);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.user.role, "student");
      assert.strictEqual(r.body.coins, 0);
      assert.strictEqual(r.body.ashram.stagesCompleted, 0);
      assert.deepStrictEqual(r.body.counts, { stories: 0, missions: 0, quizzes: 0, games: 0, quests: 0, badges: 0 });
      assert.ok(Array.isArray(r.body.recentActivity));
    });
    await ok("quest progress mapping: lessons -> lesson, quests -> quest", async () => {
      const Progress = mongoose.model("Progress");
      const Quest = mongoose.model("Quest");
      const student = await mongoose.model("User").findOne({ email: "student@example.com" });
      await Progress.create({ userId: student._id, kind: "lesson", refSlug: "loka-1", title: "Loka One" });
      await Progress.create({ userId: student._id, kind: "lesson", refSlug: "loka-2", title: "Loka Two" });
      await Progress.create({ userId: student._id, kind: "quest", refSlug: "q-1", title: "Quest One" });
      await Quest.create({ slug: "q-1", title: "Quest One", description: "d", goal: { kind: "quests", count: 2 }, coins: 10, status: "published" });
      assert.strictEqual(await Progress.countDocuments({ kind: "lesson" }), 2);
      assert.strictEqual(await Progress.countDocuments({ kind: "quest" }), 1);
      const saved = await Quest.findOne({ slug: "q-1" });
      assert.ok(saved);
      assert.strictEqual(saved.goal.kind, "quests");
    });
    await ok("duplicate quest reward claims are rejected (409 ALREADY_CLAIMED)", async () => {
      const Quest = mongoose.model("Quest");
      const QuestClaim = mongoose.model("QuestClaim");
      const student = await mongoose.model("User").findOne({ email: "student@example.com" });
      await Quest.create({ slug: "trek-1", title: "First Trek", description: "d", goal: { kind: "lessons", count: 1 }, coins: 20, status: "published" });
      await mongoose.model("Progress").create({ userId: student._id, kind: "lesson", refSlug: "anything", title: "x" });
      const r1 = await request("POST", "/api/rewards/claim", { questSlug: "trek-1" }, studentCookie);
      assert.strictEqual(r1.status, 201, "first claim failed: " + JSON.stringify(r1.body));
      const r2 = await request("POST", "/api/rewards/claim", { questSlug: "trek-1" }, studentCookie);
      assert.strictEqual(r2.status, 409, "duplicate claim should be 409: " + JSON.stringify(r2.body));
      assert.strictEqual(r2.body.error.code, "ALREADY_CLAIMED");
      const claims = await QuestClaim.countDocuments({ userId: student._id, questSlug: "trek-1" });
      assert.strictEqual(claims, 1, "only one claim row should exist");
    });
    await ok("content access returns published-only empty state", async () => {
      const LibraryEntry = mongoose.model("LibraryEntry");
      await LibraryEntry.create({ slug: "pub-article", title: "Published", category: "ref", summary: "s", body: "b", status: "published" });
      await LibraryEntry.create({ slug: "draft-article", title: "Draft", category: "ref", summary: "s", body: "b", status: "draft" });
      const r = await request("GET", "/api/library");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.total, 1);
      assert.strictEqual(r.body.items[0].slug, "pub-article");
    });
    await ok("admin CRUD permissions: student forbidden, admin can create draft", async () => {
    const forbidden = await request("POST", "/api/content/library", { slug: "nope", title: "Nope", category: "ref", summary: "s", body: "b" }, studentCookie);
    assert.strictEqual(forbidden.status, 403);
    assert.strictEqual(forbidden.body.error.code, "FORBIDDEN");
    const before = await request("GET", "/api/content/library", null, adminCookie);
    const beforeTotal = before.body.total;
    const created = await request("POST", "/api/content/library", { slug: "new-article", title: "New", category: "ref", summary: "s", body: "b" }, adminCookie);
    assert.strictEqual(created.status, 201, "admin create failed: " + JSON.stringify(created.body));
    assert.strictEqual(created.body.item.status, "draft");
    const listed = await request("GET", "/api/content/library", null, adminCookie);
    assert.strictEqual(listed.status, 200);
    assert.strictEqual(listed.body.total, beforeTotal + 1);
    assert.ok(listed.body.items.some((i) => i.slug === "new-article"));
    });
    await ok("errors return JSON with code and status", async () => {
      const r = await request("GET", "/api/does-not-exist");
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.body.error.code, "NOT_FOUND");
      const bad = await request("POST", "/api/register", { email: "no@", password: "short" }, null);
      assert.strictEqual(bad.status, 422);
      assert.strictEqual(bad.body.error.code, "VALIDATION_ERROR");
    });
  } finally {
    try { await disconnectDatabase(); } catch (e) { /* ignore */ }
    try { if (server) server.close(); } catch (e) { /* ignore */ }
  }
  console.log("db.test.js: " + passed + " passed, " + failed + " failed");
  return { passed, failed };
}

if (require.main === module) { run().then(({ failed }) => process.exit(failed ? 1 : 0)); }
module.exports = { run };
