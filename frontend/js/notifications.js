// Notifications — Queued, dismissible in-app notifications.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.notifications";

const state = { ready: false, items: [], root: null };

export function initNotifications() {
  const root = document.getElementById("notificationsRoot");
  if (!root) { console.warn("[Notifications] root #notificationsRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="notifications__head">
      <span class="notifications__icon" aria-hidden="true">🔔</span>
      <h3>Notifications</h3>
    </div>
    <div class="notifications__body" data-role="body">
      <p class="empty">Initializing Notifications…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Round settled", value: "You won 5 USDm", meta: "2m ago" },
    { label: "Room 2", value: "9/10 seats filled", meta: "5m ago" },
    { label: "Welcome", value: "Connect to play", meta: "now" },
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
  return `<div class="notifications__row">
    <span class="notifications__idx">${i + 1}</span>
    <span class="notifications__label">${it.label}</span>
    <span class="notifications__meta">${it.meta || ""}</span>
    <strong class="notifications__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function dismissFirst() {
  if (state.items.length) state.items.shift();
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".notifications__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="notifications__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}
