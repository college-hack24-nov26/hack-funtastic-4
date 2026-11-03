require('dotenv').config();

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const LearningContent = require('../src/models/learningContent');
const LearningProgress = require('../src/models/learningProgress');
const User = require('../src/models/user');

const databaseName = `mythoverse_learning_test_${randomBytes(12).toString('hex')}`;
const storySlug = `fixture-story-${randomBytes(5).toString('hex')}`;
const storyInput = {
  title: 'Temporary Test Story',
  slug: storySlug,
  shortDescription: 'Temporary content used only by the learning API test.',
  fullDescription: 'This fixture is not a traditional or historical account. It exists only in a temporary test database.',
  mythologicalBackground: 'No mythological or historical claims are made by this temporary test fixture.',
  category: 'Test fixture',
  ageGroups: ['9-12', '13-15'],
  difficulty: 'introductory',
  learningObjectives: ['Practice reading a test fixture.'],
  estimatedMinutes: 5,
  chapters: [{
    title: 'Fixture chapter',
    order: 1,
    lessons: [{ title: 'Fixture lesson', order: 1, content: 'Temporary test-only lesson content.' }]
  }]
};

let server;
let baseUrl;
let studentCookie;
let teacherCookie;
let adminCookie;
let createdStoryId;
let firstChapterId;
let firstLessonId;
let secondChapterId;
let secondLessonId;

async function loginCookie(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'temporary-test-password' })
  });
  assert.equal(response.status, 200, 'fixture account must authenticate through the real login endpoint');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie || '', /;\s*HttpOnly/i, 'authentication cookie must be HTTP-only');
  return setCookie.split(';', 1)[0];
}

async function request(path, { method = 'GET', cookie, body, sameOrigin = false } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sameOrigin) headers.Origin = baseUrl;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { response, body: await response.json() };
}

test('learning content API and schema use a disposable MongoDB database', async (t) => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI must be configured to run isolated content API tests.');
  assert.ok(process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET, 'utf8') >= 32,
    'JWT_SECRET must be configured to exercise authenticated API guards.');

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000
  });

  try {
    assert.equal(mongoose.connection.name, databaseName, 'Tests must never use the configured production/default database name.');
    await Promise.all([LearningContent.init(), LearningProgress.init(), User.init()]);
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const passwordHash = await bcrypt.hash('temporary-test-password', 4);
    await User.create([
      { displayName: 'Test Student', email: 'student@test.invalid', passwordHash, ageGroup: '9-12', preferredLanguage: 'English', onboardingCompleted: true, role: 'student' },
      { displayName: 'Test Teacher', email: 'teacher@test.invalid', passwordHash, ageGroup: '9-12', preferredLanguage: 'English', role: 'teacher' }
    ]);
    await t.test('first-admin provisioning refuses an email already used by a student', async () => {
      const authService = require('../src/services/authService');
      await assert.rejects(
        authService.provisionFirstAdmin({
          displayName: 'Email Collision Fixture',
          email: 'STUDENT@test.invalid',
          password: 'temporary-test-password'
        }),
        (error) => error.statusCode === 409 && /already uses this email/i.test(error.message)
      );
      assert.equal(await User.countDocuments({ role: 'admin' }), 0);
      assert.equal(await User.countDocuments({ email: 'student@test.invalid' }), 1);
    });
    await t.test('first administrator provisions through the existing service in the disposable database', async () => {
      const authService = require('../src/services/authService');
      const safeAdmin = await authService.provisionFirstAdmin({
        displayName: 'Test Admin',
        email: 'admin@test.invalid',
        password: 'temporary-test-password'
      });
      assert.equal(safeAdmin.role, 'admin');
      assert.equal(Object.hasOwn(safeAdmin, 'passwordHash'), false);
      assert.equal(await User.countDocuments({ role: 'admin' }), 1);
    });
    studentCookie = await loginCookie('student@test.invalid');
    teacherCookie = await loginCookie('teacher@test.invalid');
    adminCookie = await loginCookie('admin@test.invalid');

    await t.test('admin password change updates only the target hash and validates account role', async () => {
      const authService = require('../src/services/authService');
      const adminBefore = await User.findOne({ email: 'admin@test.invalid' });
      const originalHash = await User.findById(adminBefore._id).select('+passwordHash').then((user) => user.passwordHash);
      const change = { email: 'ADMIN@test.invalid', password: 'temporary-admin-password-updated' };

      await assert.rejects(
        authService.changeAdminPassword({ ...change, password: 'short' }),
        (error) => error.statusCode === 400
      );
      await assert.rejects(
        authService.changeAdminPassword({ ...change, password: '😀'.repeat(19) }),
        (error) => error.statusCode === 400
      );
      await assert.rejects(
        authService.changeAdminPassword({ email: 'missing@test.invalid', password: change.password }),
        (error) => error.statusCode === 404
      );
      await assert.rejects(
        authService.changeAdminPassword({ email: 'student@test.invalid', password: change.password }),
        (error) => error.statusCode === 403
      );

      const originalFindOne = User.findOne;
      try {
        User.findOne = () => { throw new Error('fixture database query failure'); };
        await assert.rejects(authService.changeAdminPassword(change), /fixture database query failure/);
      } finally {
        User.findOne = originalFindOne;
      }

      const changed = await authService.changeAdminPassword(change);
      assert.deepEqual(changed, { email: 'admin@test.invalid', role: 'admin' });
      const adminAfter = await User.findOne({ email: 'admin@test.invalid' }).select('+passwordHash');
      assert.equal(adminAfter.displayName, adminBefore.displayName);
      assert.equal(adminAfter.email, adminBefore.email);
      assert.equal(adminAfter.role, 'admin');
      assert.notEqual(adminAfter.passwordHash, originalHash);
      assert.equal(await bcrypt.compare(change.password, adminAfter.passwordHash), true);

      const oldPasswordLogin = await request('/api/auth/login', {
        method: 'POST', body: { email: 'admin@test.invalid', password: 'temporary-test-password' }
      });
      assert.equal(oldPasswordLogin.response.status, 401);
      const newPasswordLogin = await request('/api/auth/login', {
        method: 'POST', body: { email: 'admin@test.invalid', password: change.password }
      });
      assert.equal(newPasswordLogin.response.status, 200);
      assert.match(newPasswordLogin.response.headers.get('set-cookie') || '', /;\s*HttpOnly/i);
      assert.equal(Object.hasOwn(newPasswordLogin.body, 'token'), false);
    });

    await t.test('local first-admin provisioning refuses to overwrite or add an admin when one exists', async () => {
      const authService = require('../src/services/authService');
      await assert.rejects(
        authService.provisionFirstAdmin({
          displayName: 'Unused Provision Fixture',
          email: 'unused-provision@test.invalid',
          password: 'temporary-test-password'
        }),
        (error) => error.statusCode === 409
      );
      assert.equal(await User.countDocuments({ role: 'admin' }), 1);
      assert.equal(await User.exists({ email: 'unused-provision@test.invalid' }), null);
      const publicRoute = await request('/api/auth/provision-admin', {
        method: 'POST', body: { displayName: 'Unused', email: 'unused@test.invalid', password: 'test-only-not-used' }
      });
      assert.equal(publicRoute.response.status, 404);
    });

    await t.test('model validation rejects malformed fields and incomplete publication', async () => {
      const invalid = new LearningContent({ ...storyInput, slug: 'Bad Slug', ageGroups: ['unknown'] });
      await assert.rejects(invalid.validate(), (error) => error.name === 'ValidationError');

      const incompletePublished = new LearningContent({ ...storyInput, slug: `${storySlug}-incomplete`, chapters: [], publicationStatus: 'published' });
      await assert.rejects(incompletePublished.validate(), (error) => error.name === 'ValidationError');
    });

    await t.test('unauthenticated and non-student callers cannot read student story APIs', async () => {
      const adminPage = await fetch(`${baseUrl}/admin/stories.html`);
      assert.equal(adminPage.status, 200);
      assert.match(await adminPage.text(), /Story management/i);
      const storyLibraryPage = await fetch(`${baseUrl}/stories.html`);
      assert.equal(storyLibraryPage.status, 200);
      assert.match(await storyLibraryPage.text(), /Story Library/);
      const storyReaderPage = await fetch(`${baseUrl}/story.html?slug=${storySlug}`);
      assert.equal(storyReaderPage.status, 200);
      assert.match(await storyReaderPage.text(), /lesson reader/i);

      const unauthenticated = await request('/api/learning/stories');
      assert.equal(unauthenticated.response.status, 401);
      const teacherResult = await request('/api/learning/stories', { cookie: teacherCookie });
      assert.equal(teacherResult.response.status, 403);
      const adminResult = await request('/api/learning/stories', { cookie: adminCookie });
      assert.equal(adminResult.response.status, 403);
      const unauthenticatedAdminList = await request('/api/admin/content/stories');
      assert.equal(unauthenticatedAdminList.response.status, 401);
      const unauthenticatedDashboard = await request('/api/admin/dashboard');
      assert.equal(unauthenticatedDashboard.response.status, 401);
    });

    await t.test('student registration, login, and logout retain their existing cookie behavior', async () => {
      const email = `new-student-${randomBytes(5).toString('hex')}@test.invalid`;
      const password = 'temporary-registration-password';
      const registration = await request('/api/auth/register', {
        method: 'POST',
        body: { displayName: 'New Test Student', email, password, ageGroup: '9-12', role: 'admin' }
      });
      assert.equal(registration.response.status, 201);
      assert.equal(registration.body.user.role, 'student');
      assert.equal(Object.hasOwn(registration.body.user, 'passwordHash'), false);
      assert.equal(Object.hasOwn(registration.body, 'token'), false);

      const login = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(login.response.status, 200);
      assert.match(login.response.headers.get('set-cookie') || '', /;\s*HttpOnly/i);
      assert.equal(Object.hasOwn(login.body, 'token'), false);

      const logout = await request('/api/auth/logout', { method: 'POST' });
      assert.equal(logout.response.status, 200);
      assert.match(logout.response.headers.get('set-cookie') || '', /Max-Age=0|Expires=/i);
    });

    await t.test('admin dashboard authorization and available counts use fixture database records', async () => {
      assert.equal((await request('/api/admin/dashboard', { cookie: studentCookie })).response.status, 403);
      const dashboard = await request('/api/admin/dashboard', { cookie: adminCookie });
      assert.equal(dashboard.response.status, 200);
      assert.equal(dashboard.body.summary.totalStudents.available, true);
      assert.ok(dashboard.body.summary.totalStudents.count >= 1);
      assert.equal(dashboard.body.summary.totalTeachers.count, 1);
      assert.equal(dashboard.body.summary.totalContentItems.available, false);
    });

    await t.test('admin story authoring validates input and rejects duplicate slugs', async () => {
      const denied = await request('/api/admin/content/stories', {
        method: 'POST', cookie: studentCookie, sameOrigin: true, body: storyInput
      });
      assert.equal(denied.response.status, 403);

      const missingOrigin = await request('/api/admin/content/stories', {
        method: 'POST', cookie: adminCookie, body: storyInput
      });
      assert.equal(missingOrigin.response.status, 403);

      const invalid = await request('/api/admin/content/stories', {
        method: 'POST', cookie: adminCookie, sameOrigin: true, body: { ...storyInput, difficulty: 'expert' }
      });
      assert.equal(invalid.response.status, 400);

      const created = await request('/api/admin/content/stories', {
        method: 'POST', cookie: adminCookie, sameOrigin: true, body: storyInput
      });
      assert.equal(created.response.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.story.slug, storySlug);
      assert.equal(created.body.story.publicationStatus, 'draft');
      assert.ok(created.body.story.chapters[0].lessons[0]._id);
      assert.equal(Object.hasOwn(created.body.story, 'passwordHash'), false);
      createdStoryId = created.body.story._id;
      firstChapterId = created.body.story.chapters[0]._id;
      firstLessonId = created.body.story.chapters[0].lessons[0]._id;

      const updated = await request(`/api/admin/content/stories/${createdStoryId}`, {
        method: 'PATCH', cookie: adminCookie, sameOrigin: true,
        body: { title: 'Updated Temporary Test Story' }
      });
      assert.equal(updated.response.status, 200);
      assert.equal(updated.body.story.title, 'Updated Temporary Test Story');

      const adminList = await request('/api/admin/content/stories?status=draft&search=Temporary', { cookie: adminCookie });
      assert.equal(adminList.response.status, 200);
      assert.equal(adminList.body.stories.some((story) => story._id === createdStoryId), true);
      assert.deepEqual(adminList.body.stats, { total: 1, published: 0, draft: 1 });
      const invalidFilter = await request('/api/admin/content/stories?status=deleted', { cookie: adminCookie });
      assert.equal(invalidFilter.response.status, 400);

      const studentAdminList = await request('/api/admin/content/stories', { cookie: studentCookie });
      assert.equal(studentAdminList.response.status, 403);

      const duplicate = await request('/api/admin/content/stories', {
        method: 'POST', cookie: adminCookie, sameOrigin: true, body: storyInput
      });
      assert.equal(duplicate.response.status, 409);
    });

    await t.test('students cannot access draft content; admin can inspect drafts', async () => {
      const studentList = await request('/api/learning/stories', { cookie: studentCookie });
      assert.equal(studentList.response.status, 200);
      assert.equal(studentList.body.stories.some((story) => story.slug === storySlug), false);

      const studentStory = await request(`/api/learning/stories/${storySlug}`, { cookie: studentCookie });
      assert.equal(studentStory.response.status, 404);
      const hiddenProgress = await request(`/api/learning/progress/stories/${storySlug}`, { cookie: studentCookie });
      assert.equal(hiddenProgress.response.status, 404);

      const noCookieAdminApi = await request(`/api/admin/content/stories/${storySlug}`);
      assert.equal(noCookieAdminApi.response.status, 401);
      const draft = await request(`/api/admin/content/stories/${storySlug}`, { cookie: adminCookie });
      assert.equal(draft.response.status, 200);
      assert.equal(draft.body.story.publicationStatus, 'draft');
    });

    await t.test('admin can add chapters and lessons, update lesson content, and publish', async () => {
      const chapterResult = await request(`/api/admin/content/stories/${createdStoryId}/chapters`, {
        method: 'POST', cookie: adminCookie, sameOrigin: true,
        body: { title: 'Second fixture chapter', order: 2, lessons: [] }
      });
      assert.equal(chapterResult.response.status, 200);
      const chapterId = chapterResult.body.chapter._id;
      secondChapterId = chapterId;

      const updatedChapter = await request(`/api/admin/content/stories/${createdStoryId}/chapters/${chapterId}`, {
        method: 'PATCH', cookie: adminCookie, sameOrigin: true,
        body: { title: 'Edited second fixture chapter', summary: 'Updated test-only summary.', order: 2, estimatedMinutes: 12 }
      });
      assert.equal(updatedChapter.response.status, 200);
      assert.equal(updatedChapter.body.chapter.title, 'Edited second fixture chapter');

      const lessonResult = await request(`/api/admin/content/stories/${createdStoryId}/chapters/${chapterId}/lessons`, {
        method: 'POST', cookie: adminCookie, sameOrigin: true,
        body: { title: 'Second fixture lesson', order: 1, content: 'Temporary lesson text.' }
      });
      assert.equal(lessonResult.response.status, 200);
      const lessonId = lessonResult.body.lesson._id;
      secondLessonId = lessonId;

      const updatedLesson = await request(`/api/admin/content/stories/${createdStoryId}/chapters/${chapterId}/lessons/${lessonId}`, {
        method: 'PATCH', cookie: adminCookie, sameOrigin: true,
        body: { content: 'Updated temporary lesson text.' }
      });
      assert.equal(updatedLesson.response.status, 200);
      assert.equal(updatedLesson.body.lesson.content, 'Updated temporary lesson text.');

      const published = await request(`/api/admin/content/stories/${createdStoryId}/publication`, {
        method: 'PATCH', cookie: adminCookie, sameOrigin: true,
        body: { publicationStatus: 'published' }
      });
      assert.equal(published.response.status, 200);
      assert.equal(published.body.story.publicationStatus, 'published');
    });

    await t.test('student progress is saved, deduplicated, age-scoped, and isolated by account', async () => {
      const unauthenticated = await request('/api/learning/progress/summary');
      assert.equal(unauthenticated.response.status, 401);
      const nonStudent = await request('/api/learning/progress/summary', { cookie: teacherCookie });
      assert.equal(nonStudent.response.status, 403);
      const invalidStory = await request('/api/learning/progress/stories/no-such-story', { cookie: studentCookie });
      assert.equal(invalidStory.response.status, 404);

      const initial = await request(`/api/learning/progress/stories/${storySlug}`, { cookie: studentCookie });
      assert.equal(initial.body.progress.started, false);
      assert.equal(initial.body.progress.completedLessons, 0);
      assert.equal(initial.body.progress.totalLessons, 2);
      const emptySummary = await request('/api/learning/progress/summary', { cookie: studentCookie });
      assert.deepEqual(emptySummary.body.summary, {
        availableStories: 1,
        startedStories: 0,
        completedLessons: 0,
        totalLessons: 2,
        percentage: 0
      });
      assert.equal(emptySummary.body.continueLearning, null);

      const invalidIds = await request(`/api/learning/progress/stories/${storySlug}/chapters/not-an-id/lessons/${firstLessonId}/complete`, {
        method: 'POST', cookie: studentCookie, sameOrigin: true
      });
      assert.equal(invalidIds.response.status, 400);
      const missingOrigin = await request(`/api/learning/progress/stories/${storySlug}/chapters/${firstChapterId}/lessons/${firstLessonId}/access`, {
        method: 'POST', cookie: studentCookie
      });
      assert.equal(missingOrigin.response.status, 403);

      const accessed = await request(`/api/learning/progress/stories/${storySlug}/chapters/${firstChapterId}/lessons/${firstLessonId}/access`, {
        method: 'POST', cookie: studentCookie, sameOrigin: true
      });
      assert.equal(accessed.response.status, 200);
      assert.equal(accessed.body.progress.started, true);
      assert.equal(accessed.body.progress.completedLessons, 0, 'opening a lesson must not complete it');

      const completedPath = `/api/learning/progress/stories/${storySlug}/chapters/${firstChapterId}/lessons/${firstLessonId}/complete`;
      await LearningProgress.updateOne({ student: (await User.findOne({ email: 'student@test.invalid' }))._id, story: createdStoryId }, {
        $set: { lastAccessedAt: new Date(Date.now() - 16_000) }
      });
      const [completed, concurrentComplete] = await Promise.all([
        request(completedPath, { method: 'POST', cookie: studentCookie, sameOrigin: true }),
        request(completedPath, { method: 'POST', cookie: studentCookie, sameOrigin: true })
      ]);
      assert.equal(completed.response.status, 200);
      assert.equal(completed.body.progress.completedLessons, 1);
      assert.equal(completed.body.progress.percentage, 50);
      assert.equal(concurrentComplete.body.progress.completedLessons, 1);
      assert.equal(completed.body.dharmaPointsAwarded + concurrentComplete.body.dharmaPointsAwarded, 5);
      assert.equal((await User.findOne({ email: 'student@test.invalid' })).dharmaPoints, 5);
      assert.equal(await LearningProgress.countDocuments({ student: (await User.findOne({ email: 'student@test.invalid' }))._id, story: createdStoryId }), 1);

      const lastAccess = await request('/api/learning/progress/last-accessed', { cookie: studentCookie });
      assert.equal(lastAccess.response.status, 200);
      assert.equal(lastAccess.body.continueLearning.lesson.id, firstLessonId);
      assert.equal(lastAccess.body.continueLearning.story.slug, storySlug);
      assert.equal(lastAccess.body.continueLearning.lastLessonCompleted, true);
      assert.deepEqual(lastAccess.body.continueLearning.nextLesson, { chapterId: secondChapterId, lessonId: secondLessonId });

      const summary = await request('/api/learning/progress/summary', { cookie: studentCookie });
      assert.deepEqual(summary.body.summary, {
        availableStories: 1,
        startedStories: 1,
        completedLessons: 1,
        totalLessons: 2,
        percentage: 50
      });

      const otherHash = await bcrypt.hash('temporary-test-password', 4);
      await User.create({ displayName: 'Second Test Student', email: 'second-student@test.invalid', passwordHash: otherHash, ageGroup: '9-12', role: 'student' });
      const otherCookie = await loginCookie('second-student@test.invalid');
      const otherProgress = await request(`/api/learning/progress/stories/${storySlug}`, { cookie: otherCookie });
      assert.equal(otherProgress.response.status, 200);
      assert.equal(otherProgress.body.progress.completedLessons, 0);
      assert.equal(otherProgress.body.progress.started, false);
      const otherSummary = await request('/api/learning/progress/summary', { cookie: otherCookie });
      assert.equal(otherSummary.body.summary.startedStories, 0);
      assert.equal(otherSummary.body.summary.completedLessons, 0);
      assert.equal(otherSummary.body.continueLearning, null);

      const ageLimitedHash = await bcrypt.hash('temporary-test-password', 4);
      await User.create({ displayName: 'Age Group Test Student', email: 'age-student@test.invalid', passwordHash: ageLimitedHash, ageGroup: '16-18', role: 'student' });
      const ageLimitedCookie = await loginCookie('age-student@test.invalid');
      const ageLimitedStory = await request(`/api/learning/progress/stories/${storySlug}`, { cookie: ageLimitedCookie });
      assert.equal(ageLimitedStory.response.status, 404);
    });

    await t.test('student password change updates only its hash and preserves profile and learning progress', async () => {
      const authService = require('../src/services/authService');
      const student = await User.findOne({ email: 'student@test.invalid' }).select('+passwordHash');
      const originalHash = student.passwordHash;
      const preservedFields = [
        '_id', 'displayName', 'email', 'role', 'ageGroup', 'profilePictureUrl', 'dateOfBirth',
        'schoolName', 'grade', 'preferredLanguage', 'learningInterests', 'onboardingCompleted',
        'onboardingCompletedAt', 'profileUpdatedAt', 'isActive', 'createdAt', 'updatedAt'
      ];
      const studentBefore = Object.fromEntries(preservedFields.map((field) => [field, student.get(field)]));
      const progressBefore = await LearningProgress.findOne({ student: student._id }).lean();
      assert.ok(progressBefore, 'fixture student should have persisted story progress before password change');
      const adminBefore = await User.findOne({ email: 'admin@test.invalid' }).select('+passwordHash');
      const adminHash = adminBefore.passwordHash;
      const nextPassword = 'temporary-student-password-updated';

      await assert.rejects(
        authService.changeStudentPassword({ email: student.email, password: 'short' }),
        (error) => error.statusCode === 400
      );
      await assert.rejects(
        authService.changeStudentPassword({ email: student.email, password: '😀'.repeat(19) }),
        (error) => error.statusCode === 400
      );
      await assert.rejects(
        authService.changeStudentPassword({ email: 'missing-student@test.invalid', password: nextPassword }),
        (error) => error.statusCode === 404
      );
      await assert.rejects(
        authService.changeStudentPassword({ email: adminBefore.email, password: nextPassword }),
        (error) => error.statusCode === 403
      );

      const changed = await authService.changeStudentPassword({ email: student.email.toUpperCase(), password: nextPassword });
      assert.deepEqual(changed, { email: student.email, role: 'student' });

      const studentAfter = await User.findById(student._id).select('+passwordHash');
      assert.deepEqual(
        Object.fromEntries(preservedFields.map((field) => [field, studentAfter.get(field)])),
        studentBefore
      );
      assert.notEqual(studentAfter.passwordHash, originalHash);
      assert.equal(await bcrypt.compare(nextPassword, studentAfter.passwordHash), true);
      assert.equal(await bcrypt.compare('temporary-test-password', studentAfter.passwordHash), false);
      assert.equal((await User.findById(adminBefore._id).select('+passwordHash')).passwordHash, adminHash);
      assert.deepEqual(await LearningProgress.findOne({ student: student._id }).lean(), progressBefore);

      const oldPasswordLogin = await request('/api/auth/login', {
        method: 'POST', body: { email: student.email, password: 'temporary-test-password' }
      });
      assert.equal(oldPasswordLogin.response.status, 401);
      const newPasswordLogin = await request('/api/auth/login', {
        method: 'POST', body: { email: student.email, password: nextPassword }
      });
      assert.equal(newPasswordLogin.response.status, 200);
      assert.match(newPasswordLogin.response.headers.get('set-cookie') || '', /;\s*HttpOnly/i);
      assert.equal(Object.hasOwn(newPasswordLogin.body, 'token'), false);
    });

    await t.test('published stories filter by age group and return story, chapter, and lesson shapes', async () => {
      const list = await request('/api/learning/stories?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(list.response.status, 200);
      assert.equal(list.body.stories.some((story) => story.slug === storySlug), true);
      assert.equal(typeof list.body.pagination.total, 'number');

      const otherAge = await request('/api/learning/stories?ageGroup=6-8', { cookie: studentCookie });
      assert.equal(otherAge.body.stories.some((story) => story.slug === storySlug), false);
      const category = await request('/api/learning/stories?category=Test%20fixture', { cookie: studentCookie });
      assert.equal(category.body.stories.some((story) => story.slug === storySlug), true);
      const difficulty = await request('/api/learning/stories?difficulty=introductory', { cookie: studentCookie });
      assert.equal(difficulty.body.stories.some((story) => story.slug === storySlug), true);
      const search = await request('/api/learning/stories?search=Temporary%20Test', { cookie: studentCookie });
      assert.equal(search.body.stories.some((story) => story.slug === storySlug), true);
      const invalidAge = await request('/api/learning/stories?ageGroup=unknown', { cookie: studentCookie });
      assert.equal(invalidAge.response.status, 400);
      const invalidDifficulty = await request('/api/learning/stories?difficulty=expert', { cookie: studentCookie });
      assert.equal(invalidDifficulty.response.status, 400);

      const story = await request(`/api/learning/stories/${createdStoryId}`, { cookie: studentCookie });
      assert.equal(story.response.status, 200);
      assert.equal(story.body.story.slug, storySlug);

      const chapters = await request(`/api/learning/stories/${storySlug}/chapters`, { cookie: studentCookie });
      assert.equal(chapters.response.status, 200);
      assert.equal(chapters.body.chapters.length, 2);
      assert.equal(Object.hasOwn(chapters.body.chapters[0].lessons[0], 'content'), false);

      const lessons = await request(`/api/learning/stories/${storySlug}/chapters/${chapters.body.chapters[1]._id}/lessons`, { cookie: studentCookie });
      assert.equal(lessons.response.status, 200);
      assert.equal(lessons.body.lessons[0].content, 'Updated temporary lesson text.');
    });

    await t.test('missing story, chapter, and lesson return not found; admin can unpublish', async () => {
      const missing = await request('/api/learning/stories/no-such-story', { cookie: studentCookie });
      assert.equal(missing.response.status, 404);
      const invalidIdentifier = await request('/api/learning/stories/invalid_slug!', { cookie: studentCookie });
      assert.equal(invalidIdentifier.response.status, 400);

      const unpublished = await request(`/api/admin/content/stories/${createdStoryId}/publication`, {
        method: 'PATCH', cookie: adminCookie, sameOrigin: true,
        body: { publicationStatus: 'draft' }
      });
      assert.equal(unpublished.response.status, 200);
      const hiddenAgain = await request(`/api/learning/stories/${storySlug}`, { cookie: studentCookie });
      assert.equal(hiddenAgain.response.status, 404);
    });
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
