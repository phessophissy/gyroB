export function setLoading(element, isLoading, label = "Loading") {
  if (!element) return;
  element.classList.toggle("is-loading", isLoading);
  element.setAttribute("aria-busy", String(isLoading));
  if (isLoading) element.dataset.loadingLabel = label;
}

export function roomListSkeleton(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-room" aria-hidden="true">
      <div class="skeleton-line skeleton-line--short"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line skeleton-line--medium"></div>
    </div>
  `).join("");
}