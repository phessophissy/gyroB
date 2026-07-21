// Lightweight Web Audio sound engine for GyroB.
// No audio assets required — tones are synthesized at runtime.
// Respects a persisted mute preference (localStorage key: "gyrob:sound").

const STORAGE_KEY = "gyrob:sound";

let audioCtx = null;
let enabled = loadEnabled();

function loadEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function context() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* ignore persistence errors */
  }
  return enabled;
}

export function toggleSound() {
  return setSoundEnabled(!enabled);
}

// Play a simple tone with an optional frequency ramp.
function tone({ from, to = from, duration = 0.15, type = "sine", gain = 0.08 }) {
  const ctx = context();
  if (!ctx || !enabled) return;
  if (ctx.state === "suspended") ctx.resume();

  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), ctx.currentTime + duration);

  vol.gain.setValueAtTime(gain, ctx.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  osc.connect(vol).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playSpin() {
  tone({ from: 220, to: 660, duration: 0.25, type: "triangle", gain: 0.06 });
}

export function playWin() {
  tone({ from: 523, to: 784, duration: 0.12, type: "sine", gain: 0.09 });
  setTimeout(() => tone({ from: 784, to: 1046, duration: 0.18, type: "sine", gain: 0.09 }), 120);
}

export function playLose() {
  tone({ from: 330, to: 130, duration: 0.3, type: "sawtooth", gain: 0.05 });
}

export function playClick() {
  tone({ from: 880, duration: 0.04, type: "square", gain: 0.03 });
}
