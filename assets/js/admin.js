const API_BASE = "/api";

const modal = document.querySelector("#admin-modal");
const modalMessage = document.querySelector("#admin-modal-message");
let lastActionButton;

function setModalVisibility(isVisible) {
  if (!modal) return;
  modal.hidden = !isVisible;
  document.body.style.overflow = isVisible ? "hidden" : "";
  if (isVisible) {
    modal.querySelector("[data-modal-close]")?.focus();
  } else {
    lastActionButton?.focus();
  }
}

document.querySelectorAll("[data-admin-action]").forEach((button) => {
  button.addEventListener("click", () => {
    lastActionButton = button;
    if (modalMessage) {
      modalMessage.textContent = `${button.dataset.adminAction} is a navigation placeholder. It will require authenticated permissions and a backend contract before it can manage real data.`;
    }
    setModalVisibility(true);
  });
});

modal?.querySelectorAll("[data-modal-close]").forEach((button) => {
  button.addEventListener("click", () => setModalVisibility(false));
});
modal?.addEventListener("click", (event) => {
  if (event.target === modal) setModalVisibility(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal && !modal.hidden) setModalVisibility(false);
});

/* ---------------- API client ---------------- */

async function apiRequest(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      credentials: "include",
    });
    let body = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await res.json().catch(() => null);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: { code: "NETWORK_ERROR", message: "Unable to reach the server." } } };
  }
}

/* ---------------- Authentication UI ---------------- */

const adminProfileLoading = document.querySelector("#admin-profile-loading");
const adminProfileUnauth = document.querySelector("#admin-profile-unauthenticated");
const adminProfileAuth = document.querySelector("#admin-profile-authenticated");
const adminProfileError = document.querySelector("#admin-profile-error");
const adminProfileName = document.querySelector("#admin-profile-name");
const adminProfileRole = document.querySelector("#admin-profile-role");
const adminProfileErrorMessage = document.querySelector("#admin-profile-error-message");
const adminSignInButton = document.querySelector("[data-action='admin-sign-in']");
const navAdminProfile = document.querySelector("#nav-admin-profile");
const requireAdminLinks = document.querySelectorAll("[data-require-admin]");
const contentAuthNote = document.querySelector("#content-auth-note");

const adminStats = document.querySelector("#admin-stats");
const statStudents = document.querySelector("#stat-students");
const statContent = document.querySelector("#stat-content");
const statQuizzes = document.querySelector("#stat-quizzes");

function showSection(element) {
  document.querySelectorAll("#admin-profile-loading, #admin-profile-unauthenticated, #admin-profile-authenticated, #admin-profile-error").forEach((el) => {
    if (el) el.style.display = "none";
  });
  if (element) element.style.display = "block";
}

function setAuthenticated(user) {
  showSection(adminProfileAuth);
  if (adminProfileName) adminProfileName.textContent = user.displayName || "Administrator";
  if (adminProfileRole) adminProfileRole.textContent = (user.role || "admin").charAt(0).toUpperCase() + (user.role || "admin").slice(1);
  if (navAdminProfile) navAdminProfile.style.display = "inline-block";
  requireAdminLinks.forEach((el) => { el.style.opacity = "1"; el.style.pointerEvents = "auto"; });
  if (contentAuthNote) contentAuthNote.style.display = "none";
  if (adminStats) adminStats.style.display = "block";
}

function setUnauthenticated() {
  showSection(adminProfileUnauth);
  if (navAdminProfile) navAdminProfile.style.display = "none";
  requireAdminLinks.forEach((el) => { el.style.opacity = "0.5"; el.style.pointerEvents = "none"; });
  if (contentAuthNote) contentAuthNote.style.display = "block";
  if (adminStats) adminStats.style.display = "none";
}

function setError(message) {
  showSection(adminProfileError);
  if (adminProfileErrorMessage) adminProfileErrorMessage.textContent = message || "Unable to load session.";
}

adminSignInButton?.addEventListener("click", () => {
  window.location.href = "../student/";
});

/* ---------------- Admin stats ---------------- */

async function loadAdminStats() {
  const res = await apiRequest("/stats");
  if (!res.ok || !res.body) return;
  const data = res.body;
  if (statStudents) statStudents.textContent = data.students !== undefined ? data.students : 0;
  const contentTotal = [
    data.videos, data.library, data.stories, data.missions, data.quizzes,
    data.quests, data.games, data.chambers, data.ashramStages,
  ].reduce((sum, v) => sum + (v || 0), 0);
  if (statContent) statContent.textContent = contentTotal;
  if (statQuizzes) statQuizzes.textContent = data.quizzes !== undefined ? data.quizzes : 0;
}

/* ---------------- Initialize ---------------- */

async function loadSession() {
  showSection(adminProfileLoading);
  const res = await apiRequest("/me");
  if (!res.ok || res.status === 401 || !res.body || !res.body.user) {
    setUnauthenticated();
    return;
  }
  const user = res.body.user;
  if (user.role !== "admin") {
    setUnauthenticated();
    return;
  }
  setAuthenticated(user);
  await loadAdminStats();
}

document.addEventListener("DOMContentLoaded", () => {
  loadSession();
});
