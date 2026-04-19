# Chat lobby for room participants — Part 5

## Overview

This document covers component 5 of the **Chat lobby for room participants** enhancement
for the GyroBoard platform on Celo.

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| enabled | boolean | true | Enable this module |
| threshold | number | 5 | Processing threshold |
| timeout | number | 5000 | Timeout in ms |
| network | string | celo | Target network |
| entryFee | uint256 | 0.02 USDm | Minimum entry fee |

## Usage

```javascript
import { init5 } from './feature-chat-lobby-5';
const config = init5({ threshold: 10 });
```

## Contract Integration

```solidity
function recordAction5(bytes32 roomId, uint256 spinValue) external;
```

## Notes

- Requires Celo mainnet RPC
- USDm (Mento Dollar) for all transactions
- Part 5 of 10 in this PR
- Compatible with MiniPay wallet
