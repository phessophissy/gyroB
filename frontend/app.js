import { createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, getAddress, http } from "viem";
import { celo } from "viem/chains";

const USDM_ADDRESS = getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a");
const CONTRACT_ADDRESS = normalizeAddress(import.meta.env.VITE_GYROB_CONTRACT_ADDRESS || "");
const RPC_URL = import.meta.env.VITE_CELO_RPC_URL || "https://forno.celo.org";
const MAX_APPROVAL = 2n ** 256n - 1n;

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
};

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

function normalizeAddress(value) {
  if (!value) {
    return "";
  }

  return getAddress(value.toLowerCase());
}

function init() {
  buildSpinGrid();
  for (const button of connectButtons) {
    button.addEventListener("click", connectWallet);
  }
  refreshBtn.addEventListener("click", refreshApp);
  approveBtn.addEventListener("click", approveRoom);
  playBtn.addEventListener("click", playRoom);

  const provider = getProvider();
  state.provider = provider;

  if (provider) {
    setConnectButtonLabel(provider.isMiniPay ? "MiniPay ready" : `Connect ${getProviderLabel(provider)}`);
    bindProviderEvents(provider);
  }

  if (!CONTRACT_ADDRESS) {
    updateStatus("Connect your wallet to enter a room and submit a spin.", "success");
  }

  refreshApp();

  if (provider?.isMiniPay) {
    void connectWallet({ silent: true });
  }
}

async function connectWallet(options = {}) {
  const { silent = false } = options;

  try {
    const provider = getProvider();
    if (!provider) {
      updateStatus("No supported wallet was detected. Open Gyro Board in MiniPay or use an injected Celo wallet.", "error");
      return;
    }

    state.provider = provider;
    await switchToCelo(provider);
    const [account] = await provider.request({ method: "eth_requestAccounts" });
    state.account = account;

    walletAddress.textContent = shorten(account);
    setConnectButtonLabel(provider.isMiniPay ? "MiniPay connected" : `${getProviderLabel(provider)} connected`);

    if (!silent || !provider.isMiniPay) {
      updateStatus("Wallet connected. Choose a room, approve USDm, then submit one spin.", "success");
    }
    await refreshApp();
  } catch (error) {
    updateStatus(parseError(error), "error");
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
        const room = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: gyrobAbi,
          functionName: "rooms",
          args: [roomId],
        });

        return { roomId, ...room };
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

  const selectedRoom = getSelectedRoom();
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
  allowanceValue.textContent = selectedRoom ? `${formatUSDm(allowance)} USDm` : `${formatUSDm(allowance)} USDm`;
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
    playerList.innerHTML = '<p class="empty-state">Select a room to inspect the active round.</p>';
    return;
  }

  summaryRoom.textContent = `Room ${room.roomId} • ${formatUSDm(room.entryFee)} USDm`;
  summaryRound.textContent = room.currentRound.toString();
  summaryPlayers.textContent = `${room.playerCount}/10`;
  summaryPot.textContent = `${formatUSDm(room.totalPot)} USDm`;
  summaryHighSpin.textContent = room.highestSpin === 0n ? "None yet" : room.highestSpin.toString();

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

  if (players.length === 0) {
    playerList.innerHTML = '<p class="empty-state">No players have joined this round yet.</p>';
    return;
  }

  playerList.innerHTML = players
    .map(
      (player, index) => `
        <article class="player-item">
          <div class="player-row">
            <span class="metric-label">Seat ${index + 1}</span>
            <code>${shorten(player.player)}</code>
          </div>
          <strong>Spin ${player.spin}</strong>
        </article>
      `,
    )
    .join("");
}

function renderRooms(rooms) {
  if (rooms.length === 0) {
    roomList.innerHTML = '<p class="empty-state">No rooms found yet. Deploy and create room tiers first.</p>';
    return;
  }

  roomList.innerHTML = rooms
    .map((room) => {
      const active = room.roomId === state.selectedRoomId ? "active" : "";
      return `
        <button class="room-card ${active}" type="button" data-room-id="${room.roomId}">
          <span class="room-chip">${formatUSDm(room.entryFee)} USDm entry</span>
          <h3>Room ${room.roomId}</h3>
          <div class="room-meta">
            <div>
              <span class="metric-label">Round</span>
              <strong>${room.currentRound}</strong>
            </div>
            <div>
              <span class="metric-label">Players</span>
              <strong>${room.playerCount}/10</strong>
            </div>
          </div>
          <div class="room-meta">
            <div>
              <span class="metric-label">Pot</span>
              <strong>${formatUSDm(room.totalPot)} USDm</strong>
            </div>
            <div>
              <span class="metric-label">High spin</span>
              <strong>${room.highestSpin === 0n ? "-" : room.highestSpin}</strong>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  for (const button of roomList.querySelectorAll("[data-room-id]")) {
    button.addEventListener("click", async () => {
      state.selectedRoomId = BigInt(button.dataset.roomId);
      renderRooms(state.rooms);
      await syncAccountState();
      await renderSelectedRoom();
      syncControls();
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
      selectedSpinLabel.textContent = `Spin ${state.selectedSpin}`;

      for (const spinButton of spinGrid.querySelectorAll(".spin-button")) {
        spinButton.classList.toggle("active", spinButton === button);
      }

      syncControls();
    });
  }
}

async function approveRoom() {
  const room = getSelectedRoom();
  if (!room || !state.account) return;

  try {
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: USDM_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, MAX_APPROVAL],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus(`Approval submitted: ${shorten(hash)}`, "success");
    await publicClient.waitForTransactionReceipt({ hash });
    updateStatus(`USDm approval confirmed for Room ${room.roomId}.`, "success");
    await syncAccountState();
    syncControls();
  } catch (error) {
    updateStatus(parseError(error), "error");
  }
}

async function playRoom() {
  const room = getSelectedRoom();
  if (!room || !state.account || !state.selectedSpin) return;

  try {
    const walletClient = await getWalletClient();
    const { request } = await publicClient.simulateContract({
      address: CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "play",
      args: [room.roomId, BigInt(state.selectedSpin)],
      account: state.account,
    });

    const hash = await walletClient.writeContract(request);
    updateStatus(`Play submitted: ${shorten(hash)}`, "success");
    await publicClient.waitForTransactionReceipt({ hash });
    updateStatus(`Spin ${state.selectedSpin} confirmed in Room ${room.roomId}.`, "success");
    await refreshApp();
  } catch (error) {
    updateStatus(parseError(error), "error");
  }
}

function syncControls() {
  const hasWallet = Boolean(state.account);
  const hasRoom = Boolean(getSelectedRoom());
  const hasSpin = Boolean(state.selectedSpin);

  approveBtn.disabled = !hasWallet || !hasRoom || !CONTRACT_ADDRESS;
  playBtn.disabled = !hasWallet || !hasRoom || !hasSpin || !CONTRACT_ADDRESS;
}

function getSelectedRoom() {
  return state.rooms.find((room) => room.roomId === state.selectedRoomId);
}

function getProvider() {
  const ethereum = window.ethereum;
  if (!ethereum) {
    return null;
  }

  const providers = Array.isArray(ethereum.providers) && ethereum.providers.length > 0
    ? ethereum.providers
    : [ethereum];

  return providers.find((provider) => provider.isMiniPay)
    || providers.find((provider) => provider.isCoinbaseWallet)
    || providers.find((provider) => provider.isMetaMask)
    || providers[0]
    || null;
}

async function getWalletClient() {
  const provider = getProvider();
  await switchToCelo(provider);
  return createWalletClient({ chain: celo, transport: custom(provider) });
}

function bindProviderEvents(provider) {
  if (!provider?.on) {
    return;
  }

  provider.on("accountsChanged", async (accounts) => {
    state.account = accounts?.[0] || null;
    walletAddress.textContent = state.account ? shorten(state.account) : "Not connected";
    if (!state.account) {
      walletBalance.textContent = "-";
      allowanceValue.textContent = "-";
      setConnectButtonLabel(provider.isMiniPay ? "MiniPay ready" : `Connect ${getProviderLabel(provider)}`);
    }
    await refreshApp();
  });

  provider.on("chainChanged", async () => {
    await refreshApp();
  });
}

function getProviderLabel(provider) {
  if (provider?.isMiniPay) {
    return "MiniPay";
  }

  if (provider?.isCoinbaseWallet) {
    return "Coinbase Wallet";
  }

  if (provider?.isMetaMask) {
    return "MetaMask";
  }

  return "wallet";
}

function setConnectButtonLabel(label) {
  for (const button of connectButtons) {
    button.textContent = label;
  }
}

async function switchToCelo(provider) {
  if (!provider) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xa4ec" }],
    });
  } catch (error) {
    if (error.code !== 4902) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0xa4ec",
          chainName: "Celo Mainnet",
          nativeCurrency: {
            name: "CELO",
            symbol: "CELO",
            decimals: 18,
          },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ["https://celoscan.io"],
        },
      ],
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
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function updateStatus(message, tone = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${tone ? `is-${tone}` : ""}`.trim();
}

function parseError(error) {
  return error?.shortMessage || error?.message || "Transaction failed.";
}
