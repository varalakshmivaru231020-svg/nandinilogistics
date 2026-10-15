import "server-only";

import { grnMatch } from "@/lib/material/list-filters";
import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, qty } from "@/lib/utils";

/**
 * The goods-receipt row, as `grn-card.tsx` draws it: the GRN number, what it
 * is against, what arrived on the first line and of how much ordered, whether
 * there is a challan photo and who inspected it, the three figures the card
 * splits a receipt into — accepted, rejected, short — and where it sits in the
 * three-way match.
 *
 * `grnLineSummary` is the page's own arithmetic, moved here so the card and the
 * phone read one set of figures.
 */

export interface GrnLine {
  receivedQty: unknown;
  acceptedQty: unknown;
  rejectedQty: unknown;
  shortQty: unknown;
  poItem?: { orderedQty: unknown } | null;
  item: { name: string; uom: { name: string } };
}

export function grnLineSummary(items: GrnLine[]): {
  accepted: number;
  rejected: number;
  short: number;
  unit: string | null;
  item: string;
} {
  const accepted = items.reduce((n, i) => n + Number(i.acceptedQty), 0);
  const rejected = items.reduce((n, i) => n + Number(i.rejectedQty), 0);
  const short = items.reduce((n, i) => n + Number(i.shortQty), 0);
  // The design names the unit beside each figure; a receipt mixing units has
  // no single one to name.
  const units = new Set(items.map((i) => i.item.uom.name));
  const unit = units.size === 1 ? [...units][0] : null;
  // The design names the first line and what it delivered of its order.
  const first = items[0];
  const ordered = first ? Number(first.poItem?.orderedQty ?? 0) : 0;
  const item = first
    ? `${first.item.name} · ${qty(first.receivedQty, 3)}${ordered ? ` of ${qty(ordered, 3)}` : ""} ${first.item.uom.name}` +
      (items.length > 1 ? ` +${items.length - 1}` : "")
    : "—";
  return { accepted, rejected, short, unit, item };
}

export interface GrnRowInput {
  id: string;
  grnNo: string;
  poNo: string;
  vendor: string;
  grnDate: Date | string;
  status: string;
  hasChallanPhoto: boolean;
  inspectedBy: string | null;
  invoices: number;
  items: GrnLine[];
}

export function grnScreenRow(g: GrnRowInput): ScreenRow {
  const { accepted, rejected, short, unit, item } = grnLineSummary(g.items);
  const match = grnMatch(g.status, rejected, short, g.invoices);
  const u = unit ? ` ${unit}` : "";

  return {
    id: g.id,
    title: g.grnNo,
    meta: `against ${g.poNo} · ${g.vendor} · ${formatDate(g.grnDate)}`,
    lines: [
      { value: item },
      {
        value:
          (g.hasChallanPhoto ? "challan photo ✓" : "no challan photo") +
          (g.inspectedBy ? ` · insp. ${g.inspectedBy}` : " · not inspected"),
      },
    ],
    chips: [
      { text: `Accepted ${qty(accepted)}${u}`, tone: "good" },
      ...(rejected > 0 ? [{ text: `Rejected ${qty(rejected)}${u}`, tone: "bad" as const }] : []),
      ...(short > 0 ? [{ text: `Short ${qty(short)}${u}`, tone: "warn" as const }] : []),
    ],
    status: { label: match.label, tone: webTone(match.tone) },
  };
}

export function grnEmpty(filtered: boolean) {
  return {
    title: filtered ? "No goods receipts match these filters" : "Nothing received yet",
  };
}

export const GRN_NOTE =
  "Three-way match: PO ↔ GRN ↔ Invoice. A mismatch is blocked or flagged — never quietly paid. " +
  "Only accepted stock enters the ledger.";
