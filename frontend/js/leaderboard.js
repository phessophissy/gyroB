// Leaderboard — Top players ranked by total USDm winnings.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.leaderboard";

const state = { ready: false, items: [], root: null };

export function initLeaderboard() {
  const root = document.getElementById("leaderboardRoot");
  if (!root) { console.warn("[Leaderboard] root #leaderboardRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
  render();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="leaderboard__head">
      <span class="leaderboard__icon" aria-hidden="true">🏆</span>
      <h3>Leaderboard</h3>
    </div>
    <div class="leaderboard__body" data-role="body">
      <p class="empty">Initializing Leaderboard…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "0xA1…2f", value: "128.4 USDm", meta: "42 wins" },
    { label: "0xB2…7c", value: "96.7 USDm", meta: "31 wins" },
    { label: "0xC3…19", value: "71.2 USDm", meta: "27 wins" },
    { label: "0xD4…8e", value: "48.0 USDm", meta: "19 wins" },
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
  return `<div class="leaderboard__row">
    <span class="leaderboard__idx">${i + 1}</span>
    <span class="leaderboard__label">${it.label}</span>
    <span class="leaderboard__meta">${it.meta || ""}</span>
    <strong class="leaderboard__value">${it.value}</strong>
  </div>`;
}
