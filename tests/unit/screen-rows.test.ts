import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";

/**
 * The composed row is the web's row, or this test fails.
 *
 * `src/lib/screens/rows/` builds each list row the way the web screen builds
 * it, and the list route sends it in its JSON mode. Two things can rot:
 *
 *  1. a list stops sending a composed row, and the phone falls back to the
 *     export's flat columns — which is the state this whole layer replaced;
 *  2. a word drifts — the screen renames a badge and the row keeps the old
 *     spelling.
 *
 * So this reads the route files and the screen sources, rather than trusting
 * that somebody remembered.
 */

const read = (p: string) => readFileSync(p, "utf-8");

/** Where each list's route lives, from the generated map's own import list. */
const ROUTE: Record<string, string> = Object.fromEntries(
  read("src/lib/api/mobile-lists.ts")
    .split("\n")
    .flatMap((line) => {
      const m = /^import \{ GET as (l\d+) \} from "@\/app(.+)";$/.exec(line);
      return m ? [[m[1], `src/app${m[2]}.ts`]] : [];
    }),
);
const KEY_TO_ALIAS: Record<string, string> = Object.fromEntries(
  read("src/lib/api/mobile-lists.ts")
    .split("\n")
    .flatMap((line) => {
      const m = /^  "([^"]+)": (l\d+),$/.exec(line);
      return m ? [[m[1], m[2]]] : [];
    }),
);

/** Every row builder, read once — the rows and their buttons are asserted against it. */
const ALL_ROWS = ["lead", "follow-up", "hr", "task"]
  .map((m) => readFileSync(`src/lib/screens/rows/${m}.ts`, "utf-8"))
  .join("\n");

describe("every list sends the screen's own row", () => {
  for (const key of MOBILE_LIST_KEYS) {
    it(key, () => {
      const route = ROUTE[KEY_TO_ALIAS[key]];
      expect(route, `${key} has no route in the generated map`).toBeTruthy();
      const src = read(route);

      expect(
        src.includes("@/lib/screens/rows"),
        `${key} does not build a composed row — the phone would fall back to the export's columns`,
      ).toBe(true);
      expect(src.includes("screen,"), `${key} builds a row but does not send it`).toBe(true);
      expect(
        src.includes('gate.format === "json"'),
        `${key} composes a row outside the JSON mode, which would slow every file export`,
      ).toBe(true);
    });
  }
});

describe("the row's buttons are the web row's buttons", () => {
  it("every row button names an action the boundary has", async () => {
    const { MOBILE_ACTIONS } = await import("@/lib/api/mobile-actions");
    const keys = new Set(Object.keys(MOBILE_ACTIONS));
    const named = [...ALL_ROWS.matchAll(/action: "([a-z][^"]*)"/g)].map((m) => m[1]);
    expect(named.length, "no row builder names an action").toBeGreaterThan(0);
    for (const key of named) {
      expect(keys.has(key), `${key} is not an action the boundary dispatches`).toBe(true);
    }
  });
});
