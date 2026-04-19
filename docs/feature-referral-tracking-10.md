# Referral tracking and rewards — Part 10

## Overview

This document covers component 10 of the **Referral tracking and rewards** enhancement
for the GyroBoard platform on Celo.

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| enabled | boolean | true | Enable this module |
| threshold | number | 10 | Processing threshold |
| timeout | number | 10000 | Timeout in ms |
| network | string | celo | Target network |
| entryFee | uint256 | 0.02 USDm | Minimum entry fee |

## Usage

```javascript
import { init10 } from './feature-referral-tracking-10';
const config = init10({ threshold: 15 });
```

## Contract Integration

```solidity
function recordAction10(bytes32 roomId, uint256 spinValue) external;
```

## Notes

- Requires Celo mainnet RPC
- USDm (Mento Dollar) for all transactions
- Part 10 of 10 in this PR
- Compatible with MiniPay wallet
