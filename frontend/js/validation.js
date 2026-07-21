// Client-side validation helpers for GyroB play flow.
// Mirrors the on-chain constraints in contracts/GyroBoard.sol so we can
// fail fast with a friendly message before submitting a transaction.

export const MIN_SPIN = 1;
export const MAX_SPIN = 10;

// Entry fee bounds (in wei). 0.02 USDm .. 100 USDm.
export const MIN_ENTRY_FEE = 2n * 10n ** 16n;
export const MAX_ENTRY_FEE = 100n * 10n ** 18n;

/**
 * Validate a chosen spin value.
 * @param {number} spin
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function validateSpin(spin) {
  const value = Number(spin);
  if (!Number.isInteger(value)) {
    return { ok: false, error: "Spin must be a whole number." };
  }
  if (value < MIN_SPIN || value > MAX_SPIN) {
    return { ok: false, error: `Spin must be between ${MIN_SPIN} and ${MAX_SPIN}.` };
  }
  return { ok: true, value };
}

/**
 * Validate that the player can afford the room entry fee given their
 * current USDm balance and token allowance.
 * @param {bigint} entryFee
 * @param {bigint} balance
 * @param {bigint} allowance
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateAffordability(entryFee, balance, allowance) {
  if (typeof entryFee !== "bigint" || entryFee <= 0n) {
    return { ok: false, error: "Invalid room entry fee." };
  }
  if (entryFee < MIN_ENTRY_FEE || entryFee > MAX_ENTRY_FEE) {
    return { ok: false, error: "Room entry fee is outside the allowed range." };
  }
  if (typeof balance !== "bigint" || balance < entryFee) {
    return { ok: false, error: "Insufficient USDm balance for this room." };
  }
  if (typeof allowance !== "bigint" || allowance < entryFee) {
    return { ok: false, error: "Insufficient USDm allowance. Approve the contract first." };
  }
  return { ok: true };
}

/**
 * Combined pre-flight check for the play action.
 */
export function validatePlay({ spin, entryFee, balance, allowance }) {
  const spinResult = validateSpin(spin);
  if (!spinResult.ok) return spinResult;
  return validateAffordability(entryFee, balance, allowance);
}
