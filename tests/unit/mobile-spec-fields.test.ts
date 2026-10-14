import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";

/**
 * Every field the Android client reads must be a field the server sends.
 *
 * `mobile/lib/modules/spec.dart` names a module's columns by hand — its row
 * title, its band, its detail fields. Nothing checks those names at runtime:
 * a wrong one renders as an empty string, so a list looks *almost* right and
 * nobody notices a column has quietly disappeared.
 *
 * Six were wrong when this was first written. `total` where the purchase order
 * export sends `value`, `balance` where stock sends `quantity`, `po` where the
 * GRN sends `poNo`, `contact`/`mobile` where vendors send `contactPerson` and
 * `phone`. Each one was an invisible blank on a screen.
 *
 * The column keys come from the export routes' own `columns` arrays, read the
 * same way — so this compares two pieces of source rather than needing a
 * server and a database.
 */

const ROOT = join(__dirname, "..", "..");
const spec = readFileSync(join(ROOT, "mobile", "lib", "modules", "spec.dart"), "utf8");

/** Fields the boundary adds to every row, which are not columns. */
const ALWAYS = new Set(["decide", "canDecide", "id", "href"]);

/** The module blocks in spec.dart, by list key. */
function specBlocks(): Map<string, string> {
  const out = new Map<string, string>();
  const parts = spec.split(/\n {2}'([a-z/-]+)': ModuleSpec\(/);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i], parts[i + 1]);
  return out;
}

/** Every row field a module's spec reads. */
function referenced(body: string): Set<string> {
  const out = new Set<string>();
  const add = (re: RegExp) => {
    for (const m of body.matchAll(re)) out.add(m[1]);
  };
  add(/r\['([a-zA-Z]+)'\]/g);
  add(/r\["([a-zA-Z]+)"\]/g);
  add(/_s\(r, '([a-zA-Z]+)'\)/g);
  add(/sumOf\(rows, '([a-zA-Z]+)'\)/g);
  add(/countWhere\(rows, "([a-zA-Z]+)"/g);
  for (const m of body.matchAll(/_(?:join|first)\(r, \[([^\]]+)\]/g)) {
    for (const q of m[1].matchAll(/'([a-zA-Z]+)'/g)) out.add(q[1]);
  }
  return out;
}

/**
 * The column keys an export route declares — following one level into the
 * helpers some of them use.
 *
 * Three routes build their columns in a shared function (`unitExportColumns`,
 * and the stock and reorder pair) because the set depends on a permission. A
 * scan of the route file alone finds none of them and would pass this test by
 * comparing against nothing.
 */
function columnsOf(listKey: string): Set<string> {
  const file = join(ROOT, "src", "app", "api", listKey, "export", "route.ts");
  const src = readFileSync(file, "utf8");
  const out = new Set<string>();

  const collect = (text: string) => {
    for (const m of text.matchAll(/\{\s*key:\s*"([a-zA-Z]+)"/g)) out.add(m[1]);
  };
  collect(src);

  for (const m of src.matchAll(/from "@\/(lib\/[^"]+)"/g)) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try {
        collect(readFileSync(join(ROOT, "src", m[1] + ext), "utf8"));
        break;
      } catch {
        // not that extension
      }
    }
  }
  return out;
}

describe("the client reads fields the server actually sends", () => {
  const blocks = specBlocks();

  it("found the specs", () => {
    expect(blocks.size).toBeGreaterThan(25);
  });

  it("every spec names a list the boundary serves", () => {
    const unknown = [...blocks.keys()].filter((k) => !MOBILE_LIST_KEYS.includes(k));
    expect(unknown).toEqual([]);
  });

  for (const [key, body] of specBlocks()) {
    it(`${key} reads nothing the export route does not send`, () => {
      const have = columnsOf(key);
      const missing = [...referenced(body)]
        .filter((f) => !ALWAYS.has(f))
        .filter((f) => !have.has(f))
        .sort();
      expect(missing, `${key}: these render blank`).toEqual([]);
    });
  }
});
