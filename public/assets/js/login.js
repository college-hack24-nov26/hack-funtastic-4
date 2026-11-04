const loginForm = document.querySelector('#login-form');

function getSafeLoginDestination() {
  const requested = new URLSearchParams(window.location.search).get('next');
  if (requested === '/profile.html' || requested === '/dashboard.html' || requested === '/stories.html') {
    return requested;
  }
  if (requested) {
    try {
      const inviteDestination = new URL(requested, window.location.origin);
      const token = inviteDestination.searchParams.get('token');
      if (inviteDestination.origin === window.location.origin && inviteDestination.pathname === '/guardian-invite.html' && /^[A-Za-z0-9_-]{43}$/.test(token || '')) {
        return `/guardian-invite.html?token=${encodeURIComponent(token)}`;
      }
    } catch (error) {
      return '';
    }
  }
  if (!requested) return '';
  try {
    const destination = new URL(requested, window.location.origin);
    if (destination.origin !== window.location.origin || destination.pathname !== '/story.html') return '';
    const slug = destination.searchParams.get('slug');
    const lesson = destination.searchParams.get('lesson');
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return '';
    if (lesson && !/^[a-f0-9]{24}$/i.test(lesson)) return '';
    return `/story.html?slug=${encodeURIComponent(slug)}${lesson ? `&lesson=${encodeURIComponent(lesson)}` : ''}`;
  } catch (error) {
    return '';
  }
}

if (loginForm instanceof HTMLFormElement) {
  const status = loginForm.querySelector('#login-status');
  const submitButton = loginForm.querySelector('[type="submit"]');
  const email = loginForm.querySelector('#login-email');
  const password = loginForm.querySelector('#login-password');

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  function validateField(field) {
    const error = loginForm.querySelector(`#${field.id}-error`);
    let message = '';

    if (field.validity.valueMissing) {
      message = 'Please complete this field.';
    } else if (field.validity.typeMismatch) {
      message = 'Enter a valid email address.';
    }

    field.setAttribute('aria-invalid', String(Boolean(message)));
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    return !message;
  }

  for (const field of [email, password]) {
    field.addEventListener('input', () => {
      validateField(field);
      setStatus('', 'idle');
    });
    field.addEventListener('blur', () => {
      if (field.value) {
        validateField(field);
      }
    });
  }

  loginForm.querySelector('[data-toggle-password]').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const showPassword = password.type === 'password';
    password.type = showPassword ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(showPassword));
    button.textContent = showPassword ? 'Hide' : 'Show';
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('', 'idle');

    if (typeof window.MythoVerseAuth?.login !== 'function') {
      setStatus('Login is temporarily unavailable. Please reload and try again.', 'error');
      return;
    }

    const invalidFields = [email, password].filter((field) => !validateField(field));
    if (invalidFields.length > 0) {
      setStatus('Please review the highlighted fields.', 'error');
      invalidFields[0].focus();
      return;
    }

    submitButton.disabled = true;
    loginForm.setAttribute('aria-busy', 'true');
    setStatus('Signing you in…', 'loading');

    try {
      const signedInUser = await window.MythoVerseAuth.login({
        email: email.value.trim(),
        password: password.value
      });

      let destination = signedInUser.role === 'guardian'
        ? (getSafeLoginDestination() || '/guardian-dashboard.html')
        : '/dashboard.html';
      if (signedInUser.role === 'student') {
        try {
          const onboarding = await window.MythoVerseAuth.getOnboardingStatus();
          if (onboarding.onboardingRequired) {
            destination = '/onboarding.html';
          } else {
            const requestedPath = getSafeLoginDestination();
            if (requestedPath) destination = requestedPath;
          }
        } catch (error) {
          console.error('Unable to check onboarding status after login.', error);
          setStatus('You are signed in, but your onboarding status could not be checked. Please retry or visit the home page.', 'error');
          return;
        }
      }

      setStatus(
        destination === '/onboarding.html'
          ? 'You are signed in. Let’s finish setting up your profile…'
          : 'You are signed in. Opening your dashboard…',
        'success'
      );
      window.setTimeout(() => {
        window.location.assign(destination);
      }, 500);
    } catch (error) {
      console.error('Login request failed.', error);
      setStatus(error.message || 'We could not sign you in. Check your details and try again.', 'error');
    } finally {
      loginForm.removeAttribute('aria-busy');
      submitButton.disabled = false;
    }
  });
}
