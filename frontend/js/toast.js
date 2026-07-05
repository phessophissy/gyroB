export function showToast(message, tone = "") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${tone ? `toast--${tone}` : ""}`.trim();
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}