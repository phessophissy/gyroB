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