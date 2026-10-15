import "server-only";

import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { webTone } from "@/lib/records/shared";
import type { RecordAction } from "@/lib/records/types";
import type { BoardFlat, ScreenBoard } from "@/lib/screens/rows";
import { blockName, BOARD_FILTERS, BOARD_LABEL, boardHolder, boardState } from "@/lib/units/board";
import { formatDate, qty } from "@/lib/utils";

/**
 * The availability board, for the phone — the same board `/units/board` draws.
 *
 * The web's own vocabulary comes from `src/lib/units/board.ts`, which its grid
 * reads too: the three states, their words, whether a block is a tower or a
 * cluster, and who the panel names against a flat. What is added here is the
 * panel's buttons, under the same conditions the web's `UnitPanel` applies.
 */

export interface BoardBlockInput {
  id: string;
  name: string;
  units: Array<{
    id: string;
    unitNumber: string;
    floorNumber: number;
    status: string;
    superBuiltUpArea: unknown;
    unitType: { name: string } | null;
    hold: { id: string; customerName: string | null; leadName: string | null } | null;
    booking: { id: string; status: string; customerName: string } | null;
  }>;
}

/**
 * The panel's buttons: release what is held or booked, or reserve what is free.
 *
 * `UnitPanel` offers exactly these, and refuses to release a registered flat —
 * that takes a deed cancellation, which the action itself would refuse.
 */
export function boardFlatActions(
  u: BoardBlockInput["units"][number],
  can: { hold: boolean; book: boolean; release: boolean; cancelBooking: boolean },
): RecordAction[] {
  const held = u.status === "HELD";
  const actions: RecordAction[] = [];

  if (held && can.release && u.hold) {
    actions.push({
      key: "release",
      label: "Release hold — back to Available",
      emphasis: "reject",
      action: "sales/cost-sheets/releaseHold",
      args: [u.hold.id, ""],
      remark: "none",
      confirm: `Unit ${u.unitNumber} goes back to Available.`,
    });
  }

  if (!held && u.booking && can.cancelBooking && u.status !== "REGISTERED") {
    actions.push({
      key: "removeBooking",
      label: "Remove booking — back to Available",
      emphasis: "reject",
      action: "sales/bookings/cancelBooking",
      args: [u.booking.id, "$reason"],
      remark: "none",
      fields: [
        {
          name: "reason",
          label: "Why is it being released?",
          kind: "textarea",
          required: true,
          placeholder: "e.g. customer withdrew, cheque bounced",
          wide: true,
        },
      ],
      confirm: "The flat goes back to Available and every unpaid demand on it is cancelled.",
    });
  }

  // A flat that is free, or one already held, can be reserved.
  if (u.status === "AVAILABLE" || held) {
    if (can.hold) {
      actions.push({
        key: "hold",
        label: "Hold unit",
        emphasis: "outline",
        action: "sales/cost-sheets/holdUnit",
        args: [u.id, null, "$customerId", "$remarks"],
        remark: "none",
        // Every free flat asks the same question, so the board sends it once.
        fieldsFrom: "hold",
        confirm: "The flat is held, and shows as Held on the board until it is released.",
      });
    }
  }

  return actions;
}

export function boardFlat(
  u: BoardBlockInput["units"][number],
  can: { hold: boolean; book: boolean; release: boolean; cancelBooking: boolean },
): BoardFlat {
  const state = boardState(u.status);
  const holder = boardHolder({ status: u.status, hold: u.hold, booking: u.booking });
  return {
    id: u.id,
    number: u.unitNumber,
    floor: u.floorNumber,
    type: u.unitType?.name ?? null,
    state,
    stateLabel: BOARD_LABEL[state],
    summary: `${u.unitType?.name ?? "—"} · ${qty(Number(u.superBuiltUpArea), 0)} sq ft · ${BOARD_LABEL[state]}`,
    ...(holder ? { holder } : {}),
    /*
     * The web's panel has a Book button, and booking from the board is a
     * sequence rather than one action: a cost sheet is raised for the flat and
     * the booking follows it. Both live on the flat's own record, so the panel
     * carries the web's word and opens that record.
     */
    open: can.book && (u.status === "AVAILABLE" || u.status === "HELD")
      ? "Book unit"
      : "Open the flat",
    actions: boardFlatActions(u, can),
  };
}

export function screenBoard(
  ctx: AuthContext,
  input: {
    project: { id: string; name: string } | null;
    projects: Array<{ id: string; name: string }>;
    projectType: string | null;
    blocks: BoardBlockInput[];
    priceList: { version: number | string; effectiveFrom: Date } | null;
    customers: Array<{ id: string; name: string; phone: string }>;
  },
): ScreenBoard {
  const can = {
    hold: ctx.has(PERM.unit.hold.create),
    release: ctx.has(PERM.unit.hold.release),
    cancelBooking: ctx.has(PERM.sales.booking.cancel),
    book: ctx.has(PERM.sales.booking.create) && ctx.has(PERM.sales.costSheet.create),
  };

  return {
    project: input.project,
    projects: input.projects,
    blocks: input.blocks.map((b) => ({
      id: b.id,
      name: blockName(b.name, input.projectType),
      flats: b.units.map((u) => boardFlat(u, can)),
    })),
    legend: (["AVAILABLE", "HELD", "BOOKED"] as const).map((value) => ({
      value,
      label: BOARD_LABEL[value],
      tone: webTone(value === "AVAILABLE" ? "good" : value === "HELD" ? "warn" : "bad"),
    })),
    filters: BOARD_FILTERS,
    types: [
      ...new Set(
        input.blocks.flatMap((b) => b.units.map((u) => u.unitType?.name).filter(Boolean) as string[]),
      ),
    ],
    priceList: input.priceList
      ? `Price list ${input.priceList.version} · effective ${formatDate(input.priceList.effectiveFrom)} · holds released manually`
      : null,
    // What "Hold unit" asks for, sent once — the drawer's own two questions.
    ...(can.hold
      ? {
          fieldSets: {
            hold: [
              {
                name: "customerId",
                label: "Hold for",
                kind: "lookup" as const,
                required: true,
                options: input.customers.map((c) => ({ value: c.id, label: c.name, hint: c.phone })),
              },
              { name: "remarks", label: "Remarks", kind: "textarea" as const, wide: true },
            ],
          },
        }
      : {}),
    emptyTower: "No units in this tower yet",
  };
}
