const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

test('student story pages load the shared shell and their page controllers', () => {
  const library = read('public/stories.html');
  const reader = read('public/story.html');
  for (const html of [library, reader]) {
    assert.match(html, /assets\/css\/global\.css/);
    assert.match(html, /assets\/js\/auth-client\.js/);
    assert.match(html, /assets\/js\/main\.js/);
    assert.match(html, /data-component="header"/);
    assert.match(html, /data-component="footer"/);
  }
  assert.match(library, /assets\/js\/stories\.js/);
  assert.match(library, /story-search/);
  assert.match(library, /story-category/);
  assert.match(library, /story-age-group/);
  assert.match(library, /story-difficulty/);
  assert.match(reader, /assets\/js\/story\.js/);
  assert.match(reader, /data-story-outline/);
  assert.match(reader, /data-complete-lesson/);
  assert.match(reader, /data-previous-lesson/);
  assert.match(reader, /data-next-lesson/);
});

test('student story frontend uses real APIs and never inserts story content as HTML', () => {
  const library = read('public/assets/js/stories.js');
  const reader = read('public/assets/js/story.js');
  const dashboard = read('public/assets/js/dashboard.js');
  assert.match(library, /getPublishedStories/);
  assert.match(reader, /getPublishedStory/);
  assert.match(reader, /getPublishedChapters/);
  assert.match(reader, /getPublishedLessons/);
  assert.match(reader, /recordLessonAccess/);
  assert.match(reader, /completeLesson/);
  assert.match(dashboard, /getStudentDashboard/);
  assert.match(dashboard, /dashboard\.learning/);
  assert.match(read('public/assets/js/auth-client.js'), /\/api\/student\/dashboard/);
  for (const source of [library, reader, dashboard]) {
    assert.doesNotMatch(source, /\.innerHTML\s*=/);
  }
});

test('story module CSS includes tablet, mobile, and reduced-motion adaptations', () => {
  const css = read('public/assets/css/global.css');
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.story-reading-layout/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.story-filter-grid/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.story-card/);
});
