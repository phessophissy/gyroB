#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { StacksMainnet } from '@stacks/network';
import {
  AnchorMode,
  TransactionVersion,
  makeSTXTokenTransfer,
} from '@stacks/transactions';
import { generateWallet, getStxAddress } from '@stacks/wallet-sdk';

const EXPECTED_FUNDER_ADDRESS = 'SP1QPNQB6R3EFMTQYGHG9J7N03S3K52ARSE1VEVX4';
const MAINNET_API_URL = process.env.STACKS_API_URL || 'https://stacks-node-api.mainnet.stacks.co';
const DEFAULT_WALLETS_FILE = 'generated/mainnet-wallets.json';
const DEFAULT_ENV_FILE = '.env';
const network = new StacksMainnet({ url: MAINNET_API_URL });

main().catch(error => {
  console.error(`[fatal] ${error.message}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printUsage();
    return;
  }

  const envFile = resolvePath(args.dotenv || DEFAULT_ENV_FILE);
  await loadDotEnv(envFile);

  const mnemonic = (process.env.FUNDER_MNEMONIC || '').trim();
  if (!mnemonic) {
    throw new Error(`FUNDER_MNEMONIC is missing. Add it to ${envFile}`);
  }

  const password = process.env.FUNDER_WALLET_PASSWORD || 'local-funder-password';
  const funder = await deriveFunderFromMnemonic(mnemonic, password);

  if (funder.address !== EXPECTED_FUNDER_ADDRESS) {
    throw new Error(
      `Mnemonic does not resolve to expected funder address. Expected ${EXPECTED_FUNDER_ADDRESS}, got ${funder.address}`
    );
  }

  const walletsPath = resolvePath(args.wallets || DEFAULT_WALLETS_FILE);
  const recipients = await loadRecipients(walletsPath);

  const startIndex = toNonNegativeInt(args['start-index'], 0);
  const count = args.count ? toPositiveInt(args.count, 0) : recipients.length;
  const selected = recipients.slice(startIndex, startIndex + count);

  if (selected.length === 0) {
    throw new Error('No recipient wallets selected. Check --start-index and --count.');
  }

  const amount = parseAmount(args);
  const fee = BigInt(toPositiveInt(args.fee, 3000));
  const delayMs = toNonNegativeInt(args['delay-ms'], 1200);
  const memo = String(args.memo || 'SpinningB funding').slice(0, 34);
  const dryRun = Boolean(args['dry-run']);

  const totalTransfers = amount * BigInt(selected.length);
  const totalFees = fee * BigInt(selected.length);
  const totalRequired = totalTransfers + totalFees;

  const funderAccount = await fetchAccountState(funder.address);
  const funderBalance = funderAccount.balance;
  const startingNonce = funderAccount.nonce;

  console.log(`[info] Network: mainnet (${MAINNET_API_URL})`);
  console.log(`[info] Funder: ${funder.address}`);
  console.log(`[info] Recipients selected: ${selected.length}`);
  console.log(`[info] Amount each: ${amount} uSTX`);
  console.log(`[info] Fee each: ${fee} uSTX`);
  console.log(`[info] Total required: ${totalRequired} uSTX`);
  console.log(`[info] Funder balance: ${funderBalance} uSTX`);
  console.log(`[info] Starting nonce: ${startingNonce}`);
  console.log(`[info] Mode: ${dryRun ? 'dry-run' : 'broadcast'}`);

  if (funderBalance < totalRequired) {
    throw new Error(
      `Insufficient funder balance. Need ${totalRequired} uSTX, available ${funderBalance} uSTX.`
    );
  }

  for (let i = 0; i < selected.length; i += 1) {
    const recipient = selected[i];
    const nonce = startingNonce + BigInt(i);
    const label = `[wallet ${recipient.index ?? i}] ${recipient.address}`;

    if (dryRun) {
      console.log(`${label} -> dry-run transfer ${amount} uSTX, nonce=${nonce}`);
      await sleep(delayMs);
      continue;
    }

    const tx = await makeSTXTokenTransfer({
      recipient: recipient.address,
      amount,
      fee,
      nonce,
      memo,
      senderKey: funder.privateKey,
      network,
      anchorMode: AnchorMode.Any,
    });

    const txId = await broadcastRawTxWithCurl(tx.serialize());
    console.log(`${label} -> tx submitted: ${txId}`);

    await sleep(delayMs);
  }

  console.log('[done] Funding run completed.');
}

function printUsage() {
  console.log(`
SpinningB Mainnet Funding Tool

Loads funder mnemonic from .env, verifies it matches:
  ${EXPECTED_FUNDER_ADDRESS}

Usage:
  node scripts/fund-wallets.js --amount-ustx 50000 --count 50 --dry-run

Options:
  --dotenv <path>           Env file path (default: .env)
  --wallets <path>          Wallet list JSON (default: generated/mainnet-wallets.json)
  --amount-ustx <n>         Amount per wallet in microSTX (required if --amount-stx not provided)
  --amount-stx <n>          Amount per wallet in STX (example: 0.02)
  --count <n>               Number of wallets to fund (default: all selected)
  --start-index <n>         Start index in wallet file (default: 0)
  --fee <ustx>              Fee per transfer tx in microSTX (default: 3000)
  --delay-ms <n>            Delay between tx broadcasts (default: 1200)
  --memo <text>             Transfer memo, max 34 chars (default: "SpinningB funding")
  --dry-run                 Print the plan without broadcasting

Required .env vars:
  FUNDER_MNEMONIC="word1 word2 ..."

Optional .env vars:
  FUNDER_WALLET_PASSWORD="anything"
`);
}

function parseArgs(tokens) {
  const args = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = tokens[i + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

async function loadDotEnv(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Env file not found at ${filePath}`);
  }

  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

async function deriveFunderFromMnemonic(mnemonic, password) {
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password,
  });

  const account = wallet.accounts[0];
  const address = getStxAddress({
    account,
    transactionVersion: TransactionVersion.Mainnet,
  });

  return {
    address,
    privateKey: account.stxPrivateKey,
  };
}

async function loadRecipients(filePath) {
  const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const wallets = Array.isArray(payload) ? payload : payload.wallets;

  if (!Array.isArray(wallets) || wallets.length === 0) {
    throw new Error(`No wallets found in ${filePath}`);
  }

  const result = [];

  for (let i = 0; i < wallets.length; i += 1) {
    const wallet = wallets[i];
    if (!wallet || typeof wallet !== 'object') {
      throw new Error(`Invalid wallet entry at index ${i}`);
    }

    const address = String(wallet.address || '').trim();
    if (!address) {
      throw new Error(`Wallet entry at index ${i} is missing an address`);
    }

    result.push({
      index: wallet.index ?? i,
      address,
    });
  }

  return result;
}

function parseAmount(args) {
  if (args['amount-ustx']) {
    return BigInt(toPositiveInt(args['amount-ustx'], 0));
  }

  if (args['amount-stx']) {
    return stxToMicroStx(String(args['amount-stx']));
  }

  throw new Error('Amount is required. Use --amount-ustx or --amount-stx.');
}

function stxToMicroStx(stxAmount) {
  const normalized = stxAmount.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error(`Invalid --amount-stx value "${stxAmount}"`);
  }

  const [whole, fractional = ''] = normalized.split('.');
  const wholePart = BigInt(whole) * 1000000n;
  const fractionalPart = BigInt((fractional + '000000').slice(0, 6));
  const result = wholePart + fractionalPart;

  if (result <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  return result;
}

async function fetchAccountState(address) {
  const url = `${MAINNET_API_URL}/v2/accounts/${address}?proof=0`;
  const { body, status } = await curlRequest({
    url,
    method: 'GET',
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Could not fetch account state for ${address}: HTTP ${status} ${body}`);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid account response for ${address}: ${body}`);
  }

  return {
    balance: BigInt(payload?.balance || '0'),
    nonce: BigInt(payload?.nonce ?? '0'),
  };
}

async function broadcastRawTxWithCurl(serializedTx) {
  const url = `${MAINNET_API_URL}/v2/transactions`;
  const { body, status } = await curlRequest({
    url,
    method: 'POST',
    headers: ['Content-Type: application/octet-stream'],
    body: Buffer.from(serializedTx),
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Broadcast failed: HTTP ${status} ${body}`);
  }

  const txId = body.trim().replace(/^"+|"+$/g, '');
  if (!txId) {
    throw new Error(`Broadcast returned empty txid: ${body}`);
  }

  return txId;
}

async function curlRequest({ url, method = 'GET', headers = [], body = null }) {
  const args = ['-sS', '-X', method, ...headers.flatMap(header => ['-H', header])];

  if (body !== null) {
    args.push('--data-binary', '@-');
  }

  args.push('-w', '\n%{http_code}', url);

  const stdout = execFileSync('curl', args, {
    encoding: 'utf8',
    input: body,
    maxBuffer: 10 * 1024 * 1024,
  });

  const splitAt = stdout.lastIndexOf('\n');
  if (splitAt === -1) {
    throw new Error(`Unexpected curl output: ${stdout}`);
  }

  const responseBody = stdout.slice(0, splitAt);
  const codeText = stdout.slice(splitAt + 1).trim();
  const status = Number.parseInt(codeText, 10);

  if (!Number.isInteger(status)) {
    throw new Error(`Invalid HTTP status from curl: ${codeText}`);
  }

  return { body: responseBody, status };
}

function toPositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }
  return n;
}

function toNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Expected a non-negative integer, got "${value}"`);
  }
  return n;
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
