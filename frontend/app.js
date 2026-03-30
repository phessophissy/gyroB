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
const heroConnectBtn = document.getElementById('heroConnectBtn');
const jumpToConsoleBtn = document.getElementById('jumpToConsoleBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
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
const roundPulseValue = document.getElementById('roundPulseValue');
const roundPulseHint = document.getElementById('roundPulseHint');
const lastUpdated = document.getElementById('lastUpdated');
const activityList = document.getElementById('activityList');
const clearActivityBtn = document.getElementById('clearActivityBtn');
const toggleRefreshBtn = document.getElementById('toggleRefreshBtn');
const activityFilterButtons = [...document.querySelectorAll('[data-activity-filter]')];
const roundCapacity = document.getElementById('roundCapacity');
const potSignal = document.getElementById('potSignal');
const currentRoundEl = document.getElementById('currentRound');
const playerCountEl = document.getElementById('playerCount');
const totalPotEl = document.getElementById('totalPot');
const highestSpinEl = document.getElementById('highestSpin');
const seatsOpenEl = document.getElementById('seatsOpen');
const seatsSignal = document.getElementById('seatsSignal');
const winnerTakeEl = document.getElementById('winnerTake');
const winnerTakeSignal = document.getElementById('winnerTakeSignal');
const roundProgressFill = document.getElementById('roundProgressFill');
const roundProgressLabel = document.getElementById('roundProgressLabel');
const roundTempo = document.getElementById('roundTempo');
const roundPressure = document.getElementById('roundPressure');
const spinPosture = document.getElementById('spinPosture');
const payoutStance = document.getElementById('payoutStance');
const winningRead = document.getElementById('winningRead');
const refreshModeLabel = document.getElementById('refreshModeLabel');
const nextRefreshLabel = document.getElementById('nextRefreshLabel');
const conservativeSpin = document.getElementById('conservativeSpin');
const aggressiveSpin = document.getElementById('aggressiveSpin');
const roundStory = document.getElementById('roundStory');
const splitNote = document.getElementById('splitNote');
const chainTip = document.getElementById('chainTip');
const nodeHealth = document.getElementById('nodeHealth');
const walletBalance = document.getElementById('walletBalance');
const playBudget = document.getElementById('playBudget');
const spinButtons = [...document.querySelectorAll('.spin-btn')];
const quickSpinButtons = [...document.querySelectorAll('[data-quick-spin]')];

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  const storedPreferences = loadStoredPreferences();
  state.autoRefreshEnabled = storedPreferences.autoRefreshEnabled ?? true;
  state.theme = storedPreferences.theme || 'nebula';

  connectBtn.addEventListener('click', handleWalletAction);
  heroConnectBtn.addEventListener('click', handleWalletAction);
  jumpToConsoleBtn.addEventListener('click', () => {
    document.getElementById('gameSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  themeToggleBtn.addEventListener('click', () => {
    state.theme = state.theme === 'sunrise' ? 'nebula' : 'sunrise';
    applyTheme();
    savePreferences();
    addActivity(`Theme switched to ${state.theme}.`);
  });
  refreshStatsBtn.addEventListener('click', () => {
    loadGameStats({ reason: 'manual', withStatus: true });
  });
  playBtn.addEventListener('click', playGame);

  spinButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectSpin(btn));
  });
  activityFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActivityFilter(button.dataset.activityFilter || 'all');
    });
  });
  clearActivityBtn.addEventListener('click', () => {
    state.activity = [];
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify([]));
    renderActivity();
    showStatus('Local session activity cleared.', 'info');
  });
  toggleRefreshBtn.addEventListener('click', () => {
    state.autoRefreshEnabled = !state.autoRefreshEnabled;
    savePreferences();
    startAutoRefreshLoop();
    addActivity(state.autoRefreshEnabled ? 'Auto refresh resumed.' : 'Auto refresh paused.');
  });
  window.addEventListener('keydown', handleSpinShortcut);

  if (userSession.isUserSignedIn()) {
    const userData = userSession.loadUserData();
    state.connectedAddress = userData.profile.stxAddress.mainnet;
    state.hasPlayed = false;
    addActivity('Wallet session restored.');
  }

  setActivityFilter(state.activityFilter);
  renderLastTransaction();
  applyTheme();
  syncWalletUI();
  syncSelectionUI();
  refreshWalletDesk();
  refreshNetworkDesk();
  loadGameStats({ reason: 'initial' });
  startAutoRefreshLoop();

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
      refreshWalletDesk();
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
  refreshWalletDesk();
  showStatus('Wallet disconnected. You can reconnect anytime.', 'info');
  addActivity('Wallet disconnected.');
}

function syncWalletUI() {
  if (state.connectedAddress) {
    connectBtn.textContent = 'Disconnect Wallet';
    heroConnectBtn.textContent = 'Wallet connected';
    connectBtn.classList.add('connected');
    heroConnectBtn.disabled = true;
    walletInfo.classList.remove('hidden');
    walletStatusPill.classList.toggle('locked', state.hasPlayed);
    walletStatusPill.textContent = state.hasPlayed ? 'Round locked' : 'Wallet live';
    walletAddress.textContent = formatAddress(state.connectedAddress);
    connectionState.textContent = `Connected as ${formatAddress(state.connectedAddress)}`;
  } else {
    connectBtn.textContent = 'Connect Wallet';
    heroConnectBtn.textContent = 'Enter the room';
    connectBtn.classList.remove('connected');
    heroConnectBtn.disabled = false;
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
    spinPosture.textContent =
      state.selectedSpin >= 8 ? 'Aggressive upper-board play' : state.selectedSpin >= 5 ? 'Balanced middle-board play' : 'Low-board contrarian play';
  } else {
    selectedSpinValue.textContent = 'No spin selected';
    selectionHint.textContent = 'Choose a number to prepare your transaction.';
    selectionSummary.textContent = 'No spin prepared';
    spinPosture.textContent = 'Choose a spin';
  }

  renderSelectionRead();
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

function updateRefreshLabels() {
  refreshModeLabel.textContent = state.autoRefreshEnabled ? 'Every 30 seconds' : 'Manual refresh only';
  toggleRefreshBtn.textContent = state.autoRefreshEnabled ? 'Pause auto refresh' : 'Resume auto refresh';

  if (!state.autoRefreshEnabled || !state.lastRefreshAt) {
    nextRefreshLabel.textContent = state.lastRefreshAt ? 'Waiting for manual refresh' : 'Waiting for first refresh';
    return;
  }

  const nextRefreshAt = state.lastRefreshAt + REFRESH_INTERVAL_MS;
  nextRefreshLabel.textContent = nextRefreshAt <= Date.now() ? 'Refreshing soon' : formatCountdown(nextRefreshAt - Date.now());
}

function startAutoRefreshLoop() {
  if (state.autoRefreshTimer) {
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
  if (state.refreshCountdownTimer) {
    window.clearInterval(state.refreshCountdownTimer);
    state.refreshCountdownTimer = null;
  }

  if (state.autoRefreshEnabled) {
    state.autoRefreshTimer = window.setInterval(() => loadGameStats({ reason: 'poll' }), REFRESH_INTERVAL_MS);
    state.refreshCountdownTimer = window.setInterval(updateRefreshLabels, 1000);
  }

  updateRefreshLabels();
}

function renderSeatSignals() {
  const seatsLeft = Math.max(ROUND_CAPACITY - state.statsSnapshot.players, 0);
  seatsOpenEl.textContent = seatsLeft;
  seatsSignal.textContent = seatsLeft <= 2 ? 'Late round pressure' : seatsLeft <= 5 ? 'Round building' : 'Plenty of room';
}

function renderPrizeSignals() {
  const playerPrizeMicroStx = Math.floor(state.statsSnapshot.pot / 2);
  winnerTakeEl.textContent = state.statsSnapshot.pot > 0 ? formatStx(playerPrizeMicroStx) : '- STX';
  winnerTakeSignal.textContent =
    state.statsSnapshot.pot > 0 ? 'Half of the current pot goes to players' : 'Prize appears after the first paid entry';
}

function renderRoundPulse() {
  const { players, highest, pot } = state.statsSnapshot;
  roundPulseValue.textContent =
    players === 0 ? 'Fresh round' : players >= 8 ? 'Crowded close' : highest >= 9 ? 'High-spin heat' : 'Room still shaping';
  roundPulseHint.textContent =
    pot > 0 ? `${players} player${players === 1 ? '' : 's'} in the pot, current top spin ${highest || '-'}.` : 'No paid entries have landed in this round yet.';
}

function renderRoundProgress() {
  const ratio = Math.min(Math.max(state.statsSnapshot.players / ROUND_CAPACITY, 0), 1);
  roundProgressFill.style.width = `${(ratio * 100).toFixed(2)}%`;
  roundProgressFill.parentElement?.setAttribute('aria-valuenow', String(state.statsSnapshot.players));
  roundProgressLabel.textContent =
    state.statsSnapshot.players === 0
      ? 'Round has not started yet'
      : `${state.statsSnapshot.players} of ${ROUND_CAPACITY} seats filled`;
}

function renderRoundStrategy() {
  const { players, highest } = state.statsSnapshot;
  roundTempo.textContent = players >= 8 ? 'Late-stage round, expect sharper closing choices' : players >= 4 ? 'Mid-round tempo with room to reposition' : 'Early round with plenty of board space';
  roundPressure.textContent = players >= 8 ? 'Heavy pressure' : players >= 5 ? 'Moderate pressure' : 'Light pressure';
  conservativeSpin.textContent = highest >= 7 ? `Need ${highest} or better pressure awareness` : 'Middle-to-high spins still in play';
  aggressiveSpin.textContent = highest >= 9 ? 'Only top-end numbers can overtake now' : 'Upper-board plays can still seize control';
  roundStory.textContent = highest > 0 ? `Current high spin is ${highest} with ${players} seat${players === 1 ? '' : 's'} filled.` : 'No benchmark spin has been set yet.';
  splitNote.textContent = players > 1 ? 'Equal top spins split the player-side prize evenly.' : 'Single entry rounds still respect the normal split rules.';
}

function renderSelectionRead() {
  const { highest, pot } = state.statsSnapshot;

  if (!state.selectedSpin) {
    payoutStance.textContent = 'Waiting for current pot';
    winningRead.textContent = 'Needs chain sync';
    return;
  }

  payoutStance.textContent = pot > 0 ? `${formatStx(Math.floor(pot / 2))} player-side prize on the line` : 'First entry sets the pot in motion';
  if (highest === 0) {
    winningRead.textContent = 'No spin benchmark yet in this round';
  } else if (state.selectedSpin > highest) {
    winningRead.textContent = 'Your prepared spin currently leads the board';
  } else if (state.selectedSpin === highest) {
    winningRead.textContent = 'Your prepared spin would currently tie the lead';
  } else {
    winningRead.textContent = `Your prepared spin trails the current high of ${highest}`;
  }
}

function renderDerivedDashboard() {
  renderSeatSignals();
  renderPrizeSignals();
  renderRoundPulse();
  renderRoundProgress();
  renderRoundStrategy();
  renderSelectionRead();
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
    refreshNetworkDesk();

    currentRoundEl.textContent = round;
    playerCountEl.textContent = `${players}/${ROUND_CAPACITY}`;
    totalPotEl.textContent = formatStx(pot);
    highestSpinEl.textContent = highest > 0 ? highest : '-';
    state.statsSnapshot = { round, players, pot, highest };

    const seatsLeft = Math.max(ROUND_CAPACITY - players, 0);
    roundCapacity.textContent = seatsLeft === 0 ? 'Round is full' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} open`;
    potSignal.textContent =
      pot > 0
        ? `${players} player${players === 1 ? '' : 's'} currently in the round`
        : 'No entries yet for this round';
    state.lastRefreshAt = Date.now();
    lastUpdated.textContent = formatTimestamp(new Date());
    updateRefreshLabels();
    renderDerivedDashboard();
    refreshWalletDesk();

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

async function fetchNetworkInfo() {
  const response = await fetch(`${API_URL}/v2/info`);
  if (!response.ok) {
    throw new Error(`Network info request failed with status ${response.status}`);
  }

  return response.json();
}

async function refreshNetworkDesk() {
  try {
    const info = await fetchNetworkInfo();
    state.networkTip = info.stacks_tip_height ?? info.burn_block_height ?? null;
    chainTip.textContent = state.networkTip ? `Tip ${state.networkTip}` : 'Tip unavailable';
    nodeHealth.textContent = 'Mainnet online';
  } catch (error) {
    console.error('Failed to fetch network info:', error);
    chainTip.textContent = 'Tip unavailable';
    nodeHealth.textContent = 'Mainnet degraded';
  }
}

async function fetchWalletBalance(address) {
  const response = await fetch(`${API_URL}/extended/v1/address/${address}/stx`);
  if (!response.ok) {
    throw new Error(`Balance request failed with status ${response.status}`);
  }

  return response.json();
}

async function refreshWalletDesk() {
  if (!state.connectedAddress) {
    state.walletBalanceMicroStx = null;
    walletBalance.textContent = 'Connect wallet';
    playBudget.textContent = 'Waiting for balance';
    return;
  }

  try {
    const balanceData = await fetchWalletBalance(state.connectedAddress);
    state.walletBalanceMicroStx = Number(balanceData.balance || 0);
    walletBalance.textContent = formatStx(state.walletBalanceMicroStx);
    playBudget.textContent = `${Math.floor(state.walletBalanceMicroStx / 1000).toLocaleString()} entries at 0.001 STX`;
  } catch (error) {
    console.error('Failed to fetch wallet balance:', error);
    walletBalance.textContent = 'Balance unavailable';
    playBudget.textContent = 'Could not estimate budget';
  }
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

function applyQuickSpin(mode) {
  const spin =
    mode === 'low' ? 2
      : mode === 'mid' ? 5
        : mode === 'high' ? 9
          : Math.floor(Math.random() * ROUND_CAPACITY) + 1;

  const targetButton = spinButtons.find((button) => Number(button.dataset.spin) === spin);
  if (targetButton) {
    selectSpin(targetButton);
  }
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
    kind:
      /wallet|theme/i.test(message) ? 'wallet' : /spin|round|stats|transaction|play/i.test(message) ? 'game' : 'all',
    at: new Date().toISOString(),
  };

  state.activity = [entry, ...state.activity].slice(0, MAX_ACTIVITY_ITEMS);
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(state.activity));
  renderActivity();
}

function renderActivity() {
  const visibleActivity = state.activity.filter((entry) => {
    if (state.activityFilter === 'all') return true;
    return entry.kind === state.activityFilter;
  });

  if (!visibleActivity.length) {
    activityList.innerHTML =
      state.activityFilter === 'all'
        ? '<li class="activity-empty">No local activity yet. Connect a wallet or refresh stats.</li>'
        : `<li class="activity-empty">No ${state.activityFilter} activity yet in this session.</li>`;
    return;
  }

  activityList.innerHTML = '';

  visibleActivity.forEach((entry) => {
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

function loadStoredPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePreferences() {
  localStorage.setItem(
    PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      autoRefreshEnabled: state.autoRefreshEnabled,
      theme: state.theme,
    })
  );
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

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme === 'sunrise' ? 'sunrise' : 'nebula');
  themeToggleBtn.textContent = state.theme === 'sunrise' ? 'Switch to nebula' : 'Switch theme';
}

function setActivityFilter(nextFilter) {
  state.activityFilter = nextFilter;
  activityFilterButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.activityFilter === nextFilter);
  });
  renderActivity();
}

function formatStx(valueMicroStx) {
  return `${(Number(valueMicroStx) / 1_000_000).toFixed(4)} STX`;
}

function formatMicroStxToCount(valueMicroStx) {
  return Number(valueMicroStx) / 1_000_000;
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

function formatCountdown(msRemaining) {
  const totalSeconds = Math.max(Math.ceil(msRemaining / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
