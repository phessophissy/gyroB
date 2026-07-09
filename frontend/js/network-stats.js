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
