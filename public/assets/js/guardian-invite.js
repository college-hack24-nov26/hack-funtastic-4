(async function initializeGuardianInvite() {
  const status = document.querySelector('[data-guardian-invite-status]');
  const form = document.querySelector('[data-guardian-new-form]');
  const existing = document.querySelector('[data-existing-guardian]');
  const login = document.querySelector('[data-guardian-login]');
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!status || !form) return;
  const setStatus = (message, state = '') => { status.textContent = message; status.dataset.state = state; };
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setStatus('This invitation link is invalid or incomplete.', 'error'); return; }
  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role === 'guardian') {
      existing.hidden = false;
      existing.addEventListener('click', async () => {
        existing.disabled = true;
        try {
          const result = await window.MythoVerseAuth.acceptExistingGuardianInvite(token);
          setStatus(result.message, 'success');
          window.setTimeout(() => window.location.assign('/guardian-dashboard.html'), 800);
        } catch (error) { setStatus(error.message || 'This invitation could not be verified.', 'error'); existing.disabled = false; }
      });
      setStatus('You are signed in as a guardian. Verify this invitation to send a request to the student.');
      return;
    }
    setStatus('Sign in with the guardian account that received this invitation.');
    login.href = `/login.html?next=${encodeURIComponent(`/guardian-invite.html?token=${token}`)}`;
    login.hidden = false;
  } catch (error) {
    if (error.status !== 401) { setStatus('We could not verify the current account. Please try again.', 'error'); return; }
    form.hidden = false;
    setStatus('Create a guardian account using the email address that received this invitation.');
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const data = new FormData(form);
      const result = await window.MythoVerseAuth.acceptGuardianInvite({ token, displayName: data.get('displayName'), password: data.get('password') });
      form.hidden = true;
      setStatus(`${result.message} Sign in to view relationship status.`, 'success');
      window.setTimeout(() => window.location.assign('/login.html'), 1200);
    } catch (error) {
      setStatus(error.message || 'The invitation could not be verified.', 'error');
      if (error.status === 409) { login.href = `/login.html?next=${encodeURIComponent(`/guardian-invite.html?token=${token}`)}`; login.hidden = false; }
      submit.disabled = false;
    }
  });
})();
