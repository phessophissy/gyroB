import { createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, getAddress, http } from "viem";
import { celo } from "viem/chains";

const USDM_ADDRESS = getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a");
const CONTRACT_ADDRESS = normalizeAddress(import.meta.env.VITE_GYROB_CONTRACT_ADDRESS || "");
const RPC_URL = normalizeEnvValue(import.meta.env.VITE_CELO_RPC_URL) || "https://forno.celo.org";
const WALLETCONNECT_PROJECT_ID = normalizeEnvValue(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID) || "";
const MAX_APPROVAL = 2n ** 256n - 1n;

const ROOM_TIERS = {
  1n: { label: "Bronze", cls: "bronze" },
  2n: { label: "Silver", cls: "silver" },
  3n: { label: "Gold", cls: "gold" },
  4n: { label: "Diamond", cls: "diamond" },
};

const AVATAR_COLORS = ["#a882ff", "#ff6bcb", "#4de8ff", "#ffd166", "#5dffa0", "#ff9de0", "#7b9fff", "#ff8b6b", "#c4f0ff", "#ffb347"];

const gyrobAbi = [
  {
    type: "function",
    name: "rooms",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "entryFee", type: "uint256" },
      { name: "currentRound", type: "uint256" },
      { name: "playerCount", type: "uint256" },
      { name: "totalPot", type: "uint256" },
      { name: "highestSpin", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getRoomIds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getRoundPlayers",
    stateMutability: "view",
    inputs: [
      { name: "roomId", type: "uint256" },
      { name: "round", type: "uint256" },
    ],
    outputs: [
      {
        name: "players",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "spin", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "hasPlayed",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "play",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roomId", type: "uint256" },
      { name: "spin", type: "uint256" },
    ],
    outputs: [],
  },
];

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
const minipayBadge = document.getElementById("minipayBadge");
const toastContainer = document.getElementById("toastContainer");
const roundProgress = document.getElementById("roundProgress");

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

function normalizeEnvValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAddress(value) {
  const normalizedValue = normalizeEnvValue(value);
  if (!normalizedValue) {
    return "";
  }
  return getAddress(normalizedValue.toLowerCase());
}

function init() {
  buildSpinGrid();
  for (const button of connectButtons) {
    button.addEventListener("click", connectWallet);
  }
  walletPill?.addEventListener("click", () => {
    if (!state.account) connectWallet();
  });
  refreshBtn.addEventListener("click", () => {
    haptic(10);
    refreshBtn.classList.add("spinning");
    refreshApp().finally(() => refreshBtn.classList.remove("spinning"));
  });
  approveBtn.addEventListener("click", approveRoom);
  playBtn.addEventListener("click", playRoom);

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
function initNavigation() {
  const navItems = document.querySelectorAll(".bottom-nav .nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.tab;
      navItems.forEach((n) => n.classList.toggle("active", n === item));
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

/* ===== TOASTS & HAPTICS ===== */
function showToast(message, tone = "") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone ? `toast--${tone}` : ""}`.trim();
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function setWalletConnected(connected) {
  walletPill?.classList.toggle("connected", connected);
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
    await syncAccountState();
    await renderSelectedRoom();
    syncControls();
  } catch (error) {
    updateStatus(parseError(error), "error");
  }
}

async function syncAccountState() {
  if (!state.account || !state.selectedRoomId) {
    walletBalance.textContent = "-";
    allowanceValue.textContent = "-";
    return;
  }

  const [balance, allowance] = await Promise.all([
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
  ]);

  walletBalance.textContent = `${formatUSDm(balance)} USDm`;
  allowanceValue.textContent = `${formatUSDm(allowance)} USDm`;
}

function renderSeatProgress(playerCount, players = []) {
  if (!roundProgress) return;
  const myAddr = state.account?.toLowerCase();
  roundProgress.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const filled = i < Number(playerCount);
    const player = players[i];
    const isYou = player && myAddr && player.player.toLowerCase() === myAddr;
    const cls = [filled ? "filled" : "", isYou ? "you" : ""].filter(Boolean).join(" ");
    return `<div class="seat ${cls}" title="Seat ${i + 1}">${filled ? i + 1 : ""}</div>`;
  }).join("");
}

function getRoomTier(roomId) {
  return ROOM_TIERS[roomId] || { label: "Room", cls: "bronze" };
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
    renderSeatProgress(0);
    return;
  }

  const tier = getRoomTier(room.roomId);
  summaryRoom.textContent = `${tier.label} • ${formatUSDm(room.entryFee)} USDm`;
  summaryRound.textContent = room.currentRound.toString();
  summaryPlayers.textContent = `${room.playerCount}/10`;
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

  renderSeatProgress(room.playerCount, players);

  if (players.length === 0) {
    playerList.innerHTML = '<p class="empty">Waiting for players… Be the first!</p>';
    return;
  }

  const highSpin = room.highestSpin;
  playerList.innerHTML = players
    .map((player, index) => {
      const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
      const isLeader = highSpin > 0n && player.spin === highSpin;
      const isYou = state.account && player.player.toLowerCase() === state.account.toLowerCase();
      return `
        <article class="player-item">
          <div class="player-avatar" style="background:${color}22;color:${color}">${index + 1}</div>
          <div class="player-info">
            <code>${isYou ? "You" : shorten(player.player)}</code>
          </div>
          <span class="player-spin ${isLeader ? "leader" : ""}">${player.spin}</span>
        </article>
      `;
    })
    .join("");
}

function renderRooms(rooms) {
  if (rooms.length === 0) {
    roomList.innerHTML = '<p class="empty">No rooms found. Seed rooms first.</p>';
    return;
  }

  roomList.innerHTML = rooms
    .map((room) => {
      const active = room.roomId === state.selectedRoomId ? "active" : "";
      const tier = getRoomTier(room.roomId);
      const fillPct = (Number(room.playerCount) / 10) * 100;
      return `
        <button class="room-card ${active}" type="button" data-room-id="${room.roomId}">
          <span class="room-tier room-tier--${tier.cls}">${tier.label}</span>
          <h3>Room ${room.roomId}</h3>
          <div class="room-meta">
            <div>
              <span class="metric-label">Entry</span>
              <strong>${formatUSDm(room.entryFee)} USDm</strong>
            </div>
            <div>
              <span class="metric-label">Pot</span>
              <strong>${formatUSDm(room.totalPot)}</strong>
            </div>
          </div>
          <div class="room-meta">
            <div>
              <span class="metric-label">Round</span>
              <strong>#${room.currentRound}</strong>
            </div>
            <div>
              <span class="metric-label">Players</span>
              <strong>${room.playerCount}/10</strong>
            </div>
          </div>
          <div class="room-fill">
            <div class="room-fill__bar" style="width:${fillPct}%"></div>
          </div>
        </button>
      `;
    })
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

  try {
    playBtn.disabled = true;
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
    haptic([20, 40, 20]);
    state.selectedSpin = null;
    selectedSpinLabel.textContent = "None";
    for (const btn of spinGrid.querySelectorAll(".spin-button")) btn.classList.remove("active");
    await refreshApp();
    setPlayStep("rooms");
  } catch (error) {
    updateStatus(parseError(error), "error");
    showToast(parseError(error), "error");
  } finally {
    syncControls();
  }
}

function syncControls() {
  const hasWallet = Boolean(state.account);
  const hasRoom = Boolean(getSelectedRoom());
  const hasSpin = Boolean(state.selectedSpin);

  approveBtn.disabled = !hasWallet || !hasRoom || !CONTRACT_ADDRESS;
  playBtn.disabled = !hasWallet || !hasRoom || !hasSpin || !CONTRACT_ADDRESS;

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

function isMiniPayEnvironment() {
  return Boolean(typeof window !== "undefined" && window.ethereum?.isMiniPay);
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
    walletAddress.textContent = state.account ? shorten(state.account) : "Connect";
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

function formatUSDm(value) {
  return Number(formatUnits(value, 18)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function shorten(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function updateStatus(message, tone = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-banner ${tone ? `is-${tone}` : ""}`.trim();
}

function parseError(error) {
  return error?.shortMessage || error?.message || "Transaction failed.";
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
    haptic([15, 30, 15]);
  } else if (practiceSelectedSpin < computerSpin) {
    outcome = { text: "CPU wins!", cls: "lose" };
    practiceStreakCount = 0;
    haptic(10);
  } else {
    outcome = { text: "It's a tie!", cls: "tie" };
    practiceStreakCount = 0;
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

  if (outcome.cls === "win") showToast(`Win! Streak: ${practiceStreakCount}`, "success");
}