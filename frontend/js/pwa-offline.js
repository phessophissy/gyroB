// PwaOffline — Register a service worker for offline caching.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.pwa-offline";

const state = { ready: false, items: [], root: null };

export function initPwaOffline() {
  const root = document.getElementById("pwaOfflineRoot");
  if (!root) { console.warn("[PwaOffline] root #pwaOfflineRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="pwa-offline__head">
      <span class="pwa-offline__icon" aria-hidden="true">📲</span>
      <h3>Offline</h3>
    </div>
    <div class="pwa-offline__body" data-role="body">
      <p class="empty">Initializing Offline…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Service worker", value: "registering", meta: "/sw.js" },
    { label: "Cache", value: "stale", meta: "v1" },
    { label: "Install prompt", value: "ready", meta: "pwa" },
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
  return `<div class="pwa-offline__row">
    <span class="pwa-offline__idx">${i + 1}</span>
    <span class="pwa-offline__label">${it.label}</span>
    <span class="pwa-offline__meta">${it.meta || ""}</span>
    <strong class="pwa-offline__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
      .catch((e) => console.warn("[PWA] SW reg failed", e));
  }
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".pwa-offline__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="pwa-offline__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}
