require('dotenv').config();

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const Announcement = require('../src/models/announcement');
const User = require('../src/models/user');
const dashboardService = require('../src/services/studentDashboardService');
const pointsService = require('../src/services/studentPointsService');
const emailService = require('../src/services/emailService');
const GuardianInvite = require('../src/models/guardianInvite');
const GuardianRelationship = require('../src/models/guardianRelationship');

const databaseName = `mythoverse_dashboard_test_${randomBytes(10).toString('hex')}`;

async function apiRequest(baseUrl, route, { cookie, method = 'GET', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Origin = baseUrl;
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { response, body: await response.json().catch(() => ({})) };
}

test('student dashboard and announcement APIs use a disposable database and enforce role access', async (t) => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI is required for isolated dashboard tests.');
  assert.ok(process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET, 'utf8') >= 32,
    'JWT_SECRET is required for authenticated dashboard checks.');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  assert.equal(mongoose.connection.name, databaseName);
  let server;
  const sendInviteOriginal = emailService.sendGuardianInvite;
  let sentInviteUrl = null;
  try {
    await Promise.all([User.init(), Announcement.init(), GuardianInvite.init(), GuardianRelationship.init()]);
    const passwordHash = await bcrypt.hash('temporary-dashboard-test-password', 4);
    await User.create([
      { displayName: 'Dashboard Student', email: 'dashboard-student@test.invalid', passwordHash, ageGroup: '9-12', preferredLanguage: 'English', onboardingCompleted: true, role: 'student' },
      { displayName: 'Dashboard Admin', email: 'dashboard-admin@test.invalid', passwordHash, role: 'admin' }
    ]);
    server = http.createServer(app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function login(email, password = 'temporary-dashboard-test-password') {
      const { response } = await apiRequest(baseUrl, '/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';', 1)[0];
    }
    let studentCookie = await login('dashboard-student@test.invalid');
    const adminCookie = await login('dashboard-admin@test.invalid');

    emailService.sendGuardianInvite = async ({ inviteUrl }) => { sentInviteUrl = inviteUrl; };

    await t.test('dashboard is student-only and returns actual profile and seven local days', async () => {
      assert.equal((await apiRequest(baseUrl, '/api/student/dashboard')).response.status, 401);
      assert.equal((await apiRequest(baseUrl, '/api/student/dashboard', { cookie: adminCookie })).response.status, 403);
      const result = await apiRequest(baseUrl, '/api/student/dashboard?timeZone=Asia%2FCalcutta', { cookie: studentCookie });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.student.displayName, 'Dashboard Student');
      assert.equal(result.body.student.ageGroup, '9-12');
      assert.equal(result.body.weeklyActivity.length, 7);
      assert.equal(result.body.dharma.available, true);
      assert.equal(result.body.dharma.dharmaPoints, 0);
      assert.equal(result.body.dharma.currentLoka, 'Bhuloka');
      assert.equal(result.body.recommendedAssessment, null);
    });

    await t.test('dashboard sections are authenticated and use the student-owned data APIs', async () => {
      const routes = [
        '/api/student/courses',
        '/api/student/assignments',
        '/api/student/submissions',
        '/api/student/grades/gradebook',
        '/api/student/grades/progress',
        '/api/student/calendar/events',
        '/api/student/library/resources',
        '/api/student/library/downloads',
        '/api/student/settings'
      ];
      for (const route of routes) {
        assert.equal((await apiRequest(baseUrl, route)).response.status, 401, `${route} requires authentication`);
        assert.equal((await apiRequest(baseUrl, route, { cookie: adminCookie })).response.status, 403, `${route} is student-only`);
      }

      const [courses, assignments, submissions, gradebook, progress, calendar, resources, downloads] = await Promise.all([
        apiRequest(baseUrl, '/api/student/courses?ageGroup=9-12', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/assignments?ageGroup=9-12', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/submissions', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/grades/gradebook', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/grades/progress', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/calendar/events', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/library/resources', { cookie: studentCookie }),
        apiRequest(baseUrl, '/api/student/library/downloads', { cookie: studentCookie })
      ]);
      assert.equal(courses.response.status, 200);
      assert.deepEqual(courses.body.teachers, []);
      assert.equal(assignments.response.status, 200);
      assert.deepEqual(assignments.body.assignments, []);
      assert.deepEqual(submissions.body.submissions, []);
      assert.deepEqual(gradebook.body.submissions, []);
      assert.deepEqual(progress.body.teachers, []);
      assert.equal(calendar.body.available, false);
      assert.deepEqual(calendar.body.items, []);
      assert.equal(resources.response.status, 200);
      assert.deepEqual(downloads.body.downloads, []);
    });

    await t.test('student preferences are validated and saved without profile edits', async () => {
      const initial = await apiRequest(baseUrl, '/api/student/settings', { cookie: studentCookie });
      assert.equal(initial.response.status, 200);
      assert.equal(initial.body.settings.timeZone, 'UTC');
      const preferences = await apiRequest(baseUrl, '/api/student/settings/preferences', {
        cookie: studentCookie, method: 'PUT', body: { timeZone: 'Asia/Kolkata', theme: 'dark', fontSize: 'large' }
      });
      assert.equal(preferences.response.status, 200);
      assert.equal(preferences.body.settings.timeZone, 'Asia/Kolkata');
      assert.equal(preferences.body.settings.appearance.fontSize, 'large');
      assert.equal((await apiRequest(baseUrl, '/api/student/settings/preferences', {
        cookie: studentCookie, method: 'PUT', body: { displayName: 'Not a setting' }
      })).response.status, 400);
      const notifications = await apiRequest(baseUrl, '/api/student/settings/notifications', {
        cookie: studentCookie, method: 'PUT',
        body: { learningReminders: false, assessmentNotifications: true }
      });
      assert.equal(notifications.response.status, 200);
      assert.equal(notifications.body.settings.notifications.learningReminders, false);
      assert.equal(notifications.body.settings.notifications.assessmentNotifications, true);
    });

    await t.test('point changes are idempotent, clamp Dharma at zero, and preserve permanent unlocks', async () => {
      const student = await User.findOne({ email: 'dashboard-student@test.invalid' });
      const first = await pointsService.applyChoice(student._id, { eventKey: 'test-point-event-001', dharmaChange: 100 });
      assert.equal(first.applied, true);
      assert.equal(first.dharmaPoints, 100);
      assert.equal(first.progression.effectiveDharma, 100);
      assert.equal(first.progression.currentLoka, 'Bhuvarloka');
      const duplicate = await pointsService.applyChoice(student._id, { eventKey: 'test-point-event-001', dharmaChange: 100 });
      assert.equal(duplicate.applied, false);
      assert.equal(duplicate.dharmaPoints, 100);
      const penalty = await pointsService.applyChoice(student._id, { eventKey: 'test-point-event-002', adharmaChange: 1 });
      assert.equal(penalty.progression.effectiveDharma, 98);
      assert.equal(penalty.progression.currentLoka, 'Bhuvarloka');
      const reduction = await pointsService.applyChoice(student._id, { eventKey: 'test-point-event-003', dharmaChange: -500 });
      assert.equal(reduction.dharmaPoints, 0);
      assert.equal(reduction.adharmaPoints, 1);
      assert.equal(reduction.progression.currentLoka, 'Bhuvarloka');
      assert.equal(reduction.progression.ashram.currentStage, 'Forest Hermitage');
      assert.equal(reduction.progression.lokas.find((item) => item.key === 'bhuvarloka').unlocked, true);
      assert.equal((await User.findById(student._id)).dailyDharmaRecords.at(-1).dharmaEarned, 100);
    });

    await t.test('all configured Loka and Ashram thresholds unlock at their exact boundaries', async () => {
      const passwordHash = await bcrypt.hash('temporary-progression-test-password', 4);
      const student = await User.create({ displayName: 'Progression Boundary', email: 'progression-boundary@test.invalid', passwordHash, role: 'student' });
      let current = await User.findById(student._id).select('dharmaPoints adharmaPoints').lean();
      let points = current.dharmaPoints || 0;
      const adharmaPenalty = (current.adharmaPoints || 0) * 2;
      const config = require('../src/config/progression');
      for (let index = 0; index < config.lokaThresholds.length; index += 1) {
        const milestone = config.lokaThresholds[index];
        const delta = milestone.dharmaRequired + adharmaPenalty - points;
        if (delta > 0) {
          const result = await pointsService.applyChoice(student._id, { eventKey: `threshold-test-loka-${index}`, dharmaChange: delta });
          points += delta;
          assert.equal(result.progression.lokas[index].unlocked, true);
          assert.equal(result.progression.currentLoka, milestone.name);
        }
      }
      for (let index = 0; index < config.ashramStages.length; index += 1) {
        const stage = config.ashramStages[index];
        assert.equal(points >= stage.dharmaRequired, true);
      }
      const finalState = await pointsService.applyChoice(student._id, { eventKey: 'threshold-test-reduce', dharmaChange: -100_000 });
      assert.equal(finalState.dharmaPoints, 0);
      assert.equal(finalState.progression.currentLoka, 'Patala');
      assert.equal(finalState.progression.ashram.currentStage, 'Great University');
      assert.equal(finalState.progression.lokas.every((item) => item.unlocked), true);
      assert.equal(finalState.progression.ashram.unlockedStages.every((item) => item.unlocked), true);
    });

    await t.test('announcements are admin-managed and only published entries reach students', async () => {
      const denied = await apiRequest(baseUrl, '/api/admin/announcements', { cookie: studentCookie });
      assert.equal(denied.response.status, 403);
      const created = await apiRequest(baseUrl, '/api/admin/announcements', {
        cookie: adminCookie, method: 'POST', body: { title: 'Learning update', description: 'A real test announcement for students.', category: 'Learning', important: true }
      });
      assert.equal(created.response.status, 201);
      const id = created.body.announcement._id;
      assert.equal((await apiRequest(baseUrl, '/api/student/announcements', { cookie: studentCookie })).body.announcements.length, 0);
      const published = await apiRequest(baseUrl, `/api/admin/announcements/${id}/publication`, {
        cookie: adminCookie, method: 'PATCH', body: { publicationStatus: 'published' }
      });
      assert.equal(published.response.status, 200);
      const visible = await apiRequest(baseUrl, '/api/student/announcements', { cookie: studentCookie });
      assert.equal(visible.body.announcements.length, 1);
      assert.equal(visible.body.announcements[0].title, 'Learning update');
      assert.equal(Object.hasOwn(visible.body.announcements[0], 'createdBy'), false);
      const detail = await apiRequest(baseUrl, `/api/student/announcements/${id}`, { cookie: studentCookie });
      assert.equal(detail.response.status, 200);
      assert.equal(detail.body.announcement.title, 'Learning update');
      assert.equal((await apiRequest(baseUrl, `/api/student/announcements/${id}`, { cookie: adminCookie })).response.status, 403);
    });

    await t.test('guardian invites verify email, require student approval, and revoke read access immediately', async () => {
      const inviteResult = await apiRequest(baseUrl, '/api/student/guardian-invites', {
        cookie: studentCookie, method: 'POST', body: { email: 'verified-guardian@test.invalid', relationship: 'parent' }
      });
      assert.equal(inviteResult.response.status, 201);
      assert.equal(Object.hasOwn(inviteResult.body, 'token'), false);
      const inviteToken = new URL(sentInviteUrl).searchParams.get('token');
      assert.match(inviteToken, /^[A-Za-z0-9_-]{43}$/);
      const storedInvite = await GuardianInvite.findOne({ email: 'verified-guardian@test.invalid' }).select('+tokenHash');
      assert.notEqual(storedInvite.tokenHash, inviteToken);
      const accepted = await apiRequest(baseUrl, '/api/guardian/invites/accept', {
        method: 'POST', body: { token: inviteToken, displayName: 'Verified Parent', password: 'guardian-test-password-123' }
      });
      assert.equal(accepted.response.status, 201);
      assert.equal((await User.findOne({ email: 'verified-guardian@test.invalid' })).role, 'guardian');
      assert.equal((await apiRequest(baseUrl, '/api/guardian/invites/accept', {
        method: 'POST', body: { token: inviteToken, displayName: 'Replay', password: 'guardian-test-password-456' }
      })).response.status, 410);
      const guardianCookie = await login('verified-guardian@test.invalid', 'guardian-test-password-123');
      const linked = await apiRequest(baseUrl, '/api/guardian/relationships', { cookie: guardianCookie });
      assert.equal(linked.response.status, 200);
      assert.equal(linked.body.relationships[0].status, 'pending');
      const relationshipId = accepted.body.relationshipId;
      assert.equal((await apiRequest(baseUrl, `/api/guardian/students/${(await User.findOne({ email: 'dashboard-student@test.invalid' }))._id}/dashboard`, { cookie: guardianCookie })).response.status, 404);
      const approved = await apiRequest(baseUrl, `/api/student/guardian-relationships/${relationshipId}`, {
        cookie: studentCookie, method: 'PATCH', body: { decision: 'approved' }
      });
      assert.equal(approved.response.status, 200);
      const studentId = (await User.findOne({ email: 'dashboard-student@test.invalid' }))._id;
      const visible = await apiRequest(baseUrl, `/api/guardian/students/${studentId}/dashboard`, { cookie: guardianCookie });
      assert.equal(visible.response.status, 200);
      assert.equal(visible.body.student.displayName, 'Dashboard Student');
      assert.equal(Object.hasOwn(visible.body.student, 'email'), false);
      const revoked = await apiRequest(baseUrl, `/api/student/guardian-relationships/${relationshipId}`, { cookie: studentCookie, method: 'DELETE', body: {} });
      assert.equal(revoked.response.status, 200);
      assert.equal((await apiRequest(baseUrl, `/api/guardian/students/${studentId}/dashboard`, { cookie: guardianCookie })).response.status, 404);
    });

    await t.test('password changes require the current password and invalidate the browser cookie', async () => {
      const wrongPassword = await apiRequest(baseUrl, '/api/student/settings/password', {
        cookie: studentCookie, method: 'PUT',
        body: { currentPassword: 'wrong-password', newPassword: 'new-dashboard-password-123' }
      });
      assert.equal(wrongPassword.response.status, 401);
      const shortPassword = await apiRequest(baseUrl, '/api/student/settings/password', {
        cookie: studentCookie, method: 'PUT',
        body: { currentPassword: 'temporary-dashboard-test-password', newPassword: 'short' }
      });
      assert.equal(shortPassword.response.status, 400);
      const changed = await apiRequest(baseUrl, '/api/student/settings/password', {
        cookie: studentCookie, method: 'PUT',
        body: { currentPassword: 'temporary-dashboard-test-password', newPassword: 'new-dashboard-password-123' }
      });
      assert.equal(changed.response.status, 200);
      assert.match(changed.response.headers.get('set-cookie') || '', /mythoverse_token=;/);
      studentCookie = await login('dashboard-student@test.invalid', 'new-dashboard-password-123');
      assert.equal((await apiRequest(baseUrl, '/api/student/settings', { cookie: studentCookie })).response.status, 200);
    });
  } finally {
    emailService.sendGuardianInvite = sendInviteOriginal;
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});

test('dashboard day aggregation honors timezone and creates seven calendar days', () => {
  const days = dashboardService.localDaySequence('Asia/Calcutta', new Date('2026-11-03T18:30:00.000Z'));
  assert.equal(days.length, 7);
  assert.deepEqual(days, ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
});
