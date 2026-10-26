import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SCREENS } from "@/lib/screens/registry";

/**
 * The screen registry, against the screens themselves.
 *
 * The registry is what the Android client renders its search box and filter
 * sheet from, so if it drifts from the web the two stop being the same product.
 * Option *values* cannot drift, because the registry maps over the same
 * constants the pages do. What can drift is the prose — the placeholder and
 * the filter parameter names — so those are read back out of the screen's
 * sources and compared.
 */

const ROOT = join(__dirname, "..", "..");

/** The directory holding each module's page and screen components. */
const SOURCE: Record<string, string> = {
  "sales/leads": "sales/leads",
  "sales/follow-ups": "sales/follow-ups",
  "hr/employees": "hr",
  "hr/attendance": "hr",
  tasks: "tasks",
};

/** The query parameters each list's own filter reader accepts. */
const PARAMS: Record<string, string> = {
  "sales/leads": "src/lib/sales/lead-list.ts",
  "sales/follow-ups": "src/app/api/sales/follow-ups/export/route.ts",
  "hr/employees": "src/lib/hr/list-filters.ts",
  "hr/attendance": "src/lib/hr/list-filters.ts",
  tasks: "src/lib/tasks/list-filters.ts",
};

function sources(dir: string): string {
  let out = "";
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".tsx") || name.endsWith(".ts")) out += readFileSync(path, "utf8");
    }
  };
  walk(dir);
  return out;
}

describe("the registry says what the screens say", () => {
  it("covers every screen that has a list", () => {
    const missing = Object.keys(SOURCE).filter((k) => !SCREENS[k]);
    expect(missing, "these screens have a list and no descriptor").toEqual([]);
  });

  for (const key of Object.keys(SOURCE)) {
    describe(key, () => {
      const def = SCREENS[key];
      const screen = sources(join(ROOT, "src", "app", "(app)", SOURCE[key]));
      const params = readFileSync(join(ROOT, PARAMS[key]), "utf8");

      it("uses the screen's own search placeholder", () => {
        if (def.searchPlaceholder === null) return;
        expect(screen, `expected the screen to carry ${JSON.stringify(def.searchPlaceholder)}`)
          .toContain(def.searchPlaceholder);
      });

      it("names filters the list's own reader accepts", () => {
        for (const f of def.filters) {
          expect(params, `filter "${f.name}" is not read by ${PARAMS[key]}`).toMatch(new RegExp(`["'(]${f.name}["')]`));
        }
      });
    });
  }
});
