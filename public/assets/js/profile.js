const profileRoot = document.querySelector('#profile-content');

if (profileRoot) {
  const display = profileRoot.querySelector('[data-profile-display]');
  const editForm = profileRoot.querySelector('#profile-edit-form');
  const status = profileRoot.querySelector('#profile-status');
  const editButton = profileRoot.querySelector('[data-profile-edit]');
  const cancelButton = profileRoot.querySelector('[data-profile-cancel]');
  const saveButton = profileRoot.querySelector('[type="submit"]');
  let profile = null;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function renderProfile(user, completion) {
    profile = user;
    const setText = (selector, value) => {
      for (const element of display.querySelectorAll(selector)) {
        element.textContent = value;
      }
    };

    setText('[data-profile-name]', user.displayName);
    setText('[data-profile-email]', user.email);
    setText('[data-profile-age-group]', user.ageGroup || 'Not added yet');
    display.querySelector('[data-profile-date-of-birth]').textContent = user.dateOfBirth || 'Not added yet';
    display.querySelector('[data-profile-school]').textContent = user.schoolName || 'Not added yet';
    display.querySelector('[data-profile-grade]').textContent = user.grade || 'Not added yet';
    display.querySelector('[data-profile-language]').textContent = user.preferredLanguage || 'Not added yet';

    const interestList = display.querySelector('[data-profile-interests]');
    interestList.replaceChildren();
    if (user.learningInterests?.length) {
      for (const interest of user.learningInterests) {
        const item = document.createElement('li');
        item.textContent = interestLabels[interest] || interest;
        interestList.append(item);
      }
    } else {
      const item = document.createElement('li');
      item.textContent = 'Not added yet';
      interestList.append(item);
    }

    display.querySelector('[data-profile-completion]').textContent =
      user.onboardingCompleted ? 'Onboarding complete' : 'Profile in progress';
    const progress = display.querySelector('[data-profile-progress]');
    progress.value = completion.percentage;
    progress.setAttribute('aria-valuetext', `${completion.percentage}% profile completion`);
    display.querySelector('[data-profile-progress-label]').textContent =
      `${completion.percentage}% profile completion`;

    const avatar = display.querySelector('[data-profile-avatar]');
    const fallback = display.querySelector('[data-profile-initials]');
    fallback.textContent = initials(user.displayName);
    avatar.hidden = !user.profilePictureUrl;
    fallback.hidden = Boolean(user.profilePictureUrl);
    if (user.profilePictureUrl) {
      avatar.src = user.profilePictureUrl;
    } else {
      avatar.removeAttribute('src');
    }

    editForm.elements.displayName.value = user.displayName;
    editForm.elements.profilePictureUrl.value = user.profilePictureUrl || '';
    editForm.elements.dateOfBirth.value = user.dateOfBirth || '';
    editForm.elements.ageGroup.value = user.ageGroup || '';
    editForm.elements.schoolName.value = user.schoolName || '';
    editForm.elements.grade.value = user.grade || '';
    editForm.elements.preferredLanguage.value = user.preferredLanguage || '';
    for (const input of editForm.querySelectorAll('input[name="learningInterests"]')) {
      input.checked = (user.learningInterests || []).includes(input.value);
    }
  }

  async function reloadProfile() {
    const result = await window.MythoVerseAuth.getProfile();
    renderProfile(result.user, result.profileCompletion);
  }

  function setEditing(isEditing) {
    display.hidden = isEditing;
    editForm.hidden = !isEditing;
    editButton.hidden = isEditing;
    setStatus('');
    if (isEditing) {
      editForm.querySelector('#profile-display-name').focus();
    } else {
      editButton.focus();
    }
  }

  function validateProfileForm() {
    const fields = Array.from(editForm.querySelectorAll('input, select'))
      .filter((field) => field.type !== 'checkbox');
    const invalid = [];

    for (const field of fields) {
      let message = '';
      if (field.validity.valueMissing) {
        message = 'Please complete this field.';
      } else if (field.validity.typeMismatch) {
        message = 'Enter a valid URL.';
      } else if (field.validity.tooShort) {
        message = `Please enter at least ${field.minLength} characters.`;
      } else if (field.validity.tooLong) {
        message = `Please enter no more than ${field.maxLength} characters.`;
      }

      field.setAttribute('aria-invalid', String(Boolean(message)));
      const error = editForm.querySelector(`#${field.id}-error`);
      if (error) {
        error.textContent = message;
        error.hidden = !message;
      }
      if (message) {
        invalid.push(field);
      }
    }

    if (invalid.length) {
      setStatus('Please review the highlighted fields.', 'error');
      invalid[0].focus();
      return false;
    }
    return true;
  }

  const interestLabels = {
    stories: 'Stories',
    culture: 'Culture',
    history: 'History',
    puzzles: 'Puzzles',
    quizzes: 'Quizzes',
    art: 'Art and drawing'
  };

  display.querySelector('[data-profile-avatar]').addEventListener('error', (event) => {
    event.currentTarget.hidden = true;
    display.querySelector('[data-profile-initials]').hidden = false;
  });

  editButton.addEventListener('click', () => setEditing(true));
  cancelButton.addEventListener('click', () => {
    if (profile) {
      renderProfile(profile, {
        percentage: display.querySelector('[data-profile-progress]').value
      });
    }
    setEditing(false);
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateProfileForm()) {
      return;
    }

    const updates = {
      displayName: editForm.elements.displayName.value.trim(),
      profilePictureUrl: editForm.elements.profilePictureUrl.value.trim(),
      dateOfBirth: editForm.elements.dateOfBirth.value,
      ageGroup: editForm.elements.ageGroup.value,
      schoolName: editForm.elements.schoolName.value.trim(),
      grade: editForm.elements.grade.value.trim(),
      preferredLanguage: editForm.elements.preferredLanguage.value,
      learningInterests: Array.from(
        editForm.querySelectorAll('input[name="learningInterests"]:checked'),
        (input) => input.value
      )
    };

    saveButton.disabled = true;
    editForm.setAttribute('aria-busy', 'true');
    setStatus('Saving profile…', 'loading');

    try {
      await window.MythoVerseAuth.updateProfile(updates);
      await reloadProfile();
      setEditing(false);
      setStatus('Your profile has been updated.', 'success');
    } catch (error) {
      console.error('Unable to update student profile.', error);
      setStatus(error.message || 'We could not update your profile. Please try again.', 'error');
    } finally {
      editForm.removeAttribute('aria-busy');
      saveButton.disabled = false;
    }
  });

  document.addEventListener('mythoverse:student-page-ready', async (event) => {
    renderProfile(event.detail.profile, event.detail.profileCompletion);
    profileRoot.hidden = false;
  });
}
