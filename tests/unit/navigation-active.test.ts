import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeNavHref, NAVIGATION } from "@/lib/navigation";

/**
 * Two bugs visible in one screenshot, both regression-guarded here.
 */

describe("exactly one navigation entry is ever active", () => {
  /** Every href the navigation declares, so the parent/child pairs are real. */
  const allHrefs = NAVIGATION.flatMap((s) => s.items.map((i) => i.href));

  // The design's menu has no parent/child pair, so the rule is checked against
  // a menu of its own: whatever the entries, the longest match must win.
  it("picks the child, not the parent, when both are listed", () => {
    const sections = [{ items: [{ href: "/sales" }, { href: "/sales/leads" }] }];
    expect(activeNavHref("/sales/leads", sections)).toBe("/sales/leads");
  });

  it("lights the entry a screen opened from inside another belongs to", () => {
    expect(activeNavHref("/sales/leads/abc123", NAVIGATION)).toBe("/sales/leads");
  });

  it("picks the parent for a route the navigation does not list", () => {
    expect(activeNavHref("/hr/abc123", NAVIGATION)).toBe("/hr");
  });

  it("never returns a parent when a longer entry also matches", () => {
    for (const href of allHrefs) {
      const chosen = activeNavHref(href, NAVIGATION);
      expect(chosen, `${href} chose ${chosen}`).toBe(href);
    }
  });

  it("matches nothing for a route outside the navigation", () => {
    expect(activeNavHref("/nowhere", NAVIGATION)).toBeNull();
  });

  it("does not let /dashboard swallow every path", () => {
    expect(activeNavHref("/tasks", NAVIGATION)).toBe("/tasks");
  });
});

/**
 * Tailwind v4 puts utilities in @layer utilities, and unlayered CSS beats
 * layered CSS in the cascade regardless of specificity. A bare `a { color }`
 * therefore overrides every text-colour utility on every link in the app — the
 * sidebar rendered brand blue throughout, including the active item, where blue
 * on the navy gradient is barely legible.
 */
describe("base element styles stay inside @layer base", () => {
  const CSS = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

  /** The span of every `@layer base { … }` block, brace-matched. */
  function baseLayerRanges(): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const re = /@layer\s+base\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(CSS))) {
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < CSS.length && depth > 0) {
        if (CSS[i] === "{") depth++;
        else if (CSS[i] === "}") depth--;
        i++;
      }
      ranges.push([m.index, i]);
    }
    return ranges;
  }

  const ranges = baseLayerRanges();
  const inBaseLayer = (index: number) => ranges.some(([a, b]) => index > a && index < b);

  it("declares a base layer at all", () => {
    expect(ranges.length).toBeGreaterThan(0);
  });

  for (const selector of ["a {", "body {", "html,"]) {
    it(`${selector.trim()} is layered`, () => {
      const at = CSS.indexOf(`\n  ${selector}`) >= 0
        ? CSS.indexOf(`\n  ${selector}`)
        : CSS.indexOf(`\n${selector}`);
      expect(at, `${selector} not found`).toBeGreaterThan(-1);
      expect(
        inBaseLayer(at),
        `${selector.trim()} sits outside @layer base, so it overrides every Tailwind utility on that element`,
      ).toBe(true);
    });
  }
});
