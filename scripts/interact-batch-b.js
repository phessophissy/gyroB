import { runBatchInteractions } from "./batch-interaction-common.js";

const roomId = process.env.BATCH_B_ROOM_ID || "2";

runBatchInteractions({
  batchLabel: "Batch B",
  batchFileName: "batch-b-mainnet-wallets.json",
  roomId,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
