import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generatedDir = path.resolve(__dirname, "..", "generated");

function buildBatch(batchLabel, count) {
  return Array.from({ length: count }, (_, index) => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const walletNumber = String(index + 1).padStart(3, "0");

    return {
      name: `${batchLabel} ${walletNumber}`,
      address: account.address,
      privateKey,
    };
  });
}

function toAddressCsv(wallets) {
  const header = "name,address";
  const lines = wallets.map((wallet) => `${wallet.name},${wallet.address}`);
  return [header, ...lines].join("\n");
}

async function writeBatchArtifacts(filePrefix, wallets) {
  await writeFile(
    path.join(generatedDir, `${filePrefix}-wallets.json`),
    JSON.stringify(wallets, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(generatedDir, `${filePrefix}-addresses.csv`),
    toAddressCsv(wallets),
    "utf8",
  );
}

async function main() {
  await mkdir(generatedDir, { recursive: true });

  const batchA = buildBatch("Batch A", 50);
  const batchB = buildBatch("Batch B", 50);

  await writeBatchArtifacts("batch-a-mainnet", batchA);
  await writeBatchArtifacts("batch-b-mainnet", batchB);

  console.log("Generated 100 mainnet wallets.");
  console.log(`Batch A: ${batchA.length} wallets -> ${path.join(generatedDir, "batch-a-mainnet-wallets.json")}`);
  console.log(`Batch B: ${batchB.length} wallets -> ${path.join(generatedDir, "batch-b-mainnet-wallets.json")}`);
  console.log("Address-only CSV exports were also written for both batches.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
