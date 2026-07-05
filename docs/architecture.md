# Architecture
Gyro Board is a Celo USDm spin game with MiniPay frontend and Hardhat contracts.
## Components
- contracts/GyroBoard.sol — room state and payouts
- frontend/ — MiniPay + WalletConnect UI
- scripts/ — deploy and local ops (keys in .env only)
## Security
See SECURITY.md. Never commit generated/ or private keys.

## Data Flow
1. Connect wallet → 2. Select room → 3. Approve USDm → 4. Submit play().
