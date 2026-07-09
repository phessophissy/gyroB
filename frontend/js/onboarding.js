// Onboarding — Step-by-step first-run tour of Gyro Board.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.onboarding";

const state = { ready: false, items: [], root: null };

export function initOnboarding() {
  const root = document.getElementById("onboardingRoot");
  if (!root) { console.warn("[Onboarding] root #onboardingRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
}

function mountShell(root) {
  root.innerHTML = `
    <div class="onboarding__head">
      <span class="onboarding__icon" aria-hidden="true">🧭</span>
      <h3>Onboarding</h3>
    </div>
    <div class="onboarding__body" data-role="body">
      <p class="empty">Initializing Onboarding…</p>
    </div>
  `;
}
