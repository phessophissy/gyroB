/**
 * Spinning Board Game - Frontend Application
 * Uses @stacks/connect for wallet connection and transaction signing.
 */

import {
  AppConfig,
  UserSession,
  openContractCall,
  showConnect,
} from '@stacks/connect';
import {
  PostConditionMode,
  cvToHex,
  standardPrincipalCV,
  uintCV,
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';

const CONTRACT_ADDRESS = 'SP2KYZRNME33Y39GP3RKC90DQJ45EF1N0NZNVRE09';
const CONTRACT_NAME = 'spinning-board';
const NETWORK = new StacksMainnet();
const API_URL = 'https://stacks-node-api.mainnet.stacks.co';
const ACTIVITY_STORAGE_KEY = 'spinningb-session-activity';
const LAST_TX_STORAGE_KEY = 'spinningb-last-tx';
const PREFERENCES_STORAGE_KEY = 'spinningb-ui-preferences';
const MAX_ACTIVITY_ITEMS = 6;
const ROUND_CAPACITY = 10;
const REFRESH_INTERVAL_MS = 30000;

const state = {
  selectedSpin: null,
  connectedAddress: null,
  hasPlayed: false,
  isRefreshing: false,
  activity: loadStoredActivity(),
  lastTransaction: loadStoredTransaction(),
  statusTimer: null,
  activityFilter: 'all',
  lastRefreshAt: null,
  refreshCountdownTimer: null,
  autoRefreshTimer: null,
  autoRefreshEnabled: true,
  walletBalanceMicroStx: null,
  networkTip: null,
  theme: 'nebula',
  statsSnapshot: {
    round: null,
    players: 0,
    pot: 0,
    highest: 0,
  },
};

const appConfig = new AppConfig(['store_write']);
const userSession = new UserSession({ appConfig });

const connectBtn = document.getElementById('connectBtn');
const refreshStatsBtn = document.getElementById('refreshStatsBtn');
const playBtn = document.getElementById('playBtn');
const playBtnText = document.getElementById('playBtnText');
const statusMessage = document.getElementById('statusMessage');
const txHistory = document.getElementById('txHistory');
const txLink = document.getElementById('txLink');
const walletInfo = document.getElementById('walletInfo');
const walletStatusPill = document.getElementById('walletStatusPill');
const walletAddress = document.getElementById('walletAddress');
const connectionState = document.getElementById('connectionState');
const selectedSpinValue = document.getElementById('selectedSpinValue');
const selectionHint = document.getElementById('selectionHint');
const selectionSummary = document.getElementById('selectionSummary');
const lastUpdated = document.getElementById('lastUpdated');
const activityList = document.getElementById('activityList');
const roundCapacity = document.getElementById('roundCapacity');
const potSignal = document.getElementById('potSignal');
const currentRoundEl = document.getElementById('currentRound');
const playerCountEl = document.getElementById('playerCount');
const totalPotEl = document.getElementById('totalPot');
const highestSpinEl = document.getElementById('highestSpin');
const spinButtons = [...document.querySelectorAll('.spin-btn')];

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  connectBtn.addEventListener('click', handleWalletAction);
  refreshStatsBtn.addEventListener('click', () => {
    loadGameStats({ reason: 'manual', withStatus: true });
  });
  playBtn.addEventListener('click', playGame);

  spinButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectSpin(btn));
  });
  window.addEventListener('keydown', handleSpinShortcut);

  if (userSession.isUserSignedIn()) {
    const userData = userSession.loadUserData();
    state.connectedAddress = userData.profile.stxAddress.mainnet;
    state.hasPlayed = false;
    addActivity('Wallet session restored.');
  }

  renderActivity();
  renderLastTransaction();
  syncWalletUI();
  syncSelectionUI();
  loadGameStats({ reason: 'initial' });
  window.setInterval(() => loadGameStats({ reason: 'poll' }), 30000);

  if (state.connectedAddress) {
    checkIfAlreadyPlayed();
  }
}

function handleWalletAction() {
  if (state.connectedAddress) {
    disconnectWallet();
    return;
  }

  connectWallet();
}

function connectWallet() {
  showConnect({
    appDetails: {
      name: 'SpinningB Signal Room',
      icon: 'https://stacks.co/favicon.ico',
    },
    userSession,
    onFinish: () => {
      const userData = userSession.loadUserData();
      state.connectedAddress = userData.profile.stxAddress.mainnet;
      state.hasPlayed = false;
      syncWalletUI();
      addActivity('Wallet connected.');
      showStatus('Wallet connected. Choose a spin to prepare your move.', 'success');
      checkIfAlreadyPlayed();
    },
    onCancel: () => {
      showStatus('Wallet connection cancelled.', 'info');
      addActivity('Wallet connection was cancelled.');
    },
  });
}

function disconnectWallet() {
  userSession.signUserOut();
  state.connectedAddress = null;
  state.hasPlayed = false;
  syncWalletUI();
  showStatus('Wallet disconnected. You can reconnect anytime.', 'info');
  addActivity('Wallet disconnected.');
}

function syncWalletUI() {
  if (state.connectedAddress) {
    connectBtn.textContent = 'Disconnect Wallet';
    connectBtn.classList.add('connected');
    walletInfo.classList.remove('hidden');
    walletStatusPill.classList.toggle('locked', state.hasPlayed);
    walletStatusPill.textContent = state.hasPlayed ? 'Round locked' : 'Wallet live';
    walletAddress.textContent = formatAddress(state.connectedAddress);
    connectionState.textContent = `Connected as ${formatAddress(state.connectedAddress)}`;
  } else {
    connectBtn.textContent = 'Connect Wallet';
    connectBtn.classList.remove('connected');
    walletInfo.classList.add('hidden');
    walletStatusPill.classList.remove('locked');
    connectionState.textContent = 'Wallet not connected';
  }

  syncPlayButton();
}

function syncSelectionUI() {
  spinButtons.forEach((btn) => {
    const isSelected = Number(btn.dataset.spin) === state.selectedSpin;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', String(isSelected));
  });

  if (state.selectedSpin) {
    selectedSpinValue.textContent = `Spin ${state.selectedSpin}`;
    selectionHint.textContent = state.connectedAddress
      ? 'Ready to sign on mainnet as soon as you confirm the transaction.'
      : 'Connect a wallet to turn this selection into a signed move.';
    selectionSummary.textContent = `Spin ${state.selectedSpin} prepared`;
  } else {
    selectedSpinValue.textContent = 'No spin selected';
    selectionHint.textContent = 'Choose a number to prepare your transaction.';
    selectionSummary.textContent = 'No spin prepared';
  }

  syncPlayButton();
}

function syncPlayButton() {
  playBtn.classList.remove('loading');

  if (state.hasPlayed) {
    playBtn.disabled = true;
    playBtnText.textContent = 'Already Played This Round';
    if (state.connectedAddress) {
      walletStatusPill.textContent = 'Round locked';
    }
    return;
  }

  if (!state.connectedAddress) {
    playBtn.disabled = true;
    playBtnText.textContent = 'Connect Wallet to Play';
    return;
  }

  if (!state.selectedSpin) {
    playBtn.disabled = true;
    playBtnText.textContent = 'Select a Number';
    return;
  }

  playBtn.disabled = false;
  playBtnText.textContent = `Submit Spin ${state.selectedSpin}`;
}

async function loadGameStats({ reason = 'auto', withStatus = false } = {}) {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  refreshStatsBtn.disabled = true;
  refreshStatsBtn.classList.add('loading');
  refreshStatsBtn.textContent = reason === 'manual' ? 'Refreshing...' : 'Refresh stats';

  try {
    const [round, players, pot, highest] = await Promise.all([
      callReadOnly('get-current-round'),
      callReadOnly('get-player-count'),
      callReadOnly('get-total-pot'),
      callReadOnly('get-highest-spin'),
    ]);

    currentRoundEl.textContent = round;
    playerCountEl.textContent = `${players}/${ROUND_CAPACITY}`;
    totalPotEl.textContent = `${(pot / 1_000_000).toFixed(4)} STX`;
    highestSpinEl.textContent = highest > 0 ? highest : '-';

    const seatsLeft = Math.max(ROUND_CAPACITY - players, 0);
    roundCapacity.textContent = seatsLeft === 0 ? 'Round is full' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} open`;
    potSignal.textContent =
      pot > 0
        ? `${players} player${players === 1 ? '' : 's'} currently in the round`
        : 'No entries yet for this round';
    lastUpdated.textContent = formatTimestamp(new Date());

    if (withStatus) {
      showStatus('Round stats refreshed from mainnet.', 'info');
      addActivity('Stats manually refreshed.');
    }
  } catch (error) {
    console.error('Failed to load game stats:', error);
    if (withStatus) {
      showStatus('Could not refresh stats from mainnet right now.', 'error');
    }
    addActivity('Stats refresh failed.');
  } finally {
    state.isRefreshing = false;
    refreshStatsBtn.disabled = false;
    refreshStatsBtn.classList.remove('loading');
    refreshStatsBtn.textContent = 'Refresh stats';
  }
}

async function callReadOnly(functionName, args = [], sender = CONTRACT_ADDRESS) {
  const url = `${API_URL}/v2/contracts/call-read/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/${functionName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender,
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mainnet request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data.okay) {
    throw new Error(data.cause || 'Contract call failed');
  }

  return parseClarityValue(data.result);
}

function parseClarityValue(hex) {
  if (hex.startsWith('0x01')) {
    return Number.parseInt(hex.slice(4), 16);
  }

  if (hex === '0x03') return true;
  if (hex === '0x04') return false;
  return hex;
}

function selectSpin(btn) {
  state.selectedSpin = Number.parseInt(btn.dataset.spin, 10);
  syncSelectionUI();
  addActivity(`Prepared spin ${state.selectedSpin}.`);
}

function handleSpinShortcut(event) {
  const shortcutMap = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    0: 10,
  };

  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  ) {
    return;
  }

  const spin = shortcutMap[event.key];
  if (!spin) return;

  const targetButton = spinButtons.find((btn) => Number(btn.dataset.spin) === spin);
  if (targetButton) {
    selectSpin(targetButton);
  }
}

async function checkIfAlreadyPlayed() {
  if (!state.connectedAddress) return;

  try {
    const hasPlayed = await callReadOnly(
      'has-player-played',
      [cvToHex(standardPrincipalCV(state.connectedAddress))],
      state.connectedAddress
    );

    state.hasPlayed = Boolean(hasPlayed);
    syncWalletUI();

    if (state.hasPlayed) {
      showStatus('This wallet already played the current round. Wait for the next round to open.', 'info');
      addActivity('Detected an existing entry for this wallet in the current round.');
    }
  } catch (error) {
    console.error('Failed to check play status:', error);
  }
}

async function playGame() {
  if (!state.connectedAddress || !state.selectedSpin) {
    showStatus('Connect a wallet and select a spin number first.', 'error');
    return;
  }

  playBtn.disabled = true;
  playBtn.classList.add('loading');
  playBtnText.textContent = 'Submitting Transaction...';
  hideStatus();

  try {
    await openContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'play',
      functionArgs: [uintCV(state.selectedSpin)],
      network: NETWORK,
      postConditionMode: PostConditionMode.Allow,
      onFinish: ({ txId }) => {
        state.hasPlayed = true;
        syncWalletUI();
        persistLastTransaction(txId);
        renderLastTransaction();

        showStatus(`Transaction submitted for spin ${state.selectedSpin}.`, 'success');
        addActivity(`Submitted spin ${state.selectedSpin}. Transaction pending on mainnet.`);

        playBtn.classList.remove('loading');
        playBtnText.textContent = 'Transaction Pending...';

        window.setTimeout(() => loadGameStats({ reason: 'post-submit' }), 5000);
        window.setTimeout(() => {
          checkIfAlreadyPlayed();
          loadGameStats({ reason: 'post-submit' });
        }, 15000);
      },
      onCancel: () => {
        showStatus('Transaction cancelled before signing.', 'info');
        addActivity('Transaction signing was cancelled.');
        resetPlayButton();
      },
    });
  } catch (error) {
    console.error('Transaction error:', error);
    showStatus(`Transaction error: ${error.message}`, 'error');
    addActivity('Transaction submission failed before broadcast.');
    resetPlayButton();
  }
}

function resetPlayButton() {
  playBtn.classList.remove('loading');
  syncPlayButton();
}

function showStatus(message, type = 'info') {
  if (state.statusTimer) {
    window.clearTimeout(state.statusTimer);
  }

  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');

  if (type !== 'error') {
    state.statusTimer = window.setTimeout(() => {
      hideStatus();
    }, 7000);
  }
}

function hideStatus() {
  if (state.statusTimer) {
    window.clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }

  statusMessage.classList.add('hidden');
}

function addActivity(message) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    message,
    at: new Date().toISOString(),
  };

  state.activity = [entry, ...state.activity].slice(0, MAX_ACTIVITY_ITEMS);
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(state.activity));
  renderActivity();
}

function renderActivity() {
  if (!state.activity.length) {
    activityList.innerHTML = '<li class="activity-empty">No local activity yet. Connect a wallet or refresh stats.</li>';
    return;
  }

  activityList.innerHTML = '';

  state.activity.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = `${formatTimestamp(entry.at)} · ${entry.message}`;
    activityList.appendChild(item);
  });
}

function renderLastTransaction() {
  if (!state.lastTransaction) {
    txHistory.classList.add('hidden');
    return;
  }

  txHistory.classList.remove('hidden');
  txLink.href = `https://explorer.stacks.co/txid/${state.lastTransaction}?chain=mainnet`;
  txLink.textContent = `${state.lastTransaction.slice(0, 20)}...`;
}

function loadStoredActivity() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function loadStoredTransaction() {
  try {
    return localStorage.getItem(LAST_TX_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistLastTransaction(txId) {
  state.lastTransaction = txId;
  localStorage.setItem(LAST_TX_STORAGE_KEY, txId);
}

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
