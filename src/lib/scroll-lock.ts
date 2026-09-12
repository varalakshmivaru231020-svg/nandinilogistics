/**
 * Freezes the page behind an overlay.
 *
 * The shell pins itself to the viewport and scrolls its content pane, not the
 * body — so locking `body` alone leaves the page scrolling behind a modal.
 * Both are locked, and the pane is found by its data attribute rather than by
 * a selector that assumes the shell's shape.
 */
export function lockAppScroll(): () => void {
  if (typeof document === "undefined") return () => undefined;

  const pane = document.querySelector<HTMLElement>("[data-app-scroll]");
  const previousBody = document.body.style.overflow;
  const previousPane = pane?.style.overflow ?? "";

  document.body.style.overflow = "hidden";
  if (pane) pane.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousBody;
    if (pane) pane.style.overflow = previousPane;
  };
}
