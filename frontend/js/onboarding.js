// Onboarding — Step-by-step first-run tour of Gyro Board.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.onboarding";

const state = { ready: false, items: [], root: null };

export function initOnboarding() {
  const root = document.getElementById("onboardingRoot");
  if (!root) { console.warn("[Onboarding] root #onboardingRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="onboarding__head">
      <span class="onboarding__icon" aria-hidden="true">🧭</span>
      <h3>Onboarding</h3>
    </div>
    <div class="onboarding__body" data-role="body">
      <p class="empty">Initializing Onboarding…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Step 1", value: "Pick a spin 1–10", meta: "practice" },
    { label: "Step 2", value: "Join a USDm room", meta: "play" },
    { label: "Step 3", value: "Beat the table", meta: "win 90%" },
    { label: "Step 4", value: "Withdraw winnings", meta: "mini pay" },
  ];
}

function loadInitial() {
  if (state.items.length) return;
  state.items = seedItems();
}

// ---- render ----
function render() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  if (!body) return;
  if (!state.items.length) { body.innerHTML = '<p class="empty">No entries yet.</p>'; return; }
  body.innerHTML = state.items.map(rowTemplate).join("");
}

function rowTemplate(it, i) {
  return `<div class="onboarding__row">
    <span class="onboarding__idx">${i + 1}</span>
    <span class="onboarding__label">${it.label}</span>
    <span class="onboarding__meta">${it.meta || ""}</span>
    <strong class="onboarding__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function markSeen() {
  try { localStorage.setItem("gyrob.onboarding.seen", "1"); } catch (e) { /* ignore */ }
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".onboarding__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="onboarding__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}
