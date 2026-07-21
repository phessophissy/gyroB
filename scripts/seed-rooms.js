// Seeds the default rooms on the deployed GyroBoard contract.
// Uses viem directly with explicit nonce management to avoid the
// "nonce too low" errors that occur when sending multiple txs rapidly
// through Hardhat's ethers wrapper on Celo's sequencer.
import "dotenv/config";

import { createPublicClient, createWalletClient, fallback, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

// Multiple Celo RPCs for resilience against transient timeouts/rate-limits.
const RPC_URLS = [
  process.env.CELO_RPC_URL || "https://forno.celo.org",
  "https://rpc.ankr.com/celo",
  "https://celo-rpc.publicnode.com",
].filter(Boolean);
const transport = fallback(
  RPC_URLS.map((url) => http(url, { timeout: 30_000, retryCount: 3 })),
  { rank: false },
);

// Minimal ABI for room seeding (kept local so the frontend ABI stays clean).
const SEED_ABI = [
  {
    type: "function",
    name: "createRoom",
    inputs: [
      { name: "roomId", type: "uint256" },
      { name: "entryFee", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getRoomIds",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
];

const CONTRACT = process.env.GYROB_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!CONTRACT || !PRIVATE_KEY) {
  console.error("Missing GYROB_CONTRACT_ADDRESS or DEPLOYER_PRIVATE_KEY in .env");
  process.exit(1);
}

const ROOMS = [
  { roomId: 1n, entryFee: parseUnits("0.02", 18) },
  { roomId: 2n, entryFee: parseUnits("5", 18) },
  { roomId: 3n, entryFee: parseUnits("10", 18) },
  { roomId: 4n, entryFee: parseUnits("100", 18) },
];

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: celo, transport });
const walletClient = createWalletClient({ account, chain: celo, transport });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Seeding rooms on", CONTRACT);
  console.log("Deployer:", account.address);

  // Fetch the current on-chain nonce and use it explicitly for each tx.
  let nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log("Starting nonce:", nonce);

  // Determine which rooms already exist so we can skip them (idempotent re-runs).
  let existing = [];
  try {
    existing = (await publicClient.readContract({ address: CONTRACT, abi: SEED_ABI, functionName: "getRoomIds" })).map((x) => x.toString());
  } catch {
    /* ignore */
  }
  console.log("Existing room IDs:", existing);

  // RoomAlreadyExists selector: 0x0158bcb8
  const ROOM_ALREADY_EXISTS = "0x0158bcb8";

  for (const room of ROOMS) {
    if (existing.includes(room.roomId.toString())) {
      console.log(`Skipping room ${room.roomId} (already exists)`);
      continue;
    }
    const feeLabel = String(room.entryFee / 10n ** 18n);
    let attempt = 0;
    let success = false;
    while (attempt < 4 && !success) {
      attempt += 1;
      try {
        console.log(`Creating room ${room.roomId} (fee ${feeLabel} USDm) nonce=${nonce} attempt=${attempt}`);
        const hash = await walletClient.writeContract({
          address: CONTRACT,
          abi: SEED_ABI,
          functionName: "createRoom",
          args: [room.roomId, room.entryFee],
          nonce,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`  ✓ room ${room.roomId} created in block ${receipt.blockNumber} (tx ${hash})`);
        nonce += 1;
        success = true;
        await sleep(2000);
      } catch (err) {
        const sig = err.data || (err.cause && err.cause.data) || "";
        if (typeof sig === "string" && sig.toLowerCase() === ROOM_ALREADY_EXISTS) {
          console.log(`  ✓ room ${room.roomId} already exists (treated as success)`);
          success = true;
          try {
            nonce = await publicClient.getTransactionCount({ address: account.address });
          } catch {
            /* ignore */
          }
          break;
        }
        console.warn(`  ✗ attempt ${attempt} failed: ${err.shortMessage || err.message}`);
        try {
          nonce = await publicClient.getTransactionCount({ address: account.address });
        } catch {
          /* ignore */
        }
        await sleep(4000);
      }
    }
    if (!success) {
      console.error(`Failed to create room ${room.roomId} after ${attempt} attempts. Aborting.`);
      process.exit(1);
    }
  }

  // Verify
  const ids = await publicClient.readContract({ address: CONTRACT, abi: SEED_ABI, functionName: "getRoomIds" });
  console.log("Final room IDs:", ids.map((x) => x.toString()));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
