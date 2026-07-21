// Minimal viem stub for running frontend/js/format.js under Node's
// native test runner without bundling. Only the symbols imported by
// format.js are implemented.
//
// Usage: node --import ./test/stubs/vitest-stub.js --test test/format-helpers.test.js

export function formatUnits(value, decimals = 18) {
  if (typeof value !== "bigint") throw new TypeError("expected bigint");
  const negative = value < 0n;
  let abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  let fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fractionStr) fractionStr = "." + fractionStr;
  return (negative ? "-" : "") + whole.toString() + fractionStr;
}
