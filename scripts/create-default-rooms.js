import "dotenv/config";

import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const CELO_RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";
const GYROB_CONTRACT_ADDRESS = process.env.GYROB_CONTRACT_ADDRESS || "0xa0C01234FEEA3401dE13598b3ef823afe0a9672B";
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "";

const roomAbi = parseAbi([
  "function rooms(uint256) view returns (uint256 entryFee, uint256 currentRound, uint256 playerCount, uint256 totalPot, uint256 highestSpin, bool exists)",
  "function createRoom(uint256 roomId, uint256 entryFee)",
]);

const defaultRooms = [
  { roomId: 1n, entryFee: parseUnits("0.02", 18) },
  { roomId: 2n, entryFee: parseUnits("5", 18) },
  { roomId: 3n, entryFee: parseUnits("10", 18) },
  { roomId: 4n, entryFee: parseUnits("100", 18) },
];

async function main() {
  if (!OPERATOR_PRIVATE_KEY) {
    throw new Error("Set OPERATOR_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY to seed rooms.");
  }

  const account = privateKeyToAccount(OPERATOR_PRIVATE_KEY);
  const publicClient = createPublicClient({
    chain: celo,
    transport: http(CELO_RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(CELO_RPC_URL),
  });

  console.log(`Seeding rooms on ${GYROB_CONTRACT_ADDRESS} with operator ${account.address}`);

  for (const room of defaultRooms) {
    const existingRoom = await publicClient.readContract({
      address: GYROB_CONTRACT_ADDRESS,
      abi: roomAbi,
      functionName: "rooms",
      args: [room.roomId],
    });

    if (existingRoom.exists) {
      console.log(`Room ${room.roomId.toString()} already exists. Skipping.`);
      continue;
    }

    const { request } = await publicClient.simulateContract({
      address: GYROB_CONTRACT_ADDRESS,
      abi: roomAbi,
      functionName: "createRoom",
      args: [room.roomId, room.entryFee],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Created room ${room.roomId.toString()} with ${formatUnits(room.entryFee, 18)} USDm entry fee`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
