// Achievements — Milestone badges for spins, wins, and streaks.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.achievements";

const state = { ready: false, items: [], root: null };

export function initAchievements() {
  const root = document.getElementById("achievementsRoot");
  if (!root) { console.warn("[Achievements] root #achievementsRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
}

function mountShell(root) {
  root.innerHTML = `
    <div class="achievements__head">
      <span class="achievements__icon" aria-hidden="true">🎖️</span>
      <h3>Achievements</h3>
    </div>
    <div class="achievements__body" data-role="body">
      <p class="empty">Initializing Achievements…</p>
    </div>
  `;
}
