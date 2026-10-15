import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";
import { LEAD_SOURCE_TONE } from "@/lib/sales/lead-display";

/**
 * The composed row is the web's row, or this test fails.
 *
 * `src/lib/screens/rows/` builds each list row the way the web screen builds
 * it, and the list route sends it in its JSON mode. Two things can rot:
 *
 *  1. a list stops sending a composed row, and the phone falls back to the
 *     export's flat columns — which is the state this whole layer replaced;
 *  2. a word drifts — the screen renames a badge and the row keeps the old
 *     spelling, which is exactly how "On hold" became "INACTIVE" on the phone.
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

/**
 * A report is a table of figures with no record behind its rows, and the web
 * shows exactly those columns — so the columns are the screen, and there is
 * nothing to compose. Everything else must compose its row.
 */
const REPORTS = new Set(["tasks/reports"]);

/** Every row builder, read once — the rows and their buttons are asserted against it. */
const ALL_ROWS = [
  "indent", "purchase-order", "grn", "vendor", "issue", "return", "material-rest",
  "lead", "follow-up", "site-visit", "customer", "booking", "sales-rest", "unit",
  "hr", "task", "exec", "stock",
].map((m) => readFileSync(`src/lib/screens/rows/${m}.ts`, "utf-8")).join("\n");

describe("every list sends the screen's own row", () => {
  for (const key of MOBILE_LIST_KEYS) {
    it(key, () => {
      const route = ROUTE[KEY_TO_ALIAS[key]];
      expect(route, `${key} has no route in the generated map`).toBeTruthy();
      const src = read(route);

      if (REPORTS.has(key)) {
        expect(src.includes("screen,"), `${key} is listed as a report but composes a row`).toBe(false);
        return;
      }

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
  /**
   * The label a row button carries, against the screen whose row carries it.
   *
   * The decision behind each one is the module's own `…Decisions` function,
   * which the record screen asks too — what is asserted here is the wording,
   * because the web's row says "Clear" where its record says "Mark cleared",
   * and a row that renamed a button would be a different product wearing the
   * same name.
   */
  const BUTTONS: Array<[string, string, string[]]> = [
    ["purchase order", "src/app/(app)/material/purchase-orders/approve-button.tsx", ["✓ Admin approve", "✓ PM approve"]],
    ["issue", "src/app/(app)/material/issues/issues-screen.tsx", ["Acknowledge receipt", "Raise return", "Cancel issue"]],
    ["transfer", "src/app/(app)/material/transfers/transfers-screen.tsx", ["Approve &amp; despatch", "Receive"]],
    ["customer", "src/app/(app)/sales/customers/customers-screen.tsx", ["Verify KYC"]],
    ["price list", "src/app/(app)/units/price-lists/price-lists-screen.tsx", ["Make active"]],
    ["receipt", "src/app/(app)/sales/receipts/receipt-clearance-controls.tsx", ["Clear", "Bounce"]],
    ["site visit", "src/app/(app)/sales/site-visits/site-visits-screen.tsx", ["Record outcome"]],
    ["task", "src/app/(app)/tasks/tasks-screen.tsx", ["Accept", "Start"]],
    ["employee", "src/app/(app)/hr/hr-screen.tsx", ["Activate", "Edit", "Delete"]],
    ["unit", "src/app/(app)/units/unit-manager.tsx", ["Edit", "Block", "Unblock", "Delete"]],
    ["approval", "src/app/(app)/approvals/approvals-screen.tsx", ["Approve", "Reject"]],
  ];

  for (const [what, file, labels] of BUTTONS) {
    it(`${what}: ${labels.join(", ")}`, () => {
      const screen = read(file);
      for (const label of labels) {
        expect(screen.includes(label), `the ${what} row no longer says “${label}”`).toBe(true);
        expect(
          ALL_ROWS.includes(label.replace("&amp;", "&")),
          `no ${what} row button is labelled “${label}”`,
        ).toBe(true);
      }
    });
  }

  it("every row button names an action the boundary has", async () => {
    const { MOBILE_ACTIONS } = await import("@/lib/api/mobile-actions");
    const keys = new Set(Object.keys(MOBILE_ACTIONS));
    const named = [...ALL_ROWS.matchAll(/action: "([a-z][^"]*)"/g)].map((m) => m[1]);
    expect(named.length, "no row builder names an action").toBeGreaterThan(5);
    for (const key of named) {
      expect(keys.has(key), `${key} is not an action the boundary dispatches`).toBe(true);
    }
  });
});

describe("the words are the screen's words", () => {
  it("the lead source chips cover the sources the screen colours", () => {
    const screen = read("src/app/(app)/sales/leads/leads-screen.tsx");
    const keys = [...screen.matchAll(/^  "?([a-z0-9-]+)"?: "bg-[a-z]/gm)].map((m) => m[1]);
    expect(keys.length, "the screen's SOURCE_TONE map could not be read").toBeGreaterThan(3);
    expect(Object.keys(LEAD_SOURCE_TONE).sort()).toEqual(keys.sort());
  });

  /**
   * Each phrase a row writes, against the screen that writes it.
   *
   * Only phrases the screen still spells out itself. Where a word has been
   * lifted into a shared `*-display.ts` module that both sides import, there is
   * nothing left to compare — and nothing left to drift.
   */
  const SAID: Array<[string, string, string[]]> = [
    [
      "indent",
      "src/app/(app)/material/indents/indent-card.tsx",
      ["Required by", "raised"],
    ],
    [
      "purchase order",
      "src/app/(app)/material/purchase-orders/page.tsx",
      ["Vendor", "Items", "Delivery", "from "],
    ],
    [
      "goods receipt",
      "src/app/(app)/material/grn/grn-card.tsx",
      ["against ", "challan photo ✓", "no challan photo", "not inspected", "Accepted ", "Rejected ", "Short "],
    ],
    [
      "vendor",
      "src/app/(app)/material/vendors/page.tsx",
      ["No contact recorded", "GSTIN · PAN", "Terms · POs", "on-time", "spend"],
    ],
    [
      "issue",
      "src/app/(app)/material/issues/issues-screen.tsx",
      ["Cancelled", "Acknowledged", "Awaiting acknowledgement", "Part returned", "return(s) pending", "issued by "],
    ],
    [
      "return",
      "src/app/(app)/material/returns/page.tsx",
      ["Against ", "into ", "damaged line(s)", "raised by "],
    ],
    [
      "booking",
      "src/app/(app)/sales/bookings/page.tsx",
      ["unit ", "Collected", "Overdue", "Sold by"],
    ],
    [
      "task",
      "src/app/(app)/tasks/tasks-screen.tsx",
      ["Location", "Assignee", "Due", "Evidence", "file(s)", "with ", "extension waiting", "Checklist"],
    ],
    [
      "unit",
      "src/app/(app)/units/page.tsx",
      ["Type", "Floor", "Super built-up", "Facing", "Parking"],
    ],
    [
      "site progress",
      "src/app/(app)/projects/progress/progress-screen.tsx",
      ["on site", "photo(s)", "by "],
    ],
    [
      "project",
      "src/app/(app)/projects/page.tsx",
      ["RERA not recorded", "Unassigned", "tower", "units"],
    ],
    [
      "price list",
      "src/app/(app)/units/price-lists/price-lists-screen.tsx",
      ["Effective ", " onwards", "Base", "Floor rise", "PLC", "Active", "Superseded"],
    ],
    [
      "follow-up",
      "src/app/(app)/sales/follow-ups/follow-ups-screen.tsx",
      // The bucket names themselves are no longer here to compare: they live
      // in `follow-up-display.ts`, which this screen imports — which is a
      // stronger guarantee than a matching string.
      ["Remarks", "When"],
    ],
    [
      "employee",
      "src/app/(app)/hr/hr-screen.tsx",
      ["Aadhaar · PAN", "Address", "Inactive", "alt "],
    ],
    [
      "attendance",
      "src/app/(app)/hr/hr-screen.tsx",
      ["Present", "Half day", "Absent", "Payable days", "Overtime"],
    ],
    [
      "approval",
      "src/app/(app)/approvals/approvals-screen.tsx",
      ["waiting "],
    ],
  ];

  for (const [what, file, phrases] of SAID) {
    it(`${what} says what its screen says`, () => {
      const screen = read(file);
      for (const phrase of phrases) {
        expect(screen.includes(phrase), `the ${what} screen no longer says “${phrase}”`).toBe(true);
        expect(ALL_ROWS.includes(phrase), `no ${what} row writes “${phrase}”`).toBe(true);
      }
    });
  }
});
