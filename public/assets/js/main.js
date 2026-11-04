const componentPaths = {
  header: '/components/header.html',
  footer: '/components/footer.html'
};

async function loadComponent(container) {
  const componentName = container.dataset.component;
  const componentPath = componentPaths[componentName];

  if (!componentPath || container.dataset.componentLoaded === 'true') {
    return;
  }

  container.dataset.componentLoaded = 'true';

  try {
    const response = await fetch(componentPath);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    container.innerHTML = await response.text();

    if (componentName === 'header') {
      initializeNavigation(container);
      setCurrentPage(container);
      if (typeof window.MythoVerseAuth?.initializeHeader === 'function') {
        window.MythoVerseAuth.initializeHeader(container);
      }
    } else if (componentName === 'footer') {
      setCurrentYear(container);
    }
  } catch (error) {
    container.dataset.componentLoaded = 'false';
    console.error(`Unable to load the shared ${componentName} component.`, error);

    const message = document.createElement('p');
    message.className = 'component-error';
    message.setAttribute('role', 'alert');
    message.textContent = `The shared ${componentName} could not be loaded. Please refresh the page to try again.`;
    container.replaceChildren(message);
  }
}

function initializeNavigation(container) {
  const toggle = container.querySelector('[data-menu-toggle]');
  const navigation = container.querySelector('#site-navigation');

  if (!toggle || !navigation) {
    console.error('The shared header is missing its navigation controls.');
    return;
  }

  const mobileViewport = window.matchMedia('(max-width: 900px)');

  function setMenuState(isOpen) {
    const shouldOpen = mobileViewport.matches && isOpen;
    navigation.hidden = mobileViewport.matches && !shouldOpen;
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    toggle.setAttribute('aria-label', shouldOpen ? 'Close navigation menu' : 'Open navigation menu');
  }

  toggle.hidden = false;
  setMenuState(false);

  toggle.addEventListener('click', () => {
    setMenuState(toggle.getAttribute('aria-expanded') !== 'true');
  });

  navigation.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a') && mobileViewport.matches) {
      setMenuState(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileViewport.matches && !navigation.hidden) {
      setMenuState(false);
      toggle.focus();
    }
  });

  mobileViewport.addEventListener('change', () => {
    setMenuState(false);
  });
}

function setCurrentPage(container) {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';

  for (const link of container.querySelectorAll('.nav-link')) {
    const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/+$/, '') || '/';

    if (linkPath === currentPath) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

function setCurrentYear(container) {
  const currentYear = container.querySelector('[data-current-year]');

  if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
  }
}

async function initializePage() {
  const containers = document.querySelectorAll('[data-component]');
  await Promise.all(Array.from(containers, loadComponent));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage, { once: true });
} else {
  initializePage();
}
