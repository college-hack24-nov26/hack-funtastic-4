(async function initializeStudentDashboard() {
  const status = document.querySelector('#dashboard-status');
  const content = document.querySelector('[data-dashboard-content]');
  const retry = document.querySelector('[data-dashboard-retry]');

  if (!status || !content) {
    return;
  }
  retry?.addEventListener('click', () => window.location.reload());

  function showStatus(message, state = 'loading') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function makeStoryCard(story) {
    const card = document.createElement('article');
    card.className = 'story-card card';
    const visual = document.createElement('div');
    visual.className = 'story-card-visual';
    visual.setAttribute('aria-hidden', 'true');
    if (story.coverImage) {
      const image = document.createElement('img');
      image.src = story.coverImage;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        image.remove();
        visual.dataset.fallback = 'true';
        visual.textContent = '✦';
      }, { once: true });
      visual.append(image);
    } else {
      visual.dataset.fallback = 'true';
      visual.textContent = '✦';
    }
    const body = document.createElement('div');
    body.className = 'story-card-body';
    const category = document.createElement('p');
    category.className = 'eyebrow';
    category.textContent = story.category;
    const title = document.createElement('h3');
    title.textContent = story.title;
    const description = document.createElement('p');
    description.textContent = story.shortDescription;
    const link = document.createElement('a');
    link.className = 'button button-secondary';
    link.href = `/story.html?slug=${encodeURIComponent(story.slug)}`;
    link.textContent = 'Read story';
    body.append(category, title, description, link);
    card.append(visual, body);
    return card;
  }

  async function loadLearningPanel(student, dashboard) {
    const progressStatus = content.querySelector('[data-learning-status]');
    const storiesStatus = content.querySelector('#dashboard-stories-status');
    const storyGrid = content.querySelector('[data-dashboard-stories]');
    try {
      if (!dashboard.sectionStatus.learning || !dashboard.learning) throw new Error('Learning progress is unavailable.');
      const summary = dashboard.learning;
      content.querySelector('[data-learning-available]').textContent = String(summary.availableStories);
      content.querySelector('[data-learning-started]').textContent = String(summary.startedStories);
      content.querySelector('[data-learning-completed]').textContent = String(summary.completedLessons);
      content.querySelector('[data-learning-percentage]').textContent = String(summary.percentage);
      const learningProgress = content.querySelector('[data-learning-progress]');
      learningProgress.value = summary.percentage;
      learningProgress.setAttribute('aria-valuetext', `${summary.percentage}% of available lessons completed`);

      const current = dashboard.continueLearning;
      const continueEmpty = content.querySelector('[data-continue-empty]');
      const continueContent = content.querySelector('[data-continue-content]');
      if (current) {
        continueEmpty.hidden = true;
        continueContent.hidden = false;
        content.querySelector('[data-continue-chapter]').textContent = current.chapter.title;
        content.querySelector('[data-continue-story]').textContent = current.story.title;
        content.querySelector('[data-continue-lesson]').textContent = current.allLessonsCompleted
          ? 'You have completed every lesson in this story. Revisit it any time.'
          : `Last opened: ${current.lesson.title}`;
        const resumeLessonId = !current.allLessonsCompleted && current.lastLessonCompleted && current.nextLesson
          ? current.nextLesson.lessonId
          : current.lesson.id;
        const link = content.querySelector('[data-continue-link]');
        link.href = `/story.html?slug=${encodeURIComponent(current.story.slug)}&lesson=${encodeURIComponent(resumeLessonId)}`;
        link.textContent = current.allLessonsCompleted ? 'Review story' : 'Continue reading';
      } else {
        continueEmpty.hidden = false;
        continueContent.hidden = true;
      }
      if (progressStatus) progressStatus.hidden = true;
    } catch (error) {
      for (const selector of ['[data-learning-available]', '[data-learning-started]', '[data-learning-completed]', '[data-learning-percentage]']) {
        content.querySelector(selector).textContent = 'Unavailable';
      }
      if (progressStatus) {
        progressStatus.textContent = 'Learning progress could not be loaded. Please try again later.';
        progressStatus.hidden = false;
        progressStatus.dataset.state = 'error';
      }
    }

    try {
      if (!dashboard.sectionStatus.stories) throw new Error('Published stories are unavailable.');
      storyGrid.replaceChildren(...dashboard.stories.map(makeStoryCard));
      storyGrid.hidden = dashboard.stories.length === 0;
      storiesStatus.textContent = dashboard.stories.length ? '' : 'No published stories are available for your age group yet.';
      storiesStatus.hidden = Boolean(dashboard.stories.length);
    } catch (error) {
      storiesStatus.textContent = error.status === 401
        ? 'Please sign in again to view published stories.'
        : 'Published stories could not be loaded. Please try again later.';
      storiesStatus.dataset.state = 'error';
    }
  }

  function loadTeacherPanel(student, dashboard) {
    const teacherStatus = content.querySelector('[data-teachers-dashboard-status]');
    const teacherGrid = content.querySelector('[data-dashboard-teachers]');
    if (!teacherStatus || !teacherGrid) return;
    try {
      if (!dashboard.sectionStatus.teachers) throw new Error('Teacher data is unavailable.');
      if (!dashboard.teachers.length) {
        teacherStatus.textContent = 'No teacher learning paths have been published for your age group yet. They will appear here after an administrator publishes the syllabus.';
        teacherStatus.dataset.state = 'empty';
        return;
      }
      teacherGrid.replaceChildren(...dashboard.teachers.map((teacher) => {
        const card = document.createElement('article'); card.className = 'teacher-card card';
        const portrait = document.createElement('div'); portrait.className = 'teacher-portrait'; portrait.setAttribute('aria-hidden', 'true');
        if (teacher.portrait) { const image = document.createElement('img'); image.src = teacher.portrait; image.alt = ''; image.loading = 'lazy'; portrait.append(image); }
        else portrait.textContent = teacher.name.slice(0, 1);
        const body = document.createElement('div'); body.className = 'teacher-card-body';
        const domain = document.createElement('p'); domain.className = 'eyebrow'; domain.textContent = teacher.teachingDomain;
        const title = document.createElement('h3'); title.textContent = teacher.name;
        const intro = document.createElement('p'); intro.textContent = teacher.shortIntroduction;
        const summary = Array.isArray(teacher.progress)
          ? teacher.progress.find((item) => item?.ageGroup === student.ageGroup)
          : teacher.progress;
        const progress = document.createElement('p'); progress.className = 'teacher-progress-copy';
        progress.textContent = summary
          ? `${summary.completedLessons}/${summary.totalLessons} lessons · ${summary.percentage}% · ${summary.testsAttempted} tests attempted`
          : student.ageGroup ? 'No learning started yet' : 'Add an age group to your profile for a recommended syllabus.';
        const link = document.createElement('a'); link.className = 'button button-secondary';
        link.href = summary?.continueLessonId && student.ageGroup
          ? `/teacher-lesson.html?${new URLSearchParams({ teacher: teacher.slug, ageGroup: student.ageGroup, lesson: summary.continueLessonId })}`
          : `/teachers/${encodeURIComponent(teacher.slug)}.html`;
        link.textContent = summary?.continueLessonId ? 'Continue learning' : 'Explore teacher';
        body.append(domain, title, intro, progress, link); card.append(portrait, body); return card;
      }));
      teacherGrid.hidden = false;
      teacherStatus.hidden = true;
    } catch (error) {
      teacherStatus.textContent = 'Teacher learning information could not be loaded. Please try again later.';
      teacherStatus.dataset.state = 'error';
    }
  }

  function renderDashboardPanels(dashboard) {
    const dharmaStatus = content.querySelector('[data-dharma-status]');
    const progressionAvailable = dashboard.sectionStatus.progression && dashboard.dharma.available;
    content.querySelector('[data-dharma-points]').textContent = progressionAvailable ? String(dashboard.dharma.dharmaPoints) : 'Unavailable';
    content.querySelector('[data-adharma-points]').textContent = progressionAvailable ? String(dashboard.dharma.adharmaPoints) : 'Unavailable';
    content.querySelector('[data-current-loka]').textContent = progressionAvailable ? dashboard.dharma.currentLoka : 'Unavailable';
    dharmaStatus.textContent = progressionAvailable
      ? `Effective Dharma for Loka unlocks: ${dashboard.dharma.effectiveDharma}. ${dashboard.dharma.adharmaPenalty}`
      : dashboard.dharma.reason || 'Point progression could not be loaded. Please try again later.';
    dharmaStatus.dataset.state = progressionAvailable ? 'default' : 'error';
    const ashramStatus = content.querySelector('[data-ashram-status]');
    ashramStatus.textContent = dashboard.ashram.available
      ? `Current stage: ${dashboard.ashram.currentStage}.`
      : dashboard.ashram.reason || 'Ashram progression could not be loaded.';
    content.querySelector('[data-ashram-next]').textContent = !dashboard.ashram.available
      ? 'Progress is temporarily unavailable.'
      : dashboard.ashram.nextStage
        ? `Next: ${dashboard.ashram.nextStage.name} at ${dashboard.ashram.nextStage.dharmaRequired} Dharma points.`
        : 'All Ashram stages are unlocked.';
    const ashramProgress = content.querySelector('[data-ashram-progress]');
    ashramProgress.value = dashboard.ashram.available ? dashboard.ashram.progressPercent : 0;
    ashramProgress.setAttribute('aria-valuetext', dashboard.ashram.available
      ? `${dashboard.ashram.progressPercent}% toward the next Ashram stage`
      : 'Ashram progress unavailable');

    const lokaStatus = content.querySelector('[data-loka-status]');
    lokaStatus.textContent = dashboard.lokaSystem.available
      ? `Current Loka: ${dashboard.lokaSystem.currentLoka} · ${dashboard.dharma.effectiveDharma} effective Dharma. Unlocks are permanent.`
      : dashboard.lokaSystem.reason || 'Loka progression could not be loaded.';
    const lokaList = content.querySelector('[data-loka-list]');
    lokaList.replaceChildren(...(dashboard.lokaSystem.lokas || []).map((loka) => {
      const card = document.createElement('article'); card.className = 'dashboard-module-card card';
      const heading = document.createElement('h3'); heading.textContent = loka.name;
      const threshold = document.createElement('p'); threshold.textContent = `Requires ${loka.dharmaRequired} effective Dharma`;
      const state = document.createElement('span'); state.className = 'badge'; state.textContent = loka.unlocked ? 'Unlocked' : 'Locked';
      card.append(heading, threshold, state); return card;
    }));

    const announcementsStatus = content.querySelector('[data-announcements-status]');
    const announcementsGrid = content.querySelector('[data-dashboard-announcements]');
    if (!dashboard.sectionStatus.announcements) {
      announcementsStatus.textContent = 'Announcements could not be loaded. Please retry later.';
      announcementsStatus.dataset.state = 'error';
    } else if (dashboard.announcements.length) {
      announcementsGrid.replaceChildren(...dashboard.announcements.map((item) => {
        const card = document.createElement('article'); card.className = 'dashboard-module-card card';
        const category = document.createElement('p'); category.className = 'eyebrow'; category.textContent = item.important ? `${item.category} · Important` : item.category;
        const title = document.createElement('h3'); title.textContent = item.title;
        const description = document.createElement('p'); description.textContent = item.description;
        const date = document.createElement('p'); date.className = 'muted';
        date.textContent = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : '';
        card.append(category, title, description, date); return card;
      }));
      announcementsGrid.hidden = false; announcementsStatus.hidden = true;
    } else {
      announcementsStatus.textContent = 'There are no published announcements.';
      announcementsStatus.dataset.state = 'empty';
    }

    const weeklyStatus = content.querySelector('[data-weekly-status]');
    const weeklyGrid = content.querySelector('[data-weekly-activity]');
    weeklyGrid.replaceChildren(...dashboard.weeklyActivity.map((day) => {
      const item = document.createElement('li'); item.className = 'dashboard-summary-card card';
      const date = document.createElement('p'); date.className = 'eyebrow'; date.textContent = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
      const count = document.createElement('p'); count.className = 'dashboard-summary-value'; count.textContent = day.active ? 'Active' : '—';
      const detail = document.createElement('p'); detail.textContent = `${day.lessonsCompleted} lessons · ${day.testsAttempted} tests · ${day.studySessions} study sessions · ${day.dharmaEarned} Dharma earned`;
      item.append(date, count, detail); return item;
    }));
    weeklyGrid.hidden = !dashboard.sectionStatus.weeklyActivity;
    weeklyStatus.textContent = !dashboard.sectionStatus.weeklyActivity
      ? 'Weekly activity could not be loaded. Please retry later.'
      : dashboard.weeklyActivity.some((day) => day.active)
      ? 'Activity is based on saved lesson, study, and assessment records. Dharma rewards are included.'
        : 'No saved learning activity in the last seven days.';
    weeklyStatus.dataset.state = dashboard.sectionStatus.weeklyActivity ? 'empty' : 'error';

    const testPanel = content.querySelector('[data-today-test]');
    if (dashboard.recommendedAssessment) {
      const test = dashboard.recommendedAssessment;
      const details = document.createElement('p');
      details.textContent = `${test.teacher.name} · ${test.questionCount} questions · ${test.difficulty} · about ${test.estimatedMinutes} minutes`;
      const title = document.createElement('h3'); title.textContent = test.title;
      const link = document.createElement('a'); link.className = 'button button-primary'; link.href = test.href; link.textContent = 'Start test';
      testPanel.replaceChildren(title, details, link);
    } else {
      const empty = document.createElement('p'); empty.className = 'dashboard-empty-copy';
      empty.textContent = dashboard.sectionStatus.assessment
        ? 'No published assessment is available for your age group right now.'
        : 'Published assessments could not be loaded. Please retry later.';
      testPanel.replaceChildren(empty);
    }

    const parentStatus = content.querySelector('[data-parent-status]');
    const parents = content.querySelector('[data-approved-parents]');
    if (!dashboard.parentRelationships.available) {
      parentStatus.textContent = 'Guardian relationships could not be loaded.';
      parentStatus.dataset.state = 'error';
      return;
    }
    parentStatus.textContent = 'Guardians verify their email first. Student approval is required before read-only access begins.';
    const entries = [
      ...dashboard.parentRelationships.invitations,
      ...dashboard.parentRelationships.relationships
    ];
    parents.replaceChildren(...entries.map((item) => {
      const card = document.createElement('article'); card.className = 'dashboard-module-card card';
      const heading = document.createElement('h3'); heading.textContent = item.guardianName || item.email;
      const detail = document.createElement('p'); detail.textContent = `${item.relationship || 'Guardian'} · ${item.status}`;
      card.append(heading, detail);
      if (item.status === 'pending' && item.id) {
        for (const decision of ['approved', 'rejected']) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-secondary';
          button.textContent = decision === 'approved' ? 'Approve access' : 'Reject request';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await window.MythoVerseAuth.decideGuardianRelationship(item.id, decision); window.location.reload(); }
            catch (error) { button.disabled = false; parentStatus.textContent = error.message || 'The request could not be updated.'; parentStatus.dataset.state = 'error'; }
          });
          card.append(button);
        }
      } else if (item.status === 'approved') {
        const approved = document.createElement('p'); approved.textContent = item.approvedAt ? `Approved ${new Date(item.approvedAt).toLocaleDateString()}` : 'Approved'; card.append(approved);
        const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'button button-quiet'; revoke.textContent = 'Revoke access';
        revoke.addEventListener('click', async () => {
          revoke.disabled = true;
          try { await window.MythoVerseAuth.revokeGuardianRelationship(item.id); window.location.reload(); }
          catch (error) { revoke.disabled = false; parentStatus.textContent = error.message || 'Access could not be revoked.'; parentStatus.dataset.state = 'error'; }
        });
        card.append(revoke);
      }
      return card;
    }));
    if (!entries.length) {
      const empty = document.createElement('p'); empty.className = 'dashboard-empty-copy'; empty.textContent = 'No guardian invitations or relationships yet.'; parents.append(empty);
    }
  }

  function makeText(tag, text, className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text == null ? '' : String(text);
    return node;
  }

  function showViewMessage(section, message, state = 'empty') {
    const status = section?.querySelector('[data-view-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function showViewContent(section) {
    const status = section?.querySelector('[data-view-status]');
    if (status) status.hidden = true;
  }

  function appendEmpty(container, message) {
    container.replaceChildren(makeText('p', message, 'dashboard-status-card'));
  }

  function makeDataTable(columns, rows) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dashboard-table-wrap';
    const table = document.createElement('table');
    table.className = 'dashboard-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const column of columns) headerRow.append(makeText('th', column, ''));
    head.append(headerRow);
    const body = document.createElement('tbody');
    for (const values of rows) {
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        if (value instanceof Node) cell.append(value);
        else cell.textContent = value == null ? '—' : String(value);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    wrapper.append(table);
    return wrapper;
  }

  function makeDashboardLink(href, label, className = 'button button-secondary') {
    const link = document.createElement('a');
    link.className = className;
    link.href = href;
    link.textContent = label;
    return link;
  }

  function renderCourseCards(container, teachers, student) {
    if (!teachers.length) {
      appendEmpty(container, 'No published learning paths are available for your learning group yet.');
      return;
    }
    container.replaceChildren(...teachers.map((teacher) => {
      const card = document.createElement('article');
      card.className = 'teacher-card card';
      const portrait = document.createElement('div');
      portrait.className = 'teacher-portrait';
      portrait.setAttribute('aria-hidden', 'true');
      portrait.textContent = teacher.name.slice(0, 1);
      const body = document.createElement('div');
      body.className = 'teacher-card-body';
      body.append(
        makeText('p', teacher.teachingDomain, 'eyebrow'),
        makeText('h2', teacher.name),
        makeText('p', teacher.shortIntroduction)
      );
      const progress = Array.isArray(teacher.progress)
        ? teacher.progress.find((item) => item?.ageGroup === student.ageGroup)
        : teacher.progress;
      body.append(makeText('p', progress
        ? `${progress.completedLessons}/${progress.totalLessons} lessons complete · ${progress.percentage}%`
        : 'No learning started yet', 'teacher-progress-copy'));
      body.append(makeDashboardLink(`/dashboard.html?view=course&teacher=${encodeURIComponent(teacher.slug)}`, 'View syllabus'));
      card.append(portrait, body);
      return card;
    }));
  }

  function renderAssessmentCards(container, assignments) {
    if (!assignments.length) {
      appendEmpty(container, 'No published assessments are available for your learning group yet.');
      return;
    }
    container.replaceChildren(...assignments.map((item) => {
      const card = document.createElement('article');
      card.className = 'dashboard-module-card card';
      card.append(
        makeText('p', item.teacher.name, 'eyebrow'),
        makeText('h2', item.title),
        makeText('p', `${item.module.title}${item.chapter ? ` · ${item.chapter.title}` : ''}`),
        makeText('p', `${item.questionCount} questions · ${item.totalMarks} marks · ${item.status}`)
      );
      card.append(makeDashboardLink(item.href, item.status === 'submitted' ? 'Try again' : 'Start assessment', 'button button-primary'));
      return card;
    }));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }

  async function renderCourseSyllabus(section, student, teacherSlug) {
    const container = section.querySelector('[data-view-content]');
    if (!teacherSlug) {
      const teachers = await window.MythoVerseAuth.getStudentCourses(student.ageGroup || '');
      showViewContent(section);
      renderCourseCards(container, teachers.teachers || [], student);
      showViewMessage(section, 'Choose a learning path below to view its age-specific syllabus.', 'empty');
      return;
    }
    if (!student.ageGroup) throw new Error('Choose a learning group before opening an age-specific syllabus.');
    const [courseResult, syllabusResult] = await Promise.all([
      window.MythoVerseAuth.getStudentCourse(teacherSlug, student.ageGroup),
      window.MythoVerseAuth.getStudentCourseSyllabus(teacherSlug, student.ageGroup)
    ]);
    const teacher = courseResult.teacher;
    const syllabus = syllabusResult.syllabus;
    const contentNodes = [
      makeText('p', teacher.teachingDomain, 'eyebrow'),
      makeText('h2', teacher.title || teacher.name),
      makeText('p', teacher.shortIntroduction),
      makeText('p', `Learning group ${syllabus.ageGroup} · ${syllabus.difficulty} · ${syllabus.estimatedMinutes} estimated minutes`)
    ];
    const objectives = document.createElement('ul');
    for (const objective of syllabus.learningObjectives || []) objectives.append(makeText('li', objective));
    contentNodes.push(objectives);
    for (const module of syllabus.modules || []) {
      const moduleCard = document.createElement('article');
      moduleCard.className = 'dashboard-content-card card';
      moduleCard.append(makeText('h3', module.title), makeText('p', module.description));
      if (module.assessment?.questions?.length) {
        moduleCard.append(makeDashboardLink(
          `/teacher-assessment.html?${new URLSearchParams({ teacher: teacher.slug, ageGroup: student.ageGroup, assessment: module.assessment.id })}`,
          `Assessment: ${module.assessment.title}`
        ));
      }
      for (const chapter of module.chapters || []) {
        const chapterBlock = document.createElement('div');
        chapterBlock.className = 'teacher-chapter';
        chapterBlock.append(makeText('h4', chapter.title), makeText('p', chapter.summary));
        if (chapter.assessment?.questions?.length) {
          chapterBlock.append(makeDashboardLink(
            `/teacher-assessment.html?${new URLSearchParams({ teacher: teacher.slug, ageGroup: student.ageGroup, assessment: chapter.assessment.id })}`,
            `Assessment: ${chapter.assessment.title}`
          ));
        }
        for (const lesson of chapter.lessons || []) {
          const lessonLink = makeDashboardLink(
            `/teacher-lesson.html?${new URLSearchParams({ teacher: teacher.slug, ageGroup: student.ageGroup, lesson: lesson._id })}`,
            `${lesson.completed ? 'Review' : 'Start'}: ${lesson.title}`
          );
          chapterBlock.append(lessonLink);
        }
        moduleCard.append(chapterBlock);
      }
      contentNodes.push(moduleCard);
    }
    container.replaceChildren(...contentNodes);
    showViewContent(section);
  }

  async function loadSettings(section) {
    const result = await window.MythoVerseAuth.getStudentSettings();
    const settings = result.settings;
    const preferences = section.querySelector('[data-preferences-form]');
    preferences.elements.timeZone.value = settings.timeZone;
    preferences.elements.theme.value = settings.appearance.theme;
    preferences.elements.fontSize.value = settings.appearance.fontSize;
    const notifications = section.querySelector('[data-notifications-form]');
    for (const [key, value] of Object.entries(settings.notifications)) notifications.elements[key].checked = value;
    document.body.dataset.theme = settings.appearance.theme;
    document.body.dataset.fontSize = settings.appearance.fontSize;
    const status = section.querySelector('[data-settings-status]');
    status.textContent = '';
    status.hidden = true;
    return settings;
  }

  function connectSettingsForms(section) {
    const status = section.querySelector('[data-settings-status]');
    const preferences = section.querySelector('[data-preferences-form]');
    const notifications = section.querySelector('[data-notifications-form]');
    const password = section.querySelector('[data-password-form]');
    const showResult = (message, state) => {
      status.textContent = message;
      status.dataset.state = state;
      status.hidden = false;
    };
    preferences.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(preferences);
      try {
        const result = await window.MythoVerseAuth.updateStudentPreferences({
          timeZone: values.get('timeZone'),
          theme: values.get('theme'),
          fontSize: values.get('fontSize')
        });
        document.body.dataset.theme = result.settings.appearance.theme;
        document.body.dataset.fontSize = result.settings.appearance.fontSize;
        showResult('Preferences saved.', 'success');
      } catch (error) { showResult(error.message || 'Preferences could not be saved.', 'error'); }
    });
    notifications.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(notifications);
      const update = Object.fromEntries([...values.keys()].map((key) => [key, true]));
      for (const checkbox of notifications.querySelectorAll('input[type="checkbox"]')) {
        if (!values.has(checkbox.name)) update[checkbox.name] = false;
      }
      try {
        await window.MythoVerseAuth.updateStudentNotifications(update);
        showResult('Notification preferences saved.', 'success');
      } catch (error) { showResult(error.message || 'Notification preferences could not be saved.', 'error'); }
    });
    password.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(password);
      const submit = password.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await window.MythoVerseAuth.changeStudentPassword({
          currentPassword: values.get('currentPassword'),
          newPassword: values.get('newPassword')
        });
        password.reset();
        showResult('Password changed. Redirecting to sign in…', 'success');
        window.setTimeout(() => window.location.replace('/login.html'), 800);
      } catch (error) {
        showResult(error.message || 'Password could not be changed.', 'error');
        submit.disabled = false;
      }
    });
  }

  async function loadDashboardView(student, dashboard) {
    const layout = content;
    const query = new URLSearchParams(window.location.search);
    const requestedView = query.get('view') || 'dashboard';
    const sectionByView = {
      dashboard: 'dashboard',
      courses: 'courses',
      course: 'course',
      assignments: 'assignments',
      submissions: 'submissions',
      gradebook: 'gradebook',
      progress: 'progress',
      classes: 'calendar',
      events: 'calendar',
      exams: 'calendar',
      resources: 'resources',
      downloads: 'downloads',
      announcements: 'announcements',
      announcement: 'announcement',
      settings: 'settings',
      notifications: 'settings',
      security: 'settings',
      appearance: 'settings'
    };
    const view = sectionByView[requestedView] || 'dashboard';
    const sections = [...layout.querySelectorAll('[data-dashboard-view]')];
    for (const section of sections) section.hidden = section.dataset.dashboardView !== view;
    const activeView = requestedView === 'announcement' ? 'announcements' : requestedView;
    for (const link of layout.querySelectorAll('[data-dashboard-nav]')) {
      const active = link.dataset.dashboardNav === activeView;
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      if (active) link.closest('details')?.setAttribute('open', '');
    }
    const sidebar = layout.querySelector('[data-student-sidebar]');
    const toggle = layout.querySelector('[data-sidebar-toggle]');
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    layout.classList.toggle('sidebar-collapsed', mobile);
    toggle.setAttribute('aria-expanded', String(!mobile));
    toggle.addEventListener('click', () => {
      const collapsed = layout.classList.toggle('sidebar-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });
    layout.querySelectorAll('.student-dashboard-navigation a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 900px)').matches) {
          layout.classList.add('sidebar-collapsed');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    });

    if (view === 'dashboard') {
      const courseCount = layout.querySelector('[data-dashboard-course-count]');
      const assessmentCount = layout.querySelector('[data-dashboard-assessment-count]');
      let failed = false;
      try {
        const courses = await window.MythoVerseAuth.getStudentCourses(student.ageGroup || '');
        courseCount.textContent = String(courses.teachers.length);
      } catch (error) {
        courseCount.textContent = 'Unavailable';
        failed = true;
      }
      try {
        const submissions = await window.MythoVerseAuth.getStudentSubmissions();
        assessmentCount.textContent = String(submissions.submissions.length);
      } catch (error) {
        assessmentCount.textContent = 'Unavailable';
        failed = true;
      }
      return failed ? 'Some dashboard metrics could not be loaded. Please retry.' : '';
    }

    const section = layout.querySelector(`[data-dashboard-view="${view}"]`);
    const container = section.querySelector('[data-view-content]');
    try {
      if (view === 'courses') {
        const result = await window.MythoVerseAuth.getStudentCourses(student.ageGroup || '');
        renderCourseCards(container, result.teachers || [], student);
        showViewContent(section);
      } else if (view === 'course') {
        await renderCourseSyllabus(section, student, query.get('teacher'));
      } else if (view === 'assignments') {
        const result = await window.MythoVerseAuth.getStudentAssignments({ ageGroup: student.ageGroup || '' });
        renderAssessmentCards(container, result.assignments || []);
        showViewContent(section);
      } else if (view === 'submissions' || view === 'gradebook') {
        const result = view === 'submissions'
          ? await window.MythoVerseAuth.getStudentSubmissions()
          : await window.MythoVerseAuth.getStudentGradebook();
        const rows = (result.submissions || []).map((item) => [
          item.title,
          item.teacher?.name || 'Teacher unavailable',
          formatDate(item.submittedAt),
          `${item.score}/${item.totalMarks} (${item.percentage}%)`,
          item.passed ? 'Passed' : 'Review',
          makeDashboardLink(item.href, 'View result')
        ]);
        if (!rows.length) appendEmpty(container, 'No assessment submissions have been recorded yet.');
        else container.replaceChildren(makeDataTable(['Assessment', 'Teacher', 'Submitted', 'Score', 'Result', 'Details'], rows));
        showViewContent(section);
      } else if (view === 'progress') {
        const result = await window.MythoVerseAuth.getStudentProgress();
        const rows = (result.teachers || []).filter((item) => item.ageGroup === student.ageGroup);
        const summaryCards = [];
        if (dashboard.learning) {
          const storyCard = document.createElement('article');
          storyCard.className = 'dashboard-module-card card';
          storyCard.append(
            makeText('p', 'Story learning', 'eyebrow'),
            makeText('h2', `${dashboard.learning.completedLessons} lessons complete`),
            makeText('p', `${dashboard.learning.percentage}% of available lessons`)
          );
          summaryCards.push(storyCard);
        }
        if (dashboard.dharma.available) {
          const dharmaCard = document.createElement('article');
          dharmaCard.className = 'dashboard-module-card card';
          dharmaCard.append(
            makeText('p', 'Values journey', 'eyebrow'),
            makeText('h2', `${dashboard.dharma.dharmaPoints} Dharma points`),
            makeText('p', `${dashboard.dharma.currentLoka} · ${dashboard.dharma.effectiveDharma} effective Dharma`)
          );
          summaryCards.push(dharmaCard);
        }
        const teacherCards = rows.map((item) => {
          const card = document.createElement('article');
          card.className = 'dashboard-module-card card';
          card.append(
            makeText('p', `${item.ageGroup} · ${item.testsAttempted} assessments`, 'eyebrow'),
            makeText('h2', item.name),
            makeText('p', `${item.completedLessons} of ${item.totalLessons} lessons complete · ${item.percentage}%`)
          );
          const progress = document.createElement('progress');
          progress.max = 100;
          progress.value = item.percentage;
          progress.setAttribute('aria-label', `${item.name} learning progress`);
          card.append(progress);
          return card;
        });
        if (!teacherCards.length) summaryCards.push(makeText('p', 'No teacher learning progress is available for this learning group yet.', 'dashboard-status-card'));
        container.replaceChildren(...summaryCards, ...teacherCards);
        showViewContent(section);
      } else if (view === 'calendar') {
        const kind = requestedView === 'classes' ? 'classes' : requestedView === 'events' ? 'events' : 'exams';
        section.querySelector('[data-calendar-title]').textContent = ({
          classes: 'Class schedule', events: 'Events', exams: 'Assessment dates'
        })[kind];
        const result = await window.MythoVerseAuth.getStudentCalendar(kind);
        appendEmpty(container, result.reason || 'No scheduled dates are available.');
        showViewMessage(section, 'No calendar dates are published in MythoVerse yet.', 'empty');
      } else if (view === 'resources') {
        const form = section.querySelector('[data-resource-search]');
        const renderResources = async (search) => {
          const result = await window.MythoVerseAuth.getStudentResources({ search });
          if (!result.stories.length) appendEmpty(container, 'No published stories match this search.');
          else container.replaceChildren(...result.stories.map(makeStoryCard));
          showViewContent(section);
        };
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          renderResources(new FormData(form).get('search') || '').catch((error) => showViewMessage(section, error.message, 'error'));
        });
        await renderResources('');
      } else if (view === 'downloads') {
        const result = await window.MythoVerseAuth.getStudentDownloads();
        appendEmpty(container, result.reason);
        showViewMessage(section, 'Download history is unavailable because downloadable resources are not currently tracked.', 'empty');
      } else if (view === 'announcements') {
        const result = await window.MythoVerseAuth.getStudentAnnouncements();
        if (!result.announcements.length) appendEmpty(container, 'There are no published announcements.');
        else container.replaceChildren(...result.announcements.map((item) => {
          const card = document.createElement('article');
          card.className = 'dashboard-module-card card';
          card.append(
            makeText('p', item.important ? `${item.category} · Important` : item.category, 'eyebrow'),
            makeText('h2', item.title),
            makeText('p', item.description),
            makeText('p', formatDate(item.publishedAt), 'muted'),
            makeDashboardLink(`/dashboard.html?view=announcement&id=${encodeURIComponent(item._id)}`, 'Read announcement', 'button button-quiet dashboard-announcement-link')
          );
          return card;
        }));
        showViewContent(section);
      } else if (view === 'announcement') {
        const id = query.get('id');
        if (!id) throw new Error('Choose an announcement from the announcements list.');
        const result = await window.MythoVerseAuth.getStudentAnnouncement(id);
        const item = result.announcement;
        container.replaceChildren(
          makeText('p', item.important ? `${item.category} · Important` : item.category, 'eyebrow'),
          makeText('h2', item.title),
          makeText('p', item.description),
          makeText('p', formatDate(item.publishedAt), 'muted'),
          makeDashboardLink('/dashboard.html?view=announcements', 'Back to announcements')
        );
        showViewContent(section);
      } else if (view === 'settings') {
        await loadSettings(section);
        if (!section.dataset.settingsHandlers) {
          connectSettingsForms(section);
          section.dataset.settingsHandlers = 'true';
        }
        if (requestedView !== 'settings') {
          const focusSelector = {
            notifications: '[data-notifications-form] input',
            security: '[data-password-form] input',
            appearance: '#settings-theme'
          }[requestedView];
          section.querySelector(focusSelector)?.focus?.();
        }
      }
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/login.html?next=%2Fdashboard.html');
        return;
      }
      showViewMessage(section, error.message || 'This dashboard section could not be loaded. Please try again.', 'error');
    }
  }

  const guardianForm = content.querySelector('[data-guardian-invite-form]');
  guardianForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = content.querySelector('[data-guardian-feedback]');
    const submit = content.querySelector('[data-guardian-invite-submit]');
    submit.disabled = true;
    try {
      const form = new FormData(guardianForm);
      const result = await window.MythoVerseAuth.createGuardianInvite({ email: form.get('email'), relationship: form.get('relationship') });
      feedback.textContent = result.message;
      feedback.dataset.state = 'success';
      feedback.hidden = false;
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      feedback.textContent = error.message || 'The verified invitation could not be sent.';
      feedback.dataset.state = 'error';
      feedback.hidden = false;
    } finally { submit.disabled = false; }
  });

  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') {
      window.location.replace('/');
      return;
    }

    let dashboardSettingsWarning = '';
    let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try {
      const settings = await window.MythoVerseAuth.getStudentSettings();
      timeZone = settings.settings.timeZone || timeZone;
      document.body.dataset.theme = settings.settings.appearance.theme;
      document.body.dataset.fontSize = settings.settings.appearance.fontSize;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/login.html?next=%2Fdashboard.html');
        return;
      }
      console.error('Unable to load dashboard preferences.', error);
      dashboardSettingsWarning = 'Dashboard preferences could not be loaded; browser defaults are in use.';
    }

    const dashboard = await window.MythoVerseAuth.getStudentDashboard(timeZone);
    if (!dashboard.student.onboardingCompleted) {
      window.location.replace('/onboarding.html');
      return;
    }

    const student = dashboard.student;
    content.querySelector('[data-dashboard-name]').textContent = student.displayName;
    content.querySelector('[data-dashboard-age]').textContent = student.ageGroup || 'Not set';

    await loadLearningPanel(student, dashboard);
    loadTeacherPanel(student, dashboard);
    renderDashboardPanels(dashboard);
    const viewWarning = await loadDashboardView(student, dashboard);
    if (Object.values(dashboard.sectionStatus).some((available) => !available)) retry.hidden = false;

    showStatus(viewWarning || dashboardSettingsWarning);
    content.hidden = false;
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/login.html?next=%2Fdashboard.html');
      return;
    }

    console.error('Unable to load the student dashboard.', error);
    showStatus(error.message || 'We could not load your dashboard. Please try again.', 'error');
    if (retry) retry.hidden = false;
  }
})();
