/**
 * Script helper: feature-round-timer-countdown-2
 * Utility for: Round timer countdown component
 * GyroBoard tooling
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { celo } from 'viem/chains';

const SCRIPT_VERSION = '2.0.0';

export function validateInput2(params) {
  const required = ['roomId', 'spinValue'];
  const missing = required.filter(k => !(k in params));
  if (missing.length > 0) {
    throw new Error(`Missing required params: ${missing.join(', ')}`);
  }
  if (params.spinValue < 1 || params.spinValue > 10) {
    throw new Error('Spin value must be between 1 and 10');
  }
  return true;
}

export function formatOutput2(data) {
  return {
    version: SCRIPT_VERSION,
    timestamp: new Date().toISOString(),
    results: Array.isArray(data) ? data : [data],
    count: Array.isArray(data) ? data.length : 1,
  };
}

export function parseRoomConfig2(roomData) {
  return {
    entryFee: BigInt(roomData.entryFee),
    currentRound: Number(roomData.currentRound),
    playerCount: Number(roomData.playerCount),
    totalPot: BigInt(roomData.totalPot),
    highestSpin: Number(roomData.highestSpin),
    exists: Boolean(roomData.exists),
  };
}

export async function fetchRoomState2(client, contractAddr, roomId) {
  try {
    const abi = parseAbi(['function rooms(bytes32) view returns (uint256,uint256,uint256,uint256,uint256,bool)']);
    const data = await client.readContract({
      address: contractAddr,
      abi,
      functionName: 'rooms',
      args: [roomId],
    });
    return parseRoomConfig2({
      entryFee: data[0], currentRound: data[1], playerCount: data[2],
      totalPot: data[3], highestSpin: data[4], exists: data[5],
    });
  } catch (e) {
    console.error(`Room fetch failed: ${e.message}`);
    return null;
  }
}
