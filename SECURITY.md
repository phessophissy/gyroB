# Security Policy

## Reporting a Vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Email the maintainer privately or use GitHub's private vulnerability reporting if enabled on this repository.

## Sensitive Data

Never commit:

- `.env` files or private keys (`DEPLOYER_PRIVATE_KEY`, `FUNDER_PRIVATE_KEY`, `OPERATOR_PRIVATE_KEY`)
- `generated/` wallet batch files
- `wallets.json` or any file containing mnemonics or raw private keys

## Local Operations

Mainnet wallet batch tooling (`npm run wallets:generate`, `fund:batch-*`, `interact:batch-*`) is for **local development only**. See [docs/local-ops.md](docs/local-ops.md). These scripts must never run in CI and must never commit output files.

## Smart Contract

- `createRoom` is permissionless by design.
- Integer division remainders stay in the contract balance after winner splits.
- Always verify deployed contract addresses before approving USDm.

---

## Deployed contract

| Item | Value |
|------|-------|
| Contract | `GyroBoard` |
| Address (Celo Mainnet) | `0xa0C01234FEEA3401dE13598b3ef823afe0a9672B` |
| Solidity compiler | `0.8.24` |
| Optimizer | enabled, 200 runs |
| Source | [`contracts/GyroBoard.sol`](./contracts/GyroBoard.sol) |

## CeloScan compiler warning — SOL-2025-1 (LostStorageArrayWriteOnSlotOverflow)

CeloScan reports a low-severity compiler warning for the deployed contract:

> **LostStorageArrayWriteOnSlotOverflow (low-severity)** — Operations that
> involve clearing or copying from arrays that straddle the end of storage
> could result in silent data retention.

This is Solidity advisory **SOL-2025-1**. Authoritative details (from the
official Solidity known-bugs database):

- **UID:** SOL-2025-1
- **Severity:** low
- **Introduced:** 0.1.0
- **Fixed in:** 0.8.32
- **Reference:** https://blog.soliditylang.org/2025/12/18/lost-storage-array-write-on-slot-overflow-bug/

### What the bug is

Solidity lets a storage variable conceptually extend past the last
(2²⁵⁶-th) slot, wrapping back to slot 0. When a storage **array** straddles
that boundary, the compiler-generated *clearing loops* (used by `delete`,
`array.pop()`, `array.push()`, array assignment, and array initialization)
can terminate early and leave stale data instead of zeroing it. The copy
operation can also be affected in the legacy (`evmasm`) pipeline.

### Why GyroBoard is NOT affected

The bug has two prerequisites, neither of which `GyroBoard` satisfies:

1. **A storage array must be positioned so it straddles the end of storage**
   (its base slot must be ~2²⁵⁶ − length, causing wrap-around).

   `GyroBoard` has exactly **one** storage array:

   ```solidity
   uint256[] private roomIds;   // line 73
   ```

   Storage layout (note: `mentoDollar` and `creator` are `immutable`, so
   they do **not** occupy storage slots):

   | Slot | Variable |
   |------|----------|
   | 0 | `rooms` (mapping) |
   | 1 | `playerSpins` (mapping) |
   | 2 | `hasPlayed` (mapping) |
   | 3 | `roundPlayers` (mapping) |
   | 4 | `roomIds` (dynamic array — length here, elements at `keccak256(4)`) |

   `roomIds` lives at **slot 4** — about as far from the 2²⁵⁶ boundary as
   possible. It cannot straddle the end of storage, so the wrap-around
   condition required to trigger the bug cannot occur.

2. **A clearing operation must run on that array** (`delete`, `.pop()`, a
   shrinking array assignment, or `push()` of an empty element).

   `roomIds` is **only ever appended to** with a concrete value:

   ```solidity
   roomIds.push(roomId);   // line 140 — grows only, never deleted/popped/reassigned
   ```

   It is never `delete`d, `.pop()`ped, or overwritten with a shorter array.
   No clearing loop that could be mis-terminated is ever executed on it.

Additionally:

- The other array-returning functions (`getRoomIds`, `getRoundPlayers`)
  return **memory** arrays (`new Player[](count)`, `uint256[] memory`).
  The bug is **storage-only**, so these are unaffected.
- `playerSpins`, `hasPlayed`, `roundPlayers`, and `rooms` are **mappings**,
  not arrays — mappings are not subject to this bug.
- The OpenZeppelin dependencies (`@openzeppelin/contracts ^5.2.0`,
  `ReentrancyGuard` and `SafeERC20`) do not trigger this condition.

### Conclusion

The Solidity team rates SOL-2025-1 as **low** severity and notes it is
*"extremely unlikely to be triggered accidentally"* and that realistic
intentional exploitation scenarios *"do not seem realistic."* For
`GyroBoard` specifically, the sole storage array sits at slot 4 and is
never cleared, deleted, or popped — so the bug's trigger conditions are
not met.

**The deployed contract is not exploitable via this advisory. No change to
the deployed bytecode is required.** This document is the written rationale
for the CeloScan warning.

### Forward note (informational)

The fix for SOL-2025-1 shipped in Solidity **0.8.32**. Any **future**
contract deployments should use `0.8.32` or later to avoid the warning
entirely. This does not change the already-deployed `GyroBoard` bytecode
(bytecode on-chain is immutable); it is a compiler-hygiene recommendation
for new deploys only.

