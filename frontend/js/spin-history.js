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
