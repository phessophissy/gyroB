export function initSpinGridKeyboard(grid, onSelect) {
  if (!grid) return;

  grid.addEventListener("keydown", (event) => {
    const buttons = [...grid.querySelectorAll(".spin-button")];
    const current = document.activeElement;
    const index = buttons.indexOf(current);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(index + 1, buttons.length - 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(index - 1, 0);
    if (next !== index) {
      event.preventDefault();
      buttons[next].focus();
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const spin = Number(current.dataset.spin);
      if (spin) onSelect(spin, current);
    }
  });
}

export function announceLive(message) {
  const el = document.getElementById("liveRegion");
  if (el) el.textContent = message;
}