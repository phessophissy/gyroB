// ThemeToggle — Persisted light/dark theme with a system default.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.theme-toggle";

const state = { ready: false, items: [], root: null };

export function initThemeToggle() {
  const root = document.getElementById("themeToggleRoot");
  if (!root) { console.warn("[ThemeToggle] root #themeToggleRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
  loadInitial();
}

function mountShell(root) {
  root.innerHTML = `
    <div class="theme-toggle__head">
      <span class="theme-toggle__icon" aria-hidden="true">🌗</span>
      <h3>Theme</h3>
    </div>
    <div class="theme-toggle__body" data-role="body">
      <p class="empty">Initializing Theme…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "Dark", value: "active", meta: "default" },
    { label: "Light", value: "switch", meta: "tap to use" },
    { label: "System", value: "switch", meta: "auto" },
  ];
}

function loadInitial() {
  if (state.items.length) return;
  state.items = seedItems();
}
