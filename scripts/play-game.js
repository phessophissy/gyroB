#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { StacksMainnet } from '@stacks/network';
import {
  AnchorMode,
  PostConditionMode,
  TransactionVersion,
  getAddressFromPrivateKey,
  makeContractCall,
  uintCV,
} from '@stacks/transactions';
import { generateSecretKey, generateWallet, getStxAddress } from '@stacks/wallet-sdk';

const CONTRACT_ADDRESS = 'SP2KYZRNME33Y39GP3RKC90DQJ45EF1N0NZNVRE09';
const CONTRACT_NAME = 'spinning-board';
const FUNCTION_NAME = 'play';
const MAINNET_API_URL = process.env.STACKS_API_URL || 'https://stacks-node-api.mainnet.stacks.co';
const DEFAULT_WALLETS_FILE = 'generated/mainnet-wallets.json';
const DEFAULT_WALLETS_CSV_FILE = 'generated/mainnet-wallets.csv';
const ENTRY_FEE_USTX = 1000n;

const network = new StacksMainnet({ url: MAINNET_API_URL });

main().catch(error => {
  console.error(`[fatal] ${error.message}`);
  process.exit(1);
});

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'generate') {
    await runGenerate(args);
    return;
  }

  if (command === 'play') {
    await runPlay(args);
    return;
  }

  throw new Error(`Unknown command "${command}". Use "generate" or "play".`);
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

function printUsage() {
  console.log(`
SpinningB Mainnet Wallet Tool

Commands:
  generate                  Generate Stacks mainnet wallets
  play                      Submit contract calls from generated wallets

Examples:
  node scripts/play-game.js generate --count 50
  node scripts/play-game.js play --wallets generated/mainnet-wallets.json --count 10 --spin random --dry-run
  node scripts/play-game.js play --wallets generated/mainnet-wallets.json --count 10 --spin random --fee 3000 --delay-ms 1200

Generate options:
  --count <n>               Number of wallets to create (default: 50)
  --out <path>              JSON output path (default: generated/mainnet-wallets.json)
  --csv <path>              CSV output path (default: generated/mainnet-wallets.csv)

Play options:
  --wallets <path>          Wallet JSON file (default: generated/mainnet-wallets.json)
  --count <n>               Number of wallets to use (default: all)
  --start-index <n>         Start from wallet index in file (default: 0)
  --spin <1-10|random>      Spin value or random (default: random)
  --fee <ustx>              Fee per transaction in microSTX (default: 3000)
  --delay-ms <n>            Delay between tx broadcasts (default: 1000)
  --dry-run                 Build plan only; do not broadcast
  --check-balance           In dry-run mode, also query live balances
`);
}

async function runGenerate(args) {
  const count = toPositiveInt(args.count, 50);
  const outFile = resolvePath(args.out || DEFAULT_WALLETS_FILE);
  const csvFile = resolvePath(args.csv || DEFAULT_WALLETS_CSV_FILE);

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.mkdir(path.dirname(csvFile), { recursive: true });

  const wallets = [];

  for (let i = 0; i < count; i += 1) {
    const secretKey = generateSecretKey(128);
    const wallet = await generateWallet({
      secretKey,
      password: `local-${Date.now()}-${i}`,
    });

    const account = wallet.accounts[0];
    const address = getStxAddress({
      account,
      transactionVersion: TransactionVersion.Mainnet,
    });

    wallets.push({
      index: i,
      address,
      privateKey: account.stxPrivateKey,
      mnemonic: secretKey,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    network: 'mainnet',
    contract: {
      address: CONTRACT_ADDRESS,
      name: CONTRACT_NAME,
      functionName: FUNCTION_NAME,
      entryFeeMicroSTX: ENTRY_FEE_USTX.toString(),
    },
    wallets,
  };

  await fs.writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.chmod(outFile, 0o600).catch(() => {});

  const csvRows = [
    'index,address,privateKey,mnemonic',
    ...wallets.map(w => `${w.index},${w.address},${w.privateKey},"${w.mnemonic}"`),
  ];
  await fs.writeFile(csvFile, `${csvRows.join('\n')}\n`, 'utf8');
  await fs.chmod(csvFile, 0o600).catch(() => {});

  console.log(`[ok] Generated ${wallets.length} wallets (mainnet).`);
  console.log(`[ok] JSON saved to ${outFile}`);
  console.log(`[ok] CSV saved to ${csvFile}`);
  console.log('[warn] These files contain private keys and mnemonics. Keep them offline and secure.');
}

async function runPlay(args) {
  const walletsPath = resolvePath(args.wallets || DEFAULT_WALLETS_FILE);
  const startIndex = toNonNegativeInt(args['start-index'], 0);
  const limit = args.count ? toPositiveInt(args.count, 0) : null;
  const spinArg = String(args.spin || 'random').toLowerCase();
  const fee = BigInt(toPositiveInt(args.fee, 3000));
  const delayMs = toNonNegativeInt(args['delay-ms'], 1000);
  const dryRun = Boolean(args['dry-run']);
  const checkBalance = Boolean(args['check-balance']);

  const payload = JSON.parse(await fs.readFile(walletsPath, 'utf8'));
  const allWallets = Array.isArray(payload) ? payload : payload.wallets;

  if (!Array.isArray(allWallets) || allWallets.length === 0) {
    throw new Error(`No wallets found in ${walletsPath}`);
  }

  const selected = allWallets.slice(startIndex, limit ? startIndex + limit : undefined);

  if (selected.length === 0) {
    throw new Error('Wallet selection is empty. Check --start-index and --count values.');
  }

  console.log(`[info] Network: mainnet (${MAINNET_API_URL})`);
  console.log(`[info] Contract: ${CONTRACT_ADDRESS}.${CONTRACT_NAME}::${FUNCTION_NAME}`);
  console.log(`[info] Wallets selected: ${selected.length}`);
  console.log(`[info] Mode: ${dryRun ? 'dry-run' : 'broadcast'}`);

  for (let i = 0; i < selected.length; i += 1) {
    const wallet = selected[i];
    try {
      validateWalletRecord(wallet, i);

      const address =
        wallet.address || getAddressFromPrivateKey(wallet.privateKey, TransactionVersion.Mainnet);
      const spin = resolveSpin(spinArg);
      const minRequired = ENTRY_FEE_USTX + fee;
      const label = `[wallet ${wallet.index ?? i}] ${address}`;

      if (dryRun && !checkBalance) {
        console.log(`${label} -> dry-run play(${spin}), fee=${fee}`);
        await sleep(delayMs);
        continue;
      }

      const accountState = await fetchAccountState(address);
      const balance = accountState.balance;
      if (balance < minRequired) {
        console.log(`${label} -> skipped (insufficient balance: ${balance} < ${minRequired})`);
        await sleep(delayMs);
        continue;
      }

      if (dryRun) {
        console.log(
          `${label} -> dry-run play(${spin}), fee=${fee}, balance=${balance}, nonce=${accountState.nonce}`
        );
        await sleep(delayMs);
        continue;
      }

      const tx = await makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: FUNCTION_NAME,
        functionArgs: [uintCV(spin)],
        senderKey: wallet.privateKey,
        network,
        fee,
        nonce: accountState.nonce,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      });

      const txId = await broadcastRawTxWithCurl(tx.serialize());
      console.log(`${label} -> tx submitted: ${txId} (spin=${spin})`);
    } catch (error) {
      const label = `[wallet ${wallet.index ?? i}] ${wallet.address || 'unknown-address'}`;
      console.log(`${label} -> failed: ${error.message}`);
    }

    await sleep(delayMs);
  }

  console.log('[done] Batch play run completed.');
}

function validateWalletRecord(wallet, idx) {
  if (!wallet || typeof wallet !== 'object') {
    throw new Error(`Invalid wallet at index ${idx}`);
  }
  if (typeof wallet.privateKey !== 'string' || wallet.privateKey.length < 64) {
    throw new Error(`Wallet at index ${idx} is missing a valid privateKey`);
  }
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

function resolveSpin(spinArg) {
  if (spinArg === 'random') {
    return Math.floor(Math.random() * 10) + 1;
  }

  const spin = Number.parseInt(spinArg, 10);
  if (!Number.isInteger(spin) || spin < 1 || spin > 10) {
    throw new Error(`Invalid --spin value "${spinArg}". Use 1-10 or random.`);
  }

  return spin;
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
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
