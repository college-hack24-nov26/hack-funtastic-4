(async function initializeAnnouncementManager() {
  const status = document.querySelector('[data-announcement-status]');
  const content = document.querySelector('[data-announcement-content]');
  if (!status || !content) return;
  const form = document.querySelector('[data-announcement-form]');
  const list = document.querySelector('[data-announcement-list]');
  const filter = document.querySelector('[data-announcement-filter]');
  const feedback = document.querySelector('[data-announcement-feedback]');
  let editingId = null;
  const message = (target, text, state = '') => { target.textContent = text; target.dataset.state = state; target.hidden = !text; };

  function resetForm() {
    form.reset(); editingId = null;
    document.querySelector('[data-announcement-save]').textContent = 'Save draft';
  }

  async function renderList() {
    const result = await window.MythoVerseAuth.getAdminAnnouncements(filter.value);
    list.replaceChildren(...result.announcements.map((item) => {
      const card = document.createElement('article'); card.className = 'dashboard-content-card card';
      const heading = document.createElement('h3'); heading.textContent = item.title;
      const description = document.createElement('p'); description.textContent = item.description;
      const state = document.createElement('p'); state.className = 'eyebrow'; state.textContent = `${item.category} · ${item.publicationStatus}${item.important ? ' · Important' : ''}`;
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button-secondary'; edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editingId = item._id;
        form.elements.title.value = item.title;
        form.elements.category.value = item.category;
        form.elements.description.value = item.description;
        form.elements.important.checked = item.important;
        document.querySelector('[data-announcement-save]').textContent = 'Save changes';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const publication = document.createElement('button'); publication.type = 'button'; publication.className = 'button button-quiet';
      publication.textContent = item.publicationStatus === 'published' ? 'Unpublish' : 'Publish';
      publication.addEventListener('click', async () => {
        publication.disabled = true;
        try {
          await window.MythoVerseAuth.setAdminAnnouncementPublication(item._id, item.publicationStatus === 'published' ? 'draft' : 'published');
          await renderList(); message(feedback, 'Announcement status updated.', 'success');
        } catch (error) { message(feedback, error.message || 'Could not update announcement.', 'error'); publication.disabled = false; }
      });
      card.append(state, heading, description, edit, publication); return card;
    }));
    if (!result.announcements.length) {
      const empty = document.createElement('p'); empty.className = 'dashboard-empty-copy'; empty.textContent = 'No announcements match this filter.'; list.replaceChildren(empty);
    }
  }

  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'admin') { window.location.replace('/'); return; }
    content.hidden = false;
    await renderList(); status.hidden = true;
  } catch (error) {
    if (error.status === 401 || error.status === 403) { window.location.replace('/admin-login.html'); return; }
    message(status, 'Announcement management could not be loaded.', 'error');
  }

  filter.addEventListener('change', () => renderList().catch((error) => message(feedback, error.message, 'error')));
  document.querySelector('[data-announcement-reset]').addEventListener('click', resetForm);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const payload = { title: input.title, category: input.category, description: input.description, important: form.elements.important.checked };
    const save = document.querySelector('[data-announcement-save]'); save.disabled = true;
    try {
      if (editingId) await window.MythoVerseAuth.updateAdminAnnouncement(editingId, payload);
      else await window.MythoVerseAuth.createAdminAnnouncement(payload);
      resetForm(); await renderList(); message(feedback, 'Announcement saved as a draft.', 'success');
    } catch (error) { message(feedback, error.message || 'Announcement could not be saved.', 'error'); }
    finally { save.disabled = false; }
  });
})();
