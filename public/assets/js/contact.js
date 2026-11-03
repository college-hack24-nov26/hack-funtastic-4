const contactForm = document.querySelector('#contact-form');

if (contactForm instanceof HTMLFormElement) {
  const formStatus = contactForm.querySelector('#contact-form-status');
  const submitButton = contactForm.querySelector('[type="submit"]');
  const fields = Array.from(contactForm.querySelectorAll('input, textarea'));

  function getValidationMessage(field) {
    if (field.validity.valueMissing) {
      return 'Please complete this field.';
    }

    if (field.validity.typeMismatch) {
      return 'Enter a valid email address.';
    }

    if (field.validity.tooShort) {
      return `Please enter at least ${field.minLength} characters.`;
    }

    if (field.validity.tooLong) {
      return `Please enter no more than ${field.maxLength} characters.`;
    }

    return '';
  }

  function updateFieldValidation(field) {
    const error = contactForm.querySelector(`#${field.id}-error`);
    const message = getValidationMessage(field);

    field.setAttribute('aria-invalid', String(Boolean(message)));

    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }

    return !message;
  }

  function setFormStatus(message, state) {
    formStatus.textContent = message;
    formStatus.dataset.state = state;
  }

  for (const field of fields) {
    field.addEventListener('input', () => {
      updateFieldValidation(field);
      setFormStatus('', 'idle');
    });

    field.addEventListener('blur', () => {
      if (field.value) {
        updateFieldValidation(field);
      }
    });
  }

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    contactForm.setAttribute('aria-busy', 'true');
    setFormStatus('Checking your message details…', 'loading');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const invalidFields = fields.filter((field) => !updateFieldValidation(field));

    contactForm.removeAttribute('aria-busy');
    submitButton.disabled = false;

    if (invalidFields.length > 0) {
      setFormStatus('Please review the highlighted fields before continuing.', 'error');
      invalidFields[0].focus();
      return;
    }

    setFormStatus(
      'Your details pass validation, but your message has not been sent. Contact form submission is not configured yet.',
      'ready'
    );
  });
}
