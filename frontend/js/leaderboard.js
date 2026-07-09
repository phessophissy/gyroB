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
