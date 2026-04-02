# Gyro Board (GyroB)

Gyro Board is a standalone game on Celo, designed for MiniPay as a Mini App. Players join USDm rooms, choose a spin from 1 to 10, and compete in deterministic 10-player rounds that settle automatically when the final seat is filled.

## Game Overview

- Chain: Celo Mainnet
- Wallet experience: MiniPay-compatible Mini App flow
- Token: Mento Dollar (`USDm`)
- Room model: independent tiers keyed by `roomId`
- Round size: 10 players
- Spin range: integers from `1` to `10`
- Payout split: `90%` to highest-spin winner(s), `10%` to the game creator

## Rules

- Each room runs its own round state.
- Every player pays the room entry fee in USDm.
- Spins must be between `1` and `10`.
- Each round accepts exactly `10` players.
- One play per wallet per room round
- The highest spin wins the round.
- If multiple players share the highest spin, they split the winner pool equally.
- The 10th player triggers automatic round finalization.

## Project Structure

```text
contracts/
  GyroBoard.sol
  MockUSDm.sol
frontend/
  index.html
  styles.css
  app.js
scripts/
  batch-interaction-common.js
  create-default-rooms.js
  deploy.js
  fund-batch-a.js
  fund-batch-b.js
  fund-batch-common.js
  generate-wallet-batches.js
  interact-batch-a.js
  interact-batch-b.js
test/
  GyroBoard.t.js
hardhat.config.js
```

## Contract Overview

`GyroBoard.sol` stores an independent `Room` state for each `roomId`:

```solidity
struct Room {
    uint256 entryFee;
    uint256 currentRound;
    uint256 playerCount;
    uint256 totalPot;
    uint256 highestSpin;
    bool exists;
}
```

Player state is scoped by `roomId` and `round`:

```solidity
mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public playerSpins;
mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasPlayed;
mapping(uint256 => mapping(uint256 => mapping(uint256 => Player))) public roundPlayers;
```

### Payout Formula

```solidity
uint256 creatorAmount = room.totalPot * 10 / 100;
uint256 winnerPool = room.totalPot * 90 / 100;
uint256 payoutPerWinner = winnerPool / winnerCount;
```

If `winnerCount == 0`, the contract reverts.

## Setup

### Prerequisites

- Node.js 18+
- npm
- A Celo-compatible wallet for production use, such as MiniPay

### Install

```bash
npm install
```

### Compile

```bash
npm run compile
```

### Test

```bash
npm test
```

The suite covers:

- room creation bounds and duplicate protection
- invalid spins and double-play prevention
- 10th-player auto-finalization
- 90/10 payout logic with tie splitting
- simultaneous multi-room isolation
- 100+ wallets across independent rooms

## Deploy To Celo Mainnet

Create or update `.env`:

```bash
cp .env.example .env
```

Required values:

```bash
DEPLOYER_PRIVATE_KEY=0xyourprivatekey
CELO_RPC_URL=https://forno.celo.org
GYROB_CREATOR=0xyourCreatorAddress
```

Deploy:

```bash
npm run deploy:celo
```

The deployment script uses the Celo mainnet USDm token at:

- `0x765DE816845861e75A25fCA122bb6898B8B1282a`

It also seeds four default rooms:

- Room 1: `0.02 USDm`
- Room 2: `5 USDm`
- Room 3: `10 USDm`
- Room 4: `100 USDm`

## Frontend

The Vite frontend is mobile-first and supports:

- implicit MiniPay connection inside the MiniPay app
- injected browser wallets on desktop
- WalletConnect on desktop when a Reown project ID is configured

### Frontend Environment

Set a deployed contract address before running the UI:

```bash
VITE_GYROB_CONTRACT_ADDRESS=0xyourdeployedcontract
VITE_CELO_RPC_URL=https://forno.celo.org
VITE_WALLETCONNECT_PROJECT_ID=your_reown_project_id
```

### Run Locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### User Flow

1. Connect MiniPay or another injected Celo wallet.
2. Select a room tier.
3. Approve USDm.
4. Choose a spin from `1-10`.
5. Submit `play(roomId, spin)`.

MiniPay note:

- Inside MiniPay, wallet connection is implicit and the app auto-connects on load.
- On desktop, WalletConnect requires a valid Reown project ID.

## Mainnet Wallet Batches

GyroB includes local-only tooling to generate mainnet wallets in two batches and run separate contract interaction scripts for each batch.

Generate wallets:

```bash
npm run wallets:generate
```

This creates ignored files in `generated/`:

- `batch-a-mainnet-wallets.json`
- `batch-b-mainnet-wallets.json`
- address-only CSV exports for both batches

Fund Batch A from `0xfB9735dAd6ce2aE918900124Ac9FCB744DeDE7a2`:

```bash
FUNDER_PRIVATE_KEY=0xyourfunderkey npm run fund:batch-a
```

Fund Batch B from `0xfB9735dAd6ce2aE918900124Ac9FCB744DeDE7a2`:

```bash
FUNDER_PRIVATE_KEY=0xyourfunderkey npm run fund:batch-b
```

Default top-up targets:

- Batch A: `0.05 CELO` and `0.05 USDm` per wallet
- Batch B: `0.05 CELO` and `5.5 USDm` per wallet

Funding behavior:

- verifies the private key belongs to `0xfB9735dAd6ce2aE918900124Ac9FCB744DeDE7a2`
- tops wallets up to the configured balance target instead of blindly resending funds
- uses native CELO transfers for gas and USDm `transfer()` for token funding

Run Batch A against a room:

```bash
GYROB_CONTRACT_ADDRESS=0xa0C01234FEEA3401dE13598b3ef823afe0a9672B BATCH_A_ROOM_ID=1 npm run interact:batch-a
```

Run Batch B against a room:

```bash
GYROB_CONTRACT_ADDRESS=0xa0C01234FEEA3401dE13598b3ef823afe0a9672B BATCH_B_ROOM_ID=2 npm run interact:batch-b
```

Environment used by the batch scripts:

- `CELO_RPC_URL`
- `GYROB_CONTRACT_ADDRESS`
- `USDM_ADDRESS`
- `FUNDER_PRIVATE_KEY`
- `BATCH_A_ROOM_ID`
- `BATCH_B_ROOM_ID`
- `BATCH_A_CELO_AMOUNT`
- `BATCH_A_USDM_AMOUNT`
- `BATCH_B_CELO_AMOUNT`
- `BATCH_B_USDM_AMOUNT`
- `FUNDING_DELAY_MS`
- `TX_DELAY_MS`

Each batch script:

- loads its own local wallet file
- checks CELO gas balance and USDm balance
- submits `approve()` if allowance is below the room fee
- calls `play(roomId, spin)` for each funded wallet
- uses deterministic spins from `1-10` across the batch

If your deployed contract has no rooms yet, seed the default tiers first:

```bash
GYROB_CONTRACT_ADDRESS=0xa0C01234FEEA3401dE13598b3ef823afe0a9672B OPERATOR_PRIVATE_KEY=0xyourkey npm run rooms:seed
```

This creates:

- Room 1: `0.02 USDm`
- Room 2: `5 USDm`
- Room 3: `10 USDm`
- Room 4: `100 USDm`

## Assumptions

- `creator` is fixed at deployment time and receives 10% of every completed round.
- `createRoom` is intentionally permissionless because the requested interface specified `external` with no owner gate.
- Integer division follows Solidity defaults, so any remainder after splitting the winner pool stays in the contract balance.
