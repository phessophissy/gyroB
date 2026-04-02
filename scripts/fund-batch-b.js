import { runBatchFunding } from "./fund-batch-common.js";

const celoAmount = process.env.BATCH_B_CELO_AMOUNT || "0.05";
const usdmAmount = process.env.BATCH_B_USDM_AMOUNT || "5.5";

runBatchFunding({
  batchLabel: "Batch B",
  batchFileName: "batch-b-mainnet-wallets.json",
  celoAmount,
  usdmAmount,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
