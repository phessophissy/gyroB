// RoomChat — Lightweight off-chain lobby chat for the current room.
// Self-contained Gyro Board frontend panel module.

const STORAGE_KEY = "gyrob.room-chat";

const state = { ready: false, items: [], root: null };

export function initRoomChat() {
  const root = document.getElementById("roomChatRoot");
  if (!root) { console.warn("[RoomChat] root #roomChatRoot not found"); return; }
  state.root = root;
  state.ready = true;
  mountShell(root);
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
