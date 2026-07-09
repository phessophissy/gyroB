// ThemeToggle — Persisted light/dark theme with a system default.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.theme-toggle";

const state = { ready: false, items: [], root: null };

export function initThemeToggle() {
  const root = document.getElementById("themeToggleRoot");
  if (!root) { console.warn("[ThemeToggle] root #themeToggleRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="theme-toggle__head">
      <span class="theme-toggle__icon" aria-hidden="true">🌗</span>
      <h3>Theme</h3>
    </div>
    <div class="theme-toggle__body" data-role="body">
      <p class="empty">Initializing Theme…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Dark", value: "active", meta: "default" },
    { label: "Light", value: "switch", meta: "tap to use" },
    { label: "System", value: "switch", meta: "auto" },
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
  return `<div class="theme-toggle__row">
    <span class="theme-toggle__idx">${i + 1}</span>
    <span class="theme-toggle__label">${it.label}</span>
    <span class="theme-toggle__meta">${it.meta || ""}</span>
    <strong class="theme-toggle__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".theme-toggle__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="theme-toggle__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}
