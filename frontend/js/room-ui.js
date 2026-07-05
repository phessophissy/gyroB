import { AVATAR_COLORS, ROOM_TIERS } from "./config.js";
import { formatUSDm, shorten } from "./format.js";

export function getRoomTier(roomId) {
  return ROOM_TIERS[roomId] || { label: "Room", cls: "bronze" };
}

export function renderSeatProgress(roundProgress, playerCount, players = [], myAddr) {
  if (!roundProgress) return;
  roundProgress.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const filled = i < Number(playerCount);
    const player = players[i];
    const isYou = player && myAddr && player.player.toLowerCase() === myAddr;
    const cls = [filled ? "filled" : "", isYou ? "you" : ""].filter(Boolean).join(" ");
    return `<div class="seat ${cls}" title="Seat ${i + 1}">${filled ? i + 1 : ""}</div>`;
  }).join("");
}

export function buildRoomCardHtml(room, selectedRoomId) {
  const active = room.roomId === selectedRoomId ? "active" : "";
  const tier = getRoomTier(room.roomId);
  const fillPct = (Number(room.playerCount) / 10) * 100;
  return `
    <button class="room-card ${active}" type="button" data-room-id="${room.roomId}">
      <span class="room-tier room-tier--${tier.cls}">${tier.label}</span>
      <h3>Room ${room.roomId}</h3>
      <div class="room-meta">
        <div><span class="metric-label">Entry</span><strong>${formatUSDm(room.entryFee)} USDm</strong></div>
        <div><span class="metric-label">Pot</span><strong>${formatUSDm(room.totalPot)}</strong></div>
      </div>
      <div class="room-meta">
        <div><span class="metric-label">Round</span><strong>#${room.currentRound}</strong></div>
        <div><span class="metric-label">Players</span><strong>${room.playerCount}/10</strong></div>
      </div>
      <div class="room-fill"><div class="room-fill__bar" style="width:${fillPct}%"></div></div>
    </button>
  `;
}

export function buildPlayerListHtml(players, highSpin, account) {
  if (players.length === 0) {
    return '<p class="empty">Waiting for players… Be the first!</p>';
  }
  return players.map((player, index) => {
    const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const isLeader = highSpin > 0n && player.spin === highSpin;
    const isYou = account && player.player.toLowerCase() === account.toLowerCase();
    return `
      <article class="player-item">
        <div class="player-avatar" style="background:${color}22;color:${color}">${index + 1}</div>
        <div class="player-info"><code>${isYou ? "You" : shorten(player.player)}</code></div>
        <span class="player-spin ${isLeader ? "leader" : ""}">${player.spin}</span>
      </article>
    `;
  }).join("");
}