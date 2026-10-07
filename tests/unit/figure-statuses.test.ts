import { $Enums } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  INDENT_CLEARED, INDENT_WAITING, PO_OPEN, PO_WAITING, UNIT_GONE,
} from "@/lib/metrics/figures";

/**
 * Every status a module figure counts, checked against the enum it comes from.
 *
 * This exists because three of these were wrong and nothing noticed. The flats
 * band counted "HOLD" and "SOLD" — neither is a UnitStatus, so held flats read
 * as none and the sold figure missed every flat that had reached agreement or
 * registration. The purchase order band counted "SUBMITTED" and "SENT", which
 * are not PurchaseOrderStatus either, so "awaiting approval" could never be
 * anything but zero.
 *
 * A status is a string in TypeScript, so comparing one to a row's status
 * compiles whatever it says. The only way to catch a name that does not exist
 * is to ask the enum, which is what this does.
 */

function assertMembers(name: string, used: readonly string[], members: Record<string, string>) {
  const real = Object.values(members);
  for (const status of used) {
    expect(real, `${name}: "${status}" is not a ${name} — it is one of ${real.join(", ")}`)
      .toContain(status);
  }
}

describe("the statuses the module figures count are real", () => {
  it("indents waiting on a decision", () => {
    assertMembers("IndentStatus", INDENT_WAITING, $Enums.IndentStatus);
  });

  it("indents that have cleared approval", () => {
    assertMembers("IndentStatus", INDENT_CLEARED, $Enums.IndentStatus);
  });

  it("purchase orders still expecting goods", () => {
    assertMembers("PurchaseOrderStatus", PO_OPEN, $Enums.PurchaseOrderStatus);
  });

  it("purchase orders waiting on a decision", () => {
    assertMembers("PurchaseOrderStatus", PO_WAITING, $Enums.PurchaseOrderStatus);
  });

  it("flats that are no longer for sale", () => {
    assertMembers("UnitStatus", UNIT_GONE, $Enums.UnitStatus);
  });

  /*
   * The two groups must not overlap either: an indent cannot be both waiting
   * and decided, and a figure that counted it twice would quietly inflate.
   */
  it("keeps waiting and cleared indents apart", () => {
    const both = INDENT_WAITING.filter((s) => (INDENT_CLEARED as readonly string[]).includes(s));
    expect(both).toEqual([]);
  });

  it("keeps waiting and open purchase orders apart", () => {
    const both = PO_WAITING.filter((s) => (PO_OPEN as readonly string[]).includes(s));
    expect(both).toEqual([]);
  });

  it("does not count an available flat as gone", () => {
    expect(UNIT_GONE).not.toContain("AVAILABLE");
    expect(UNIT_GONE).not.toContain("HELD");
  });
});
