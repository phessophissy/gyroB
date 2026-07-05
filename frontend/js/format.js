import { formatUnits } from "viem";

export function formatUSDm(value) {
  return Number(formatUnits(value, 18)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function shorten(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function parseError(error) {
  return error?.shortMessage || error?.message || "Transaction failed.";
}