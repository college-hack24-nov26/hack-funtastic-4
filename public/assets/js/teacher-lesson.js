(async function initializeTeacherLesson() {
  const status = document.querySelector('[data-lesson-status]');
  const content = document.querySelector('[data-lesson-content]');
  const query = new URLSearchParams(window.location.search);
  const teacherSlug = query.get('teacher');
  const ageGroup = query.get('ageGroup');
  const lessonId = query.get('lesson');
  if (!status || !content || !teacherSlug || !ageGroup || !lessonId) {
    if (status) status.textContent = 'This lesson link is incomplete. Return to the teacher page and choose a lesson.';
    return;
  }
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') { window.location.replace('/'); return; }
    const result = await window.MythoVerseAuth.getTeacherLesson(teacherSlug, ageGroup, lessonId);
    const { teacher, module, chapter, lesson, navigation, progress } = result;
    const studyRequirementSeconds = Number.isInteger(result.studyRequirementSeconds) && result.studyRequirementSeconds > 0
      ? result.studyRequirementSeconds
      : 15;
    document.title = `${lesson.title} · ${teacher.name} | MythoVerse`;
    const top = node('div', undefined, 'teacher-lesson-topline');
    const back = node('a', `← ${teacher.name}`); back.href = `/teachers/${encodeURIComponent(teacherSlug)}.html?ageGroup=${encodeURIComponent(ageGroup)}#teacher-learning`;
    top.append(back, node('span', `${ageGroup} years · ${module.title} · ${chapter.title}`, 'eyebrow'));
    const heading = node('header', undefined, 'teacher-lesson-heading');
    heading.append(node('p', teacher.teachingDomain, 'eyebrow'), node('h1', lesson.title), node('p', `${navigation.position} of ${navigation.total} lessons`));
    const progressBar = document.createElement('progress'); progressBar.max = navigation.total; progressBar.value = navigation.position; progressBar.setAttribute('aria-label', 'Lesson sequence progress'); heading.append(progressBar);
    const body = node('div', undefined, 'teacher-lesson-reading card');
    body.append(node('p', lesson.introduction, 'teacher-lesson-intro'));
    const articleText = node('div', lesson.content, 'teacher-lesson-text'); articleText.style.whiteSpace = 'pre-line'; body.append(articleText);
    if (lesson.narrativeContext) { body.append(node('h2', 'Story and context'), node('p', lesson.narrativeContext)); }
    if (lesson.keyConcepts?.length) { body.append(node('h2', 'Key concepts')); const list = node('ul'); lesson.keyConcepts.forEach((item) => list.append(node('li', item))); body.append(list); }
    if (lesson.realLifeApplication) body.append(node('h2', 'Try this in daily life'), node('p', lesson.realLifeApplication));
    if (lesson.takeaways?.length) { body.append(node('h2', 'Remember')); const list = node('ul'); lesson.takeaways.forEach((item) => list.append(node('li', item))); body.append(list); }
    if (lesson.activities?.length) {
      const activitySection = node('section', undefined, 'teacher-activities'); activitySection.append(node('h2', 'Activities'));
      for (const activity of lesson.activities) activitySection.append(node('h3', activity.title), node('p', activity.instructions));
      body.append(activitySection);
    }
    const actions = node('div', undefined, 'teacher-lesson-actions');
    const complete = node('button', lesson.completed ? 'Lesson completed' : `Study for ${studyRequirementSeconds} seconds to continue`, 'button button-primary'); complete.type = 'button'; complete.disabled = true;
    const feedback = node('p', '', 'form-status'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    if (lesson.completed) {
      complete.textContent = 'Lesson completed';
    } else {
      feedback.textContent = `Study tracking must start before completion. Keep this lesson open for ${studyRequirementSeconds} seconds; the server verifies the elapsed time.`;
    }
    complete.addEventListener('click', async () => {
      if (lesson.completed) return;
      complete.disabled = true;
      try {
        const update = await window.MythoVerseAuth.completeTeacherLesson(teacherSlug, ageGroup, lessonId);
        feedback.textContent = update.dharmaPointsAwarded > 0
          ? `${update.progress.completedLessons} of ${update.progress.totalLessons} lessons complete. ${update.dharmaPointsAwarded} Dharma points earned.`
          : `${update.progress.completedLessons} of ${update.progress.totalLessons} lessons complete. No new Dharma points were awarded.`;
        complete.textContent = 'Lesson completed';
      } catch (error) {
        feedback.textContent = error.message || 'Progress could not be saved. Try again.';
        feedback.dataset.state = 'error';
        complete.disabled = false;
      }
    });
    const nav = node('nav', undefined, 'teacher-lesson-nav'); nav.setAttribute('aria-label', 'Lesson navigation');
    if (navigation.previous) { const previous = node('a', 'Previous lesson', 'button button-quiet'); previous.href = `/teacher-lesson.html?${new URLSearchParams({ teacher: teacherSlug, ageGroup, lesson: navigation.previous })}`; nav.append(previous); }
    if (navigation.next) { const next = node('a', 'Next lesson', 'button button-secondary'); next.href = `/teacher-lesson.html?${new URLSearchParams({ teacher: teacherSlug, ageGroup, lesson: navigation.next })}`; nav.append(next); }
    actions.append(complete, feedback); body.append(actions, nav);
    content.replaceChildren(top, heading, body); content.hidden = false; status.hidden = true;
    if (!lesson.completed) {
      try {
        await window.MythoVerseAuth.recordTeacherLessonAccess(teacherSlug, ageGroup, lessonId);
        feedback.dataset.state = 'status';
        feedback.textContent = `Study tracking is active. Keep this lesson open for ${studyRequirementSeconds} seconds, then mark it complete.`;
        complete.textContent = `Continue after ${studyRequirementSeconds} seconds`;
        window.setTimeout(() => {
          if (!complete.isConnected || complete.textContent === 'Lesson completed') return;
          complete.disabled = false;
          complete.textContent = 'Mark lesson complete';
          feedback.textContent = 'The minimum study time has elapsed. The server will verify completion when you continue.';
        }, studyRequirementSeconds * 1000);
      } catch (error) {
        feedback.dataset.state = 'error';
        feedback.textContent = 'Study tracking could not be saved. Reload this lesson to try again.';
        complete.disabled = true;
      }
    }
    if (progress) document.body.dataset.teacherProgress = String(progress.percentage);
  } catch (error) {
    if (error.status === 401) { window.location.replace(`/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    status.textContent = error.message || 'This lesson could not be loaded.'; status.dataset.state = 'error';
  }
})();
