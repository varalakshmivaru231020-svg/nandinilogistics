import "server-only";

import { webTone } from "@/lib/records/shared";
import type { RecordAction } from "@/lib/records/types";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, money, qty } from "@/lib/utils";

/**
 * Two rows from the units module: a flat, as the table in
 * `src/app/(app)/units/page.tsx` draws it, and a price-list version, as
 * `price-lists-screen.tsx` draws it.
 */

export const UNIT_STATUS_TONE: Record<string, "good" | "warn" | "brand" | "navy" | "slate" | "bad"> = {
  AVAILABLE: "good", HELD: "warn", BOOKED: "brand",
  AGREEMENT: "navy", REGISTERED: "slate", BLOCKED: "bad",
};

export interface UnitRowInput {
  id: string;
  unitNumber: string;
  projectCode: string;
  block: string | null;
  unitType: string | null;
  floorNumber: number;
  carpetArea: number;
  superBuiltUpArea: number;
  facing: string | null;
  plcTag: string | null;
  parkingSlots: number;
  status: string;
}

export function unitScreenRow(
  u: UnitRowInput,
  showPrice: boolean,
  /** The flat's own decisions — the web row carries Edit, Block and Delete. */
  actions: RecordAction[] = [],
): ScreenRow {
  return {
    id: u.id,
    title: u.unitNumber,
    meta: `${u.projectCode} · ${u.block ?? "—"}`,
    ...(u.plcTag ? { chips: [{ text: u.plcTag, tone: webTone("warn") }] } : {}),
    lines: [
      { label: "Type", value: u.unitType ?? "—" },
      { label: "Floor", value: String(u.floorNumber) },
      ...(showPrice ? [{ label: "Carpet (sq.ft)", value: qty(u.carpetArea, 0) }] : []),
      { label: "Super built-up", value: qty(u.superBuiltUpArea, 0) },
      { label: "Facing", value: u.facing ?? "—" },
      { label: "Parking", value: String(u.parkingSlots) },
    ],
    status: { label: u.status, tone: webTone(UNIT_STATUS_TONE[u.status] ?? "slate") },
    // The row's icons have these as their accessible names.
    actions: asRowActions(actions, {
      edit: "Edit",
      block: "Block",
      unblock: "Unblock",
      delete: "Delete",
    }),
  };
}

/** The table's own line when nothing matches. */
export const UNIT_EMPTY = { title: "No units match these filters." };

/* ------------------------------------------------------------ price lists */

export interface PriceListRowInput {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  projectCode: string;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
  baseRate: number;
  floorRise: number;
  plcAmount: number;
}

/** The button the web's price-list row carries while a version is superseded. */
export function priceListRowActions(
  l: { id: string; isActive: boolean },
  can: { activate: boolean },
): RecordAction[] {
  if (l.isActive || !can.activate) return [];
  return [{
    key: "activate",
    label: "Make active",
    emphasis: "primary",
    action: "units/price-lists/activatePriceList",
    args: [l.id],
    remark: "none",
    confirm: "Cost sheets generated from today use this version. Existing bookings keep their rate.",
  }];
}

export function priceListScreenRow(
  l: PriceListRowInput,
  can: { activate: boolean } = { activate: false },
): ScreenRow {
  return {
    id: l.id,
    title: `v${l.version} · ${l.name}`,
    meta:
      `${l.projectCode} · Effective ${formatDate(l.effectiveFrom)}` +
      (l.effectiveTo ? ` – ${formatDate(l.effectiveTo)}` : " onwards"),
    lines: [
      { label: "Base", value: `${money(l.baseRate)}/sq.ft` },
      { label: "Floor rise", value: money(l.floorRise) },
      { label: "PLC", value: money(l.plcAmount) },
    ],
    status: l.isActive
      ? { label: "Active", tone: "good" }
      : { label: "Superseded", tone: "draft" },
    actions: priceListRowActions(l, can),
  };
}

export { priceListEmpty } from "@/lib/units/price-list-display";
