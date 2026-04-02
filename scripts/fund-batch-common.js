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
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CELO_RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";
const USDM_ADDRESS = process.env.USDM_ADDRESS || "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const EXPECTED_FUNDER_ADDRESS = "0xfB9735dAd6ce2aE918900124Ac9FCB744DeDE7a2";
const FUNDING_DELAY_MS = Number(process.env.FUNDING_DELAY_MS || "250");

const publicClient = createPublicClient({
  chain: celo,
  transport: http(CELO_RPC_URL),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatToken(value, symbol) {
  return `${formatUnits(value, 18)} ${symbol}`;
}

async function loadBatchWallets(batchFileName) {
  const walletFile = path.resolve(__dirname, "..", "generated", batchFileName);
  const fileContents = await readFile(walletFile, "utf8");
  return {
    walletFile,
    wallets: JSON.parse(fileContents),
  };
}

async function transferUSDm(walletClient, funderAccount, recipient, amount) {
  const { request } = await publicClient.simulateContract({
    address: USDM_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, amount],
    account: funderAccount.address,
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function runBatchFunding({
  batchLabel,
  batchFileName,
  celoAmount,
  usdmAmount,
}) {
  const funderPrivateKey = process.env.FUNDER_PRIVATE_KEY || process.env.OPERATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "";
  if (!funderPrivateKey) {
    throw new Error("Set FUNDER_PRIVATE_KEY to fund a wallet batch.");
  }

  const funderAccount = privateKeyToAccount(funderPrivateKey);
  if (funderAccount.address.toLowerCase() !== EXPECTED_FUNDER_ADDRESS.toLowerCase()) {
    throw new Error(`FUNDER_PRIVATE_KEY does not match ${EXPECTED_FUNDER_ADDRESS}.`);
  }

  const targetCelo = parseUnits(celoAmount, 18);
  const targetUSDm = parseUnits(usdmAmount, 18);
  const { walletFile, wallets } = await loadBatchWallets(batchFileName);
  const walletClient = createWalletClient({
    account: funderAccount,
    chain: celo,
    transport: http(CELO_RPC_URL),
  });

  console.log(`Funding ${batchLabel} from ${funderAccount.address}`);
  console.log(`Wallet file: ${walletFile}`);
  console.log(`Target CELO per wallet: ${celoAmount}`);
  console.log(`Target USDm per wallet: ${usdmAmount}`);

  const [funderNativeBalance, funderUSDmBalance] = await Promise.all([
    publicClient.getBalance({ address: funderAccount.address }),
    publicClient.readContract({
      address: USDM_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [funderAccount.address],
    }),
  ]);

  console.log(`Funder balances -> ${formatToken(funderNativeBalance, "CELO")} | ${formatToken(funderUSDmBalance, "USDm")}`);

  let fundedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const wallet of wallets) {
    try {
      const [nativeBalance, tokenBalance] = await Promise.all([
        publicClient.getBalance({ address: wallet.address }),
        publicClient.readContract({
          address: USDM_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet.address],
        }),
      ]);

      const nativeShortfall = nativeBalance >= targetCelo ? 0n : targetCelo - nativeBalance;
      const tokenShortfall = tokenBalance >= targetUSDm ? 0n : targetUSDm - tokenBalance;

      if (nativeShortfall === 0n && tokenShortfall === 0n) {
        skippedCount += 1;
        console.log(`[${wallet.name}] skipped: already funded`);
        continue;
      }

      if (nativeShortfall > 0n) {
        const hash = await walletClient.sendTransaction({
          account: funderAccount,
          chain: celo,
          to: wallet.address,
          value: nativeShortfall,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`[${wallet.name}] funded ${formatToken(nativeShortfall, "CELO")} | tx ${hash}`);
      }

      if (tokenShortfall > 0n) {
        const hash = await transferUSDm(walletClient, funderAccount, wallet.address, tokenShortfall);
        console.log(`[${wallet.name}] funded ${formatToken(tokenShortfall, "USDm")} | tx ${hash}`);
      }

      fundedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`[${wallet.name}] funding failed: ${error.shortMessage || error.message}`);
    }

    if (FUNDING_DELAY_MS > 0) {
      await sleep(FUNDING_DELAY_MS);
    }
  }

  console.log(`${batchLabel} funding complete -> funded: ${fundedCount}, skipped: ${skippedCount}, failed: ${failedCount}`);
}
