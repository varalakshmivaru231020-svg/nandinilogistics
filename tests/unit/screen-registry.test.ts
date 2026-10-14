import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SCREENS } from "@/lib/screens/registry";

/**
 * The screen registry, against the screens themselves.
 *
 * The registry is what the Android client renders its search box and filter
 * sheet from, so if it drifts from the web the two stop being the same product
 * — which is exactly what happened when the client had its own hand-written
 * idea of each list's filters. It was wrong in ways nobody could guess: the
 * vendor list labels INACTIVE **"On hold"**, the stock filter is named `stock`
 * and offers "Restock now", the goods-receipt filter is `invoice` and offers
 * "Invoice pending".
 *
 * Option *values* cannot drift, because the registry maps over the same
 * constants the pages do. What can drift is the prose: a placeholder, a filter
 * name, a label, an allLabel, the caption on a date range. So those are read
 * back out of the page sources and compared.
 */

const ROOT = join(__dirname, "..", "..");

/** The page or screen component that renders a module's toolbar. */
const SOURCE: Record<string, string> = {
  "projects/projects": "projects/page.tsx",
  "projects/progress": "projects/progress/progress-screen.tsx",
  "material/indents": "material/indents/page.tsx",
  "material/purchase-orders": "material/purchase-orders/page.tsx",
  "material/grn": "material/grn/page.tsx",
  "material/stock": "material/stock/page.tsx",
  "material/vendors": "material/vendors/page.tsx",
  "material/issues": "material/issues/page.tsx",
  "material/returns": "material/returns/page.tsx",
  "material/transfers": "material/transfers/page.tsx",
  "material/invoices": "material/invoices/page.tsx",
  "material/payments": "material/payments/page.tsx",
  "material/reorder": "material/reorder/page.tsx",
  "sales/customers": "sales/customers/customers-screen.tsx",
  "sales/bookings": "sales/bookings/page.tsx",
  "sales/receipts": "sales/receipts/page.tsx",
  "sales/cost-sheets": "sales/cost-sheets/page.tsx",
  "sales/site-visits": "sales/site-visits/site-visits-screen.tsx",
  units: "units/unit-filters.tsx",
};

function pageSource(key: string): string {
  return readFileSync(join(ROOT, "src", "app", "(app)", SOURCE[key]), "utf8");
}

/** The `<ListToolbar …>` opening tag, with its props. */
function toolbar(src: string): string {
  const i = src.indexOf("<ListToolbar");
  expect(i, "the page renders a ListToolbar").toBeGreaterThan(-1);
  let depth = 0;
  let j = i + "<ListToolbar".length;
  while (j < src.length) {
    const c = src[j];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) break;
    j += 1;
  }
  return src.slice(i, j + 1);
}

describe("the registry says what the screens say", () => {
  it("covers every screen that has a toolbar", () => {
    const withToolbars = Object.keys(SOURCE);
    const missing = withToolbars.filter((k) => !SCREENS[k]);
    expect(missing, "these screens have a toolbar and no descriptor").toEqual([]);
  });

  for (const key of Object.keys(SOURCE)) {
    describe(key, () => {
      const def = SCREENS[key];
      const props = toolbar(pageSource(key));

      /*
       * The placeholder names the fields the search covers, so it is the one
       * piece of text that tells a person what the box will do.
       */
      it("uses the screen's own search placeholder", () => {
        const texts = [...props.matchAll(/searchPlaceholder=(?:"([^"]+)"|\{[^}]*?"([^"]+)"[^}]*?\})/g)]
          .flatMap((m) => [m[1], m[2]])
          .filter(Boolean);
        if (def.searchPlaceholder === null) return;
        const wanted = [def.searchPlaceholder, def.searchWith?.placeholder].filter(Boolean);
        for (const w of wanted) {
          expect(props, `expected the page to carry ${JSON.stringify(w)}`).toContain(w!);
        }
        // And nothing the page shows is missing from the descriptor.
        for (const t of texts) {
          expect(wanted, `the page has a placeholder the descriptor lacks: ${t}`).toContain(t);
        }
      });

      it("names the same filters, in the same order", () => {
        const names = [...props.matchAll(/name:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
        expect(def.filters.map((f) => f.name)).toEqual(names);
      });

      it("labels them the way the screen does", () => {
        const labels = [...props.matchAll(/\blabel:\s*"([^"]+)"/g)].map((m) => m[1]);
        // The filter labels come first in each object, before any option label.
        for (const f of def.filters) {
          expect(labels, `filter "${f.name}" label`).toContain(f.label);
        }
      });

      it("keeps the screen's allLabels", () => {
        const alls = [...props.matchAll(/allLabel:\s*"([^"]+)"/g)].map((m) => m[1]);
        const mine = def.filters.map((f) => f.allLabel).filter(Boolean) as string[];
        expect(mine.sort()).toEqual(alls.sort());
      });

      it("captions the date range the way the screen does", () => {
        const m = /dateRange=\{\{\s*label:\s*"([^"]+)"/.exec(props);
        expect(def.dateRange?.label ?? null).toEqual(m ? m[1] : null);
      });

      it("counts in the screen's own noun", () => {
        const m = /countNoun="([^"]+)"/.exec(props);
        expect(def.countNoun ?? null).toEqual(m ? m[1] : null);
      });
    });
  }
});
