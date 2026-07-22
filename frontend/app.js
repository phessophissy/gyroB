import { createPublicClient, createWalletClient, custom, erc20Abi, http } from "viem";
import { celo } from "viem/chains";
import { gyrobAbi } from "./js/abi.js";
import {
  CONTRACT_ADDRESS,
  MAX_APPROVAL,
  RPC_URL,
  USDM_ADDRESS,
  WALLETCONNECT_PROJECT_ID,
} from "./js/config.js";
import { formatUSDm, parseError, shorten } from "./js/format.js";
import {
  validatePlay,
  validateAffordability,
  validateTreasuryPlay,
  MIN_PLAYERS,
  MAX_PLAYERS,
  TREASURY_WIN_SHARE,
} from "./js/validation.js";
import {
  isSoundEnabled,
  toggleSound,
  playClick,
  playSpin,
  playWin,
  playLose,
} from "./js/sound.js";
import { roomListSkeleton, setLoading } from "./js/loading.js";
import { isMiniPayEnvironment, shareMiniPayResult } from "./js/minipay.js";
import {
  buildPlayerListHtml,
  buildRoomCardHtml,
  getRoomTier,
  renderSeatProgress,
} from "./js/room-ui.js";
import { haptic, showToast } from "./js/toast.js";

const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC_URL),
});

const state = {
  account: null,
  selectedRoomId: null,
  selectedSpin: null,
  rooms: [],
  provider: null,
  providerType: null,
  walletConnectProvider: null,
  isConnecting: false,
  playStep: "rooms",
  balance: null,
  allowance: null,
  // Treasury mode state
  mode: "treasury", // "treasury" | "players"
  treasuryBalance: null,
  treasurySelectedSpin: null,
  treasuryStake: null,
};

const walletConnectProviders = new WeakSet();

const connectBtn = document.getElementById("connectBtn");
const sessionConnectBtn = document.getElementById("sessionConnectBtn");
const refreshBtn = document.getElementById("refreshBtn");
const approveBtn = document.getElementById("approveBtn");
const playBtn = document.getElementById("playBtn");
const roomList = document.getElementById("roomList");
const playerList = document.getElementById("playerList");
const walletAddress = document.getElementById("walletAddress");
const walletBalance = document.getElementById("walletBalance");
const allowanceValue = document.getElementById("allowanceValue");
const walletPill = document.getElementById("walletPill");
const walletDot = document.getElementById("walletDot");
const walletAction = document.getElementById("walletAction");
const minipayBadge = document.getElementById("minipayBadge");
const toastContainer = document.getElementById("toastContainer");
const roundProgress = document.getElementById("roundProgress");

// Treasury mode elements
const treasuryPanel = document.getElementById("treasuryPanel");
const playersPanel = document.getElementById("playersPanel");
const treasurySpinGrid = document.getElementById("treasurySpinGrid");
const treasurySelectedSpinLabel = document.getElementById("treasurySelectedSpinLabel");
const treasuryStakeInput = document.getElementById("treasuryStakeInput");
const treasuryApproveBtn = document.getElementById("treasuryApproveBtn");
const treasuryPlayBtn = document.getElementById("treasuryPlayBtn");
const treasuryResult = document.getElementById("treasuryResult");
const treasuryBalanceValue = document.getElementById("treasuryBalanceValue");
const finalizeEarlyBtn = document.getElementById("finalizeEarlyBtn");
const modeToggleBtns = document.querySelectorAll(".mode-toggle__btn");

const practiceSpinGrid = document.getElementById("practiceSpinGrid");
const practiceBtn = document.getElementById("practiceBtn");
const practiceResult = document.getElementById("practiceResult");
const practiceYou = document.getElementById("practiceYou");
const practiceComp = document.getElementById("practiceComp");
const practiceOutcome = document.getElementById("practiceOutcome");
const practiceHistory = document.getElementById("practiceHistory");
const practiceStreak = document.getElementById("practiceStreak");
const practiceBest = document.getElementById("practiceBest");
const practicePlayed = document.getElementById("practicePlayed");
const practiceWheel = document.getElementById("practiceWheel");
const wheelDisplay = document.getElementById("wheelDisplay");

let practiceSelectedSpin = null;
let practiceStreakCount = 0;
let practiceBestStreak = 0;
let practiceTotalPlayed = 0;
const practiceLog = [];

const selectedSpinLabel = document.getElementById("selectedSpinLabel");
const statusMessage = document.getElementById("statusMessage");
const summaryRoom = document.getElementById("summaryRoom");
const summaryRound = document.getElementById("summaryRound");
const summaryPlayers = document.getElementById("summaryPlayers");
const summaryPot = document.getElementById("summaryPot");
const summaryHighSpin = document.getElementById("summaryHighSpin");
const summaryPlayed = document.getElementById("summaryPlayed");
const spinGrid = document.getElementById("spinGrid");
const connectButtons = [connectBtn, sessionConnectBtn].filter(Boolean);

init();
initNavigation();
initPractice();
initAccessibility();

function initSoundToggle() {
  const btn = document.getElementById("soundToggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(isSoundEnabled()));
  btn.addEventListener("click", () => {
    const enabled = toggleSound();
    btn.setAttribute("aria-pressed", String(enabled));
    if (enabled) playClick();
  });
}

function init() {
  buildSpinGrid();
  buildTreasurySpinGrid();
  initSoundToggle();
  initModeToggle();
  for (const button of connectButtons) {
    button.addEventListener("click", connectWallet);
  }
  walletPill?.addEventListener("click", () => {
    if (state.account) disconnectWallet();
    else connectWallet();
  });
  refreshBtn.addEventListener("click", () => {
    haptic(10);
    setLoading(refreshBtn, true, "Refreshing");
    setLoading(roomList, true);
    roomList.setAttribute("aria-busy", "true");
    roomList.innerHTML = roomListSkeleton();
    refreshApp().finally(() => {
      setLoading(refreshBtn, false);
      setLoading(roomList, false);
      roomList.setAttribute("aria-busy", "false");
    });
  });
  approveBtn.addEventListener("click", approveRoom);
  playBtn.addEventListener("click", playRoom);
  treasuryApproveBtn?.addEventListener("click", approveTreasury);
  treasuryPlayBtn?.addEventListener("click", playVsTreasury);
  finalizeEarlyBtn?.addEventListener("click", finalizeRoundEarly);
  treasuryStakeInput?.addEventListener("input", () => {
    const parsed = parseStakeInput(treasuryStakeInput.value);
    state.treasuryStake = parsed;
    syncTreasuryControls();
  });

  const detected = getProvider();
  state.provider = null;
  state.providerType = null;

  if (detected?.type === "minipay") {
    console.info("[GyroB] MiniPay environment detected");
    minipayBadge?.classList.remove("is-hidden");
    hideConnectButtons();
    bindProviderEvents(detected.provider);
  } else {
    minipayBadge?.classList.add("is-hidden");
    showConnectButtons();
    if (detected?.provider) {
      console.info(`[GyroB] Injected provider detected: ${getProviderLabel(detected.provider)}`);
      setConnectButtonLabel(`Connect ${getProviderLabel(detected.provider)}`);
      bindProviderEvents(detected.provider);
    } else if (WALLETCONNECT_PROJECT_ID) {
      setConnectButtonLabel("Connect with WalletConnect");
    } else {
      setConnectButtonLabel("Connect wallet");
    }
  }

  if (!CONTRACT_ADDRESS) {
    updateStatus("Set VITE_GYROB_CONTRACT_ADDRESS to play on-chain.", "error");
  } else if (detected?.type === "minipay") {
    updateStatus("MiniPay detected — connecting automatically…", "success");
  } else if (detected?.provider) {
    updateStatus(`Connect ${getProviderLabel(detected.provider)} to enter a room.`, "success");
  } else if (WALLETCONNECT_PROJECT_ID) {
    updateStatus("Connect with WalletConnect to play.", "success");
  } else {
    updateStatus("Open in MiniPay or connect a Celo wallet.", "error");
  }

  refreshApp();
  void initConnection();
}

/* ===== NAVIGATION ===== */
function initAccessibility() {
  initSpinGridKeyboard(spinGrid, (spin, button) => {
    state.selectedSpin = spin;
    selectedSpinLabel.textContent = spin;
    for (const b of spinGrid.querySelectorAll(".spin-button")) b.classList.toggle("active", b === button);
    syncControls();
    announceLive(`Spin ${spin} selected`);
  });
  initSpinGridKeyboard(practiceSpinGrid, (spin, button) => {
    practiceSelectedSpin = spin;
    for (const b of practiceSpinGrid.querySelectorAll(".spin-button")) b.classList.toggle("active", b === button);
    practiceBtn.disabled = false;
    announceLive(`Practice spin ${spin} selected`);
  });
}

function initNavigation() {
  const navItems = document.querySelectorAll(".bottom-nav .nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.tab;
      navItems.forEach((n) => {
        n.classList.toggle("active", n === item);
        n.setAttribute("aria-current", n === item ? "page" : "false");
      });
      document.querySelectorAll(".screen").forEach((screen) => {
        screen.classList.toggle("active", screen.dataset.screen === target);
      });
      haptic(8);
    });
  });

  const playSteps = document.querySelectorAll(".play-step");
  playSteps.forEach((step) => {
    step.addEventListener("click", () => setPlayStep(step.dataset.step));
  });
}

function setPlayStep(step) {
  state.playStep = step;
  document.querySelectorAll(".play-step").forEach((el) => {
    const s = el.dataset.step;
    el.classList.toggle("active", s === step);
    const order = { rooms: 1, spin: 2, play: 3 };
    el.classList.toggle("done", order[s] < order[step]);
  });
  document.querySelectorAll(".play-section").forEach((section) => {
    section.classList.toggle("active", section.id === `step${capitalize(step)}`);
  });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setWalletConnected(connected) {
  walletPill?.classList.toggle("connected", connected);
  walletPill?.setAttribute("aria-label", connected ? "Disconnect wallet" : "Connect wallet");
  walletPill?.setAttribute("title", connected ? "Click to disconnect" : "Click to connect");
  if (walletAction) {
    walletAction.classList.toggle("is-hidden", !connected);
    walletAction.setAttribute("aria-hidden", String(!connected));
  }
}

/* ===== WALLET ===== */
async function connectWallet(options = {}) {
  const { silent = false } = options;
  if (state.isConnecting) {
    updateStatus("Connection in progress…", "success");
    return;
  }

  state.isConnecting = true;
  if (!isMiniPayEnvironment()) {
    setConnectButtonLabel("Connecting…");
  }

  try {
    const { provider: activeProvider, account, type } = await connectWithFallback({ silent });
    state.provider = activeProvider;
    state.providerType = type;
    state.account = account;
    bindProviderEvents(activeProvider);

    walletAddress.textContent = shorten(account);
    walletAddress.dataset.fullAddress = account;
    walletAddress.dataset.shortAddress = shorten(account);
    walletAddress.title = "Click to disconnect";
    setWalletConnected(true);

    if (type === "minipay") {
      minipayBadge?.classList.remove("is-hidden");
      hideConnectButtons();
    } else {
      showConnectButtons();
      setConnectButtonLabel(type === "walletconnect" ? "Connected" : `${getProviderLabel(activeProvider)} connected`);
    }

    if (!silent || type !== "minipay") {
      updateStatus("Wallet connected! Pick a room and spin.", "success");
      showToast("Wallet connected", "success");
    }
    haptic(20);
    await refreshApp();
  } catch (error) {
    console.error("[GyroB] Wallet connection failed:", error);
    setWalletConnected(false);
    showConnectButtons();
    if (isMiniPayEnvironment()) {
      setConnectButtonLabel("Retry MiniPay");
      updateStatus("MiniPay connection failed. Tap retry.", "error");
    } else if (WALLETCONNECT_PROJECT_ID) {
      setConnectButtonLabel("Connect with WalletConnect");
      updateStatus(parseError(error), "error");
    } else {
      setConnectButtonLabel("Connect wallet");
      updateStatus(parseError(error), "error");
    }
    showToast(parseError(error), "error");
  } finally {
    state.isConnecting = false;
  }
}

async function disconnectWallet() {
  const provider = state.provider;
  const type = state.providerType;

  // Best-effort provider-side disconnect (WalletConnect supports this; injected wallets
  // typically don't expose a disconnect method, so we just clear local state).
  try {
    if (type === "walletconnect" && provider?.disconnect) {
      await provider.disconnect();
    }
  } catch (error) {
    console.warn("[GyroB] Provider disconnect failed:", error);
  }

  state.account = null;
  state.provider = null;
  state.providerType = null;
  state.walletConnectProvider = null;
  state.balance = null;
  state.allowance = null;

  walletAddress.textContent = "Connect";
  setWalletConnected(false);
  walletBalance.textContent = "-";
  allowanceValue.textContent = "-";

  showConnectButtons();
  if (isMiniPayEnvironment()) setConnectButtonLabel("Retry MiniPay");
  else if (WALLETCONNECT_PROJECT_ID) setConnectButtonLabel("Connect with WalletConnect");
  else setConnectButtonLabel("Connect wallet");

  updateStatus("Wallet disconnected.", "error");
  showToast("Wallet disconnected", "error");
  haptic(10);
  await refreshApp();
}

async function initConnection() {
  const detected = getProvider();
  if (detected?.type === "minipay") {
    console.info("[GyroB] MiniPay detected → auto connecting");
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await connectWallet({ silent: true });
    } catch (error) {
      console.error("[GyroB] MiniPay auto-connect failed:", error);
    }
  }
}

async function refreshApp() {
  if (!CONTRACT_ADDRESS) {
    renderRooms([]);
    syncControls();
    return;
  }

  try {
    const roomIds = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "getRoomIds",
    });

    const rooms = await Promise.all(
      roomIds.map(async (roomId) => {
        const result = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: gyrobAbi,
          functionName: "rooms",
          args: [roomId],
        });
        const [entryFee, currentRound, playerCount, totalPot, highestSpin, exists] = result;
        return { roomId, entryFee, currentRound, playerCount, totalPot, highestSpin, exists };
      }),
    );

    state.rooms = rooms;

    if (!state.selectedRoomId && rooms.length > 0) {
      state.selectedRoomId = rooms[0].roomId;
    }

    renderRooms(rooms);
    await syncTreasuryBalance();
    await syncAccountState();
    await renderSelectedRoom();
    syncControls();
  } catch (error) {
    updateStatus(parseError(error), "error");
    setLoading(roomList, false);
    roomList.setAttribute("aria-busy", "false");
  }
}

async function syncAccountState() {
  if (!state.account) {
    state.balance = null;
    state.allowance = null;
    walletBalance.textContent = "-";
    allowanceValue.textContent = "-";
    syncTreasuryControls();
    return;
  }

  const reads = [
    publicClient.readContract({
      address: USDM_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [state.account],
    }),
    publicClient.readContract({
      address: USDM_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [state.account, CONTRACT_ADDRESS],
    }),
  ];

  // Fetch treasury balance in parallel (independent of room selection).
  if (CONTRACT_ADDRESS) {
    reads.push(
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: gyrobAbi,
        functionName: "treasuryBalance",
      }),
    );
  }

  const results = await Promise.all(reads);
  const [balance, allowance, treasury] = results;

  state.balance = balance;
  state.allowance = allowance;
  if (treasury != null) {
    state.treasuryBalance = treasury;
    treasuryBalanceValue.textContent = `${formatUSDm(treasury)} USDm`;
  }

  walletBalance.textContent = `${formatUSDm(balance)} USDm`;
  allowanceValue.textContent = `${formatUSDm(allowance)} USDm`;
  syncControls();
  syncTreasuryControls();
}

async function renderSelectedRoom() {
  const room = getSelectedRoom();
  if (!room) {
    summaryRoom.textContent = "Select a room";
    summaryRound.textContent = "-";
    summaryPlayers.textContent = "-";
    summaryPot.textContent = "-";
    summaryHighSpin.textContent = "-";
    summaryPlayed.textContent = "-";
    playerList.innerHTML = '<p class="empty">Select a room first.</p>';
    renderSeatProgress(roundProgress, 0);
    return;
  }

  const tier = getRoomTier(room.roomId);
  summaryRoom.textContent = `${tier.label} • ${formatUSDm(room.entryFee)} USDm`;
  summaryRound.textContent = room.currentRound.toString();
  summaryPlayers.textContent = `${room.playerCount}/${MAX_PLAYERS}`;
  summaryPot.textContent = `${formatUSDm(room.totalPot)} USDm`;
  summaryHighSpin.textContent = room.highestSpin === 0n ? "—" : room.highestSpin.toString();

  const hasPlayed = state.account
    ? await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: gyrobAbi,
        functionName: "hasPlayed",
        args: [room.roomId, room.currentRound, state.account],
      })
    : false;

  summaryPlayed.textContent = hasPlayed ? "Yes" : "No";

  const players = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: gyrobAbi,
    functionName: "getRoundPlayers",
    args: [room.roomId, room.currentRound],
  });

  renderSeatProgress(roundProgress, room.playerCount, players, state.account?.toLowerCase());
  playerList.innerHTML = buildPlayerListHtml(players, room.highestSpin, state.account);
}

function renderRooms(rooms) {
  if (rooms.length === 0) {
    roomList.innerHTML = '<p class="empty">No rooms found. Seed rooms first.</p>';
    return;
  }

  roomList.innerHTML = rooms
    .map((room) => buildRoomCardHtml(room, state.selectedRoomId))
    .join("");

  for (const button of roomList.querySelectorAll("[data-room-id]")) {
    button.addEventListener("click", async () => {
      state.selectedRoomId = BigInt(button.dataset.roomId);
      haptic(10);
      renderRooms(state.rooms);
      await syncAccountState();
      await renderSelectedRoom();
      syncControls();
      setPlayStep("spin");
      showToast(`Room ${state.selectedRoomId} selected`, "success");
    });
  }
}

function buildSpinGrid() {
  spinGrid.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const spin = index + 1;
    return `<button class="spin-button" data-spin="${spin}" type="button">${spin}</button>`;
  }).join("");

  for (const button of spinGrid.querySelectorAll("[data-spin]")) {
    button.addEventListener("click", () => {
      state.selectedSpin = Number(button.dataset.spin);
      selectedSpinLabel.textContent = state.selectedSpin;

      for (const spinButton of spinGrid.querySelectorAll(".spin-button")) {
        spinButton.classList.toggle("active", spinButton === button);
      }

      haptic(8);
      syncControls();
      setPlayStep("play");
    });
  }
}

function buildTreasurySpinGrid() {
  if (!treasurySpinGrid) return;
  treasurySpinGrid.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const spin = index + 1;
    return `<button class="spin-button" data-treasury-spin="${spin}" type="button">${spin}</button>`;
  }).join("");

  for (const button of treasurySpinGrid.querySelectorAll("[data-treasury-spin]")) {
    button.addEventListener("click", () => {
      state.treasurySelectedSpin = Number(button.dataset.treasurySpin);
      treasurySelectedSpinLabel.textContent = state.treasurySelectedSpin;

      for (const spinButton of treasurySpinGrid.querySelectorAll(".spin-button")) {
        spinButton.classList.toggle("active", spinButton === button);
      }

      haptic(8);
      syncTreasuryControls();
    });
  }
}

function initModeToggle() {
  for (const btn of modeToggleBtns) {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      state.mode = mode;
      for (const b of modeToggleBtns) {
        b.classList.toggle("active", b === btn);
      }
      const showTreasury = mode === "treasury";
      treasuryPanel?.classList.toggle("active", showTreasury);
      playersPanel?.classList.toggle("active", !showTreasury);
      haptic(10);
      syncTreasuryControls();
      syncControls();
    });
  }
}

function parseStakeInput(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Convert USDm (human) to wei (18 decimals).
  return BigInt(Math.round(num * 1e18));
}

function syncTreasuryControls() {
  const hasWallet = Boolean(state.account);
  const hasSpin = Boolean(state.treasurySelectedSpin);
  const stake = state.treasuryStake;

  const canAfford =
    hasWallet &&
    stake != null &&
    state.balance != null &&
    state.allowance != null &&
    state.treasuryBalance != null &&
    validateTreasuryPlay({
      spin: state.treasurySelectedSpin ?? 0,
      stake,
      balance: state.balance,
      allowance: state.allowance,
      treasuryBalance: state.treasuryBalance,
    }).ok;

  if (treasuryApproveBtn) {
    treasuryApproveBtn.disabled = !hasWallet || !stake || !CONTRACT_ADDRESS;
  }
  if (treasuryPlayBtn) {
    treasuryPlayBtn.disabled = !hasWallet || !hasSpin || !stake || !CONTRACT_ADDRESS || !canAfford;
  }
}

async function syncTreasuryBalance() {
  if (!CONTRACT_ADDRESS) {
    treasuryBalanceValue.textContent = "-";
    return;
  }
  try {
    const balance = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "treasuryBalance",
    });
    state.treasuryBalance = balance;
    treasuryBalanceValue.textContent = `${formatUSDm(balance)} USDm`;
  } catch {
    treasuryBalanceValue.textContent = "-";
  }
}

async function approveTreasury() {
  const stake = state.treasuryStake;
  if (!stake || !state.account) return;

  try {
    treasuryApproveBtn.disabled = true;
    updateStatus("Submitting approval…", "success");
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: USDM_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, MAX_APPROVAL],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus("Waiting for approval confirmation…", "success");
    await publicClient.waitForTransactionReceipt({ hash });
    updateStatus("USDm approved! Ready to spin.", "success");
    showToast("USDm approved", "success");
    haptic(25);
    await syncAccountState();
    syncTreasuryControls();
  } catch (error) {
    updateStatus(parseError(error), "error");
    showToast(parseError(error), "error");
  } finally {
    syncTreasuryControls();
  }
}

async function playVsTreasury() {
  const spin = state.treasurySelectedSpin;
  const stake = state.treasuryStake;
  if (!spin || !stake || !state.account) return;

  const check = validateTreasuryPlay({
    spin,
    stake,
    balance: state.balance ?? 0n,
    allowance: state.allowance ?? 0n,
    treasuryBalance: state.treasuryBalance ?? 0n,
  });
  if (!check.ok) {
    updateStatus(check.error, "error");
    showToast(check.error, "error");
    return;
  }

  try {
    treasuryPlayBtn.disabled = true;
    treasuryResult.classList.add("is-hidden");
    playSpin();
    updateStatus(`Submitting spin ${spin} vs treasury…`, "success");
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "playVsTreasury",
      args: [BigInt(spin), stake],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus("Waiting for confirmation…", "success");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Parse the TreasuryPlayed event from the receipt to reveal the result.
    const logs = receipt.logs || [];
    let won = null;
    let treasurySpin = null;
    let payout = 0n;
    for (const log of logs) {
      try {
        const decoded = publicClient.decodeEventLog({
          abi: gyrobAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "TreasuryPlayed") {
          won = decoded.args.won;
          treasurySpin = decoded.args.treasurySpin;
          payout = decoded.args.payout;
        }
      } catch {
        // not a TreasuryPlayed log
      }
    }

    if (won === true) {
      const total = stake + payout;
      treasuryResult.innerHTML = `<div class="treasury-result__win">🎉 You won! Treasury spun <strong>${treasurySpin}</strong>, you spun <strong>${spin}</strong>. Payout: <strong>${formatUSDm(total)} USDm</strong> (stake + 70%).</div>`;
      updateStatus(`Win! Treasury spun ${treasurySpin}, you spun ${spin}.`, "success");
      showToast("You beat the treasury!", "success");
      playWin();
      haptic([20, 40, 20]);
    } else if (won === false) {
      treasuryResult.innerHTML = `<div class="treasury-result__lose">💀 You lost. Treasury spun <strong>${treasurySpin}</strong>, you spun <strong>${spin}</strong>. Your stake of ${formatUSDm(stake)} USDm went to the vault.</div>`;
      updateStatus(`Lost. Treasury spun ${treasurySpin}, you spun ${spin}.`, "error");
      showToast("Treasury won this round", "error");
      playLose();
    } else {
      treasuryResult.innerHTML = `<div>Spin confirmed. Check your transaction for details.</div>`;
      updateStatus("Treasury spin confirmed.", "success");
    }
    treasuryResult.classList.remove("is-hidden");

    state.treasurySelectedSpin = null;
    treasurySelectedSpinLabel.textContent = "None";
    for (const btn of treasurySpinGrid.querySelectorAll(".spin-button")) btn.classList.remove("active");

    await syncAccountState();
    await syncTreasuryBalance();
  } catch (error) {
    updateStatus(parseError(error), "error");
    playLose();
    showToast(parseError(error), "error");
  } finally {
    syncTreasuryControls();
  }
}

async function finalizeRoundEarly() {
  const room = getSelectedRoom();
  if (!room || !state.account) return;

  try {
    finalizeEarlyBtn.disabled = true;
    updateStatus("Finalizing round early…", "success");
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "finalizeRoundEarly",
      args: [room.roomId],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus("Waiting for confirmation…", "success");
    await publicClient.waitForTransactionReceipt({ hash });
    updateStatus(`Round ${room.currentRound} finalized early!`, "success");
    showToast("Round finalized", "success");
    haptic([20, 40, 20]);
    await refreshApp();
    await syncTreasuryBalance();
  } catch (error) {
    updateStatus(parseError(error), "error");
    showToast(parseError(error), "error");
  } finally {
    syncControls();
  }
}

async function approveRoom() {
  const room = getSelectedRoom();
  if (!room || !state.account) return;

  try {
    approveBtn.disabled = true;
    updateStatus("Submitting approval…", "success");
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: USDM_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, MAX_APPROVAL],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus("Waiting for approval confirmation…", "success");
    await publicClient.waitForTransactionReceipt({ hash });
    updateStatus("USDm approved! Ready to play.", "success");
    showToast("USDm approved", "success");
    haptic(25);
    await syncAccountState();
    syncControls();
  } catch (error) {
    updateStatus(parseError(error), "error");
    showToast(parseError(error), "error");
  } finally {
    syncControls();
  }
}

async function playRoom() {
  const room = getSelectedRoom();
  if (!room || !state.account || !state.selectedSpin) return;

  const check = validatePlay({
    spin: state.selectedSpin,
    entryFee: room.entryFee,
    balance: state.balance ?? 0n,
    allowance: state.allowance ?? 0n,
  });
  if (!check.ok) {
    updateStatus(check.error, "error");
    showToast(check.error, "error");
    return;
  }

  try {
    playBtn.disabled = true;
    playSpin();
    updateStatus(`Submitting spin ${state.selectedSpin}…`, "success");
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "play",
      args: [room.roomId, BigInt(state.selectedSpin)],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus("Waiting for confirmation…", "success");
    await publicClient.waitForTransactionReceipt({ hash });
    updateStatus(`Spin ${state.selectedSpin} confirmed in ${getRoomTier(room.roomId).label} room!`, "success");
    showToast(`Spin ${state.selectedSpin} played!`, "success");
    playWin();
    haptic([20, 40, 20]);
    state.selectedSpin = null;
    selectedSpinLabel.textContent = "None";
    for (const btn of spinGrid.querySelectorAll(".spin-button")) btn.classList.remove("active");
    await refreshApp();
    setPlayStep("rooms");
  } catch (error) {
    updateStatus(parseError(error), "error");
    playLose();
    showToast(parseError(error), "error");
  } finally {
    syncControls();
  }
}

function syncControls() {
  const hasWallet = Boolean(state.account);
  const room = getSelectedRoom();
  const hasRoom = Boolean(room);
  const hasSpin = Boolean(state.selectedSpin);

  const canAfford =
    hasWallet &&
    hasRoom &&
    state.balance != null &&
    state.allowance != null &&
    validateAffordability(room.entryFee, state.balance, state.allowance).ok;

  approveBtn.disabled = !hasWallet || !hasRoom || !CONTRACT_ADDRESS;
  playBtn.disabled = !hasWallet || !hasRoom || !hasSpin || !CONTRACT_ADDRESS || !canAfford;

  // Early-finalize is available once a room is selected with at least MIN_PLAYERS joined.
  if (finalizeEarlyBtn) {
    const canFinalizeEarly =
      hasWallet && hasRoom && room.playerCount >= BigInt(MIN_PLAYERS) && CONTRACT_ADDRESS;
    finalizeEarlyBtn.disabled = !canFinalizeEarly;
  }

  if (hasRoom && hasSpin && hasWallet) setPlayStep("play");
  else if (hasRoom) setPlayStep(state.selectedSpin ? "play" : "spin");
}

function getSelectedRoom() {
  return state.rooms.find((room) => room.roomId === state.selectedRoomId);
}

function getProvider() {
  if (typeof window === "undefined") return null;

  const ethereum = window.ethereum;
  if (!ethereum) return null;

  if (ethereum.isMiniPay) {
    return { provider: ethereum, type: "minipay" };
  }

  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    const provider = ethereum.providers.find((c) => c.isMetaMask)
      || ethereum.providers.find((c) => c.isCoinbaseWallet)
      || ethereum.providers[0];
    return { provider, type: "injected" };
  }

  return { provider: ethereum, type: "injected" };
}


async function getWalletClient() {
  const detected = getProvider();
  const provider = state.provider || detected?.provider || await getWalletConnectProvider();
  if (!provider) throw new Error("Wallet not connected.");
  return createWalletClient({ chain: celo, transport: custom(provider) });
}

function bindProviderEvents(provider) {
  if (!provider?.on || provider.__gyrobBound) return;
  provider.__gyrobBound = true;

  provider.on("accountsChanged", async (accounts) => {
    state.account = accounts?.[0] || null;
    if (state.account) {
      walletAddress.textContent = shorten(state.account);
      walletAddress.title = "Click to disconnect";
    } else {
      walletAddress.textContent = "Connect";
      walletAddress.title = "Click to connect";
    }
    setWalletConnected(Boolean(state.account));
    if (!state.account) {
      walletBalance.textContent = "-";
      allowanceValue.textContent = "-";
      state.provider = null;
      state.providerType = null;
      showConnectButtons();
      if (isMiniPayEnvironment()) setConnectButtonLabel("Retry MiniPay");
      else if (WALLETCONNECT_PROJECT_ID) setConnectButtonLabel("Connect with WalletConnect");
      else setConnectButtonLabel("Connect wallet");
    }
    await refreshApp();
  });

  provider.on("chainChanged", async () => { await refreshApp(); });

  provider.on("disconnect", async () => {
    state.account = null;
    state.provider = null;
    state.providerType = null;
    walletAddress.textContent = "Connect";
    setWalletConnected(false);
    walletBalance.textContent = "-";
    allowanceValue.textContent = "-";
    showConnectButtons();
    setConnectButtonLabel(isMiniPayEnvironment() ? "Retry MiniPay" : WALLETCONNECT_PROJECT_ID ? "Connect with WalletConnect" : "Connect wallet");
    updateStatus("Wallet disconnected.", "error");
    await refreshApp();
  });
}

function getProviderLabel(provider) {
  if (provider?.isMiniPay) return "MiniPay";
  if (isWalletConnectProvider(provider)) return "WalletConnect";
  if (provider?.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider?.isMetaMask) return "MetaMask";
  return "wallet";
}

function setConnectButtonLabel(label) {
  for (const button of connectButtons) button.textContent = label;
}

function showConnectButtons() { setConnectButtonsHidden(false); }
function hideConnectButtons() { setConnectButtonsHidden(true); }

function setConnectButtonsHidden(hidden) {
  for (const button of connectButtons) button.classList.toggle("is-hidden", hidden);
}

async function getWalletConnectProvider() {
  if (state.walletConnectProvider) return state.walletConnectProvider;
  if (!WALLETCONNECT_PROJECT_ID) return null;

  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const provider = await EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [42220],
    rpcMap: { 42220: RPC_URL },
    showQrModal: true,
    metadata: {
      name: "Gyro Board",
      description: "Spin-to-win USDm game on Celo",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.svg`],
    },
  });

  walletConnectProviders.add(provider);
  bindProviderEvents(provider);
  state.walletConnectProvider = provider;
  return provider;
}

async function requestAccount(provider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const [account] = accounts || provider.accounts || [];
  if (!account) throw new Error("Wallet did not return an account.");
  return account;
}

async function connectWithFallback(options = {}) {
  const { silent = false } = options;
  const detected = getProvider();

  if (!detected) {
    if (!silent) updateStatus("Opening WalletConnect…", "success");
    return connectWalletConnect();
  }

  const { provider, type } = detected;

  if (type === "minipay") {
    const account = await requestAccount(provider);
    return { provider, account, type };
  }

  if (type === "injected") {
    try {
      const account = await requestAccount(provider);
      await switchToCelo(provider);
      return { provider, account, type };
    } catch (error) {
      if (!silent) updateStatus(`${getProviderLabel(provider)} failed. Trying WalletConnect…`, "error");
    }
  }

  if (!silent) updateStatus("Opening WalletConnect…", "success");
  return connectWalletConnect();
}

function isWalletConnectProvider(provider) {
  return Boolean(provider) && walletConnectProviders.has(provider);
}

async function connectWalletConnect() {
  const provider = await getWalletConnectProvider();
  if (!provider) throw new Error("WalletConnect unavailable. Use MiniPay or a browser wallet.");

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0] || provider.accounts?.[0];
  if (!account) throw new Error("WalletConnect did not return an account.");

  state.walletConnectProvider = provider;
  return { account, provider, type: "walletconnect" };
}

async function switchToCelo(provider) {
  if (!provider) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4ec" }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0xa4ec",
        chainName: "Celo Mainnet",
        nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: ["https://celoscan.io"],
      }],
    });
  }
}

function updateStatus(message, tone = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-banner ${tone ? `is-${tone}` : ""}`.trim();
}

/* ===== PRACTICE MODE ===== */
function initPractice() {
  practiceSpinGrid.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return `<button class="spin-button" data-spin="${n}" type="button">${n}</button>`;
  }).join("");

  for (const btn of practiceSpinGrid.querySelectorAll("[data-spin]")) {
    btn.addEventListener("click", () => {
      practiceSelectedSpin = Number(btn.dataset.spin);
      for (const b of practiceSpinGrid.querySelectorAll(".spin-button")) {
        b.classList.toggle("active", b === btn);
      }
      practiceBtn.disabled = false;
      haptic(8);
    });
  }

  practiceBtn.addEventListener("click", runPracticeSpin);
}

function runPracticeSpin() {
  if (!practiceSelectedSpin) return;

  practiceBtn.disabled = true;
  practiceResult.classList.remove("is-hidden");
  practiceWheel?.classList.add("spinning");
  wheelDisplay.textContent = "?";

  let ticks = 0;
  const interval = setInterval(() => {
    wheelDisplay.textContent = Math.floor(Math.random() * 10) + 1;
    ticks++;
    if (ticks > 12) {
      clearInterval(interval);
      finishPracticeSpin();
    }
  }, 80);
}

function finishPracticeSpin() {
  const computerSpin = Math.floor(Math.random() * 10) + 1;
  practiceWheel?.classList.remove("spinning");
  wheelDisplay.textContent = practiceSelectedSpin;

  practiceYou.textContent = practiceSelectedSpin;
  practiceComp.textContent = computerSpin;
  practiceTotalPlayed += 1;
  practicePlayed.textContent = practiceTotalPlayed;

  let outcome;
  if (practiceSelectedSpin > computerSpin) {
    outcome = { text: "You win!", cls: "win" };
    practiceStreakCount += 1;
    playWin();
    haptic([15, 30, 15]);
  } else if (practiceSelectedSpin < computerSpin) {
    outcome = { text: "CPU wins!", cls: "lose" };
    practiceStreakCount = 0;
    playLose();
    haptic(10);
  } else {
    outcome = { text: "It's a tie!", cls: "tie" };
    practiceStreakCount = 0;
    playClick();
    haptic(12);
  }

  if (practiceStreakCount > practiceBestStreak) {
    practiceBestStreak = practiceStreakCount;
    practiceBest.textContent = practiceBestStreak;
  }
  practiceStreak.textContent = practiceStreakCount;

  practiceOutcome.textContent = outcome.text;
  practiceOutcome.className = `result-outcome ${outcome.cls}`;
  practiceBtn.disabled = false;

  practiceLog.unshift(`You ${practiceSelectedSpin} vs CPU ${computerSpin} — ${outcome.text}`);
  if (practiceLog.length > 15) practiceLog.length = 15;
  practiceHistory.innerHTML = practiceLog.map((l) => `<p>${l}</p>`).join("");

  if (outcome.cls === "win") { showToast(`Win! Streak: ${practiceStreakCount}`, "success"); if (isMiniPayEnvironment()) void shareMiniPayResult({ roomId: "practice", spin: practiceSelectedSpin, outcome: outcome.text }); }
}