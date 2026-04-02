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

The deployment script uses the Celo mainnet USDm token at:

- `0x765DE816845861e75A25fCA122bb6898B8B1282a`

It also seeds four default rooms:

- Room 1: `0.02 USDm`
- Room 2: `5 USDm`
- Room 3: `10 USDm`
- Room 4: `100 USDm`

## Frontend

The Vite frontend is mobile-first and built for MiniPay-compatible injected providers.

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
3. Approve USDm.
4. Choose a spin from `1-10`.
5. Submit `play(roomId, spin)`.

## Assumptions

- `creator` is fixed at deployment time and receives 10% of every completed round.
- `createRoom` is intentionally permissionless because the requested interface specified `external` with no owner gate.
- Integer division follows Solidity defaults, so any remainder after splitting the winner pool stays in the contract balance.
