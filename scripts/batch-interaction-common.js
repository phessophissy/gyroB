import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  maxUint256,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CELO_RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";
const GYROB_CONTRACT_ADDRESS = process.env.GYROB_CONTRACT_ADDRESS || "0xa0C01234FEEA3401dE13598b3ef823afe0a9672B";
const USDM_ADDRESS = process.env.USDM_ADDRESS || "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const TX_DELAY_MS = Number(process.env.TX_DELAY_MS || "250");

const gyrobAbi = parseAbi([
  "function getRoomIds() view returns (uint256[])",
  "function rooms(uint256) view returns (uint256 entryFee, uint256 currentRound, uint256 playerCount, uint256 totalPot, uint256 highestSpin, bool exists)",
  "function hasPlayed(uint256 roomId, uint256 round, address player) view returns (bool)",
  "function play(uint256 roomId, uint256 spin)",
]);

const publicClient = createPublicClient({
  chain: celo,
  transport: http(CELO_RPC_URL),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatToken(value) {
  return `${formatUnits(value, 18)} USDm`;
}

function formatNative(value) {
  return `${formatUnits(value, 18)} CELO`;
}

function normalizeRoom(room) {
  return {
    entryFee: room[0],
    currentRound: room[1],
    playerCount: room[2],
    totalPot: room[3],
    highestSpin: room[4],
    exists: room[5],
  };
}

function buildSpin(index) {
  return BigInt((index % 10) + 1);
}

async function loadBatchWallets(batchFileName) {
  const walletFile = path.resolve(__dirname, "..", "generated", batchFileName);
  const fileContents = await readFile(walletFile, "utf8");
  return {
    walletFile,
    wallets: JSON.parse(fileContents),
  };
}

async function ensureAllowance(walletClient, account, entryFee) {
  const allowance = await publicClient.readContract({
    address: USDM_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, GYROB_CONTRACT_ADDRESS],
  });

  if (allowance >= entryFee) {
    return false;
  }

  const { request } = await publicClient.simulateContract({
    address: USDM_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [GYROB_CONTRACT_ADDRESS, maxUint256],
    account: account.address,
  });

  const hash = await walletClient.writeContract({
    ...request,
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  // Wait for RPC node to reflect the new allowance
  await sleep(2000);
  return true;
}

async function playRoom(walletClient, account, roomId, spin) {
  const { request } = await publicClient.simulateContract({
    address: GYROB_CONTRACT_ADDRESS,
    abi: gyrobAbi,
    functionName: "play",
    args: [roomId, spin],
    account: account.address,
  });

  const hash = await walletClient.writeContract({
    ...request,
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function runBatchInteractions({
  batchLabel,
  batchFileName,
  roomId,
}) {
  const normalizedRoomId = BigInt(roomId);
  const { walletFile, wallets } = await loadBatchWallets(batchFileName);

  console.log(`Running ${batchLabel} from ${walletFile}`);
  console.log(`Contract: ${GYROB_CONTRACT_ADDRESS}`);
  console.log(`USDm: ${USDM_ADDRESS}`);
  console.log(`RPC: ${CELO_RPC_URL}`);
  console.log(`Target room: ${normalizedRoomId.toString()}`);

  const room = normalizeRoom(await publicClient.readContract({
    address: GYROB_CONTRACT_ADDRESS,
    abi: gyrobAbi,
    functionName: "rooms",
    args: [normalizedRoomId],
  }));

  if (!room.exists) {
    const roomIds = await publicClient.readContract({
      address: GYROB_CONTRACT_ADDRESS,
      abi: gyrobAbi,
      functionName: "getRoomIds",
    });
    const knownRoomIds = roomIds.length > 0 ? roomIds.map(String).join(", ") : "none";
    throw new Error(
      `Room ${normalizedRoomId.toString()} does not exist on ${GYROB_CONTRACT_ADDRESS}. Available rooms: ${knownRoomIds}. Seed rooms before running batch interactions.`,
    );
  }

  console.log(
    `Room ${normalizedRoomId.toString()} entry fee: ${formatToken(room.entryFee)} | current round: ${room.currentRound.toString()} | players: ${room.playerCount.toString()}/10`,
  );

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const [index, wallet] of wallets.entries()) {
    const account = privateKeyToAccount(wallet.privateKey);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(CELO_RPC_URL),
    });

    try {
      const [nativeBalance, tokenBalance, latestRoomRaw] = await Promise.all([
        publicClient.getBalance({ address: account.address }),
        publicClient.readContract({
          address: USDM_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        }),
        publicClient.readContract({
          address: GYROB_CONTRACT_ADDRESS,
          abi: gyrobAbi,
          functionName: "rooms",
          args: [normalizedRoomId],
        }),
      ]);
      const latestRoom = normalizeRoom(latestRoomRaw);

      const alreadyPlayed = await publicClient.readContract({
        address: GYROB_CONTRACT_ADDRESS,
        abi: gyrobAbi,
        functionName: "hasPlayed",
        args: [normalizedRoomId, latestRoom.currentRound, account.address],
      });

      if (alreadyPlayed) {
        skippedCount += 1;
        console.log(`[${wallet.name}] skipped: already played in round ${latestRoom.currentRound.toString()}`);
        continue;
      }

      if (tokenBalance < latestRoom.entryFee) {
        skippedCount += 1;
        console.log(
          `[${wallet.name}] skipped: insufficient USDm (${formatToken(tokenBalance)} available, ${formatToken(latestRoom.entryFee)} required)`,
        );
        continue;
      }

      if (nativeBalance === 0n) {
        skippedCount += 1;
        console.log(`[${wallet.name}] skipped: no CELO for gas`);
        continue;
      }

      const approved = await ensureAllowance(walletClient, account, latestRoom.entryFee);
      if (approved) {
        console.log(`[${wallet.name}] approval confirmed`);
      }

      const spin = buildSpin(index);
      const hash = await playRoom(walletClient, account, normalizedRoomId, spin);
      successCount += 1;
      console.log(
        `[${wallet.name}] played room ${normalizedRoomId.toString()} with spin ${spin.toString()} | tx ${hash} | gas balance ${formatNative(nativeBalance)}`,
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[${wallet.name}] failed: ${error.shortMessage || error.message}`);
    }

    if (TX_DELAY_MS > 0) {
      await sleep(TX_DELAY_MS);
    }
  }

  console.log(
    `${batchLabel} complete -> success: ${successCount}, skipped: ${skippedCount}, failed: ${failedCount}`,
  );
}
