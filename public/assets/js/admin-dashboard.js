(async function initializeAdminDashboard() {
  const layout = document.querySelector('#admin-layout');
  const status = document.querySelector('#admin-page-status');
  const content = document.querySelector('#admin-dashboard-content');

  if (!layout || !status || !content) {
    return;
  }

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function renderCount(key, item) {
    const value = document.querySelector(`[data-summary-count="${key}"]`);
    const note = document.querySelector(`[data-summary-note="${key}"]`);
    if (!value || !note) {
      return;
    }

    value.textContent = item.available && Number.isInteger(item.count)
      ? String(item.count)
      : 'Unavailable';
    note.textContent = item.available
      ? 'Current account records'
      : 'Data source is not available';
  }

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

    toggle.addEventListener('click', () => {
      setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    sidebar.addEventListener('click', (event) => {
      const link = event.target.closest('.admin-nav-link[href^="#"]');
      if (!link) {
        return;
      }
      for (const navLink of sidebar.querySelectorAll('.admin-nav-link[aria-current]')) {
        navLink.removeAttribute('aria-current');
      }
      link.setAttribute('aria-current', 'page');
      setMenuOpen(false);
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

    const result = await window.MythoVerseAuth.getAdminDashboard();
    const displayName = document.querySelector('[data-admin-display-name]');
    displayName.textContent = user.displayName;
    for (const [key, item] of Object.entries(result.summary)) {
      renderCount(key, item);
    }

    try {
      const storyResult = await window.MythoVerseAuth.getAdminStories({ limit: 1 });
      for (const [key, value] of Object.entries(storyResult.stats)) {
        const counter = document.querySelector(`[data-story-stat="${key}"]`);
        if (counter && Number.isInteger(value)) counter.textContent = String(value);
      }
    } catch (error) {
      for (const counter of document.querySelectorAll('[data-story-stat]')) {
        counter.textContent = 'Unavailable';
      }
    }

    for (const button of document.querySelectorAll('[data-admin-logout]')) {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await window.MythoVerseAuth.logout();
          window.location.replace('/admin-login.html');
        } catch (error) {
          console.error('Unable to sign out of the admin dashboard.', error);
          setStatus(error.message || 'Unable to sign out. Please try again.', 'error');
        } finally {
          button.disabled = false;
        }
      });
    }

    initializeNavigation();
    status.hidden = true;
    content.hidden = false;
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/admin-login.html');
      return;
    }

    console.error('Unable to load the administrator dashboard.', error);
    setStatus(
      error.status === 403
        ? 'This account is not authorized for admin access.'
        : 'The dashboard could not be loaded. Please try again.',
      'error'
    );
    if (error.status === 403) {
      window.setTimeout(() => window.location.replace('/'), 1200);
    }
  }
})();
