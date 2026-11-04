(async function initializeStoryLibrary() {
  const status = document.querySelector('#story-library-status');
  const grid = document.querySelector('#story-library-grid');
  const pagination = document.querySelector('.story-pagination');
  if (!status || !grid || !pagination) return;

  const search = document.querySelector('#story-search');
  const category = document.querySelector('#story-category');
  const ageGroup = document.querySelector('#story-age-group');
  const difficulty = document.querySelector('#story-difficulty');
  let stories = [];
  let currentPage = 1;
  const pageSize = 12;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function storyCard(story) {
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
    addText(body, 'p', 'eyebrow', story.category);
    addText(body, 'h2', 'story-card-title', story.title);
    addText(body, 'p', 'story-card-description', story.shortDescription);
    const details = document.createElement('ul');
    details.className = 'story-card-meta';
    details.setAttribute('aria-label', 'Story details');
    for (const label of [
      story.difficulty,
      `${story.estimatedMinutes} min`,
      ...(story.ageGroups || []).map((group) => `Ages ${group}`)
    ]) {
      addText(details, 'li', '', label);
    }
    const link = document.createElement('a');
    link.className = 'button button-primary story-card-action';
    link.href = `/story.html?slug=${encodeURIComponent(story.slug)}`;
    link.textContent = 'Read story';
    body.append(details, link);
    card.append(visual, body);
    return card;
  }

  function filteredStories() {
    const query = search.value.trim().toLocaleLowerCase();
    return stories.filter((story) => {
      const matchesTitle = !query || story.title.toLocaleLowerCase().includes(query);
      const matchesCategory = !category.value || story.category === category.value;
      const matchesDifficulty = !difficulty.value || story.difficulty === difficulty.value;
      return matchesTitle && matchesCategory && matchesDifficulty;
    });
  }

  function render() {
    const filtered = filteredStories();
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, pages);
    const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    grid.replaceChildren(...pageItems.map(storyCard));
    grid.hidden = pageItems.length === 0;
    if (!stories.length) {
      setStatus('No published stories are available for this age group yet. Please check back soon.');
    } else if (!pageItems.length) {
      setStatus('No stories match these filters. Try a different search or category.');
    } else {
      setStatus('');
    }
    pagination.hidden = pages <= 1;
    document.querySelector('#story-page-label').textContent = `Page ${currentPage} of ${pages}`;
    document.querySelector('#story-page-previous').disabled = currentPage <= 1;
    document.querySelector('#story-page-next').disabled = currentPage >= pages;
  }

  function fillOptions(select, values, firstLabel) {
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.append(first);
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
  }

  async function loadStories(selectedAgeGroup) {
    setStatus('Loading published stories…', 'loading');
    grid.hidden = true;
    pagination.hidden = true;
    const firstPage = await window.MythoVerseAuth.getPublishedStories({ ageGroup: selectedAgeGroup, page: 1, limit: 100 });
    stories = firstPage.stories;
    for (let page = 2; page <= firstPage.pagination.pages; page += 1) {
      const result = await window.MythoVerseAuth.getPublishedStories({ ageGroup: selectedAgeGroup, page, limit: 100 });
      stories.push(...result.stories);
    }
    const categories = [...new Set(stories.map((story) => story.category))].sort((a, b) => a.localeCompare(b));
    const previousCategory = category.value;
    fillOptions(category, categories, 'All categories');
    if (categories.includes(previousCategory)) category.value = previousCategory;
    currentPage = 1;
    render();
  }

  try {
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
    const profile = await window.MythoVerseAuth.getProfile();
    const groups = ['6-8', '9-12', '13-15', '16-18', '18+'];
    fillOptions(ageGroup, groups, 'All age groups');
    ageGroup.value = profile.user.ageGroup || '';

    search.addEventListener('input', () => { currentPage = 1; render(); });
    category.addEventListener('change', () => { currentPage = 1; render(); });
    difficulty.addEventListener('change', () => { currentPage = 1; render(); });
    ageGroup.addEventListener('change', () => loadStories(ageGroup.value).catch(showLoadError));
    document.querySelector('#story-page-previous').addEventListener('click', () => { currentPage -= 1; render(); });
    document.querySelector('#story-page-next').addEventListener('click', () => { currentPage += 1; render(); });
    await loadStories(ageGroup.value);
  } catch (error) {
    showLoadError(error);
  }

  function showLoadError(error) {
    if (error.status === 401) {
      window.location.replace(`/login.html?next=${encodeURIComponent('/stories.html')}`);
      return;
    }
    console.error('Unable to load the student story library.', error);
    grid.hidden = true;
    pagination.hidden = true;
    setStatus(error.status === 403
      ? 'Story Library access is available to student accounts.'
      : 'Published stories could not be loaded. Please try again.', 'error');
  }
})();
