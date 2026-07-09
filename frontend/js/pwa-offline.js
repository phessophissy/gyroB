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
