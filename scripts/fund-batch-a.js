import { runBatchFunding } from "./fund-batch-common.js";

const celoAmount = process.env.BATCH_A_CELO_AMOUNT || "0.05";
const usdmAmount = process.env.BATCH_A_USDM_AMOUNT || "0.05";

runBatchFunding({
  batchLabel: "Batch A",
  batchFileName: "batch-a-mainnet-wallets.json",
  celoAmount,
  usdmAmount,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
