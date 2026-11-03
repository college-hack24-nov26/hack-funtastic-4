const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const teacherPages = [
  ['dharma', 'Dharma Teacher'],
  ['bhakti', 'Bhakti Teacher'],
  ['sanskrit', 'Sanskrit Teacher'],
  ['aryabhata', 'Aryabhata'],
  ['saptarishi', 'Saptarishi'],
  // Keep the existing database slug; the seed data and lesson URLs use "kanada".
  ['kanada', 'Maharshi Kanad']
];

test('the six teacher pages map each existing teacher slug to the shared profile controller', () => {
  for (const [slug, name] of teacherPages) {
    const page = read(`public/teachers/${slug}.html`);
    assert.match(page, new RegExp(`data-teacher-slug="${slug}"`));
    assert.match(page, /assets\/css\/global\.css/);
    assert.match(page, /assets\/js\/auth-client\.js/);
    assert.match(page, /assets\/js\/main\.js/);
    assert.match(page, /assets\/js\/teacher-profile\.js/);
    assert.match(page, /data-component="header"/);
    assert.match(page, /data-component="footer"/);
    assert.match(page, new RegExp(`<title>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| MythoVerse<\\/title>`));
  }
});

test('teacher pages render backend lesson progress, expandable chapters, and real lesson links', () => {
  const profile = read('public/assets/js/teacher-profile.js');
  assert.match(profile, /getTeacher\(slug/);
  assert.match(profile, /getTeacherSyllabus\(slug/);
  assert.match(profile, /progress\?\.completedLessons/);
  assert.match(profile, /progress\?\.remainingLessons/);
  assert.match(profile, /progress\?\.percentage/);
  assert.match(profile, /document\.createElement\('details'\)/);
  assert.match(profile, /lesson\.completed \? 'Completed' : isCurrent \? 'In progress' : 'Not started'/);
  assert.match(profile, /\/teacher-lesson\.html\?/);
  assert.match(profile, /No published syllabus is available for this age group yet/);
  assert.doesNotMatch(profile, /innerHTML\s*=/);
});

test('lesson completion UI waits for successful backend access tracking and server threshold', () => {
  const lesson = read('public/assets/js/teacher-lesson.js');
  assert.match(lesson, /recordTeacherLessonAccess/);
  assert.match(lesson, /studyRequirementSeconds/);
  assert.match(lesson, /complete\.disabled = true/);
  assert.match(lesson, /completeTeacherLesson/);
  assert.match(lesson, /study tracking could not be saved/i);
  assert.match(lesson, /no new Dharma points were awarded/i);
  assert.doesNotMatch(lesson, /dharmaPoints\s*\+?=/);
});
