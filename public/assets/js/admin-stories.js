(async function initializeAdminStoryManagement() {
  const layout = document.querySelector('#admin-layout');
  const pageStatus = document.querySelector('#admin-story-page-status');
  const page = document.querySelector('#admin-story-page');
  if (!layout || !pageStatus || !page) return;

  const list = document.querySelector('#story-list');
  const listStatus = document.querySelector('#story-list-status');
  const feedback = document.querySelector('#admin-story-feedback');
  const workbench = document.querySelector('#story-workbench');
  const workbenchEmpty = document.querySelector('#story-workbench-empty');
  const storyForm = document.querySelector('#story-form');
  const formStatus = document.querySelector('#story-form-status');
  const chapterManager = document.querySelector('#story-chapter-manager');
  const chapterList = document.querySelector('#chapter-list');
  const newChapterForm = document.querySelector('#new-chapter-form');
  const storyLimit = 20;
  let currentStory = null;
  let currentPage = 1;
  let pageCount = 1;
  let searchTimer = 0;
  let slugWasEdited = false;
  trackFormChanges(storyForm);

  function setStatus(target, message, state = '') {
    target.textContent = message;
    target.dataset.state = state;
    target.hidden = !message;
  }

  function escapeHtmlText(value) {
    return String(value ?? '');
  }

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = escapeHtmlText(text);
    return item;
  }

  function addField(parent, labelText, name, value, { type = 'text', required = false, min, max, minLength, maxLength, rows } = {}) {
    const label = node('label', 'form-field');
    label.append(node('span', 'form-label', labelText));
    const control = type === 'textarea' ? node('textarea', 'form-control') : node('input', 'form-control');
    control.name = name;
    if (type !== 'textarea') control.type = type;
    if (rows) control.rows = rows;
    if (value !== undefined && value !== null) control.value = String(value);
    if (required) control.required = true;
    if (min !== undefined) control.min = String(min);
    if (max !== undefined) control.max = String(max);
    if (minLength !== undefined) control.minLength = minLength;
    if (maxLength !== undefined) control.maxLength = maxLength;
    label.append(control);
    parent.append(label);
    return control;
  }

  function numberValue(form, name) {
    const value = Number(form.elements.namedItem(name).value);
    return Number.isInteger(value) ? value : NaN;
  }

  function objectivesValue(value) {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function trackFormChanges(form) {
    form.dataset.dirty = 'false';
    form.addEventListener('input', () => { form.dataset.dirty = 'true'; });
    form.addEventListener('change', () => { form.dataset.dirty = 'true'; });
  }

  function hasUnsavedEdits() {
    return storyForm.dataset.dirty === 'true'
      || newChapterForm.dataset.dirty === 'true'
      || Boolean(chapterList.querySelector('form[data-dirty="true"]'));
  }

  function confirmDiscardEdits() {
    return !hasUnsavedEdits() || window.confirm('Discard unsaved story, chapter, or lesson changes?');
  }

  function handleError(error, target = feedback) {
    if (error?.status === 401) {
      window.location.replace('/admin-login.html');
      return;
    }
    setStatus(target, error.message || 'The request could not be completed. Please try again.', 'error');
  }

  function setPageStats(stats) {
    for (const [key, value] of Object.entries(stats || {})) {
      const counter = document.querySelector(`[data-story-stat="${key}"]`);
      if (counter) counter.textContent = Number.isInteger(value) ? String(value) : 'Unavailable';
    }
  }

  function renderStories(stories) {
    list.replaceChildren();
    if (!stories.length) {
      setStatus(listStatus, 'No stories match these filters.', '');
      return;
    }

    setStatus(listStatus, '', '');
    for (const story of stories) {
      const card = node('article', 'admin-story-list-card');
      const openButton = node('button', 'admin-story-select');
      openButton.type = 'button';
      openButton.setAttribute('aria-pressed', String(currentStory?._id === story._id));
      openButton.addEventListener('click', () => openStory(story._id));
      const title = node('span', 'admin-story-list-title', story.title);
      const slug = node('span', 'admin-story-list-slug', story.slug);
      openButton.append(title, slug);
      const badge = node('span', `badge admin-story-status admin-story-status-${story.publicationStatus}`, story.publicationStatus);
      card.append(openButton, badge);
      list.append(card);
    }
  }

  async function loadStories(pageNumber = 1) {
    currentPage = pageNumber;
    setStatus(listStatus, 'Loading stories…', 'loading');
    document.querySelector('#story-page-previous').disabled = true;
    document.querySelector('#story-page-next').disabled = true;
    try {
      const result = await window.MythoVerseAuth.getAdminStories({
        status: document.querySelector('#story-status-filter').value,
        search: document.querySelector('#story-search').value.trim(),
        page: currentPage,
        limit: storyLimit
      });
      setPageStats(result.stats);
      renderStories(result.stories || []);
      pageCount = Math.max(1, result.pagination?.pages || 1);
      currentPage = result.pagination?.page || currentPage;
      document.querySelector('#story-page-label').textContent = `Page ${currentPage} of ${pageCount}`;
      document.querySelector('#story-page-previous').disabled = currentPage <= 1;
      document.querySelector('#story-page-next').disabled = currentPage >= pageCount;
    } catch (error) {
      renderStories([]);
      setStatus(listStatus, error.message || 'Unable to load stories.', 'error');
      handleError(error);
    }
  }

  function setStoryStatus(story) {
    document.querySelector('#story-status-badge').textContent = story?.publicationStatus || 'Draft';
    document.querySelector('#story-status-badge').className = `badge admin-story-status admin-story-status-${story?.publicationStatus || 'draft'}`;
    const publicationButton = document.querySelector('#story-publication-button');
    publicationButton.hidden = !story || story.publicationStatus === 'archived';
    publicationButton.textContent = story?.publicationStatus === 'published' ? 'Unpublish story' : 'Publish story';
    const chapterHint = document.querySelector('#chapter-manager-hint');
    const addChapterControls = newChapterForm.querySelectorAll('input, textarea, button');
    const published = story?.publicationStatus === 'published';
    for (const control of addChapterControls) control.disabled = published;
    chapterHint.textContent = published
      ? 'Unpublish this story before adding a chapter. Add at least one lesson to each chapter before publishing again. Chapter and lesson order is controlled by each item’s order value.'
      : 'Chapter and lesson order is controlled by each item’s order value. Published stories must have at least one lesson in every chapter.';
  }

  function showWorkbench(story = null) {
    currentStory = story;
    workbench.hidden = false;
    workbenchEmpty.hidden = true;
    chapterManager.hidden = !story;
    storyForm.reset();
    storyForm.dataset.dirty = 'false';
    newChapterForm.reset();
    newChapterForm.dataset.dirty = 'false';
    formStatus.hidden = true;
    document.querySelector('#story-editor-heading').textContent = story ? 'Edit story details' : 'Create a story';
    document.querySelector('#story-save-button').textContent = story ? 'Save story changes' : 'Save story';
    setStoryStatus(story);
    slugWasEdited = Boolean(story);

    if (!story) {
      document.querySelector('#story-estimated-minutes').value = '30';
      chapterList.replaceChildren();
      setStatus(formStatus, 'New stories are created as drafts.', '');
      return;
    }

    for (const name of ['title', 'slug', 'category', 'shortDescription', 'fullDescription', 'mythologicalBackground', 'coverImage', 'difficulty']) {
      const mapping = name === 'mythologicalBackground' ? 'story-background'
        : name === 'shortDescription' ? 'story-short-description'
          : name === 'fullDescription' ? 'story-full-description'
            : name === 'coverImage' ? 'story-cover-image'
              : `story-${name}`;
      document.getElementById(mapping).value = story[name] || '';
    }
    document.querySelector('#story-estimated-minutes').value = String(story.estimatedMinutes || 1);
    for (const checkbox of storyForm.querySelectorAll('input[name="ageGroups"]')) {
      checkbox.checked = (story.ageGroups || []).includes(checkbox.value);
    }
    document.querySelector('#story-objectives').value = (story.learningObjectives || []).join('\n');
    renderChapters(story);
  }

  async function openStory(identifier) {
    if (!confirmDiscardEdits()) return;
    setStatus(feedback, 'Loading story details…', 'loading');
    try {
      const result = await window.MythoVerseAuth.getAdminStory(identifier);
      showWorkbench(result.story);
      setStatus(feedback, '', '');
      await loadStories(currentPage);
    } catch (error) {
      handleError(error);
    }
  }

  function buildLessonEditor(story, chapter, lesson) {
    const article = node('article', 'admin-lesson-editor');
    const heading = node('h4', '', lesson.title);
    const form = node('form', 'admin-lesson-form');
    trackFormChanges(form);
    form.dataset.lessonId = lesson._id;
    const grid = node('div', 'admin-lesson-form-grid');
    addField(grid, 'Lesson title', 'title', lesson.title, { required: true, minLength: 2, maxLength: 160 });
    addField(grid, 'Order', 'order', lesson.order, { type: 'number', required: true, min: 1 });
    addField(grid, 'Estimated minutes', 'estimatedMinutes', lesson.estimatedMinutes || 5, { type: 'number', required: true, min: 1, max: 600 });

    const formatLabel = node('label', 'form-field');
    formatLabel.append(node('span', 'form-label', 'Content format'));
    const format = node('select', 'form-control');
    format.name = 'contentFormat';
    for (const [value, label] of [['plainText', 'Plain text'], ['markdown', 'Markdown']]) {
      const option = node('option', '', label);
      option.value = value;
      option.selected = (lesson.contentFormat || 'plainText') === value;
      format.append(option);
    }
    formatLabel.append(format);
    grid.append(formatLabel);
    const content = addField(grid, 'Lesson content', 'content', lesson.content, { type: 'textarea', required: true, maxLength: 30000, rows: 5 });
    content.classList.add('admin-story-field-wide');
    const objectives = addField(grid, 'Learning objectives (one per line)', 'learningObjectives', (lesson.learningObjectives || []).join('\n'), { type: 'textarea', maxLength: 5000, rows: 2 });
    objectives.classList.add('admin-story-field-wide');
    form.append(grid);
    const save = node('button', 'button button-quiet', 'Save lesson');
    save.type = 'submit';
    form.append(save);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = {
        title: form.elements.title.value.trim(),
        order: numberValue(form, 'order'),
        content: form.elements.content.value.trim(),
        contentFormat: form.elements.contentFormat.value,
        learningObjectives: objectivesValue(form.elements.learningObjectives.value),
        estimatedMinutes: numberValue(form, 'estimatedMinutes')
      };
      if (values.learningObjectives.length > 20 || values.learningObjectives.some((item) => item.length < 2 || item.length > 240)) {
        setStatus(feedback, 'Lesson objectives must be 2–240 characters each, with no more than 20 objectives.', 'error');
        return;
      }
      save.disabled = true;
      try {
        await window.MythoVerseAuth.updateAdminStoryLesson(story._id, chapter._id, lesson._id, values);
        form.dataset.dirty = 'false';
        await openStory(story._id);
        setStatus(feedback, 'Lesson changes saved.', 'success');
      } catch (error) {
        handleError(error);
      } finally {
        save.disabled = false;
      }
    });
    article.append(heading, form);
    return article;
  }

  function buildChapterEditor(story, chapter) {
    const article = node('article', 'admin-chapter-card card');
    const heading = node('div', 'admin-chapter-heading');
    heading.append(node('span', 'dashboard-module-number', `CHAPTER ${chapter.order}`));
    heading.append(node('h3', '', chapter.title));
    article.append(heading);

    const chapterForm = node('form', 'admin-chapter-edit-form');
    trackFormChanges(chapterForm);
    const chapterGrid = node('div', 'admin-chapter-form-grid');
    addField(chapterGrid, 'Chapter title', 'title', chapter.title, { required: true, minLength: 2, maxLength: 160 });
    addField(chapterGrid, 'Order', 'order', chapter.order, { type: 'number', required: true, min: 1 });
    addField(chapterGrid, 'Estimated minutes', 'estimatedMinutes', chapter.estimatedMinutes || 10, { type: 'number', required: true, min: 1, max: 1200 });
    const summary = addField(chapterGrid, 'Chapter description', 'summary', chapter.summary || '', { type: 'textarea', maxLength: 1000, rows: 2 });
    summary.classList.add('admin-story-field-wide');
    chapterForm.append(chapterGrid);
    const saveChapter = node('button', 'button button-quiet', 'Save chapter');
    saveChapter.type = 'submit';
    chapterForm.append(saveChapter);
    chapterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!chapterForm.reportValidity()) return;
      saveChapter.disabled = true;
      try {
        await window.MythoVerseAuth.updateAdminStoryChapter(story._id, chapter._id, {
          title: chapterForm.elements.title.value.trim(),
          summary: chapterForm.elements.summary.value.trim(),
          order: numberValue(chapterForm, 'order'),
          estimatedMinutes: numberValue(chapterForm, 'estimatedMinutes')
        });
        chapterForm.dataset.dirty = 'false';
        await openStory(story._id);
        setStatus(feedback, 'Chapter changes saved.', 'success');
      } catch (error) {
        handleError(error);
      } finally {
        saveChapter.disabled = false;
      }
    });
    article.append(chapterForm);

    const lessonsSection = node('section', 'admin-lesson-list');
    lessonsSection.setAttribute('aria-label', `Lessons in ${chapter.title}`);
    lessonsSection.append(node('h4', 'admin-lesson-section-title', `Lessons (${chapter.lessons.length})`));
    if (chapter.lessons.length) {
      for (const lesson of [...chapter.lessons].sort((left, right) => left.order - right.order)) {
        lessonsSection.append(buildLessonEditor(story, chapter, lesson));
      }
    } else {
      lessonsSection.append(node('p', 'form-hint', 'No lessons in this chapter yet.'));
    }

    const addLessonDetails = node('details', 'admin-add-lesson');
    addLessonDetails.append(node('summary', '', 'Add a lesson'));
    const addLessonForm = node('form', 'admin-lesson-form');
    trackFormChanges(addLessonForm);
    const addLessonGrid = node('div', 'admin-lesson-form-grid');
    addField(addLessonGrid, 'Lesson title', 'title', '', { required: true, minLength: 2, maxLength: 160 });
    addField(addLessonGrid, 'Order', 'order', Math.max(0, ...chapter.lessons.map((item) => item.order)) + 1, { type: 'number', required: true, min: 1 });
    addField(addLessonGrid, 'Estimated minutes', 'estimatedMinutes', 5, { type: 'number', required: true, min: 1, max: 600 });
    const formatLabel = node('label', 'form-field');
    formatLabel.append(node('span', 'form-label', 'Content format'));
    const format = node('select', 'form-control');
    format.name = 'contentFormat';
    for (const [value, label] of [['plainText', 'Plain text'], ['markdown', 'Markdown']]) {
      const option = node('option', '', label);
      option.value = value;
      format.append(option);
    }
    formatLabel.append(format);
    addLessonGrid.append(formatLabel);
    const lessonContent = addField(addLessonGrid, 'Lesson content', 'content', '', { type: 'textarea', required: true, maxLength: 30000, rows: 5 });
    lessonContent.classList.add('admin-story-field-wide');
    const lessonObjectives = addField(addLessonGrid, 'Learning objectives (one per line)', 'learningObjectives', '', { type: 'textarea', maxLength: 5000, rows: 2 });
    lessonObjectives.classList.add('admin-story-field-wide');
    addLessonForm.append(addLessonGrid);
    const addLessonButton = node('button', 'button button-secondary', 'Add lesson');
    addLessonButton.type = 'submit';
    addLessonForm.append(addLessonButton);
    addLessonForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!addLessonForm.reportValidity()) return;
      const objectives = objectivesValue(addLessonForm.elements.learningObjectives.value);
      if (objectives.length > 20 || objectives.some((item) => item.length < 2 || item.length > 240)) {
        setStatus(feedback, 'Lesson objectives must be 2–240 characters each, with no more than 20 objectives.', 'error');
        return;
      }
      addLessonButton.disabled = true;
      try {
        await window.MythoVerseAuth.addAdminStoryLesson(story._id, chapter._id, {
          title: addLessonForm.elements.title.value.trim(),
          order: numberValue(addLessonForm, 'order'),
          estimatedMinutes: numberValue(addLessonForm, 'estimatedMinutes'),
          content: addLessonForm.elements.content.value.trim(),
          contentFormat: addLessonForm.elements.contentFormat.value,
          learningObjectives: objectives
        });
        addLessonForm.dataset.dirty = 'false';
        await openStory(story._id);
        setStatus(feedback, 'Lesson added.', 'success');
      } catch (error) {
        handleError(error);
      } finally {
        addLessonButton.disabled = false;
      }
    });
    addLessonDetails.append(addLessonForm);
    lessonsSection.append(addLessonDetails);
    article.append(lessonsSection);
    return article;
  }

  function renderChapters(story) {
    chapterList.replaceChildren();
    const chapters = [...(story.chapters || [])].sort((left, right) => left.order - right.order);
    if (!chapters.length) chapterList.append(node('p', 'form-hint', 'No chapters yet. Add a chapter to start building this story.'));
    for (const chapter of chapters) chapterList.append(buildChapterEditor(story, chapter));
    const nextOrder = Math.max(0, ...chapters.map((chapter) => chapter.order)) + 1;
    newChapterForm.elements.order.value = String(nextOrder);
    setStoryStatus(story);
  }

  function storyPayload() {
    const ageGroups = Array.from(storyForm.querySelectorAll('input[name="ageGroups"]:checked'), (input) => input.value);
    const learningObjectives = objectivesValue(storyForm.elements.learningObjectives.value);
    if (!ageGroups.length) throw new Error('Select at least one supported age group.');
    if (!learningObjectives.length || learningObjectives.length > 20 || learningObjectives.some((item) => item.length < 2 || item.length > 240)) {
      throw new Error('Enter 1–20 learning objectives, each between 2 and 240 characters.');
    }
    return {
      title: storyForm.elements.title.value.trim(),
      slug: storyForm.elements.slug.value.trim().toLowerCase(),
      shortDescription: storyForm.elements.shortDescription.value.trim(),
      fullDescription: storyForm.elements.fullDescription.value.trim(),
      mythologicalBackground: storyForm.elements.mythologicalBackground.value.trim(),
      coverImage: storyForm.elements.coverImage.value.trim(),
      category: storyForm.elements.category.value.trim(),
      ageGroups,
      difficulty: storyForm.elements.difficulty.value,
      learningObjectives,
      estimatedMinutes: numberValue(storyForm, 'estimatedMinutes')
    };
  }

  storyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(formStatus, '', '');
    if (!storyForm.reportValidity()) return;
    let payload;
    try {
      payload = storyPayload();
    } catch (error) {
      setStatus(formStatus, error.message, 'error');
      return;
    }

    const submit = document.querySelector('#story-save-button');
    submit.disabled = true;
    setStatus(formStatus, 'Saving story…', 'loading');
    try {
      const result = currentStory
        ? await window.MythoVerseAuth.updateAdminStory(currentStory._id, payload)
        : await window.MythoVerseAuth.createAdminStory(payload);
      const created = !currentStory;
      currentStory = result.story;
      storyForm.dataset.dirty = 'false';
      await openStory(result.story._id);
      setStatus(feedback, created ? 'Draft story created.' : 'Story changes saved.', 'success');
    } catch (error) {
      handleError(error, formStatus);
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector('#new-story-button').addEventListener('click', () => {
    if (!confirmDiscardEdits()) return;
    currentStory = null;
    showWorkbench();
    setStatus(feedback, '', '');
  });

  document.querySelector('#story-cancel-button').addEventListener('click', () => {
    if (!confirmDiscardEdits()) return;
    workbench.hidden = true;
    workbenchEmpty.hidden = false;
    currentStory = null;
  });

  document.querySelector('#story-title').addEventListener('input', (event) => {
    if (currentStory || slugWasEdited) return;
    const slug = event.currentTarget.value.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    document.querySelector('#story-slug').value = slug;
  });
  document.querySelector('#story-slug').addEventListener('input', () => { slugWasEdited = true; });

  document.querySelector('#story-publication-button').addEventListener('click', async () => {
    if (!currentStory) return;
    if (!confirmDiscardEdits()) return;
    const nextStatus = currentStory.publicationStatus === 'published' ? 'draft' : 'published';
    const action = nextStatus === 'published' ? 'publish' : 'unpublish';
    const explanation = nextStatus === 'published'
      ? 'Published stories become available to students. The story must have at least one chapter and every chapter must contain a lesson.'
      : 'Unpublishing will remove this story from the student story library.';
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} “${currentStory.title}”? ${explanation}`)) return;
    try {
      await window.MythoVerseAuth.setAdminStoryPublication(currentStory._id, nextStatus);
      await openStory(currentStory._id);
      setStatus(feedback, `Story ${nextStatus === 'published' ? 'published' : 'unpublished'}.`, 'success');
    } catch (error) {
      handleError(error);
    }
  });

  newChapterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentStory || !newChapterForm.reportValidity()) return;
    const submit = newChapterForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await window.MythoVerseAuth.addAdminStoryChapter(currentStory._id, {
        title: newChapterForm.elements.title.value.trim(),
        summary: newChapterForm.elements.summary.value.trim(),
        order: numberValue(newChapterForm, 'order'),
        estimatedMinutes: numberValue(newChapterForm, 'estimatedMinutes')
      });
      newChapterForm.reset();
      newChapterForm.dataset.dirty = 'false';
      await openStory(currentStory._id);
      setStatus(feedback, 'Chapter added.', 'success');
    } catch (error) {
      handleError(error);
    } finally {
      submit.disabled = false;
    }
  });
  trackFormChanges(newChapterForm);

  document.querySelector('#story-search').addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadStories(1), 250);
  });
  document.querySelector('#story-status-filter').addEventListener('change', () => loadStories(1));
  document.querySelector('#story-page-previous').addEventListener('click', () => loadStories(Math.max(1, currentPage - 1)));
  document.querySelector('#story-page-next').addEventListener('click', () => loadStories(Math.min(pageCount, currentPage + 1)));

  function initializeNavigation() {
    const toggle = document.querySelector('[data-admin-menu-toggle]');
    const sidebar = document.querySelector('#admin-sidebar');
    const mobileViewport = window.matchMedia('(max-width: 850px)');
    function setMenuOpen(isOpen) {
      const open = mobileViewport.matches && isOpen;
      layout.dataset.menuOpen = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close admin navigation' : 'Open admin navigation');
    }
    toggle.addEventListener('click', () => setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    sidebar.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && layout.dataset.menuOpen === 'true') {
        setMenuOpen(false);
        toggle.focus();
      }
    });
    mobileViewport.addEventListener('change', () => setMenuOpen(false));
    setMenuOpen(false);
  }

  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'admin') {
      window.location.replace('/');
      return;
    }
    document.querySelector('[data-admin-display-name]').textContent = user.displayName;
    for (const button of document.querySelectorAll('[data-admin-logout]')) {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await window.MythoVerseAuth.logout();
          window.location.replace('/admin-login.html');
        } catch (error) {
          handleError(error);
        } finally {
          button.disabled = false;
        }
      });
    }
    initializeNavigation();
    pageStatus.hidden = true;
    page.hidden = false;
    await loadStories(1);
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/admin-login.html');
      return;
    }
    setStatus(pageStatus, error.status === 403 ? 'This account is not authorized for admin access.' : 'Story management could not be loaded. Please try again.', 'error');
    if (error.status === 403) window.setTimeout(() => window.location.replace('/'), 1200);
    console.error('Unable to initialize admin story management.', error);
  }
})();
