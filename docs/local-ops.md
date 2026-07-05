# Local Operations (Private Keys Required)

This document describes **local-only** scripts for testing on Celo mainnet. Never commit secrets or `generated/` output.

## Prerequisites

```bash
cp .env.example .env
# Fill in addresses and keys locally — never commit .env
```

## Generate Test Wallets (Local)

```bash
npm run wallets:generate
```

Output is written to `generated/` (gitignored):

- `batch-a-mainnet-wallets.json`
- `batch-b-mainnet-wallets.json`

## Fund Batches

```bash
FUNDER_ADDRESS=0xYourFunderAddress FUNDER_PRIVATE_KEY=0xYourKey npm run fund:batch-a
FUNDER_ADDRESS=0xYourFunderAddress FUNDER_PRIVATE_KEY=0xYourKey npm run fund:batch-b
```

The funder private key must match `FUNDER_ADDRESS`.

## Interact With Contract

```bash
GYROB_CONTRACT_ADDRESS=0xYourContract BATCH_A_ROOM_ID=1 npm run interact:batch-a
GYROB_CONTRACT_ADDRESS=0xYourContract BATCH_B_ROOM_ID=2 npm run interact:batch-b
```

## Seed Default Rooms

```bash
GYROB_CONTRACT_ADDRESS=0xYourContract OPERATOR_PRIVATE_KEY=0xYourKey npm run rooms:seed
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CELO_RPC_URL` | Celo RPC endpoint |
| `GYROB_CONTRACT_ADDRESS` | Deployed GyroBoard address |
| `USDM_ADDRESS` | USDm token (defaults to mainnet) |
| `FUNDER_ADDRESS` | Funding wallet address |
| `FUNDER_PRIVATE_KEY` | Funding wallet key (local only) |
| `OPERATOR_PRIVATE_KEY` | Room seeding operator key |
| `BATCH_A_ROOM_ID` / `BATCH_B_ROOM_ID` | Target room per batch |
| `FUNDING_DELAY_MS` / `TX_DELAY_MS` | Rate limiting between txs |