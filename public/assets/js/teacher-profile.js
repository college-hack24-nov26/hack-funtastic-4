(async function initializeTeacherProfile() {
  const main = document.querySelector('[data-teacher-slug]');
  const status = document.querySelector('[data-teacher-status]');
  const content = document.querySelector('[data-teacher-content]');
  if (!main || !status || !content) return;

  const slug = main.dataset.teacherSlug;
  const ageGroups = ['6-8', '9-12', '13-15', '16-18', '18+'];
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  function lessonUrl(lessonId, ageGroup) {
    const query = new URLSearchParams({ teacher: slug, ageGroup, lesson: lessonId });
    return `/teacher-lesson.html?${query}`;
  }

  function assessmentUrl(assessmentId, ageGroup) {
    const query = new URLSearchParams({ teacher: slug, ageGroup, assessment: assessmentId });
    return `/teacher-assessment.html?${query}`;
  }

  function renderSyllabus(syllabus, progress) {
    const root = content.querySelector('[data-syllabus-content]');
    if (!root) return;
    root.replaceChildren();
    const modulesCount = syllabus.modules.length;
    const chaptersCount = syllabus.modules.reduce((count, module) => count + module.chapters.length, 0);
    const lessonsCount = syllabus.modules.reduce((count, module) => count + module.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0), 0);
    const summary = node('div', undefined, 'teacher-syllabus-summary');
    const completedLessons = progress?.completedLessons || 0;
    const remainingLessons = progress?.remainingLessons ?? lessonsCount;
    const completionPercentage = progress?.percentage || 0;
    for (const [label, value] of [
      ['Learning modules', modulesCount], ['Chapters', chaptersCount], ['Lessons', lessonsCount],
      ['Completed', completedLessons], ['Remaining', remainingLessons], ['Completion', `${completionPercentage}%`]
    ]) {
      const item = node('div', undefined, 'teacher-stat card');
      item.append(node('span', label, 'eyebrow'), node('strong', String(value)));
      summary.append(item);
    }
    root.append(summary);
    const objectivePanel = node('section', undefined, 'teacher-objectives card');
    objectivePanel.append(node('h3', 'What you will learn'));
    const objectiveList = node('ul');
    for (const objective of syllabus.learningObjectives) objectiveList.append(node('li', objective));
    objectivePanel.append(objectiveList);
    root.append(objectivePanel);

    const curriculumHeading = node('h3', 'Learning modules and lessons');
    root.append(curriculumHeading);
    if (!lessonsCount) {
      root.append(node('p', 'This published syllabus does not have any lessons yet.', 'dashboard-empty-copy'));
    }
    for (const module of syllabus.modules.slice().sort((a, b) => a.order - b.order)) {
      const moduleSection = node('section', undefined, 'teacher-module card');
      const moduleLessons = module.chapters.flatMap((chapter) => chapter.lessons);
      const moduleCompleted = moduleLessons.filter((lesson) => lesson.completed).length;
      moduleSection.append(
        node('p', `Module ${module.order} · ${moduleCompleted}/${moduleLessons.length} lessons complete`, 'eyebrow'),
        node('h3', module.title), node('p', module.description)
      );
      for (const chapter of module.chapters.slice().sort((a, b) => a.order - b.order)) {
        const chapterBlock = document.createElement('details');
        chapterBlock.className = 'teacher-chapter';
        const chapterSummary = node('summary', `${chapter.order}. ${chapter.title} · ${chapter.lessons.filter((lesson) => lesson.completed).length}/${chapter.lessons.length} complete`);
        chapterBlock.append(chapterSummary);
        if (chapter.summary) chapterBlock.append(node('p', chapter.summary));
        const lessonList = node('ul', undefined, 'teacher-lesson-list');
        for (const lesson of chapter.lessons.slice().sort((a, b) => a.order - b.order)) {
          const row = node('li');
          const isCurrent = progress?.lastAccessedLessonId === lesson._id;
          const state = lesson.completed ? 'Completed' : isCurrent ? 'In progress' : 'Not started';
          const link = node('a', lesson.completed ? `Review: ${lesson.title}` : isCurrent ? `Continue: ${lesson.title}` : `Start: ${lesson.title}`);
          link.href = lessonUrl(lesson._id, syllabus.ageGroup);
          row.append(link, node('span', `${state} · ${lesson.estimatedMinutes} min`, 'teacher-lesson-state'));
          lessonList.append(row);
        }
        chapterBlock.append(lessonList);
        if (chapter.assessment) {
          const testLink = node('a', `Take ${chapter.assessment.title}`, 'button button-quiet');
          testLink.href = assessmentUrl(chapter.assessment.id, syllabus.ageGroup);
          chapterBlock.append(testLink);
        }
        moduleSection.append(chapterBlock);
      }
      if (module.assessment) {
        const testLink = node('a', `Take ${module.assessment.title}`, 'button button-primary');
        testLink.href = assessmentUrl(module.assessment.id, syllabus.ageGroup);
        moduleSection.append(testLink);
      }
      root.append(moduleSection);
    }
    const progressLine = content.querySelector('[data-syllabus-progress]');
    if (progressLine) progressLine.textContent = progress
      ? `${progress.modulesStarted || 0}/${progress.modules} modules started · ${progress.completedLessons}/${progress.totalLessons} lessons complete · ${progress.percentage}% overall · ${progress.testsAttempted || 0} tests attempted`
      : 'No learning started yet.';
    let continueLink = root.querySelector('[data-teacher-continue]');
    if (continueLink) continueLink.remove();
    if (progress?.continueLessonId) {
      continueLink = node('a', 'Continue your next lesson', 'button button-primary');
      continueLink.dataset.teacherContinue = 'true';
      continueLink.href = lessonUrl(progress.continueLessonId, syllabus.ageGroup);
      root.prepend(continueLink);
    }
    const navigation = node('nav', undefined, 'teacher-lesson-topline');
    navigation.setAttribute('aria-label', 'Teacher navigation');
    const directoryLink = node('a', '← All six teachers'); directoryLink.href = '/teachers.html';
    const dashboardLink = node('a', 'Student dashboard'); dashboardLink.href = '/dashboard.html';
    const subjectsLink = node('a', 'Learning modules'); subjectsLink.href = '#teacher-learning';
    navigation.append(directoryLink, dashboardLink, subjectsLink);
    root.prepend(navigation);
  }

  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') {
      window.location.replace('/');
      return;
    }
    const profile = await window.MythoVerseAuth.getProfile();
    const preferredAgeGroup = profile.user.ageGroup;
    const queryAgeGroup = new URLSearchParams(window.location.search).get('ageGroup');
    const [result] = await Promise.all([
      window.MythoVerseAuth.getTeacher(slug, preferredAgeGroup || queryAgeGroup || ''),
      Promise.resolve()
    ]);
    const teacher = result.teacher;
    document.title = `${teacher.name} | MythoVerse`;
    content.replaceChildren();
    const hero = node('section', undefined, 'teacher-profile-hero card');
    const portrait = node('div', undefined, 'teacher-portrait teacher-portrait-large');
    portrait.setAttribute('aria-hidden', 'true');
    if (teacher.portrait) {
      const img = document.createElement('img'); img.src = teacher.portrait; img.alt = ''; portrait.append(img);
    } else portrait.textContent = teacher.name.slice(0, 1);
    const intro = node('div', undefined, 'teacher-profile-intro');
    intro.append(node('p', teacher.title, 'eyebrow'), node('h1', teacher.name), node('p', teacher.shortIntroduction), node('p', teacher.teachingDomain, 'teacher-domain-chip'));
    hero.append(portrait, intro);
    content.append(hero);
    const bio = node('div', undefined, 'teacher-bio-grid');
    for (const [title, text] of [['Mythological and cultural context', teacher.mythologicalBackground], ['Teaching philosophy', teacher.teachingPhilosophy], ['Teaching style', teacher.teachingStyle], ['About this teacher', teacher.biography]]) {
      const panel = node('section', undefined, 'teacher-info-card card'); panel.append(node('h2', title), node('p', text)); bio.append(panel);
    }
    content.append(bio);
    const knowledge = node('section', undefined, 'teacher-knowledge card');
    knowledge.append(node('p', 'The subjects', 'eyebrow'), node('h2', 'Knowledge and skills'));
    const knowledgeList = node('ul'); for (const topic of teacher.knowledgeAndSkills) knowledgeList.append(node('li', topic));
    knowledge.append(knowledgeList); content.append(knowledge);

    const syllabusSection = node('section', undefined, 'teacher-syllabus-section card');
    syllabusSection.id = 'teacher-learning';
    syllabusSection.append(node('p', 'Choose your learning path', 'eyebrow'), node('h2', 'A syllabus made for your age group'));
    const helper = node('p', preferredAgeGroup ? `Using the age group from your profile: ${preferredAgeGroup}.` : 'Your profile has no age group yet. Choose one for recommendations on this page; this choice will not change your profile.');
    helper.dataset.ageHelper = 'true'; syllabusSection.append(helper);
    const select = document.createElement('select'); select.className = 'form-control teacher-age-select'; select.setAttribute('aria-label', 'Choose age group');
    for (const age of ageGroups) { const option = document.createElement('option'); option.value = age; option.textContent = `${age} years`; option.selected = age === (preferredAgeGroup || queryAgeGroup); select.append(option); }
    syllabusSection.append(select);
    const progressLine = node('p', 'Loading syllabus…', 'teacher-progress-copy'); progressLine.dataset.syllabusProgress = 'true'; syllabusSection.append(progressLine);
    const syllabusRoot = node('div'); syllabusRoot.dataset.syllabusContent = 'true'; syllabusSection.append(syllabusRoot);
    content.append(syllabusSection);
    const sourceList = node('section', undefined, 'teacher-sources card'); sourceList.append(node('h2', 'Tradition and sources'));
    const sources = node('ul');
    for (const source of teacher.sources || []) {
      const item = node('li'); item.append(node('strong', source.title)); item.append(document.createTextNode(` — ${source.reference}${source.note ? ` (${source.note})` : ''}`)); sources.append(item);
    }
    sourceList.append(sources); content.append(sourceList);
    const loadSyllabus = async () => {
      const syllabusRoot = content.querySelector('[data-syllabus-content]');
      syllabusRoot?.replaceChildren();
      progressLine.dataset.state = 'loading';
      progressLine.textContent = 'Loading syllabus…';
      try {
        const syllabus = await window.MythoVerseAuth.getTeacherSyllabus(slug, select.value);
        renderSyllabus(syllabus.syllabus, syllabus.progress);
        progressLine.dataset.state = 'default';
        const helper = content.querySelector('[data-age-helper]');
        if (helper && !preferredAgeGroup) helper.textContent = `Showing the ${select.value} learning path. This selection is used only for recommendations on this visit.`;
      } catch (error) {
        progressLine.textContent = error.status === 404
          ? 'No published syllabus is available for this age group yet. An administrator must publish reviewed lessons first.'
          : error.message || 'This syllabus could not be loaded. Please try again.';
        progressLine.dataset.state = error.status === 404 ? 'empty' : 'error';
      }
    };
    select.addEventListener('change', loadSyllabus);
    content.hidden = false;
    status.hidden = true;
    await loadSyllabus();
  } catch (error) {
    if (error.status === 401) { window.location.replace(`/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    status.textContent = error.status === 404 ? 'This teacher profile has not been published yet.' : 'This teacher profile could not be loaded. Please try again later.';
    status.dataset.state = error.status === 404 ? 'empty' : 'error';
  }
})();
