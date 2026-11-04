const registrationForm = document.querySelector('#registration-form');

if (registrationForm instanceof HTMLFormElement) {
  const status = registrationForm.querySelector('#registration-status');
  const submitButton = registrationForm.querySelector('[type="submit"]');
  const password = registrationForm.querySelector('#register-password');
  const passwordConfirmation = registrationForm.querySelector('#register-password-confirm');
  const loginLink = registrationForm.querySelector('[data-registration-login]');
  const fields = Array.from(registrationForm.querySelectorAll('input, select'))
    .filter((field) => field.type !== 'checkbox' && field.type !== 'button' && field.type !== 'submit');
  const terms = registrationForm.querySelector('#register-terms');

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  function validateField(field) {
    const error = registrationForm.querySelector(`#${field.id}-error`);
    let message = '';

    if (field.validity.valueMissing) {
      message = 'Please complete this field.';
    } else if (field.validity.typeMismatch) {
      message = 'Enter a valid email address.';
    } else if (field.validity.tooShort) {
      message = `Please enter at least ${field.minLength} characters.`;
    } else if (field.id === password.id && new TextEncoder().encode(field.value).length > 72) {
      message = 'Password must be no more than 72 bytes.';
    } else if (field.id === passwordConfirmation.id && field.value !== password.value) {
      message = 'Passwords do not match.';
    } else if (field.tagName === 'SELECT' && !field.value) {
      message = 'Choose an age group.';
    }

    field.setAttribute('aria-invalid', String(Boolean(message)));
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    return !message;
  }

  for (const field of fields) {
    field.addEventListener('input', () => {
      validateField(field);
      if (field === password) {
        validateField(passwordConfirmation);
      }
      loginLink.hidden = true;
      setStatus('', 'idle');
    });

    field.addEventListener('change', () => validateField(field));
    field.addEventListener('blur', () => {
      if (field.value) {
        validateField(field);
      }
    });
  }

  terms.addEventListener('change', () => {
    if (terms.checked) {
      terms.setAttribute('aria-invalid', 'false');
      const termsError = registrationForm.querySelector('#register-terms-error');
      termsError.textContent = '';
      termsError.hidden = true;
      setStatus('', 'idle');
    }
  });

  for (const control of registrationForm.querySelectorAll('[data-toggle-password]')) {
    control.addEventListener('click', () => {
      const target = registrationForm.querySelector(`#${control.dataset.togglePassword}`);
      if (!target) {
        return;
      }
      const showPassword = target.type === 'password';
      target.type = showPassword ? 'text' : 'password';
      control.setAttribute('aria-pressed', String(showPassword));
      control.textContent = showPassword ? 'Hide' : 'Show';
    });
  }

  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('', 'idle');

    if (typeof window.MythoVerseAuth?.register !== 'function') {
      setStatus('Registration is temporarily unavailable. Please reload and try again.', 'error');
      return;
    }

    const invalidFields = fields.filter((field) => !validateField(field));
    if (!terms.checked) {
      terms.setAttribute('aria-invalid', 'true');
      const termsError = registrationForm.querySelector('#register-terms-error');
      termsError.textContent = 'Please acknowledge the account terms before continuing.';
      termsError.hidden = false;
      setStatus('Please acknowledge the account terms before continuing.', 'error');
      terms.focus();
      return;
    }
    terms.setAttribute('aria-invalid', 'false');
    const termsError = registrationForm.querySelector('#register-terms-error');
    termsError.textContent = '';
    termsError.hidden = true;

    if (invalidFields.length > 0) {
      setStatus('Please review the highlighted fields.', 'error');
      invalidFields[0].focus();
      return;
    }

    submitButton.disabled = true;
    registrationForm.setAttribute('aria-busy', 'true');
    setStatus('Creating your student account…', 'loading');

    try {
      await window.MythoVerseAuth.register({
        displayName: registrationForm.elements.displayName.value.trim(),
        email: registrationForm.elements.email.value.trim(),
        password: password.value,
        ageGroup: registrationForm.elements.ageGroup.value
      });
      setStatus('Your account has been created. You are not signed in yet. Continue to the login page to sign in.', 'success');
      loginLink.hidden = false;
      registrationForm.reset();
      terms.setAttribute('aria-invalid', 'false');
      for (const field of fields) {
        field.setAttribute('aria-invalid', 'false');
      }
      for (const control of registrationForm.querySelectorAll('[data-toggle-password]')) {
        const target = registrationForm.querySelector(`#${control.dataset.togglePassword}`);
        if (target) {
          target.type = 'password';
          control.setAttribute('aria-pressed', 'false');
          control.textContent = 'Show';
        }
      }
    } catch (error) {
      console.error('Registration request failed.', error);
      loginLink.hidden = error.status !== 409;
      setStatus(
        error.status === 409
          ? 'An account already uses this email. Log in to your existing account instead.'
          : error.message || 'We could not create your account. Please try again.',
        'error'
      );
    } finally {
      registrationForm.removeAttribute('aria-busy');
      submitButton.disabled = false;
    }
  });
}
