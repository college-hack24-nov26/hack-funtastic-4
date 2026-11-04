(async function initializeGuardianDashboard() {
  const status = document.querySelector('[data-guardian-dashboard-status]');
  const root = document.querySelector('[data-guardian-dashboard-content]');
  const setStatus = (message, state = '') => { status.textContent = message; status.dataset.state = state; };
  document.querySelector('[data-guardian-logout]')?.addEventListener('click', async () => {
    try { await window.MythoVerseAuth.logout(); } catch (error) { /* route is protected and the session cookie expires normally */ }
    window.location.assign('/login.html');
  });
  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'guardian') { window.location.replace('/'); return; }
    const result = await window.MythoVerseAuth.getGuardianRelationships();
    const host = document.querySelector('[data-guardian-students]');
    const records = result.relationships || [];
    if (!records.length) setStatus('No guardian requests yet. A student must verify an invitation and approve access.');
    host.replaceChildren(...records.map((item) => {
      const card = document.createElement('article'); card.className = 'dashboard-module-card card';
      const heading = document.createElement('h2'); heading.textContent = item.studentName;
      const state = document.createElement('p'); state.textContent = `${item.relationship} · ${item.status}`;
      card.append(heading, state);
      if (item.status === 'approved') {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-secondary'; button.textContent = 'View approved learning summary';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await renderStudentSummary(item.studentId); }
          catch (error) { setStatus(error.message || 'Student summary is unavailable.', 'error'); }
          finally { button.disabled = false; }
        });
        card.append(button);
      }
      return card;
    }));
    root.hidden = false; status.hidden = true;
  } catch (error) {
    if (error.status === 401) { window.location.replace('/login.html?next=%2Fguardian-dashboard.html'); return; }
    setStatus('Guardian information could not be loaded.', 'error');
  }

  async function renderStudentSummary(studentId) {
    const summary = await window.MythoVerseAuth.getGuardianStudentDashboard(studentId);
    document.querySelector('[data-guardian-student-name]').textContent = summary.student.displayName;
    document.querySelector('[data-guardian-student-age]').textContent = `Age group: ${summary.student.ageGroup || 'Not set'}`;
    const grid = document.querySelector('[data-guardian-summary-grid]');
    const entries = [
      ['Published stories', summary.learning?.availableStories],
      ['Stories started', summary.learning?.startedStories],
      ['Lessons completed', summary.learning?.completedLessons],
      ['Dharma points', summary.dharma?.dharmaPoints],
      ['Adharma points', summary.dharma?.adharmaPoints],
      ['Current Loka', summary.dharma?.currentLoka],
      ['Ashram stage', summary.ashram?.currentStage]
    ];
    grid.replaceChildren(...entries.map(([label, value]) => {
      const card = document.createElement('article'); card.className = 'dashboard-summary-card card';
      const title = document.createElement('p'); title.className = 'eyebrow'; title.textContent = label;
      const data = document.createElement('p'); data.className = 'dashboard-summary-value'; data.textContent = value ?? 'Unavailable';
      card.append(title, data); return card;
    }));
    const week = document.querySelector('[data-guardian-week]');
    week.replaceChildren(...summary.weeklyActivity.map((day) => {
      const item = document.createElement('li'); item.className = 'dashboard-summary-card card';
      const date = document.createElement('p'); date.className = 'eyebrow'; date.textContent = day.date;
      const detail = document.createElement('p'); detail.textContent = `${day.lessonsCompleted} lessons · ${day.testsAttempted} tests · ${day.studySessions} sessions · ${day.dharmaEarned} Dharma earned`;
      item.append(date, detail); return item;
    }));
    document.querySelector('[data-guardian-student-summary]').hidden = false;
  }
})();
