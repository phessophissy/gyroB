# 🎰 Spinning Board Game

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://spinning-board.vercel.app/)
[![Stacks](https://img.shields.io/badge/blockchain-Stacks-5546FF)](https://www.stacks.co/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A decentralized spinning board game on the Stacks blockchain (Bitcoin L2).

![Chrome Steel Game Screenshot](https://via.placeholder.com/800x400/0d0d1a/c0c0c0?text=🎰+Chrome+Steel+Game+Interface)

> **⚙️ Live Demo:** [spinning-board.vercel.app](https://spinning-board.vercel.app/)

## 🎮 Game Rules

- **Entry Fee:** 0.001 STX per spin
- **Players:** 2-10 per round
- **Spin Range:** Choose a number from 1 to 10
- **Winning:** Highest spin wins!
- **Prize:** 50% of pot to winner(s), 50% to game creator
- **Ties:** Winners split the prize equally

## ✨ Features

- 🔐 Decentralized & trustless gameplay
- 💰 Automatic prize distribution via smart contract
- 🔩 Signal-room inspired mainnet dashboard UI
- 📱 Mobile responsive design
- 🔗 Native Stacks Connect wallet integration
- ⚡ Built on Stacks (Bitcoin L2)

## 📦 SDK

The JavaScript SDK now lives in its own repository:

- https://github.com/phessophissy/SpinningB-sdk

That keeps the app and SDK versioned independently. The main app repo no longer carries the SDK source under `packages/`.

## 📁 Project Structure

```
SpinningB/
├── contracts/
│   └── spinning-board.clar    # Clarity smart contract
├── frontend/
│   ├── index.html             # Main HTML file
│   ├── styles.css             # Metallic chrome theme styles
│   └── app.js                 # Frontend (@stacks/connect + @stacks/transactions)
├── vite.config.js             # Vite bundler configuration
├── package.json
├── vercel.json                # Vercel deployment config
├── CONTRIBUTING.md            # Contribution guidelines
└── README.md
```

## 🛠️ Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Clarinet](https://github.com/hirosystems/clarinet) (for contract development)
- A Stacks wallet (e.g., [Leather](https://leather.io/) or [Xverse](https://www.xverse.app/))

### 1. Clone the Repository

```bash
git clone https://github.com/phessophissy/SpinningB.git
cd SpinningB
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
# Start Vite development server
npm run dev
```

Then open http://localhost:5173

## 🖥️ Frontend Experience

The frontend now ships as a live round dashboard with:

- a command-center style hero that surfaces wallet and round readiness
- manual stat refresh controls alongside the normal polling cycle
- clearer selection and submission states for mainnet play
- a local session activity feed for wallet, refresh, and transaction events

### 4. Build for Production

```bash
npm run build
```

The production build will be output to the `dist/` folder.

## 🔐 Mainnet Wallet Automation

This repo includes `scripts/play-game.js` for generating wallets and submitting `play` calls on mainnet.

### Generate 50 mainnet wallets

```bash
npm run wallets:generate
```

Outputs:
- `generated/mainnet-wallets.json`
- `generated/mainnet-wallets.csv`

Both files include private keys and mnemonics. They are ignored by git and should be handled as secrets.

### Dry-run batch game calls

```bash
npm run wallets:play:dry
```

This shows which wallets would call:
- Contract: `SP2KYZRNME33Y39GP3RKC90DQJ45EF1N0NZNVRE09.spinning-board`
- Function: `play(spin)`
- Entry fee: `1000` microSTX (`0.001 STX`)

To include live balance checks in dry-run mode:

```bash
node scripts/play-game.js play --wallets generated/mainnet-wallets.json --count 10 --spin random --dry-run --check-balance
```

### Broadcast live mainnet calls

```bash
npm run wallets:play
```

You can also run the script directly for custom settings:

```bash
node scripts/play-game.js play \
  --wallets generated/mainnet-wallets.json \
  --count 50 \
  --start-index 0 \
  --spin random \
  --fee 3000 \
  --delay-ms 1200
```

### Fund the 50 wallets from your funder account

Create `.env` from `.env.example` and set your real mnemonic:

```bash
cp .env.example .env
```

Set this value in `.env`:
- `FUNDER_MNEMONIC="your real 12/24 words ..."`

The funding script verifies the mnemonic resolves to this exact address before sending:
- `SP1QPNQB6R3EFMTQYGHG9J7N03S3K52ARSE1VEVX4`

If your environment has TLS issues with the default Stacks API host, set:
- `STACKS_API_URL="https://api.mainnet.hiro.so"`

Dry-run funding plan (no broadcast):

```bash
npm run wallets:fund:dry -- --amount-stx 0.02
```

Live funding broadcast:

```bash
npm run wallets:fund -- --amount-stx 0.02
```

You can also use microSTX directly:

```bash
node scripts/fund-wallets.js --amount-ustx 20000 --count 50
```

## 🧪 Testnet Deployment

To deploy and test on Stacks Testnet before going to mainnet:

### 1. Install Clarinet

```bash
# macOS
brew install clarinet

# Windows
winget install hirosystems.clarinet

# Linux
curl -L https://github.com/hirosystems/clarinet/releases/download/v2.3.0/clarinet-linux-x64.tar.gz | tar xz
sudo mv clarinet /usr/local/bin/
```

### 2. Initialize Clarinet Project (if not exists)

```bash
clarinet new spinning-board-test
cd spinning-board-test
```

### 3. Copy Contract

```bash
cp ../contracts/spinning-board.clar contracts/
```

### 4. Update Clarinet.toml

Add to your `Clarinet.toml`:
```toml
[contracts.spinning-board]
path = "contracts/spinning-board.clar"
clarity_version = 2
epoch = 2.4
```

### 5. Test Locally

```bash
# Run unit tests
clarinet test

# Open interactive console
clarinet console
```

### 6. Deploy to Testnet

```bash
# Generate deployment plan
clarinet deployments generate --testnet

# Deploy
clarinet deployments apply -p deployments/default.testnet-plan.yaml
```

### 7. Update Frontend for Testnet

In `frontend/app.js`, change:
```javascript
// For testnet testing
const NETWORK = new StacksTestnet();
const API_URL = "https://stacks-node-api.testnet.stacks.co";
const CONTRACT_ADDRESS = "YOUR_TESTNET_CONTRACT_ADDRESS";
```

### 8. Get Testnet STX

Get free testnet STX from the [Stacks Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet).

## 🚀 Contract Deployment (Mainnet)

### Option 1: Using Clarinet

```bash
# Generate mainnet deployment plan
clarinet deployments generate --mainnet

# Review the plan, then deploy
clarinet deployments apply -p deployments/default.mainnet-plan.yaml
```

### Option 2: Using Stacks Explorer

1. Go to [Stacks Explorer Sandbox](https://explorer.stacks.co/sandbox/deploy?chain=mainnet)
2. Connect your wallet
3. Paste the contract code from `contracts/spinning-board.clar`
4. Set contract name: `spinning-board`
5. Deploy and confirm the transaction

### Post-Deployment

After deploying, update `frontend/app.js`:
```javascript
const CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
const CONTRACT_NAME = "spinning-board";
```

## 🌐 Deploy Frontend

### GitHub Pages

1. Push to GitHub
2. Go to Settings > Pages
3. Set source to `main` branch, `/frontend` folder
4. Your game will be live at `https://yourusername.github.io/SpinningB/`

### Vercel (Recommended)

1. Import your GitHub repo on [Vercel](https://vercel.com)
2. Set the root directory to `frontend`
3. Deploy!

## 📜 Contract Functions

### Public Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `play` | `spin: uint (1-10)` | Join round and submit your spin |

### Read-Only Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `get-current-round` | `uint` | Current round number |
| `get-player-count` | `uint` | Players in current round (0-10) |
| `get-total-pot` | `uint` | Current pot in microSTX |
| `get-highest-spin` | `uint` | Highest spin this round |
| `has-player-played` | `bool` | Check if player already joined |
| `get-game-creator` | `principal` | Returns game creator address |
| `get-entry-fee` | `uint` | Returns entry fee (1000 microSTX) |
| `get-round-player` | `{player, spin}` | Get player info by index |

## ⚠️ Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| u100 | `ERR_ROUND_FULL` | Round already has 10 players |
| u101 | `ERR_INVALID_SPIN` | Spin must be between 1-10 |
| u102 | `ERR_PAYMENT_FAILED` | STX transfer failed |
| u103 | `ERR_ALREADY_PLAYED` | Player already in this round |
| u104 | `ERR_PAYOUT_FAILED` | Winner payout failed |
| u105 | `ERR_NO_WINNERS` | No winners found |

## 🔧 Tech Stack

- **Smart Contract:** [Clarity](https://docs.stacks.co/clarity) (Stacks)
- **Wallet Connection:** [@stacks/connect](https://github.com/hirosystems/stacks.js) + [@stacks/transactions](https://github.com/hirosystems/stacks.js)
- **Frontend:** Vanilla JS, HTML, CSS
- **Bundler:** [Vite](https://vitejs.dev/)
- **Network:** [Stacks](https://www.stacks.co/) Mainnet (Bitcoin L2)
- **Hosting:** [Vercel](https://vercel.com/)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start for Contributors

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Live Game:** [spinning-board.vercel.app](https://spinning-board.vercel.app/)
- **Contract on Explorer:** [View on Stacks Explorer](https://explorer.stacks.co/txid/SP2KYZRNME33Y39GP3RKC90DQJ45EF1N0NZNVRE09.spinning-board?chain=mainnet)
- **Stacks Blockchain:** [stacks.co](https://www.stacks.co/)

---

Built with 🔩 on [Stacks](https://www.stacks.co/) | ⚙️ Chrome Steel Edition
