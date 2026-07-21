# Bet Validation

GyroB validates play inputs on the client before submitting on-chain
transactions, mirroring the constraints enforced by
[`contracts/GyroBoard.sol`](../contracts/GyroBoard.sol). This avoids
wasted gas and gives users immediate, friendly feedback.

## Module

[`frontend/js/validation.js`](../frontend/js/validation.js) exports:

| Export | Description |
|--------|-------------|
| `MIN_SPIN` / `MAX_SPIN` | Valid spin range (1–10). |
| `MIN_ENTRY_FEE` / `MAX_ENTRY_FEE` | Valid entry fee range in wei (0.02–100 USDm). |
| `validateSpin(spin)` | Checks the spin is an integer within range. |
| `validateAffordability(entryFee, balance, allowance)` | Checks balance & allowance cover the fee. |
| `validatePlay({ spin, entryFee, balance, allowance })` | Combined pre-flight check. |

Each function returns `{ ok: true, ... }` on success or
`{ ok: false, error: "<message>" }` on failure.

## Integration

- `syncControls()` disables the **Play** button when
  `validateAffordability()` fails for the selected room.
- `playRoom()` runs `validatePlay()` before `simulateContract` and shows
  a toast + status message on failure.
- Balance and allowance are cached on the app `state` object in
  `syncAccountState()` so validation can read them synchronously.
