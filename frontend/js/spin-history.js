// SpinHistory — Recent spins and payouts for the connected wallet.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.spin-history";

const state = { ready: false, items: [], root: null };

export function initSpinHistory() {
  const root = document.getElementById("spinHistoryRoot");
  if (!root) { console.warn("[SpinHistory] root #spinHistoryRoot not found"); return; }
  state.root = root;
  state.ready = true;
  restore();
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
  
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

// ---- interactions & domain logic ----
function netPnl() {
  return state.items.reduce((s, it) => s + parseFloat(it.value), 0).toFixed(2);
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".spin-history__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="spin-history__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}

// ---- persistence & guards ----
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items })); }
  catch (e) { /* ignore quota errors */ }
}
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.items = JSON.parse(raw).items || state.items;
  } catch (e) { /* ignore corrupt cache */ }
}
