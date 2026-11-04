(function () {
  let headerStatus = null;

  class AuthRequestError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'AuthRequestError';
      this.status = status;
    }
  }

  async function request(path, options = {}) {
    let response;

    try {
      response = await fetch(path, {
        ...options,
        credentials: 'same-origin',
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers
        }
      });
    } catch (error) {
      throw new AuthRequestError('Unable to reach MythoVerse. Check your connection and try again.');
    }

    let result = {};
    try {
      result = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new AuthRequestError('The server returned an unreadable response.', response.status);
      }
    }

    if (!response.ok) {
      const message = typeof result.error === 'string'
        ? result.error
        : 'Your request could not be completed. Please try again.';
      throw new AuthRequestError(message, response.status);
    }

    return result;
  }

  function showHeaderStatus(message, isError = false) {
    if (!headerStatus) {
      return;
    }

    headerStatus.textContent = message;
    headerStatus.dataset.state = isError ? 'error' : 'status';
    headerStatus.hidden = !message;
  }

  function setHeaderUser(user) {
    const header = document.querySelector('[data-component="header"]');
    if (!header) {
      return;
    }

    const guestControls = header.querySelector('[data-auth-guest]');
    const userControls = header.querySelector('[data-auth-user]');
    const displayName = header.querySelector('[data-auth-display-name]');

    if (!guestControls || !userControls || !displayName) {
      console.error('The shared header is missing authentication controls.');
      return;
    }

    const isAuthenticated = Boolean(user);
    guestControls.hidden = isAuthenticated;
    userControls.hidden = !isAuthenticated;
    displayName.textContent = isAuthenticated ? user.displayName : '';
  }

  async function refreshHeader() {
    try {
      const result = await request('/api/auth/me');
      setHeaderUser(result.user);
      showHeaderStatus('');
      return result.user;
    } catch (error) {
      setHeaderUser(null);

      if (error instanceof AuthRequestError && error.status === 401) {
        showHeaderStatus('');
        return null;
      }

      console.error('Unable to verify the current MythoVerse session.', error);
      showHeaderStatus('Sign-in status could not be verified. You can try reloading.', true);
      return null;
    }
  }

  function initializeHeader(container) {
    if (container.dataset.authInitialized === 'true') {
      return;
    }

    container.dataset.authInitialized = 'true';
    headerStatus = container.querySelector('[data-auth-status]');

    const logoutButton = container.querySelector('[data-auth-logout]');
    if (!logoutButton) {
      console.error('The shared header is missing its logout control.');
      return;
    }

    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      showHeaderStatus('Signing out…');

      try {
        await logout();
        setHeaderUser(null);
        showHeaderStatus('You have been signed out.');
      } catch (error) {
        console.error('Unable to sign out of MythoVerse.', error);
        showHeaderStatus(error.message, true);
      } finally {
        logoutButton.disabled = false;
      }
    });

    refreshHeader();
  }

  async function register(details) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(details)
    });
  }

  async function login(credentials) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    setHeaderUser(result.user);
    showHeaderStatus('');
    return result.user;
  }

  async function logout() {
    return request('/api/auth/logout', { method: 'POST' });
  }

  async function getCurrentUser() {
    const result = await request('/api/auth/me');
    return result.user;
  }

  async function getAdminDashboard() {
    return request('/api/admin/dashboard');
  }

  async function getAdminStories({ status = 'all', search = '', page = 1, limit = 20 } = {}) {
    const query = new URLSearchParams({ status, page: String(page), limit: String(limit) });
    if (search) query.set('search', search);
    return request(`/api/admin/content/stories?${query.toString()}`);
  }

  async function getPublishedStories({ ageGroup = '', category = '', difficulty = '', search = '', page = 1, limit = 20 } = {}) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (ageGroup) query.set('ageGroup', ageGroup);
    if (category) query.set('category', category);
    if (difficulty) query.set('difficulty', difficulty);
    if (search) query.set('search', search);
    return request(`/api/learning/stories?${query.toString()}`);
  }

  async function getPublishedStory(identifier) {
    return request(`/api/learning/stories/${encodeURIComponent(identifier)}`);
  }

  async function getPublishedChapters(identifier) {
    return request(`/api/learning/stories/${encodeURIComponent(identifier)}/chapters`);
  }

  async function getPublishedLessons(identifier, chapterId) {
    return request(`/api/learning/stories/${encodeURIComponent(identifier)}/chapters/${encodeURIComponent(chapterId)}/lessons`);
  }

  async function getStoryProgress(identifier) {
    return request(`/api/learning/progress/stories/${encodeURIComponent(identifier)}`);
  }

  async function getProgressSummary() {
    return request('/api/learning/progress/summary');
  }

  async function getLastAccessedLesson() {
    return request('/api/learning/progress/last-accessed');
  }

  async function recordLessonAccess(identifier, chapterId, lessonId) {
    return request(`/api/learning/progress/stories/${encodeURIComponent(identifier)}/chapters/${encodeURIComponent(chapterId)}/lessons/${encodeURIComponent(lessonId)}/access`, { method: 'POST' });
  }

  async function completeLesson(identifier, chapterId, lessonId) {
    return request(`/api/learning/progress/stories/${encodeURIComponent(identifier)}/chapters/${encodeURIComponent(chapterId)}/lessons/${encodeURIComponent(lessonId)}/complete`, { method: 'POST' });
  }

  async function getAdminStory(identifier) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}`);
  }

  async function createAdminStory(story) {
    return request('/api/admin/content/stories', { method: 'POST', body: JSON.stringify(story) });
  }

  async function updateAdminStory(identifier, story) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}`, {
      method: 'PATCH', body: JSON.stringify(story)
    });
  }

  async function setAdminStoryPublication(identifier, publicationStatus) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}/publication`, {
      method: 'PATCH', body: JSON.stringify({ publicationStatus })
    });
  }

  async function addAdminStoryChapter(identifier, chapter) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}/chapters`, {
      method: 'POST', body: JSON.stringify(chapter)
    });
  }

  async function updateAdminStoryChapter(identifier, chapterId, chapter) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}/chapters/${encodeURIComponent(chapterId)}`, {
      method: 'PATCH', body: JSON.stringify(chapter)
    });
  }

  async function addAdminStoryLesson(identifier, chapterId, lesson) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}/chapters/${encodeURIComponent(chapterId)}/lessons`, {
      method: 'POST', body: JSON.stringify(lesson)
    });
  }

  async function updateAdminStoryLesson(identifier, chapterId, lessonId, lesson) {
    return request(`/api/admin/content/stories/${encodeURIComponent(identifier)}/chapters/${encodeURIComponent(chapterId)}/lessons/${encodeURIComponent(lessonId)}`, {
      method: 'PATCH', body: JSON.stringify(lesson)
    });
  }

  async function getOnboardingStatus() {
    return request('/api/student/onboarding/status');
  }

  async function getProfile() {
    return request('/api/student/profile');
  }

  async function getStudentDashboard(timeZone) {
    const query = new URLSearchParams();
    if (timeZone) query.set('timeZone', timeZone);
    return request(`/api/student/dashboard${query.size ? `?${query.toString()}` : ''}`);
  }

  async function getStudentCourses(ageGroup = '') {
    const query = ageGroup ? `?${new URLSearchParams({ ageGroup })}` : '';
    return request(`/api/student/courses${query}`);
  }

  async function getStudentCourse(slug, ageGroup = '') {
    const query = ageGroup ? `?${new URLSearchParams({ ageGroup })}` : '';
    return request(`/api/student/courses/${encodeURIComponent(slug)}${query}`);
  }

  async function getStudentCourseSyllabus(slug, ageGroup) {
    const query = new URLSearchParams({ ageGroup });
    return request(`/api/student/courses/${encodeURIComponent(slug)}/syllabus?${query}`);
  }

  async function getStudentAssignments({ ageGroup = '', status = 'all' } = {}) {
    const query = new URLSearchParams({ status });
    if (ageGroup) query.set('ageGroup', ageGroup);
    return request(`/api/student/assignments?${query}`);
  }

  async function getStudentSubmissions() {
    return request('/api/student/submissions');
  }

  async function getStudentGradebook() {
    return request('/api/student/grades/gradebook');
  }

  async function getStudentProgress() {
    return request('/api/student/grades/progress');
  }

  async function getStudentCalendar(kind) {
    return request(`/api/student/calendar/${encodeURIComponent(kind)}`);
  }

  async function getStudentResources({ search = '', page = 1, limit = 20 } = {}) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) query.set('search', search.trim());
    return request(`/api/student/library/resources?${query}`);
  }

  async function getStudentResource(identifier) {
    return request(`/api/student/library/resources/${encodeURIComponent(identifier)}`);
  }

  async function getStudentDownloads() {
    return request('/api/student/library/downloads');
  }

  async function getStudentAnnouncements() {
    return request('/api/student/announcements');
  }

  async function getStudentAnnouncement(id) {
    return request(`/api/student/announcements/${encodeURIComponent(id)}`);
  }

  async function getStudentSettings() {
    return request('/api/student/settings');
  }

  async function updateStudentPreferences(preferences) {
    return request('/api/student/settings/preferences', { method: 'PUT', body: JSON.stringify(preferences) });
  }

  async function updateStudentNotifications(preferences) {
    return request('/api/student/settings/notifications', { method: 'PUT', body: JSON.stringify(preferences) });
  }

  async function changeStudentPassword(passwords) {
    return request('/api/student/settings/password', { method: 'PUT', body: JSON.stringify(passwords) });
  }

  async function getAdminAnnouncements(status = 'all') {
    return request(`/api/admin/announcements?${new URLSearchParams({ status })}`);
  }

  async function createAdminAnnouncement(announcement) {
    return request('/api/admin/announcements', { method: 'POST', body: JSON.stringify(announcement) });
  }

  async function updateAdminAnnouncement(id, announcement) {
    return request(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(announcement) });
  }

  async function setAdminAnnouncementPublication(id, publicationStatus) {
    return request(`/api/admin/announcements/${encodeURIComponent(id)}/publication`, {
      method: 'PATCH', body: JSON.stringify({ publicationStatus })
    });
  }

  async function createGuardianInvite(input) {
    return request('/api/student/guardian-invites', { method: 'POST', body: JSON.stringify(input) });
  }

  async function decideGuardianRelationship(id, decision) {
    return request(`/api/student/guardian-relationships/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ decision }) });
  }

  async function revokeGuardianRelationship(id) {
    return request(`/api/student/guardian-relationships/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function acceptGuardianInvite(input) {
    return request('/api/guardian/invites/accept', { method: 'POST', body: JSON.stringify(input) });
  }

  async function acceptExistingGuardianInvite(token) {
    return request('/api/guardian/invites/accept-existing', { method: 'POST', body: JSON.stringify({ token }) });
  }

  async function getGuardianRelationships() {
    return request('/api/guardian/relationships');
  }

  async function getGuardianStudentDashboard(studentId, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
    const query = new URLSearchParams({ timeZone });
    return request(`/api/guardian/students/${encodeURIComponent(studentId)}/dashboard?${query.toString()}`);
  }

  async function updateProfile(profile) {
    return request('/api/student/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  }

  async function completeOnboarding(profile) {
    return request('/api/student/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(profile)
    });
  }

  async function getTeachers(ageGroup = '') {
    const query = ageGroup ? `?ageGroup=${encodeURIComponent(ageGroup)}` : '';
    return request(`/api/learning/teachers${query}`);
  }

  async function getTeacher(slug, ageGroup = '') {
    const query = ageGroup ? `?ageGroup=${encodeURIComponent(ageGroup)}` : '';
    return request(`/api/learning/teachers/${encodeURIComponent(slug)}${query}`);
  }

  async function getTeacherSyllabus(slug, ageGroup) {
    return request(`/api/learning/teachers/${encodeURIComponent(slug)}/age-groups/${encodeURIComponent(ageGroup)}/syllabus`);
  }

  async function getTeacherLesson(slug, ageGroup, lessonId) {
    return request(`/api/learning/teachers/${encodeURIComponent(slug)}/age-groups/${encodeURIComponent(ageGroup)}/lessons/${encodeURIComponent(lessonId)}`);
  }

  async function recordTeacherLessonAccess(slug, ageGroup, lessonId) {
    return request(`/api/learning/teachers/${encodeURIComponent(slug)}/age-groups/${encodeURIComponent(ageGroup)}/lessons/${encodeURIComponent(lessonId)}/access`, { method: 'POST' });
  }

  async function completeTeacherLesson(slug, ageGroup, lessonId) {
    return request(`/api/learning/teachers/${encodeURIComponent(slug)}/age-groups/${encodeURIComponent(ageGroup)}/lessons/${encodeURIComponent(lessonId)}/complete`, { method: 'POST' });
  }

  async function submitTeacherAssessment(slug, ageGroup, assessmentId, submission) {
    return request(`/api/learning/teachers/${encodeURIComponent(slug)}/age-groups/${encodeURIComponent(ageGroup)}/assessments/${encodeURIComponent(assessmentId)}/submit`, { method: 'POST', body: JSON.stringify(submission) });
  }

  async function getTeacherResult(attemptId) {
    return request(`/api/learning/teachers/results/${encodeURIComponent(attemptId)}`);
  }

  async function getTeacherProgress() {
    return request('/api/learning/teachers/progress');
  }

  async function getAdminTeachers({ status = 'all', search = '' } = {}) {
    const query = new URLSearchParams({ status });
    if (search) query.set('search', search);
    return request(`/api/admin/teachers?${query.toString()}`);
  }

  async function getAdminTeacher(slug) {
    return request(`/api/admin/teachers/${encodeURIComponent(slug)}`);
  }

  async function createAdminTeacher(teacher) {
    return request('/api/admin/teachers', { method: 'POST', body: JSON.stringify(teacher) });
  }

  async function updateAdminTeacher(slug, teacher) {
    return request(`/api/admin/teachers/${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify(teacher) });
  }

  async function setAdminTeacherPublication(slug, publicationStatus) {
    return request(`/api/admin/teachers/${encodeURIComponent(slug)}/publication`, { method: 'PATCH', body: JSON.stringify({ publicationStatus }) });
  }

  window.MythoVerseAuth = {
    addAdminStoryChapter,
    addAdminStoryLesson,
    completeOnboarding,
    createAdminStory,
    createAdminAnnouncement,
    createGuardianInvite,
    acceptGuardianInvite,
    acceptExistingGuardianInvite,
    createAdminTeacher,
    getAdminStories,
    getAdminAnnouncements,
    getAdminTeachers,
    getAdminTeacher,
    getAdminStory,
    getAdminDashboard,
    getPublishedStories,
    getPublishedStory,
    getPublishedChapters,
    getPublishedLessons,
    getStoryProgress,
    getProgressSummary,
    getLastAccessedLesson,
    getCurrentUser,
    getTeachers,
    getTeacher,
    getTeacherSyllabus,
    getTeacherLesson,
    getTeacherProgress,
    getTeacherResult,
    getOnboardingStatus,
    getProfile,
    getStudentDashboard,
    getStudentCourses,
    getStudentCourse,
    getStudentCourseSyllabus,
    getStudentAssignments,
    getStudentSubmissions,
    getStudentGradebook,
    getStudentProgress,
    getStudentCalendar,
    getStudentResources,
    getStudentResource,
    getStudentDownloads,
    getStudentAnnouncements,
    getStudentAnnouncement,
    getStudentSettings,
    updateStudentPreferences,
    updateStudentNotifications,
    changeStudentPassword,
    getGuardianRelationships,
    getGuardianStudentDashboard,
    initializeHeader,
    login,
    logout,
    recordLessonAccess,
    recordTeacherLessonAccess,
    completeLesson,
    completeTeacherLesson,
    refreshHeader,
    register,
    setAdminStoryPublication,
    setAdminAnnouncementPublication,
    decideGuardianRelationship,
    revokeGuardianRelationship,
    setAdminTeacherPublication,
    submitTeacherAssessment,
    updateAdminStory,
    updateAdminAnnouncement,
    updateAdminStoryChapter,
    updateAdminStoryLesson,
    updateAdminTeacher,
    updateProfile
  };
})();
