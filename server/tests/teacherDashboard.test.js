const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dashboardPath = path.join(__dirname, '..', '..', 'public', 'dashboard.html');
const dashboardScriptPath = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'dashboard.js');
const dashboardStylesPath = path.join(__dirname, '..', '..', 'public', 'assets', 'css', 'student-dashboard.css');
const authClientPath = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'auth-client.js');
const directoryScriptPath = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'teachers-directory.js');

test('student dashboard links Six Teachers to the working teacher directory', () => {
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');
  const section = dashboard.match(/<article class="dashboard-module-card card">[\s\S]*?<h3>Six Teachers<\/h3>[\s\S]*?<\/article>/)?.[0];
  assert.ok(section, 'Six Teachers dashboard card exists');
  assert.match(section, /href="\/teachers\.html"/);
  assert.doesNotMatch(section, /Coming soon/i);
});

test('teacher empty states explain that published age-group curriculum is required', () => {
  for (const scriptPath of [dashboardScriptPath, directoryScriptPath]) {
    const script = fs.readFileSync(scriptPath, 'utf8');
    assert.match(script, /No teacher learning paths have been published/);
    assert.match(script, /administrator/);
  }
});

test('student dashboard navigation covers its data-backed views and excludes profile navigation', () => {
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');
  for (const view of ['dashboard', 'courses', 'course', 'assignments', 'submissions', 'gradebook', 'progress', 'calendar', 'resources', 'downloads', 'announcements', 'settings']) {
    assert.match(dashboard, new RegExp(`data-dashboard-view="${view}"`), `${view} view exists`);
  }
  assert.doesNotMatch(dashboard, /href="\/profile\.html"/);
  assert.match(dashboard, /data-sidebar-toggle/);
  assert.match(dashboard, /data-preferences-form/);
  assert.match(dashboard, /data-password-form/);
});

test('dashboard API client and scoped responsive stylesheet are wired', () => {
  const script = fs.readFileSync(dashboardScriptPath, 'utf8');
  const api = fs.readFileSync(authClientPath, 'utf8');
  const styles = fs.readFileSync(dashboardStylesPath, 'utf8');
  assert.match(script, /getStudentAssignments/);
  assert.match(script, /getStudentGradebook/);
  assert.match(script, /getStudentAnnouncement/);
  assert.match(script, /getStudentSettings/);
  assert.match(api, /credentials: 'same-origin'/);
  assert.match(api, /changeStudentPassword/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /--color-gold/);
});
