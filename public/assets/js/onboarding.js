const onboardingForm = document.querySelector('#onboarding-form');

if (onboardingForm instanceof HTMLFormElement) {
  const status = document.querySelector('#onboarding-status');
  const steps = Array.from(onboardingForm.querySelectorAll('[data-onboarding-step]'));
  const progress = document.querySelector('#onboarding-progress');
  const progressText = document.querySelector('#onboarding-progress-text');
  const submitButton = onboardingForm.querySelector('[type="submit"]');
  let currentStep = 0;
  let currentProfile = null;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function showStep(index) {
    currentStep = index;
    steps.forEach((step, stepIndex) => {
      step.hidden = stepIndex !== index;
    });

    const isWelcome = index === 0;
    const isReview = index === steps.length - 1;
    const formProgress = Math.max(0, index - 1);
    const formStepCount = steps.length - 2;
    progress.value = isWelcome ? 0 : isReview ? 100 : Math.round((formProgress / formStepCount) * 100);
    progressText.textContent = isWelcome
      ? 'Welcome'
      : isReview
        ? 'Review your details'
        : `Step ${index} of ${formStepCount}`;
    setStatus('');
    if (index > 0) {
      steps[index].querySelector('h2')?.focus();
    }
  }

  function validationMessage(field) {
    if (field.validity.valueMissing) {
      return 'Please complete this field.';
    }
    if (field.validity.typeMismatch) {
      return 'Enter a valid URL.';
    }
    if (field.validity.tooShort) {
      return `Please enter at least ${field.minLength} characters.`;
    }
    if (field.validity.tooLong) {
      return `Please enter no more than ${field.maxLength} characters.`;
    }
    return '';
  }

  function validateCurrentStep() {
    const step = steps[currentStep];
    const fields = Array.from(step.querySelectorAll('input, select'))
      .filter((field) => field.type !== 'checkbox' || field.required);
    const invalidFields = [];

    for (const field of fields) {
      const error = onboardingForm.querySelector(`#${field.id}-error`);
      const message = validationMessage(field);
      field.setAttribute('aria-invalid', String(Boolean(message)));
      if (error) {
        error.textContent = message;
        error.hidden = !message;
      }
      if (message) {
        invalidFields.push(field);
      }
    }

    if (invalidFields.length > 0) {
      setStatus('Please review the highlighted information.', 'error');
      invalidFields[0].focus();
      return false;
    }
    return true;
  }

  function getFormData() {
    return {
      displayName: onboardingForm.elements.displayName.value.trim(),
      ageGroup: onboardingForm.elements.ageGroup.value,
      dateOfBirth: onboardingForm.elements.dateOfBirth.value,
      schoolName: onboardingForm.elements.schoolName.value.trim(),
      grade: onboardingForm.elements.grade.value.trim(),
      preferredLanguage: onboardingForm.elements.preferredLanguage.value,
      learningInterests: Array.from(
        onboardingForm.querySelectorAll('input[name="learningInterests"]:checked'),
        (input) => input.value
      )
    };
  }

  function displayValue(value) {
    return value || 'Not added yet';
  }

  function updateReview() {
    const data = getFormData();
    const summary = document.querySelector('#onboarding-review');
    const values = {
      'review-name': data.displayName,
      'review-age-group': data.ageGroup,
      'review-date-of-birth': displayValue(data.dateOfBirth),
      'review-school': displayValue(data.schoolName),
      'review-grade': displayValue(data.grade),
      'review-language': data.preferredLanguage,
      'review-interests': data.learningInterests.length
        ? data.learningInterests.map((interest) => interestLabels[interest]).join(', ')
        : 'Not added yet'
    };

    for (const [id, value] of Object.entries(values)) {
      summary.querySelector(`#${id}`).textContent = value;
    }
  }

  const interestLabels = {
    stories: 'Stories',
    culture: 'Culture',
    history: 'History',
    puzzles: 'Puzzles',
    quizzes: 'Quizzes',
    art: 'Art and drawing'
  };

  document.addEventListener('mythoverse:student-page-ready', (event) => {
    currentProfile = event.detail.profile;
    onboardingForm.elements.displayName.value = currentProfile.displayName || '';
    onboardingForm.elements.ageGroup.value = currentProfile.ageGroup || '';
    onboardingForm.elements.dateOfBirth.value = currentProfile.dateOfBirth || '';
    onboardingForm.elements.schoolName.value = currentProfile.schoolName || '';
    onboardingForm.elements.grade.value = currentProfile.grade || '';
    onboardingForm.elements.preferredLanguage.value = currentProfile.preferredLanguage || '';
    for (const input of onboardingForm.querySelectorAll('input[name="learningInterests"]')) {
      input.checked = (currentProfile.learningInterests || []).includes(input.value);
    }
  });

  onboardingForm.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step-action]');
    if (!button) {
      return;
    }

    const action = button.dataset.stepAction;
    if (action === 'start') {
      showStep(1);
    } else if (action === 'back') {
      showStep(Math.max(0, currentStep - 1));
    } else if (action === 'next') {
      if (!validateCurrentStep()) {
        return;
      }
      if (currentStep === steps.length - 2) {
        updateReview();
        showStep(steps.length - 1);
      } else {
        showStep(Math.min(steps.length - 1, currentStep + 1));
      }
    }
  });

  onboardingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (currentStep !== steps.length - 1 || !currentProfile) {
      return;
    }

    if (typeof window.MythoVerseAuth?.completeOnboarding !== 'function') {
      setStatus('Onboarding is temporarily unavailable. Please reload and try again.', 'error');
      return;
    }

    submitButton.disabled = true;
    onboardingForm.setAttribute('aria-busy', 'true');
    setStatus('Saving your profile…', 'loading');

    try {
      await window.MythoVerseAuth.completeOnboarding(getFormData());
      setStatus('Your profile is saved. Welcome to MythoVerse!', 'success');
      window.setTimeout(() => window.location.assign('/profile.html'), 900);
    } catch (error) {
      console.error('Unable to complete onboarding.', error);
      setStatus(error.message || 'We could not save your profile. Please try again.', 'error');
    } finally {
      onboardingForm.removeAttribute('aria-busy');
      submitButton.disabled = false;
    }
  });

  showStep(0);
}
