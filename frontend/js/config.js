import { getAddress } from "viem";

export const USDM_ADDRESS = getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a");
export const CONTRACT_ADDRESS = normalizeAddress(import.meta.env.VITE_GYROB_CONTRACT_ADDRESS || "");
export const RPC_URL = normalizeEnvValue(import.meta.env.VITE_CELO_RPC_URL) || "https://forno.celo.org";
export const WALLETCONNECT_PROJECT_ID = normalizeEnvValue(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID) || "";
export const MAX_APPROVAL = 2n ** 256n - 1n;

export const ROOM_TIERS = {
  1n: { label: "Bronze", cls: "bronze" },
  2n: { label: "Silver", cls: "silver" },
  3n: { label: "Gold", cls: "gold" },
  4n: { label: "Diamond", cls: "diamond" },
};

export const AVATAR_COLORS = [
  "#a882ff", "#ff6bcb", "#4de8ff", "#ffd166", "#5dffa0",
  "#ff9de0", "#7b9fff", "#ff8b6b", "#c4f0ff", "#ffb347",
];

function normalizeEnvValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAddress(value) {
  const normalizedValue = normalizeEnvValue(value);
  if (!normalizedValue) return "";
  return getAddress(normalizedValue.toLowerCase());
}