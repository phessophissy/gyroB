// RoomChat — Lightweight off-chain lobby chat for the current room.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.room-chat";

const state = { ready: false, items: [], root: null };

export function initRoomChat() {
  const root = document.getElementById("roomChatRoot");
  if (!root) { console.warn("[RoomChat] root #roomChatRoot not found"); return; }
  state.root = root;
  state.ready = true;
  restore();
  mountShell(root);
  loadInitial();
  render();
  bindEvents();
  
}

function mountShell(root) {
  root.innerHTML = `
    <div class="room-chat__head">
      <span class="room-chat__icon" aria-hidden="true">💬</span>
      <h3>Room Chat</h3>
    </div>
    <div class="room-chat__body" data-role="body">
      <p class="empty">Initializing Room Chat…</p>
    </div>
  `;
}

// ---- data layer ----
function seedItems() {
  return [
    { label: "0xA1…2f", value: "gl hf", meta: "12:01" },
    { label: "0xB2…7c", value: "room 2 filling up", meta: "12:02" },
    { label: "0xC3…19", value: "spinning 7", meta: "12:03" },
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
  return `<div class="room-chat__row">
    <span class="room-chat__idx">${i + 1}</span>
    <span class="room-chat__label">${it.label}</span>
    <span class="room-chat__meta">${it.meta || ""}</span>
    <strong class="room-chat__value">${it.value}</strong>
  </div>`;
}

// ---- interactions & domain logic ----
function postMessage(text) {
  if (!text) return;
  state.items.push({ label: "you", value: text, meta: new Date().toLocaleTimeString().slice(0, 5) });
}

const actions = {
  refresh() { loadInitial(); ; render(); persist(); },
};

function bindEvents() {
  const body = state.root && state.root.querySelector('[data-role="body"]');
  body && body.addEventListener("click", onBodyClick);
  const head = state.root && state.root.querySelector(".room-chat__head");
  if (head) head.insertAdjacentHTML("beforeend",
    '<button class="room-chat__refresh" data-action="refresh" type="button">Refresh</button>');
}

function onBodyClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const fn = actions[target.dataset.action];
  if (fn) fn(target, e);
}

// ---- persistence & guards ----
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items })); }
  catch (e) { /* ignore quota errors */ }
}
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.items = JSON.parse(raw).items || state.items;
  } catch (e) { /* ignore corrupt cache */ }
}
