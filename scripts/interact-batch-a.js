import { runBatchInteractions } from "./batch-interaction-common.js";

const roomId = process.env.BATCH_A_ROOM_ID || "1";

runBatchInteractions({
  batchLabel: "Batch A",
  batchFileName: "batch-a-mainnet-wallets.json",
  roomId,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
