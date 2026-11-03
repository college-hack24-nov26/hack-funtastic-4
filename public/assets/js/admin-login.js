const adminLoginForm = document.querySelector('#admin-login-form');

if (adminLoginForm instanceof HTMLFormElement) {
  const status = adminLoginForm.querySelector('#admin-login-status');
  const submitButton = adminLoginForm.querySelector('[type="submit"]');
  const email = adminLoginForm.querySelector('#admin-login-email');
  const password = adminLoginForm.querySelector('#admin-login-password');

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function validateField(field) {
    let message = '';
    if (field.validity.valueMissing) {
      message = 'Please complete this field.';
    } else if (field.validity.typeMismatch) {
      message = 'Enter a valid email address.';
    }

    field.setAttribute('aria-invalid', String(Boolean(message)));
    const error = adminLoginForm.querySelector(`#${field.id}-error`);
    error.textContent = message;
    error.hidden = !message;
    return !message;
  }

  for (const field of [email, password]) {
    field.addEventListener('input', () => {
      validateField(field);
      setStatus('');
    });
  }

  adminLoginForm.querySelector('[data-toggle-admin-password]').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const showPassword = password.type === 'password';
    password.type = showPassword ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(showPassword));
    button.textContent = showPassword ? 'Hide' : 'Show';
  });

  if (typeof window.MythoVerseAuth?.getCurrentUser === 'function') {
    window.MythoVerseAuth.getCurrentUser()
      .then((user) => {
        if (user.role === 'admin') {
          window.location.replace('/admin/dashboard.html');
        }
      })
      .catch((error) => {
        if (error.status !== 401) {
          console.error('Unable to verify an existing administrator session.', error);
          setStatus('We could not verify your session. Please try again.', 'error');
        }
      });
  }

  adminLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');

    const invalidFields = [email, password].filter((field) => !validateField(field));
    if (invalidFields.length) {
      setStatus('Please review the highlighted fields.', 'error');
      invalidFields[0].focus();
      return;
    }

    if (typeof window.MythoVerseAuth?.login !== 'function') {
      setStatus('Sign-in is temporarily unavailable. Please reload and try again.', 'error');
      return;
    }

    submitButton.disabled = true;
    adminLoginForm.setAttribute('aria-busy', 'true');
    setStatus('Verifying your account…', 'loading');

    try {
      const user = await window.MythoVerseAuth.login({
        email: email.value.trim(),
        password: password.value
      });

      if (user.role !== 'admin') {
        try {
          await window.MythoVerseAuth.logout();
        } catch (error) {
          console.error('Unable to clear a non-admin session.', error);
          setStatus('This account is not authorized for admin access. Sign out from the public site before trying again.', 'error');
          return;
        }
        setStatus('This account is not authorized for admin access.', 'error');
        return;
      }

      setStatus('Administrator verified. Opening the dashboard…', 'success');
      window.location.assign('/admin/dashboard.html');
    } catch (error) {
      console.error('Administrator login failed.', error);
      setStatus('Unable to sign in with those credentials.', 'error');
    } finally {
      adminLoginForm.removeAttribute('aria-busy');
      submitButton.disabled = false;
    }
  });
}
