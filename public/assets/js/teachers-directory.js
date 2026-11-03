(async function loadTeachersDirectory() {
  const status = document.querySelector('[data-teachers-status]');
  const grid = document.querySelector('[data-teachers-grid]');
  if (!status || !grid) return;

  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') {
      window.location.replace('/');
      return;
    }
    const profile = await window.MythoVerseAuth.getProfile();
    const { teachers } = await window.MythoVerseAuth.getTeachers(profile.user.ageGroup || '');
    if (!teachers.length) {
      status.textContent = 'No teacher learning paths have been published for your age group yet. An administrator must add and publish the syllabus before lessons appear here.';
      status.dataset.state = 'empty';
      return;
    }

    grid.replaceChildren(...teachers.map((teacher) => {
      const card = document.createElement('article');
      card.className = 'teacher-card card';
      const visual = document.createElement('div');
      visual.className = 'teacher-portrait';
      visual.setAttribute('aria-hidden', 'true');
      if (teacher.portrait) {
        const image = document.createElement('img');
        image.src = teacher.portrait;
        image.alt = '';
        image.loading = 'lazy';
        visual.append(image);
      } else {
        visual.textContent = teacher.name.slice(0, 1);
      }
      const body = document.createElement('div');
      body.className = 'teacher-card-body';
      const subject = document.createElement('p');
      subject.className = 'eyebrow';
      subject.textContent = teacher.teachingDomain;
      const heading = document.createElement('h3');
      heading.textContent = teacher.name;
      const intro = document.createElement('p');
      intro.textContent = teacher.shortIntroduction;
      const summary = Array.isArray(teacher.progress)
        ? teacher.progress.find((item) => item?.ageGroup === profile.user.ageGroup)
        : teacher.progress;
      const progress = document.createElement('p');
      progress.className = 'teacher-progress-copy';
      progress.textContent = summary
        ? `${summary.completedLessons} of ${summary.totalLessons} lessons completed · ${summary.percentage}%`
        : 'No learning started yet';
      const link = document.createElement('a');
      link.className = 'button button-secondary';
      link.href = `/teachers/${encodeURIComponent(teacher.slug)}.html`;
      link.textContent = 'Enter teacher chamber';
      body.append(subject, heading, intro, progress, link);
      card.append(visual, body);
      return card;
    }));
    grid.hidden = false;
    status.hidden = true;
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/login.html?next=%2Fteachers.html');
      return;
    }
    status.textContent = 'Teacher learning paths could not be loaded. Please try again later.';
    status.dataset.state = 'error';
  }
})();
