import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `position: fixed` overlay is sized to the viewport only while no ancestor
 * establishes a containing block for it. A transform, filter, perspective or
 * `will-change` on an ancestor does establish one — and then `inset-0` sizes to
 * that ancestor instead, clipping the overlay to the page wrapper.
 *
 * This bit: `.animate-fade-up` is on nearly every page wrapper and its
 * animation ran with `fill-mode: both`, so the final keyframe's
 * `transform: translateY(0)` persisted for the life of the page. Every modal
 * opened inside a page was clipped to that wrapper's box.
 */
const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

/** The animations applied to page wrappers, all of which use fill-mode both. */
const WRAPPER_ANIMATIONS = ["fadeUp", "slideIn"];

function finalKeyframe(name: string): string {
  const block = new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS);
  if (!block) throw new Error(`@keyframes ${name} not found`);
  const frames = block[1];
  const last = /(?:100%|to)\s*\{([^}]*)\}/.exec(frames);
  return last?.[1] ?? "";
}

describe("page-wrapper animations leave no containing block behind", () => {
  for (const name of WRAPPER_ANIMATIONS) {
    it(`${name} does not end on a transform`, () => {
      expect(
        finalKeyframe(name),
        `@keyframes ${name} ends on a transform. With fill-mode both that persists, ` +
          "making every wrapper a containing block and clipping fixed overlays to it.",
      ).not.toMatch(/transform\s*:/);
    });
  }

  it("still animates from a transform, so the motion is unchanged", () => {
    for (const name of WRAPPER_ANIMATIONS) {
      const block = new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)!;
      expect(block[1]).toMatch(/(?:0%|from)\s*\{[^}]*transform\s*:/);
    }
  });
});

describe("the modal escapes its ancestors regardless", () => {
  const MODAL = readFileSync(
    join(__dirname, "..", "..", "src", "components", "ui", "modal.tsx"),
    "utf8",
  );

  it("renders through a portal to the document body", () => {
    expect(MODAL).toContain("createPortal");
    expect(MODAL).toContain("document.body");
  });
});
