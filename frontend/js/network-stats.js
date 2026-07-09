// NetworkStats — Aggregate on-chain room and round statistics.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.network-stats";

const state = { ready: false, items: [], root: null };

export function initNetworkStats() {
  const root = document.getElementById("networkStatsRoot");
  if (!root) { console.warn("[NetworkStats] root #networkStatsRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
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
