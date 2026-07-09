// Achievements — Milestone badges for spins, wins, and streaks.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.achievements";

const state = { ready: false, items: [], root: null };

export function initAchievements() {
  const root = document.getElementById("achievementsRoot");
  if (!root) { console.warn("[Achievements] root #achievementsRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="achievements__head">
      <span class="achievements__icon" aria-hidden="true">🎖️</span>
      <h3>Achievements</h3>
    </div>
    <div class="achievements__body" data-role="body">
      <p class="empty">Initializing Achievements…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "First Spin", value: "unlocked", meta: "1 spin" },
    { label: "Sharpshooter", value: "locked", meta: "spin 10 ×5" },
    { label: "High Roller", value: "unlocked", meta: "Room 3 play" },
    { label: "Streak 5", value: "locked", meta: "5 wins in a row" },
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
  return `<div class="achievements__row">
    <span class="achievements__idx">${i + 1}</span>
    <span class="achievements__label">${it.label}</span>
    <span class="achievements__meta">${it.meta || ""}</span>
    <strong class="achievements__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function countUnlocked() {
  return state.items.filter((it) => it.value === "unlocked").length;
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".achievements__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="achievements__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}
