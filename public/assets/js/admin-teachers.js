(async function initializeTeacherAdmin() {
  const status = document.querySelector('[data-admin-teacher-status]');
  const content = document.querySelector('[data-admin-teacher-content]');
  if (!status || !content) return;
  const feedback = document.querySelector('[data-admin-teacher-feedback]');
  const filter = document.querySelector('[data-teacher-filter]');
  const select = document.querySelector('[data-teacher-select]');
  const form = document.querySelector('[data-teacher-json-form]');
  const editor = document.querySelector('[data-teacher-json]');
  const save = document.querySelector('[data-save-teacher]');
  const publish = document.querySelector('[data-publish-teacher]');
  const unpublish = document.querySelector('[data-unpublish-teacher]');
  const reviewConfirm = document.querySelector('[data-confirm-content-review]');
  let currentSlug = '';
  let currentStatus = 'draft';
  function setStatus(target, message, state = '') { target.textContent = message; target.dataset.state = state; target.hidden = !message; }
  function fieldsEnabled(enabled) { save.disabled = !enabled; publish.disabled = !enabled || !currentSlug; unpublish.disabled = !enabled || !currentSlug || currentStatus !== 'published'; }
  function skeleton() {
    return {
      name: '', slug: '', identityType: 'teachingPersona', title: '', shortIntroduction: '',
      mythologicalBackground: '', personality: '', teachingPhilosophy: '', teachingDomain: '',
      knowledgeAndSkills: [], biography: '', teachingStyle: '', portrait: '', sources: [],
      contentReviewStatus: 'unreviewed', ageGroups: []
    };
  }
  function editablePayload(value) {
    const payload = { ...value };
    delete payload._id; delete payload.createdAt; delete payload.updatedAt; delete payload.publicationStatus;
    return payload;
  }
  async function refreshList(selectSlug = currentSlug) {
    const result = await window.MythoVerseAuth.getAdminTeachers({ status: filter.value });
    const optionList = [new Option('Select a teacher', ''), ...result.teachers.map((teacher) => new Option(`${teacher.name} · ${teacher.publicationStatus}`, teacher.slug))];
    select.replaceChildren(...optionList);
    if (selectSlug) select.value = selectSlug;
  }
  async function loadTeacher(slug) {
    if (!slug) { currentSlug = ''; editor.value = ''; currentStatus = 'draft'; fieldsEnabled(false); return; }
    const result = await window.MythoVerseAuth.getAdminTeacher(slug);
    currentSlug = result.teacher.slug;
    currentStatus = result.teacher.publicationStatus;
    editor.value = JSON.stringify(result.teacher, null, 2);
    reviewConfirm.checked = false;
    fieldsEnabled(true);
    publish.textContent = currentStatus === 'published' ? 'Republish' : 'Publish teacher';
    unpublish.disabled = currentStatus !== 'published';
  }
  async function initialize() {
    try {
      const user = await window.MythoVerseAuth.getCurrentUser();
      if (user.role !== 'admin') { window.location.replace('/'); return; }
      document.querySelectorAll('[data-admin-display-name]').forEach((el) => { el.textContent = user.displayName; });
      content.hidden = false;
      await refreshList();
      if (currentSlug) await loadTeacher(currentSlug);
      status.hidden = true;
    } catch (error) {
      if (error.status === 401 || error.status === 403) { window.location.replace('/admin-login.html'); return; }
      setStatus(status, 'Teacher management could not be loaded.', 'error');
    }
  }
  filter.addEventListener('change', async () => { try { await refreshList(); } catch (error) { setStatus(feedback, error.message, 'error'); } });
  select.addEventListener('change', async () => { try { await loadTeacher(select.value); setStatus(feedback, ''); } catch (error) { setStatus(feedback, error.message, 'error'); } });
  document.querySelector('[data-new-teacher]').addEventListener('click', () => {
    currentSlug = '';
    currentStatus = 'draft';
    reviewConfirm.checked = false;
    select.value = '';
    editor.value = JSON.stringify(skeleton(), null, 2);
    fieldsEnabled(true);
    publish.disabled = true;
    unpublish.disabled = true;
    setStatus(feedback, 'New teacher draft. Complete the profile fields and save it before publishing.', 'status');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let payload;
    try { payload = editablePayload(JSON.parse(editor.value)); } catch (error) { setStatus(feedback, 'Teacher content must be valid JSON.', 'error'); return; }
    save.disabled = true;
    try {
      if (currentSlug) await window.MythoVerseAuth.updateAdminTeacher(currentSlug, payload);
      else {
        const created = await window.MythoVerseAuth.createAdminTeacher(payload);
        currentSlug = created.teacher.slug;
      }
      currentStatus = 'draft';
      await refreshList(currentSlug);
      await loadTeacher(currentSlug);
      setStatus(feedback, 'Teacher draft saved.', 'success');
    } catch (error) { setStatus(feedback, error.message || 'Teacher could not be saved.', 'error'); }
    finally { save.disabled = false; publish.disabled = !currentSlug; }
  });
  publish.addEventListener('click', async () => {
    if (!reviewConfirm.checked) { setStatus(feedback, 'Review the source notes and age-specific content, then confirm before publishing.', 'error'); return; }
    let payload;
    try { payload = editablePayload(JSON.parse(editor.value)); } catch (error) { setStatus(feedback, 'Teacher content must be valid JSON.', 'error'); return; }
    try {
      payload.contentReviewStatus = 'reviewed';
      await window.MythoVerseAuth.updateAdminTeacher(currentSlug, payload);
      await window.MythoVerseAuth.setAdminTeacherPublication(currentSlug, 'published');
      currentStatus = 'published'; await refreshList(currentSlug); await loadTeacher(currentSlug);
      setStatus(feedback, 'Teacher published and visible to students.', 'success');
    } catch (error) { setStatus(feedback, error.message || 'Teacher could not be published. Check all five syllabuses and assessments.', 'error'); }
  });
  unpublish.addEventListener('click', async () => {
    try {
      await window.MythoVerseAuth.setAdminTeacherPublication(currentSlug, 'draft');
      currentStatus = 'draft'; await refreshList(currentSlug); await loadTeacher(currentSlug);
      setStatus(feedback, 'Teacher returned to draft and is no longer visible to students.', 'success');
    } catch (error) { setStatus(feedback, error.message || 'Teacher could not be unpublished.', 'error'); }
  });
  document.querySelectorAll('[data-admin-logout]').forEach((button) => button.addEventListener('click', async () => {
    try { await window.MythoVerseAuth.logout(); } catch (error) { /* local navigation clears the protected view */ }
    window.location.replace('/admin-login.html');
  }));
  await initialize();
})();
