(async function () {
  const page = document.querySelector('[data-student-page]');
  const status = document.querySelector('#student-page-status');
  const content = document.querySelector('[data-student-page-content]');

  if (!page || !status || !content) {
    return;
  }

  const pageName = page.dataset.studentPage;
  const currentPath = pageName === 'profile' ? '/profile.html' : '/onboarding.html';

  function showMessage(message, state = 'loading') {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }

  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') {
      showMessage('This page is available to student accounts only.', 'error');
      return;
    }

    const onboarding = await window.MythoVerseAuth.getOnboardingStatus();

    if (pageName === 'onboarding' && onboarding.onboardingCompleted) {
      window.location.replace('/profile.html');
      return;
    }

    if (pageName === 'profile' && onboarding.onboardingRequired) {
      window.location.replace('/onboarding.html');
      return;
    }

    const profileResult = await window.MythoVerseAuth.getProfile();
    status.hidden = true;
    content.hidden = false;
    document.dispatchEvent(new CustomEvent('mythoverse:student-page-ready', {
      detail: {
        profile: profileResult.user,
        profileCompletion: profileResult.profileCompletion,
        onboarding
      }
    }));
  } catch (error) {
    if (error.status === 401) {
      window.location.replace(`/login.html?next=${encodeURIComponent(currentPath)}`);
      return;
    }

    console.error('Unable to load the student page.', error);
    showMessage(
      error.message || 'We could not load your profile. Please try again.',
      'error'
    );
  }
})();
