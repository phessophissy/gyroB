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

import { shorten } from "../frontend/js/format.js";

test("shorten truncates a long hex address to first6…last4", () => {
  const addr = "0x0123456789abcdef0123456789abcdef01234567";
  assert.equal(shorten(addr), "0x0123…4567");
});

test("shorten handles a short string by slicing safely", () => {
  // Shorter than 10 chars: slice still returns a result without throwing.
  assert.equal(shorten("0xabc"), "0xabc…xabc");
});

import { parseError } from "../frontend/js/format.js";

test("parseError prefers shortMessage", () => {
  const err = { shortMessage: "short", message: "long" };
  assert.equal(parseError(err), "short");
});

test("parseError falls back to message", () => {
  const err = { message: "long message" };
  assert.equal(parseError(err), "long message");
});

test("parseError returns default when no info present", () => {
  assert.equal(parseError(undefined), "Transaction failed.");
  assert.equal(parseError({}), "Transaction failed.");
});
