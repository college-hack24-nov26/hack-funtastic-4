(async function initializeStoryExperience() {
  const status = document.querySelector('#story-page-status');
  const experience = document.querySelector('#story-experience');
  if (!status || !experience) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const outline = document.querySelector('[data-story-outline]');
  const reader = document.querySelector('[data-lesson-reader-content]');
  const empty = document.querySelector('[data-lesson-empty]');
  const feedback = document.querySelector('[data-lesson-feedback]');
  const lessonCache = new Map();
  let story;
  let lessons = [];
  let selectedIndex = -1;
  let selectionToken = 0;
  let progress = { completedLessonKeys: [], completedLessons: 0, totalLessons: 0, percentage: 0 };

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function setFeedback(message, state = '') {
    feedback.textContent = message;
    feedback.dataset.state = state;
    feedback.hidden = !message;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function lessonKey(chapterId, lessonId) {
    return `${chapterId}:${lessonId}`;
  }

  function updateProgress(result) {
    progress = result.progress;
    document.querySelector('[data-story-progress-label]').textContent =
      `${progress.completedLessons} of ${progress.totalLessons} lessons complete · ${progress.percentage}%`;
    for (const button of outline.querySelectorAll('[data-lesson-id]')) {
      const key = lessonKey(button.dataset.chapterId, button.dataset.lessonId);
      const completed = progress.completedLessonKeys.includes(key);
      button.dataset.completed = String(completed);
      button.setAttribute('aria-label', `${button.dataset.lessonTitle}${completed ? ', completed' : ''}`);
      const marker = button.querySelector('[data-completion-marker]');
      marker.textContent = completed ? '✓' : '';
      marker.setAttribute('aria-hidden', 'true');
    }
    if (selectedIndex >= 0) {
      const current = lessons[selectedIndex];
      const completed = progress.completedLessonKeys.includes(lessonKey(current.chapterId, current.id));
      document.querySelector('[data-complete-lesson]').hidden = completed;
      document.querySelector('[data-completed-indicator]').hidden = !completed;
    }
  }

  function appendInlineText(parent, text) {
    const syntax = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let cursor = 0;
    for (const match of text.matchAll(syntax)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];
      const tag = token.startsWith('**') ? 'strong' : token.startsWith('*') ? 'em' : 'code';
      parent.append(element(tag, '', token.slice(tag === 'strong' ? 2 : 1, tag === 'strong' ? -2 : -1)));
      cursor = match.index + token.length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }

  function appendSafeMarkdown(container, source) {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const node = element(`h${Math.min(4, heading[1].length + 1)}`);
        appendInlineText(node, heading[2]);
        container.append(node);
        index += 1;
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const list = element('ul');
        while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
          const item = element('li');
          appendInlineText(item, lines[index].replace(/^\s*[-*]\s+/, ''));
          list.append(item);
          index += 1;
        }
        container.append(list);
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const list = element('ol');
        while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
          const item = element('li');
          appendInlineText(item, lines[index].replace(/^\s*\d+[.)]\s+/, ''));
          list.append(item);
          index += 1;
        }
        container.append(list);
        continue;
      }
      if (/^>\s?/.test(line)) {
        const quote = element('blockquote');
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          const paragraph = element('p');
          appendInlineText(paragraph, lines[index].replace(/^>\s?/, ''));
          quote.append(paragraph);
          index += 1;
        }
        container.append(quote);
        continue;
      }
      const paragraphLines = [];
      while (index < lines.length && lines[index].trim()
        && !/^(#{1,3})\s+/.test(lines[index])
        && !/^\s*[-*]\s+/.test(lines[index])
        && !/^\s*\d+[.)]\s+/.test(lines[index])
        && !/^>\s?/.test(lines[index])) {
        paragraphLines.push(lines[index]);
        index += 1;
      }
      const paragraph = element('p');
      appendInlineText(paragraph, paragraphLines.join(' '));
      container.append(paragraph);
    }
  }

  function renderLessonContent(lesson) {
    const content = document.querySelector('[data-lesson-content]');
    content.replaceChildren();
    if (lesson.contentFormat === 'markdown') appendSafeMarkdown(content, lesson.content);
    else content.textContent = lesson.content;
  }

  function renderOutline(chapters) {
    outline.replaceChildren();
    lessons = chapters
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap((chapter) => (chapter.lessons || [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((lesson) => ({
          id: lesson._id,
          title: lesson.title,
          order: lesson.order,
          estimatedMinutes: lesson.estimatedMinutes,
          chapterId: chapter._id,
          chapterTitle: chapter.title,
          chapterOrder: chapter.order
        })));

    for (const chapter of chapters.slice().sort((a, b) => a.order - b.order)) {
      const section = element('section', 'story-outline-chapter');
      const heading = element('h3', '', `Chapter ${chapter.order}: ${chapter.title}`);
      section.append(heading);
      const list = element('div', 'story-outline-lessons');
      for (const lesson of (chapter.lessons || []).slice().sort((a, b) => a.order - b.order)) {
        const button = element('button', 'story-outline-lesson');
        button.type = 'button';
        button.dataset.lessonId = lesson._id;
        button.dataset.chapterId = chapter._id;
        button.dataset.lessonTitle = lesson.title;
        const label = element('span', 'story-outline-lesson-label', `${lesson.order}. ${lesson.title}`);
        const marker = element('span', 'story-outline-completion', '');
        marker.dataset.completionMarker = '';
        marker.setAttribute('aria-hidden', 'true');
        button.append(label, marker);
        button.addEventListener('click', () => {
          const lessonIndex = lessons.findIndex((item) => item.id === lesson._id);
          if (lessonIndex >= 0) openLesson(lessonIndex);
        });
        list.append(button);
      }
      if (!chapter.lessons?.length) list.append(element('p', 'muted', 'No lessons in this chapter yet.'));
      section.append(list);
      outline.append(section);
    }
  }

  function updateNavigation() {
    const lesson = lessons[selectedIndex];
    const previous = document.querySelector('[data-previous-lesson]');
    const next = document.querySelector('[data-next-lesson]');
    previous.disabled = selectedIndex <= 0;
    next.disabled = selectedIndex >= lessons.length - 1;
    document.querySelector('[data-lesson-step]').textContent = `Lesson ${selectedIndex + 1} of ${lessons.length}`;
    document.querySelector('[data-lesson-position]').textContent = `Chapter ${lesson.chapterOrder}: ${lesson.chapterTitle} · Lesson ${lesson.order}`;
    for (const button of outline.querySelectorAll('[data-lesson-id]')) {
      const active = button.dataset.lessonId === lesson.id;
      button.dataset.active = String(active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
      if (!active) button.removeAttribute('aria-current');
    }
  }

  async function getLessonContent(lesson) {
    if (!lessonCache.has(lesson.chapterId)) {
      lessonCache.set(lesson.chapterId,
        window.MythoVerseAuth.getPublishedLessons(slug, lesson.chapterId));
    }
    const pending = lessonCache.get(lesson.chapterId);
    let result;
    try {
      result = await pending;
    } catch (error) {
      if (lessonCache.get(lesson.chapterId) === pending) lessonCache.delete(lesson.chapterId);
      throw error;
    }
    const found = result.lessons.find((item) => item._id === lesson.id);
    if (!found) throw new Error('This lesson is no longer available. Reload the story to refresh its chapters.');
    return found;
  }

  async function openLesson(index) {
    if (index < 0 || index >= lessons.length) return;
    selectedIndex = index;
    const current = lessons[index];
    const token = ++selectionToken;
    reader.hidden = false;
    empty.hidden = true;
    updateNavigation();
    setFeedback('Loading lesson…', 'loading');
    document.querySelector('[data-lesson-title]').textContent = current.title;
    try {
      const lesson = await getLessonContent(current);
      if (token !== selectionToken) return;
      renderLessonContent(lesson);
      document.querySelector('[data-lesson-estimate]').textContent = `About ${lesson.estimatedMinutes || current.estimatedMinutes || 5} minutes`;
      const objectives = document.querySelector('[data-lesson-objectives]');
      objectives.replaceChildren();
      const lessonObjectives = lesson.learningObjectives?.length ? lesson.learningObjectives : story.learningObjectives;
      for (const objective of lessonObjectives || []) objectives.append(element('li', '', objective));
      objectives.parentElement.hidden = objectives.children.length === 0;
      document.querySelector('[data-lesson-title]').focus({ preventScroll: true });
      setFeedback('');
      const result = await window.MythoVerseAuth.recordLessonAccess(slug, current.chapterId, current.id);
      if (token === selectionToken) updateProgress(result);
    } catch (error) {
      if (token !== selectionToken) return;
      console.error('Unable to open the selected lesson.', error);
      setFeedback(error.status === 401
        ? 'Your student session expired. Please sign in again.'
        : 'This lesson could not be loaded. Please try again.', 'error');
    }
  }

  async function markCurrentLessonComplete() {
    if (selectedIndex < 0) return;
    const current = lessons[selectedIndex];
    const button = document.querySelector('[data-complete-lesson]');
    button.disabled = true;
    setFeedback('Saving your progress…', 'loading');
    try {
      const result = await window.MythoVerseAuth.completeLesson(slug, current.chapterId, current.id);
      updateProgress(result);
      setFeedback(`Lesson marked complete. Your progress is saved to your account. ${result.dharmaPointsAwarded || 0} Dharma points earned.`, 'success');
    } catch (error) {
      console.error('Unable to save lesson progress.', error);
      setFeedback(error.status === 401
        ? 'Your student session expired. Please sign in again.'
        : 'Your progress could not be saved. Please try again.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  try {
    if (!slug) {
      setStatus('Choose a story from the Story Library to begin reading.', 'error');
      return;
    }
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') {
      window.location.replace('/');
      return;
    }
    const onboarding = await window.MythoVerseAuth.getOnboardingStatus();
    if (onboarding.onboardingRequired) {
      window.location.replace('/onboarding.html');
      return;
    }
    const [storyResult, chapterResult, progressResult] = await Promise.all([
      window.MythoVerseAuth.getPublishedStory(slug),
      window.MythoVerseAuth.getPublishedChapters(slug),
      window.MythoVerseAuth.getStoryProgress(slug)
    ]);
    story = storyResult.story;
    renderOutline(chapterResult.chapters);
    document.querySelector('[data-story-title]').textContent = story.title;
    document.querySelector('[data-story-category]').textContent = story.category;
    document.querySelector('[data-story-short]').textContent = story.shortDescription;
    document.querySelector('[data-story-full]').textContent = story.fullDescription;
    document.querySelector('[data-story-background]').textContent = story.mythologicalBackground;
    const meta = document.querySelector('[data-story-meta]');
    for (const label of [story.difficulty, `${story.estimatedMinutes} minutes`, ...(story.ageGroups || []).map((group) => `Ages ${group}`)]) {
      meta.append(element('span', 'story-meta-pill', label));
    }
    const objectives = document.querySelector('[data-story-objectives]');
    for (const objective of story.learningObjectives || []) objectives.append(element('li', '', objective));
    updateProgress(progressResult);
    setStatus('');
    experience.hidden = false;
    reader.hidden = lessons.length === 0;
    empty.hidden = lessons.length > 0;
    if (!lessons.length) return;

    document.querySelector('[data-previous-lesson]').addEventListener('click', () => openLesson(selectedIndex - 1));
    document.querySelector('[data-next-lesson]').addEventListener('click', () => openLesson(selectedIndex + 1));
    document.querySelector('[data-complete-lesson]').addEventListener('click', markCurrentLessonComplete);
    const queryLesson = params.get('lesson');
    const resumeLesson = progressResult.progress.lastAccessed?.lessonId;
    const initialId = queryLesson || resumeLesson;
    const initialIndex = initialId ? lessons.findIndex((lesson) => lesson.id === initialId) : -1;
    await openLesson(initialIndex >= 0 ? initialIndex : 0);
  } catch (error) {
    if (error.status === 401) {
      window.location.replace(`/login.html?next=${encodeURIComponent(`/story.html?slug=${slug || ''}`)}`);
      return;
    }
    if (error.status === 404) {
      setStatus('This story is not available. It may have been unpublished.', 'error');
      return;
    }
    console.error('Unable to load this MythoVerse story.', error);
    setStatus('The story could not be loaded. Please try again later.', 'error');
  }
})();
