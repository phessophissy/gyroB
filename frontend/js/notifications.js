// Notifications — Queued, dismissible in-app notifications.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.notifications";

const state = { ready: false, items: [], root: null };

export function initNotifications() {
  const root = document.getElementById("notificationsRoot");
  if (!root) { console.warn("[Notifications] root #notificationsRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
}

function mountShell(root) {
  root.innerHTML = `
    <div class="notifications__head">
      <span class="notifications__icon" aria-hidden="true">🔔</span>
      <h3>Notifications</h3>
    </div>
    <div class="notifications__body" data-role="body">
      <p class="empty">Initializing Notifications…</p>
    </div>
  `;
}
