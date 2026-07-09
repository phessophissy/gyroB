// NetworkStats — Aggregate on-chain room and round statistics.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.network-stats";

const state = { ready: false, items: [], root: null };

export function initNetworkStats() {
  const root = document.getElementById("networkStatsRoot");
  if (!root) { console.warn("[NetworkStats] root #networkStatsRoot not found"); return; }
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
    <div class="network-stats__head">
      <span class="network-stats__icon" aria-hidden="true">📡</span>
      <h3>Network Stats</h3>
    </div>
    <div class="network-stats__body" data-role="body">
      <p class="empty">Initializing Network Stats…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Rooms live", value: "4", meta: "tiers 1–4" },
    { label: "Open rounds", value: "3", meta: "awaiting seats" },
    { label: "Settled today", value: "128", meta: "rounds" },
    { label: "USDm paid out", value: "1,920", meta: "24h" },
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
  return `<div class="network-stats__row">
    <span class="network-stats__idx">${i + 1}</span>
    <span class="network-stats__label">${it.label}</span>
    <span class="network-stats__meta">${it.meta || ""}</span>
    <strong class="network-stats__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function totalPayout() {
  return state.items
    .filter((it) => it.label.includes("paid"))
    .reduce((s, it) => s + parseInt(it.value.replace(/,/g, ""), 10), 0);
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".network-stats__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="network-stats__refresh" data-action="refresh" type="button">Refresh</button>');
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
