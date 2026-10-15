import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BOARD_FILTERS, BOARD_LABEL, blockName, boardFigures, boardHolder, boardState,
} from "@/lib/units/board";

/**
 * Three screens the app had to grow its own shape for: the availability board,
 * the task detail's tabs, and a checkpoint's move-up and move-down icons.
 *
 * Each is read back out of the web screen that owns it, so the phone cannot
 * keep a shape the web has changed.
 */

const read = (p: string) => readFileSync(p, "utf-8");

describe("the availability board is the web's board", () => {
  const grid = read("src/app/(app)/units/board/board-grid.tsx");

  it("paints the three states the web paints, and no fourth", () => {
    expect(Object.values(BOARD_LABEL).sort()).toEqual(["Available", "Booked", "Held"]);
    // The grid reads them from the shared module rather than its own copy.
    expect(grid.includes('from "@/lib/units/board"')).toBe(true);
    expect(grid.includes("const BOARD_STATE")).toBe(false);
  });

  it("maps a status to a state as the web's own table does", () => {
    expect(boardState("AVAILABLE")).toBe("AVAILABLE");
    // A blocked flat is held back, and everything after a booking is still gone.
    expect(boardState("BLOCKED")).toBe("HELD");
    expect(boardState("HELD")).toBe("HELD");
    expect(boardState("BOOKED")).toBe("BOOKED");
    expect(boardState("AGREEMENT")).toBe("BOOKED");
    expect(boardState("REGISTERED")).toBe("BOOKED");
    // Anything unknown reads as free rather than disappearing.
    expect(boardState("SOMETHING_NEW")).toBe("AVAILABLE");
  });

  it("offers the chips the web offers", () => {
    expect(BOARD_FILTERS.map((f) => f.label)).toEqual(["All", "Available", "Held", "Booked"]);
    for (const f of BOARD_FILTERS) {
      expect(grid.includes(`"${f.label}"`), `the board no longer has a ${f.label} chip`).toBe(true);
    }
  });

  it("calls a villa project's blocks clusters, as the design does", () => {
    expect(blockName("A", "Villa Enclave")).toBe("Cluster A");
    expect(blockName("A", "Apartment")).toBe("Tower A");
    // A block already named for itself is left alone.
    expect(blockName("Tower D", "Apartment")).toBe("Tower D");
    expect(blockName("Block 2", null)).toBe("Block 2");
  });

  it("counts the right rail's three figures", () => {
    const units = [
      { status: "AVAILABLE" }, { status: "AVAILABLE" }, { status: "BLOCKED" },
      { status: "REGISTERED" }, { status: "BOOKED" },
    ];
    expect(boardFigures(units)).toEqual([
      { value: "2", label: "Available" },
      { value: "1", label: "On hold" },
      { value: "2", label: "Booked" },
    ]);
    for (const label of ["Available", "On hold", "Booked"]) {
      expect(grid.includes(`label="${label}"`), `the rail no longer counts ${label}`).toBe(true);
    }
  });

  it("names one person against a flat, falling back to the lead", () => {
    expect(boardHolder({ status: "BOOKED", hold: null, booking: { customerName: "Vikram T." } }))
      .toEqual({ label: "Booked for", name: "Vikram T." });
    expect(boardHolder({ status: "HELD", hold: { customerName: null, leadName: "Priya N." }, booking: null }))
      .toEqual({ label: "Held for", name: "Priya N." });
    expect(boardHolder({ status: "AVAILABLE", hold: null, booking: null })).toBeNull();
  });
});

describe("the task detail's tabs are the web's tabs", () => {
  const detail = read("src/app/(app)/tasks/[id]/task-detail.tsx");
  const record = read("src/lib/records/task.ts");

  it("has the same three, in the same words", () => {
    for (const label of ["Checklist", "Review and approval", "History"]) {
      expect(detail.includes(`"${label}"`), `the web no longer has a ${label} tab`).toBe(true);
      expect(record.includes(`label: "${label}"`), `the record does not send a ${label} tab`).toBe(true);
    }
  });

  it("puts a checklist behind the checklist tab and the rest behind history", () => {
    expect(record.includes('tab: "checklist"')).toBe(true);
    expect(record.includes('tab: "levels"')).toBe(true);
    expect(record.includes('tab: "history"')).toBe(true);
  });

  it("judges a point with Approve and Deny, and nothing else", () => {
    expect(detail.includes(">\n                Approve\n              </button>")).toBe(true);
    expect(record.includes('label: "Approve"')).toBe(true);
    expect(record.includes('label: "Deny"')).toBe(true);
    // The verdict square the web draws at the head of a line.
    expect(record.includes('text: "✓"')).toBe(true);
    expect(record.includes('text: "✕"')).toBe(true);
  });

  it("counts what is waiting on the viewer, as the web's chip does", () => {
    expect(detail.includes("Yours to review")).toBe(true);
    expect(detail.includes("Yours to approve")).toBe(true);
    expect(record.includes("Yours to review")).toBe(true);
    expect(record.includes("Yours to approve")).toBe(true);
  });
});

describe("a checkpoint moves by the web's own icons", () => {
  const screen = read("src/app/(app)/checklists/checklists-screen.tsx");
  const record = read("src/lib/records/checklist.ts");

  it("carries ↑ ↓ 🗑 with the names the web gives them", () => {
    for (const [glyph, label] of [["↑", "Move up"], ["↓", "Move down"], ["🗑", "Delete checkpoint"]]) {
      expect(screen.includes(`label="${label}"`), `the web no longer has a ${label} icon`).toBe(true);
      expect(screen.includes(`>${glyph}<`), `the web no longer draws ${glyph}`).toBe(true);
      expect(record.includes(`glyph: "${glyph}"`), `the record does not send ${glyph}`).toBe(true);
      expect(record.includes(`label: "${label}"`), `the record does not name it ${label}`).toBe(true);
    }
    // And the text is edited by a worded link, as on the web.
    expect(screen.includes("Edit text")).toBe(true);
    expect(record.includes('label: "Edit text"')).toBe(true);
  });
});
