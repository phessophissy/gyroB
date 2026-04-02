# Gyro Board (GyroB)

Gyro Board is a Celo game built around fast, deterministic cUSD rounds. Players choose a spin from 1 to 10, each room fills to exactly 10 players, and the round auto-finalizes as soon as the tenth player joins.

## What Changed

- Target chain: Celo Mainnet
- Wallet UX: MiniPay-compatible injected wallet flow
- Token: cUSD (ERC-20)
- Rooms: multiple independent tiers keyed by `roomId`
- Payouts: `90%` to highest-spin winner(s), `10%` to the game creator

## Mechanics Preserved

- Spin range remains `1-10`
- Max players remains `10`
- One play per wallet per room round
- Highest spin wins
- Ties split the winner pool equally
- Tenth player auto-finalizes the round
- Room state is isolated per tier

## Project Structure

```text
contracts/
  GyroBoard.sol
  MockCUSD.sol
frontend/
  index.html
  styles.css
  app.js
scripts/
  deploy.js
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

The deployment script uses the Celo mainnet cUSD token at:

- `0x765DE816845861e75A25fCA122bb6898B8B1282a`

It also seeds four default rooms:

- Room 1: `0.02 cUSD`
- Room 2: `5 cUSD`
- Room 3: `10 cUSD`
- Room 4: `100 cUSD`

## Frontend

The Vite frontend is mobile-first and works with MiniPay-compatible injected providers.

### Frontend Environment

Set a deployed contract address before running the UI:

```bash
VITE_GYROB_CONTRACT_ADDRESS=0xyourdeployedcontract
VITE_CELO_RPC_URL=https://forno.celo.org
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
3. Approve cUSD.
4. Choose a spin from `1-10`.
5. Submit `play(roomId, spin)`.

## Assumptions

- `creator` is fixed at deployment time and receives 10% of every completed round.
- `createRoom` is intentionally permissionless because the requested interface specified `external` with no owner gate.
- Integer division follows Solidity defaults, so any remainder after splitting the winner pool stays in the contract balance.
