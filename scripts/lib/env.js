import { getAddress } from "viem";

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name, fallback = "") {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function requireAddress(name) {
  const value = requireEnv(name);
  try {
    return getAddress(value.toLowerCase());
  } catch {
    throw new Error(`${name} is not a valid address: ${value}`);
  }
}

export function requirePrivateKey(name) {
  const value = requireEnv(name);
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex private key prefixed with 0x`);
  }
  return value;
}