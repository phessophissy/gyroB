import { test } from "node:test";
import assert from "node:assert/strict";

import { formatUSDm } from "../frontend/js/format.js";

test("formatUSDm formats whole USDm amounts with no decimals", () => {
  // 100 USDm = 100 * 10^18 wei
  assert.equal(formatUSDm(100n * 10n ** 18n), "100");
});

test("formatUSDm keeps up to 2 fractional decimals", () => {
  // 1.234 USDm -> "1.23"
  assert.equal(formatUSDm(1234n * 10n ** 15n), "1.23");
});

test("formatUSDm rounds via toLocaleString maximumFractionDigits", () => {
  // 0.005 USDm -> "0.01" (rounded to 2 decimals)
  assert.equal(formatUSDm(5n * 10n ** 15n), "0.01");
});

test("formatUSDm handles zero", () => {
  assert.equal(formatUSDm(0n), "0");
});
