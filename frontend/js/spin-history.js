// SpinHistory — Recent spins and payouts for the connected wallet.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.spin-history";

const state = { ready: false, items: [], root: null };

export function initSpinHistory() {
  const root = document.getElementById("spinHistoryRoot");
  if (!root) { console.warn("[SpinHistory] root #spinHistoryRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="spin-history__head">
      <span class="spin-history__icon" aria-hidden="true">🧾</span>
      <h3>Spin History</h3>
    </div>
    <div class="spin-history__body" data-role="body">
      <p class="empty">Initializing Spin History…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Round #41 · Room 2", value: "+5.0 USDm", meta: "spin 9 · win" },
    { label: "Round #40 · Room 1", value: "-0.02 USDm", meta: "spin 3 · loss" },
    { label: "Round #39 · Room 2", value: "+5.0 USDm", meta: "spin 10 · win" },
    { label: "Round #38 · Room 3", value: "-10 USDm", meta: "spin 4 · loss" },
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
  return `<div class="spin-history__row">
    <span class="spin-history__idx">${i + 1}</span>
    <span class="spin-history__label">${it.label}</span>
    <span class="spin-history__meta">${it.meta || ""}</span>
    <strong class="spin-history__value">${it.value}</strong>
  </div>`;
}
