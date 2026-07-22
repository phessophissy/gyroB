import { formatUnits } from "viem";

export function formatUSDm(value) {
  // Some RPC providers return uint256 values as plain Numbers instead of BigInt.
  // formatUnits() misbehaves on Number inputs (returns malformed strings like
  // "1..51920892373162e+22"), so we coerce to BigInt first to guarantee correct
  // decimal conversion regardless of the transport.
  const big = typeof value === "bigint" ? value : BigInt(value);
  return Number(formatUnits(big, 18)).toLocaleString(undefined, {
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