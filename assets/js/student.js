const API_BASE = "/api";

const modal = document.querySelector("#journey-modal");
const modalOpenButton = document.querySelector("[data-modal-open='journey-modal']");

function setModalVisibility(isVisible) {
  if (!modal) return;
  modal.hidden = !isVisible;
  document.body.style.overflow = isVisible ? "hidden" : "";
  if (isVisible) {
    modal.querySelector("[data-modal-close]")?.focus();
  } else {
    modalOpenButton?.focus();
  }
}

modalOpenButton?.addEventListener("click", () => setModalVisibility(true));
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

const profileLoading = document.querySelector("#profile-loading");
const profileUnauth = document.querySelector("#profile-unauthenticated");
const profileAuth = document.querySelector("#profile-authenticated");
const profileError = document.querySelector("#profile-error");
const profileName = document.querySelector("#profile-name");
const profileRole = document.querySelector("#profile-role");
const profileErrorMessage = document.querySelector("#profile-error-message");
const signInButton = document.querySelector("[data-action='sign-in']");
const navProfile = document.querySelector("#nav-profile");
const requireAuthLinks = document.querySelectorAll("[data-require-auth]");
const authNotes = document.querySelectorAll("[id$='-auth-note']");

function showSection(element) {
  document.querySelectorAll("#profile-loading, #profile-unauthenticated, #profile-authenticated, #profile-error").forEach((el) => {
    if (el) el.style.display = "none";
  });
  if (element) element.style.display = "block";
}

function setAuthenticated(user) {
  showSection(profileAuth);
  if (profileName) profileName.textContent = user.displayName || "Learner";
  if (profileRole) profileRole.textContent = (user.role || "student").charAt(0).toUpperCase() + (user.role || "student").slice(1);
  if (navProfile) navProfile.style.display = "inline-block";
  requireAuthLinks.forEach((el) => { el.style.opacity = "1"; el.style.pointerEvents = "auto"; });
  authNotes.forEach((el) => { el.style.display = "none"; });
}

function setUnauthenticated() {
  showSection(profileUnauth);
  if (navProfile) navProfile.style.display = "none";
  requireAuthLinks.forEach((el) => { el.style.opacity = "0.5"; el.style.pointerEvents = "none"; });
  authNotes.forEach((el) => { el.style.display = "block"; });
}

function setError(message) {
  showSection(profileError);
  if (profileErrorMessage) profileErrorMessage.textContent = message || "Unable to load profile.";
}

signInButton?.addEventListener("click", () => {
  window.location.href = "../admin/";
});

/* ---------------- Dashboard data ---------------- */

const statCoins = document.querySelector("#stat-coins");
const statAshram = document.querySelector("#stat-ashram");
const statQuests = document.querySelector("#stat-quests");
const dashboardStats = document.querySelector("#dashboard-stats");

async function loadProfile() {
  showSection(profileLoading);
  const res = await apiRequest("/me");
  if (!res.ok || res.status === 401) {
    setUnauthenticated();
    return;
  }
  if (!res.ok || !res.body || !res.body.user) {
    setError(res.body && res.body.error && res.body.error.message ? res.body.error.message : "Unable to load profile.");
    return;
  }
  setAuthenticated(res.body.user);
  await loadDashboard(res.body.user.id);
}

async function loadDashboard(userId) {
  const res = await apiRequest("/student/dashboard");
  if (!res.ok) {
    if (res.status === 401) {
      setUnauthenticated();
      return;
    }
    setError(res.body && res.body.error && res.body.error.message ? res.body.error.message : "Unable to load dashboard.");
    return;
  }
  const data = res.body || {};
  showSection(dashboardStats ? dashboardStats : profileAuth);
  if (dashboardStats) dashboardStats.style.display = "grid";
  if (statCoins) statCoins.textContent = data.coins !== undefined ? data.coins : 0;
  if (statAshram) statAshram.textContent = data.ashram && data.ashram.stagesCompleted !== undefined ? data.ashram.stagesCompleted : 0;
  if (statQuests) statQuests.textContent = data.counts && data.counts.quests !== undefined ? data.counts.quests : 0;
}

/* ---------------- Public content checks ---------------- */

async function checkPublicContent() {
  const res = await apiRequest("/library");
  const storiesRes = await apiRequest("/stories");
  const missionsRes = await apiRequest("/missions");
  const gamesRes = await apiRequest("/games");
  const statuses = {};
  if (res.ok) statuses.library = res.body.total || 0;
  if (storiesRes.ok) statuses.stories = storiesRes.body.items ? storiesRes.body.items.length : 0;
  if (missionsRes.ok) statuses.missions = missionsRes.body.items ? missionsRes.body.items.length : 0;
  if (gamesRes.ok) statuses.games = gamesRes.body.items ? gamesRes.body.items.length : 0;
  const journeyMsg = document.querySelector("#journey-modal-message");
  if (journeyMsg) {
    const parts = [];
    if (statuses.library !== undefined) parts.push(`${statuses.library} library article(s)`);
    if (statuses.stories !== undefined) parts.push(`${statuses.stories} story(ies)`);
    if (statuses.missions !== undefined) parts.push(`${statuses.missions} mission(s)`);
    if (statuses.games !== undefined) parts.push(`${statuses.games} game(s)`);
    journeyMsg.textContent = parts.length
      ? `Published content available: ${parts.join(", ")}. Sign in to track your progress and claim rewards.`
      : "Connect to the backend to view your real progress, rewards and identity.";
  }
}

/* ---------------- Initialize ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
  checkPublicContent();
});
