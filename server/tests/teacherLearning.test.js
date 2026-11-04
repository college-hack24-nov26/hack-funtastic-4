require('dotenv').config();

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const Teacher = require('../src/models/teacher');
const TeacherProgress = require('../src/models/teacherProgress');
const TeacherAssessmentAttempt = require('../src/models/teacherAssessmentAttempt');
const User = require('../src/models/user');

const databaseName = `mythoverse_teacher_test_${randomBytes(10).toString('hex')}`;
let server;
let baseUrl;
let studentCookie;
let secondStudentCookie;
let adminCookie;
let teacherCookie;
let teacher;
let lesson;
let assessment;
let question;

async function loginCookie(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'temporary-test-password' })
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie || '', /;\s*HttpOnly/i);
  return cookie.split(';', 1)[0];
}

async function request(path, { method = 'GET', cookie, body } = {}) {
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

function teacherInput({ slug = 'dharma', publicationStatus = 'published' } = {}) {
  const ageGroups = Teacher.AGE_GROUPS.map((ageGroup, ageIndex) => ({
    ageGroup,
    difficulty: ageIndex < 2 ? 'introductory' : ageIndex < 4 ? 'developing' : 'advanced',
    learningObjectives: [`Use age-specific reflection for ${ageGroup}.`],
    estimatedMinutes: 15,
    modules: [{
      title: `Module ${ageGroup}`,
      description: `A distinct test pathway for ${ageGroup}.`,
      order: 1,
      chapters: [{
        title: `Chapter ${ageGroup}`,
        summary: `Chapter for learners aged ${ageGroup}.`,
        order: 1,
        lessons: [{
          title: `Lesson ${ageGroup}`,
          order: 1,
          introduction: `Introduction for learners aged ${ageGroup}.`,
          content: `This is a sufficiently detailed fixture lesson about thoughtful choices for ${ageGroup}. It is test-only teaching content.`,
          narrativeContext: 'A neutral fixture example, not a religious or historical claim.',
          keyConcepts: ['Reflection'],
          realLifeApplication: 'Pause and consider the effects of a choice.',
          takeaways: ['Choices affect others.'],
          learningObjectives: [`Explain one choice for ${ageGroup}.`],
          estimatedMinutes: 5,
          activities: []
        }],
        assessment: {
          title: `Check understanding ${ageGroup}`,
          instructions: 'Choose the best answer.',
          passingPercent: 60,
          questions: [{
            prompt: `Which response shows reflection for ${ageGroup}?`,
            type: 'multipleChoice',
            options: [{ key: 'a', text: 'Consider the outcome' }, { key: 'b', text: 'Act without thinking' }],
            correctAnswer: 'a',
            explanation: 'Considering consequences is reflective decision-making.',
            marks: 2
          }]
        }
      }]
    }]
  }));
  return {
    name: `Fixture ${slug}`,
    slug,
    identityType: 'teachingPersona',
    title: 'Test learning guide',
    shortIntroduction: 'A temporary teacher profile used only in isolated API tests.',
    mythologicalBackground: 'This test profile does not make claims about traditions or history.',
    personality: 'Patient and clear in this test fixture.',
    teachingPhilosophy: 'Teach one concept at a time in this test fixture.',
    teachingDomain: 'Ethical reflection',
    knowledgeAndSkills: ['Reasoning'],
    biography: 'Temporary test-only profile.',
    teachingStyle: 'Short explanations followed by practice.',
    sources: [],
    contentReviewStatus: 'reviewed',
    ageGroups,
    publicationStatus
  };
}

test('teacher learning API uses a disposable database and enforces student/admin boundaries', async (t) => {
  assert.ok(process.env.MONGODB_URI, 'MONGODB_URI is required for the isolated teacher API test.');
  assert.ok(process.env.JWT_SECRET && Buffer.byteLength(process.env.JWT_SECRET, 'utf8') >= 32,
    'JWT_SECRET is required for authenticated teacher API checks.');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  assert.equal(mongoose.connection.name, databaseName);
  try {
    await Promise.all([Teacher.init(), TeacherProgress.init(), TeacherAssessmentAttempt.init(), User.init()]);
    const passwordHash = await bcrypt.hash('temporary-test-password', 4);
    await User.create([
      { displayName: 'Teacher Test Student', email: 'teacher-student@test.invalid', passwordHash, ageGroup: '9-12', onboardingCompleted: true, role: 'student' },
      { displayName: 'Second Test Student', email: 'teacher-second@test.invalid', passwordHash, ageGroup: '9-12', onboardingCompleted: true, role: 'student' },
      { displayName: 'Test Admin', email: 'teacher-admin@test.invalid', passwordHash, role: 'admin' },
      { displayName: 'Test Teacher', email: 'nonstudent@test.invalid', passwordHash, role: 'teacher' }
    ]);
    teacher = await Teacher.create(teacherInput());
    lesson = teacher.ageGroups.find((path) => path.ageGroup === '9-12').modules[0].chapters[0].lessons[0];
    assessment = teacher.ageGroups.find((path) => path.ageGroup === '9-12').modules[0].chapters[0].assessment;
    question = assessment.questions[0];
    const draft = await Teacher.create(teacherInput({ slug: 'draft-teacher', publicationStatus: 'draft' }));
    const incomplete = await Teacher.create({
      name: 'Draft Teacher', slug: 'incomplete-teacher', identityType: 'teachingPersona', title: 'Draft title',
      shortIntroduction: 'Draft introduction for administrator editing.', mythologicalBackground: 'Draft context for admin editing.',
      personality: 'Draft personality', teachingPhilosophy: 'Draft teaching philosophy', teachingDomain: 'Draft subject',
      knowledgeAndSkills: ['Draft skill'], biography: 'Draft biography for testing.', teachingStyle: 'Draft style'
    });
    assert.ok(draft && incomplete);
    server = http.createServer(app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    studentCookie = await loginCookie('teacher-student@test.invalid');
    secondStudentCookie = await loginCookie('teacher-second@test.invalid');
    adminCookie = await loginCookie('teacher-admin@test.invalid');
    teacherCookie = await loginCookie('nonstudent@test.invalid');

    await t.test('student-only published teacher endpoints reject unauthenticated and non-student access', async () => {
      assert.equal((await request('/api/learning/teachers')).response.status, 401);
      assert.equal((await request('/api/learning/teachers', { cookie: teacherCookie })).response.status, 403);
      assert.equal((await request('/api/admin/teachers', { cookie: studentCookie })).response.status, 403);
      assert.equal((await request('/api/learning/teachers?ageGroup=unknown', { cookie: studentCookie })).response.status, 400);
    });

    await t.test('student receives only published profiles and answer-key-free selected-age syllabus', async () => {
      const list = await request('/api/learning/teachers?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(list.response.status, 200);
      assert.deepEqual(list.body.teachers.map((item) => item.slug), ['dharma']);
      assert.equal(list.body.teachers[0].progress.totalLessons, 1);
      const courses = await request('/api/student/courses?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(courses.response.status, 200);
      assert.deepEqual(courses.body.teachers.map((item) => item.slug), ['dharma']);
      const course = await request('/api/student/courses/dharma?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(course.response.status, 200);
      assert.equal(course.body.teacher.slug, 'dharma');
      const courseSyllabus = await request('/api/student/courses/dharma/syllabus?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(courseSyllabus.response.status, 200);
      assert.equal(courseSyllabus.body.syllabus.ageGroup, '9-12');
      const materials = await request('/api/student/courses/dharma/materials?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(materials.response.status, 200);
      assert.equal(materials.body.syllabus.modules.length, 1);
      const assignments = await request('/api/student/assignments?ageGroup=9-12&status=pending', { cookie: studentCookie });
      assert.equal(assignments.response.status, 200);
      assert.equal(assignments.body.assignments.length, 1);
      assert.equal(assignments.body.assignments[0].title, assessment.title);
      assert.equal(assignments.body.assignments[0].status, 'pending');
      assert.equal(JSON.stringify(assignments.body).includes('correctAnswer'), false);
      const profile = await request('/api/learning/teachers/dharma?ageGroup=9-12', { cookie: studentCookie });
      assert.equal(profile.response.status, 200);
      assert.equal(Object.hasOwn(profile.body.teacher, 'ageGroups'), false);
      const syllabus = await request('/api/learning/teachers/dharma/age-groups/9-12/syllabus', { cookie: studentCookie });
      assert.equal(syllabus.response.status, 200);
      assert.deepEqual(syllabus.body.syllabus.ageGroup, '9-12');
      const serialized = JSON.stringify(syllabus.body);
      assert.equal(serialized.includes('correctAnswer'), false);
      assert.equal(serialized.includes('acceptedAnswers'), false);
      assert.equal(serialized.includes('Considering consequences is reflective'), false);
    });

    await t.test('lesson access does not mark completion; explicit completion is unique and persistent', async () => {
      const secondStudentNoAccess = await request(`/api/learning/teachers/dharma/age-groups/9-12/lessons/${lesson._id}/complete`, {
        method: 'POST', cookie: secondStudentCookie, body: {}
      });
      assert.equal(secondStudentNoAccess.response.status, 400);
      assert.equal(await TeacherProgress.countDocuments({ teacher: teacher._id }), 0);

      const access = await request(`/api/learning/teachers/dharma/age-groups/9-12/lessons/${lesson._id}/access`, { method: 'POST', cookie: studentCookie, body: {} });
      assert.equal(access.response.status, 200);
      assert.equal(access.body.progress.completedLessons, 0);
      const earlyComplete = await request(`/api/learning/teachers/dharma/age-groups/9-12/lessons/${lesson._id}/complete`, { method: 'POST', cookie: studentCookie, body: {} });
      assert.equal(earlyComplete.response.status, 400);
      assert.equal(earlyComplete.body.error, 'Keep this lesson open for at least 15 seconds before completing it.');
      assert.equal(earlyComplete.body.progress, undefined);
      assert.equal((await TeacherProgress.findOne({ teacher: teacher._id })).completedLessonIds.length, 0);
      await TeacherProgress.updateOne({ student: (await User.findOne({ email: 'teacher-student@test.invalid' }))._id, teacher: teacher._id, ageGroup: '9-12' }, {
        $set: { lastAccessedAt: new Date(Date.now() - 16_000) }
      });
      const lessonDetail = await request(`/api/learning/teachers/dharma/age-groups/9-12/lessons/${lesson._id}`, { cookie: studentCookie });
      assert.equal(lessonDetail.response.status, 200);
      assert.equal(lessonDetail.body.studyRequirementSeconds, 15);
      const complete = await request(`/api/learning/teachers/dharma/age-groups/9-12/lessons/${lesson._id}/complete`, { method: 'POST', cookie: studentCookie, body: {} });
      assert.equal(complete.response.status, 200);
      assert.equal(complete.body.progress.completedLessons, 1);
      assert.equal(complete.body.dharmaPointsAwarded, 5);
      const repeat = await request(`/api/learning/teachers/dharma/age-groups/9-12/lessons/${lesson._id}/complete`, { method: 'POST', cookie: studentCookie, body: {} });
      assert.equal(repeat.body.progress.completedLessons, 1);
      assert.equal(repeat.body.dharmaPointsAwarded, 0);
    });

    await t.test('assessment is scored by the server, idempotent, and results are student-private', async () => {
      const invalid = await request(`/api/learning/teachers/dharma/age-groups/9-12/assessments/${assessment._id}/submit`, {
        method: 'POST', cookie: studentCookie,
        body: { submissionKey: 'test-submission-invalid-1', answers: [{ questionId: question._id, answer: 'unknown' }] }
      });
      assert.equal(invalid.response.status, 400);
      const submitted = await request(`/api/learning/teachers/dharma/age-groups/9-12/assessments/${assessment._id}/submit`, {
        method: 'POST', cookie: studentCookie,
        body: { submissionKey: 'test-submission-valid-1', score: 0, answers: [{ questionId: question._id, answer: 'a' }] }
      });
      assert.equal(submitted.response.status, 201);
      assert.equal(submitted.body.result.score, 2);
      assert.equal(submitted.body.result.totalMarks, 2);
      assert.equal(submitted.body.result.passed, true);
      assert.equal(submitted.body.result.dharmaPointsAwarded, 20);
      const repeated = await request(`/api/learning/teachers/dharma/age-groups/9-12/assessments/${assessment._id}/submit`, {
        method: 'POST', cookie: studentCookie,
        body: { submissionKey: 'test-submission-valid-1', answers: [{ questionId: question._id, answer: 'b' }] }
      });
      assert.equal(repeated.response.status, 201);
      assert.equal(repeated.body.result.id, submitted.body.result.id);
      assert.equal(repeated.body.result.dharmaPointsAwarded, 20);
      const student = await User.findOne({ email: 'teacher-student@test.invalid' });
      assert.equal(student.dharmaPoints, 25);
      const hidden = await request(`/api/learning/teachers/results/${submitted.body.result.id}`, { cookie: secondStudentCookie });
      assert.equal(hidden.response.status, 404);
      const own = await request(`/api/learning/teachers/results/${submitted.body.result.id}`, { cookie: studentCookie });
      assert.equal(own.response.status, 200);
      assert.equal(own.body.result.feedback[0].correct, true);
      const submissions = await request('/api/student/submissions', { cookie: studentCookie });
      assert.equal(submissions.body.submissions.length, 1);
      assert.equal(submissions.body.submissions[0].title, assessment.title);
      assert.equal(submissions.body.submissions[0].percentage, 100);
      assert.equal(submissions.body.submissions[0].status, 'graded');
      const submittedAssignments = await request('/api/student/assignments?ageGroup=9-12&status=submitted', { cookie: studentCookie });
      assert.equal(submittedAssignments.body.assignments.length, 1);
      assert.equal(submittedAssignments.body.assignments[0].status, 'submitted');
      assert.equal((await request('/api/student/grades/gradebook', { cookie: secondStudentCookie })).body.submissions.length, 0);
    });

    await t.test('admin can manage drafts; incomplete or unreviewed content cannot publish', async () => {
      const list = await request('/api/admin/teachers?status=all', { cookie: adminCookie });
      assert.equal(list.response.status, 200);
      assert.ok(list.body.teachers.some((item) => item.slug === 'incomplete-teacher'));
      const studentView = await request('/api/learning/teachers/incomplete-teacher', { cookie: studentCookie });
      assert.equal(studentView.response.status, 404);
      const update = await request('/api/admin/teachers/incomplete-teacher', {
        method: 'PATCH', cookie: adminCookie, body: { teachingDomain: 'Updated test domain' }
      });
      assert.equal(update.response.status, 200);
      const publish = await request('/api/admin/teachers/incomplete-teacher/publication', {
        method: 'PATCH', cookie: adminCookie, body: { publicationStatus: 'published' }
      });
      assert.equal(publish.response.status, 400);
    });

    await t.test('invalid lesson and assessment identifiers are rejected', async () => {
      assert.equal((await request('/api/learning/teachers/dharma/age-groups/9-12/lessons/nope', { cookie: studentCookie })).response.status, 400);
      assert.equal((await request('/api/learning/teachers/dharma/age-groups/9-12/assessments/nope/submit', { method: 'POST', cookie: studentCookie, body: {} })).response.status, 400);
    });
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
