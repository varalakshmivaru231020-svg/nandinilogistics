import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sidebar and topbar must stay put while the content scrolls.
 *
 * That only holds while the shell is pinned to the viewport. With
 * `min-h-screen` the shell grows with its content, the *page* scrolls, and the
 * sidebar scrolls away with it — which is exactly what happened.
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("the app shell is pinned to the viewport", () => {
  const SHELL = read("src/components/shell/app-shell.tsx");

  it("sizes itself to the screen rather than growing past it", () => {
    expect(SHELL).toMatch(/className="flex h-screen overflow-hidden"/);
  });

  it("does not apply min-h-screen, which lets the page scroll instead", () => {
    // The class, not the word — the comment above it names the bug on purpose.
    const classNames = [...SHELL.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    expect(classNames.some((c) => c.includes("min-h-screen"))).toBe(false);
  });

  it("marks the one pane that scrolls", () => {
    expect(SHELL).toContain("data-app-scroll");
    expect(SHELL).toMatch(/data-app-scroll[^>]*overflow-y-auto/);
  });
});

describe("overlays freeze the pane that actually scrolls", () => {
  for (const file of ["src/components/ui/modal.tsx", "src/components/ui/drawer.tsx"]) {
    it(`${file} locks through the shared helper`, () => {
      const src = read(file);
      expect(src).toContain("lockAppScroll");
      // Locking body alone is the bug this replaced: the shell scrolls its
      // content pane, so the page would keep moving behind the overlay.
      expect(src).not.toContain('document.body.style.overflow = "hidden"');
    });
  }

  it("the helper locks both the body and the content pane", () => {
    const src = read("src/lib/scroll-lock.ts");
    expect(src).toContain("[data-app-scroll]");
    expect(src).toContain("document.body.style.overflow");
  });
});
