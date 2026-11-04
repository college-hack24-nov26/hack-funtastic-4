require('dotenv').config();

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const teacherProfiles = require('../src/data/teacherProfiles');
const Teacher = require('../src/models/teacher');
const TeacherProgress = require('../src/models/teacherProgress');
const TeacherAssessmentAttempt = require('../src/models/teacherAssessmentAttempt');
const User = require('../src/models/user');
const migration = require('../scripts/reconcileLegacyTeacherRecords');

const databaseName = `mythoverse_teacher_reconcile_test_${randomBytes(10).toString('hex')}`;
const silentOutput = { log() {} };
const testPassword = 'reconciliation-disposable-test-password';

function toComparable(value) {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toComparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, toComparable(value[key])]));
  return value;
}

async function snapshot(collection) {
  return {
    documents: (await collection.find({}).sort({ _id: 1 }).toArray()).map(toComparable),
    indexes: (await collection.indexes()).map((index) => ({ name: index.name, key: toComparable(index.key), unique: Boolean(index.unique) }))
      .sort((left, right) => left.name.localeCompare(right.name))
  };
}

async function createLegacyFixture() {
  const database = mongoose.connection.db;
  assert.equal(mongoose.connection.name, databaseName, 'fixture must use its unique disposable database');

  const student = await User.create({
    displayName: 'Disposable Teacher Student',
    email: 'teacher-reconcile-student@test.invalid',
    passwordHash: await bcrypt.hash(testPassword, 4),
    ageGroup: '9-12',
    role: 'student',
    dharmaPoints: 23,
    adharmaPoints: 2
  });
  const admin = await User.create({
    displayName: 'Disposable Teacher Admin',
    email: 'teacher-reconcile-admin@test.invalid',
    passwordHash: await bcrypt.hash(testPassword, 4),
    role: 'admin'
  });

  const teachers = database.collection('teachers');
  const progress = database.collection('teacherprogresses');
  const chapters = database.collection('teacherchapters');
  const attempts = database.collection('teacherassessmentattempts');
  await teachers.createIndex({ name: 1 }, { unique: true, name: 'name_1' });
  await teachers.createIndex({ publicationStatus: 1, 'ageGroups.ageGroup': 1, updatedAt: -1 }, { name: 'publicationStatus_1_ageGroups.ageGroup_1_updatedAt_-1' });
  await progress.createIndex({ user: 1 }, { name: 'user_1' });
  await progress.createIndex({ user: 1, teacherKey: 1 }, { unique: true, name: 'user_1_teacherKey_1' });
  await progress.createIndex({ student: 1, lastAccessedAt: -1 }, { name: 'student_1_lastAccessedAt_-1' });
  await chapters.createIndex({ teacher: 1 }, { name: 'teacher_1' });
  await chapters.createIndex({ ageGroup: 1 }, { name: 'ageGroup_1' });
  await chapters.createIndex({ status: 1 }, { name: 'status_1' });
  await chapters.createIndex({ teacher: 1, ageGroup: 1, slug: 1 }, { unique: true, name: 'teacher_1_ageGroup_1_slug_1' });
  await attempts.createIndex({ student: 1, submissionKey: 1 }, { unique: true, name: 'student_1_submissionKey_1' });
  await attempts.createIndex({ student: 1, teacher: 1, ageGroup: 1, submittedAt: -1 }, { name: 'student_1_teacher_1_ageGroup_1_submittedAt_-1' });

  const now = new Date('2026-01-02T03:04:05.000Z');
  const teacherIds = new Map();
  const progressIds = new Map();
  const legacyKeys = new Map(teacherProfiles.map((profile) => [profile.slug, profile.slug]));
  legacyKeys.set('kanada', 'kanad');
  for (const profile of teacherProfiles) {
    const _id = new mongoose.Types.ObjectId();
    teacherIds.set(profile.slug, _id);
    await teachers.insertOne({
      _id,
      name: profile.name,
      subject: profile.teachingDomain,
      description: profile.shortIntroduction,
      guideCharacter: profile.name,
      imageUrl: `/legacy/${profile.slug}.png`,
      active: true,
      createdAt: now,
      updatedAt: now,
      __v: 0
    });
    const progressId = new mongoose.Types.ObjectId();
    progressIds.set(profile.slug, progressId);
    await progress.insertOne({
      _id: progressId,
      user: student._id,
      teacherKey: legacyKeys.get(profile.slug),
      teacherName: profile.name,
      description: profile.shortIntroduction,
      subjects: [],
      createdAt: now,
      updatedAt: now,
      __v: 0
    });
  }
  return { student, admin, teacherIds, progressIds, teachers, progress, chapters, attempts };
}

async function loginCookie(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword })
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie || '', /;\s*HttpOnly/i);
  return cookie.split(';', 1)[0];
}

async function apiRequest(baseUrl, path, { method = 'GET', cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Origin = baseUrl;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { response, body: await response.json().catch(() => ({})) };
}

test('legacy teacher reconciliation is safe, resumable, and compatible with the existing APIs', async (t) => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI is required for isolated migration tests.');
  assert.ok(process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET, 'utf8') >= 32,
    'JWT_SECRET is required for authenticated admin/student API checks.');
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
    autoCreate: false
  });
  assert.equal(mongoose.connection.name, databaseName);
  let server;
  let baseUrl;
  try {
    let fixture = await createLegacyFixture();

    await t.test('dry-run validates canonical matching and performs no writes or index changes', async () => {
      const beforeTeachers = await snapshot(fixture.teachers);
      const beforeProgress = await snapshot(fixture.progress);
      const beforeChapters = await snapshot(fixture.chapters);
      const beforeAttempts = await snapshot(fixture.attempts);
      const plan = await migration.dryRun({ output: silentOutput });
      assert.equal(plan.summary.beforeCounts.teachers, 6);
      assert.equal(plan.summary.beforeCounts.progress, 6);
      assert.ok(plan.summary.canonicalTeachers.every((item) => item.action === 'update-in-place'));
      assert.ok(plan.summary.progressRecords.every((item) => item.action === 'add-current-fields-preserve-legacy'));
      assert.match(plan.fingerprint, /^[a-f0-9]{64}$/);
      assert.deepEqual(await snapshot(fixture.teachers), beforeTeachers);
      assert.deepEqual(await snapshot(fixture.progress), beforeProgress);
      assert.deepEqual(await snapshot(fixture.chapters), beforeChapters);
      assert.deepEqual(await snapshot(fixture.attempts), beforeAttempts);
    });

    await t.test('missing teacher, duplicate teacher, duplicate slug, and populated legacy progress stop safely', async () => {
      await fixture.teachers.deleteOne({ name: 'Dharma Teacher' });
      await assert.rejects(migration.inspectMigration(), /Missing: Dharma Teacher/);

      await mongoose.connection.db.dropDatabase();
      fixture = await createLegacyFixture();
      await fixture.teachers.dropIndex('name_1');
      const duplicate = await fixture.teachers.findOne({ name: 'Dharma Teacher' });
      await fixture.teachers.insertOne({ ...duplicate, _id: new mongoose.Types.ObjectId() });
      await assert.rejects(migration.inspectMigration(), /Duplicate teacher names detected/);

      await mongoose.connection.db.dropDatabase();
      fixture = await createLegacyFixture();
      await fixture.teachers.updateOne({ name: 'Dharma Teacher' }, { $set: { slug: 'dharma' } });
      await fixture.teachers.updateOne({ name: 'Bhakti Teacher' }, { $set: { slug: 'dharma' } });
      await assert.rejects(migration.inspectMigration(), /Duplicate canonical slug|non-canonical slug/);

      await mongoose.connection.db.dropDatabase();
      fixture = await createLegacyFixture();
      await fixture.progress.updateOne({ teacherKey: 'dharma' }, { $set: { subjects: [{ name: 'unexpected legacy subject' }] } });
      await assert.rejects(migration.inspectMigration(), /needs manual mapping/);
      assert.equal(await fixture.progress.countDocuments(), 6);
    });

    await t.test('apply requires matching dry-run fingerprint and exact interactive confirmation', async () => {
      await mongoose.connection.db.dropDatabase();
      fixture = await createLegacyFixture();
      const plan = await migration.dryRun({ output: silentOutput });
      await assert.rejects(migration.applyMigration({
        planHash: plan.fingerprint,
        confirm: async () => 'no',
        output: silentOutput
      }), /Confirmation phrase did not match/);
      assert.equal((await fixture.teachers.findOne({ name: 'Dharma Teacher' })).slug, undefined);

      const stalePlan = await migration.dryRun({ output: silentOutput });
      await fixture.teachers.updateOne({ name: 'Dharma Teacher' }, { $set: { description: 'Changed after the dry run.' } });
      await assert.rejects(migration.applyMigration({
        planHash: stalePlan.fingerprint,
        confirm: async () => migration.CONFIRMATION_PHRASE,
        output: silentOutput
      }), /differs from the supplied dry-run fingerprint/);
      await fixture.teachers.updateOne({ name: 'Dharma Teacher' }, { $set: { description: teacherProfiles[0].shortIntroduction } });
    });

    await t.test('apply preserves IDs and legacy fields, maps kanad to kanada, and migrates indexes in safe order', async () => {
      const beforeUser = await User.findById(fixture.student._id).select('dharmaPoints adharmaPoints pointEventKeys').lean();
      const plan = await migration.dryRun({ output: silentOutput });
      await migration.applyMigration({
        planHash: plan.fingerprint,
        confirm: async () => migration.CONFIRMATION_PHRASE,
        output: silentOutput
      });

      const teachers = await fixture.teachers.find({}).toArray();
      const progress = await fixture.progress.find({}).toArray();
      assert.equal(teachers.length, 6);
      assert.equal(progress.length, 6);
      for (const profile of teacherProfiles) {
        const teacher = teachers.find((item) => item.slug === profile.slug);
        assert.ok(teacher);
        assert.equal(teacher._id.toString(), fixture.teacherIds.get(profile.slug).toString());
        assert.equal(teacher.publicationStatus, 'draft');
        assert.equal(teacher.contentReviewStatus, 'unreviewed');
        assert.equal(teacher.subject, profile.teachingDomain);
        assert.equal(teacher.description, profile.shortIntroduction);
        assert.equal(teacher.imageUrl, `/legacy/${profile.slug}.png`);
        assert.equal(teacher.active, true);
        assert.deepEqual(teacher.ageGroups, []);

        const expectedLegacyKey = profile.slug === 'kanada' ? 'kanad' : profile.slug;
        const oldProgress = progress.find((item) => item.teacherKey === expectedLegacyKey);
        assert.ok(oldProgress);
        assert.equal(oldProgress._id.toString(), fixture.progressIds.get(profile.slug).toString());
        assert.equal(oldProgress.user.toString(), fixture.student._id.toString());
        assert.equal(oldProgress.teacher.toString(), teacher._id.toString());
        assert.equal(oldProgress.student.toString(), fixture.student._id.toString());
        assert.equal(oldProgress.ageGroup, '9-12');
        assert.deepEqual(oldProgress.subjects, []);
        assert.deepEqual(oldProgress.completedLessonIds, []);
      }
      assert.equal(await fixture.teachers.countDocuments({ publicationStatus: 'published' }), 0);
      assert.equal(await fixture.progress.countDocuments(), 6);
      const afterUser = await User.findById(fixture.student._id).select('dharmaPoints adharmaPoints pointEventKeys').lean();
      assert.deepEqual(toComparable(afterUser), toComparable(beforeUser));

      const teacherIndexNames = (await fixture.teachers.indexes()).map((index) => index.name);
      assert.ok(teacherIndexNames.includes('slug_1'));
      assert.ok(teacherIndexNames.includes('publicationStatus_1_ageGroups.ageGroup_1_updatedAt_-1'));
      assert.ok(!teacherIndexNames.includes('name_1'));
      const progressIndexNames = (await fixture.progress.indexes()).map((index) => index.name);
      assert.ok(progressIndexNames.includes('student_1_teacher_1_ageGroup_1'));
      assert.ok(progressIndexNames.includes('student_1_lastAccessedAt_-1'));
      assert.ok(progressIndexNames.includes('user_1'));
      assert.ok(!progressIndexNames.includes('user_1_teacherKey_1'));
      assert.ok((await fixture.chapters.indexes()).some((index) => index.name === 'teacher_1_ageGroup_1_slug_1'));
      assert.equal(await fixture.chapters.countDocuments(), 0);
      assert.equal(await fixture.attempts.countDocuments(), 0);
    });

    await t.test('existing admin API can list/open/edit drafts; student APIs still withhold them', async () => {
      server = http.createServer(app);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      const adminCookie = await loginCookie(baseUrl, 'teacher-reconcile-admin@test.invalid');
      const studentCookie = await loginCookie(baseUrl, 'teacher-reconcile-student@test.invalid');

      const listed = await apiRequest(baseUrl, '/api/admin/teachers?status=all', { cookie: adminCookie });
      assert.equal(listed.response.status, 200);
      assert.equal(listed.body.teachers.length, 6);
      assert.deepEqual(new Set(listed.body.teachers.map((item) => item.slug)), new Set(teacherProfiles.map((item) => item.slug)));
      for (const profile of teacherProfiles) {
        const opened = await apiRequest(baseUrl, `/api/admin/teachers/${profile.slug}`, { cookie: adminCookie });
        assert.equal(opened.response.status, 200);
        assert.equal(opened.body.teacher.name, profile.name);
        assert.equal(opened.body.teacher.publicationStatus, 'draft');
      }

      const edit = await apiRequest(baseUrl, '/api/admin/teachers/dharma', {
        method: 'PATCH', cookie: adminCookie, body: { title: 'Admin-edited draft title' }
      });
      assert.equal(edit.response.status, 200);
      assert.equal(edit.body.teacher.title, 'Admin-edited draft title');
      const legacyTeacher = await fixture.teachers.findOne({ slug: 'dharma' });
      assert.equal(legacyTeacher.subject, 'Dharma, values, ethics, and responsibilities');
      assert.equal(legacyTeacher.imageUrl, '/legacy/dharma.png');

      const studentList = await apiRequest(baseUrl, '/api/learning/teachers', { cookie: studentCookie });
      assert.equal(studentList.response.status, 200);
      assert.deepEqual(studentList.body.teachers, []);
      const hidden = await apiRequest(baseUrl, '/api/learning/teachers/dharma', { cookie: studentCookie });
      assert.equal(hidden.response.status, 404);

      const rerunPlan = await migration.dryRun({ output: silentOutput });
      await migration.applyMigration({
        planHash: rerunPlan.fingerprint,
        confirm: async () => migration.CONFIRMATION_PHRASE,
        output: silentOutput
      });
      const stillEdited = await fixture.teachers.findOne({ slug: 'dharma' });
      assert.equal(stillEdited.title, 'Admin-edited draft title');
      const preservedProgress = await fixture.progress.findOne({ teacherKey: 'dharma' });
      assert.deepEqual(preservedProgress.completedLessonIds, []);
    });

    await t.test('partial migration resumes without replacing already-migrated teacher or progress data', async () => {
      await mongoose.connection.db.dropDatabase();
      fixture = await createLegacyFixture();
      const profile = teacherProfiles.find((item) => item.slug === 'dharma');
      const teacherId = fixture.teacherIds.get(profile.slug);
      const student = await User.findOne({ email: 'teacher-reconcile-student@test.invalid' }).lean();
      await fixture.teachers.updateOne({ _id: teacherId }, { $set: { ...profile } });
      await fixture.progress.updateOne({ teacherKey: 'dharma' }, {
        $set: {
          student: student._id,
          teacher: teacherId,
          ageGroup: student.ageGroup,
          startedModuleIds: [],
          completedLessonIds: [],
          lastAccessedLessonId: null,
          lastAccessedModuleId: null,
          lastAccessedChapterId: null,
          lastAccessedAt: null
        }
      });
      const plan = await migration.dryRun({ output: silentOutput });
      assert.equal(plan.summary.canonicalTeachers.find((item) => item.slug === 'dharma').action, 'already-migrated-preserve-content');
      assert.equal(plan.summary.progressRecords.find((item) => item.teacher === 'Dharma Teacher').action, 'already-migrated-preserve-progress');
      await migration.applyMigration({
        planHash: plan.fingerprint,
        confirm: async () => migration.CONFIRMATION_PHRASE,
        output: silentOutput
      });
      assert.equal((await fixture.teachers.findOne({ slug: 'dharma' })).title, profile.title);
      assert.equal(await fixture.teachers.countDocuments({ slug: { $exists: true } }), 6);
    });

    await t.test('verification mode checks records and indexes without changing them', async () => {
      const beforeTeachers = await snapshot(fixture.teachers);
      const beforeProgress = await snapshot(fixture.progress);
      const result = await migration.verifyMigration({ output: silentOutput });
      assert.equal(result.result, 'verified');
      assert.deepEqual(await snapshot(fixture.teachers), beforeTeachers);
      assert.deepEqual(await snapshot(fixture.progress), beforeProgress);
    });
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, databaseName, 'refuse to drop any non-disposable database');
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});

