# Sound Effects

GyroB ships a lightweight, dependency-free sound engine that synthesizes
tones at runtime using the Web Audio API — no audio asset files are
required, keeping the MiniPay bundle small.

## Module

[`frontend/js/sound.js`](../frontend/js/sound.js) exposes the following API:

| Export | Description |
|--------|-------------|
| `isSoundEnabled()` | Returns the current enabled state. |
| `setSoundEnabled(value)` | Persists the preference to `localStorage` (`gyrob:sound`). |
| `toggleSound()` | Flips the preference and returns the new state. |
| `playSpin()` | Rising triangle tone played when a spin is submitted. |
| `playWin()` | Two-note ascending chime for wins. |
| `playLose()` | Descending sawtooth tone for losses. |
| `playClick()` | Short click for ties / UI feedback. |

## Mute toggle

A `#soundToggle` button in the app header reflects and controls the
preference via `aria-pressed`. The state persists across sessions.

## Integration points

- `playRoom()` — `playSpin()` on submit, `playWin()` on confirmation,
  `playLose()` on error.
- Practice mode — `playWin()` / `playLose()` / `playClick()` per outcome.

All calls are no-ops when sound is disabled, so callers do not need to
guard them.
