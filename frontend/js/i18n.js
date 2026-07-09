// I18n — Lightweight i18n with en/es translation tables.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.i18n";

const state = { ready: false, items: [], root: null };

export function initI18n() {
  const root = document.getElementById("i18nRoot");
  if (!root) { console.warn("[I18n] root #i18nRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="i18n__head">
      <span class="i18n__icon" aria-hidden="true">🌐</span>
      <h3>Language</h3>
    </div>
    <div class="i18n__body" data-role="body">
      <p class="empty">Initializing Language…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "English", value: "active", meta: "en" },
    { label: "Español", value: "switch", meta: "es" },
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
  return `<div class="i18n__row">
    <span class="i18n__idx">${i + 1}</span>
    <span class="i18n__label">${it.label}</span>
    <span class="i18n__meta">${it.meta || ""}</span>
    <strong class="i18n__value">${it.value}</strong>
  </div>`;
}
