import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The app paints in layers, and the order only exists as Tailwind z- classes
 * spread across a handful of components. Nothing type-checks it.
 *
 * It was wrong: the detail screen is a fixed full-bleed panel at z-92 and the
 * modal was at z-50, so every dialog opened from a record — approving an
 * indent, receiving a purchase order, deleting a vendor — painted behind the
 * panel. The dialog was visible through the backdrop but the panel took the
 * click, so confirm buttons did nothing at all.
 *
 * These tests read the classes back out and assert the order, so the next
 * person to add an overlay finds out here rather than from a button that
 * silently refuses to work.
 */

function layer(file: string, hint: string): number {
  const src = readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
  const line = src.split("\n").find((l) => l.includes(hint));
  if (!line) throw new Error(`${file}: no line containing ${hint} — has it been renamed?`);
  const match = line.match(/z-\[(\d+)\]|z-(\d+)/);
  if (!match) throw new Error(`${file}: the line with ${hint} carries no z- class`);
  return Number(match[1] ?? match[2]);
}

const SIDEBAR = () => layer("components/shell/sidebar.tsx", "fixed inset-y-0 left-0");
const DRAWER = () => layer("components/ui/drawer.tsx", "animate-slide-in fixed inset-y-0 right-0");
const DETAIL = () => layer("components/shell/detail-screen.tsx", "fixed inset-y-0 left-0 right-0");
const MODAL = () => layer("components/ui/modal.tsx", "fixed inset-0");
const TOAST = () => layer("components/ui/toast.tsx", "animate-fade-up fixed bottom-");
const SPLASH = () => layer("components/loading-splash.tsx", "fixed inset-0");

describe("overlay layer order", () => {
  it("puts the detail screen above the sidebar", () => {
    expect(DETAIL()).toBeGreaterThan(SIDEBAR());
  });

  it("puts a modal above the detail screen, so dialogs opened from a record are clickable", () => {
    expect(MODAL()).toBeGreaterThan(DETAIL());
  });

  it("puts a modal above a drawer, so a confirmation inside one works", () => {
    expect(MODAL()).toBeGreaterThan(DRAWER());
  });

  it("puts a toast above a modal, so what an action did stays readable", () => {
    expect(TOAST()).toBeGreaterThan(MODAL());
  });

  it("keeps the loading splash on top of everything", () => {
    expect(SPLASH()).toBeGreaterThan(TOAST());
  });
});
