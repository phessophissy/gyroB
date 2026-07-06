export function isMiniPayEnvironment() {
  return Boolean(typeof window !== "undefined" && window.ethereum?.isMiniPay);
}
export async function shareMiniPayResult({ roomId, spin, outcome }) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title: "Gyro Board", text: `Room ${roomId}, spin ${spin}. ${outcome}`, url: location.href });
    return true;
  } catch { return false; }
}