import "server-only";

import { deliveryLabel, PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/material/po-display";
import { webTone } from "@/lib/records/shared";
import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, moneyShort, qty } from "@/lib/utils";

/**
 * The purchase-order row, as the table in
 * `src/app/(app)/material/purchase-orders/page.tsx` renders one: the PO number
 * with its revision badge, where it came from and when, how far the two
 * approvals have got, the vendor, the first item, the value for whoever may see
 * rates, the delivery line in its own tone, and the status.
 */

export interface PoRowInput {
  id: string;
  poNo: string;
  revision: number;
  status: string;
  poDate: Date | string;
  expectedDate: Date | string | null;
  totalAmount: unknown;
  vendor: string;
  sourceIndentNo: string | null;
  raisedBy: string;
  raisedByDesignation: string | null;
  pmApprovedBy: string | null;
  adminApprovedBy: string | null;
  firstItem: { name: string; orderedQty: unknown; uom: string } | null;
  lineCount: number;
}

/** Who is credited on the row — the web shows the furthest approval reached. */
export function poCredit(p: PoRowInput): string {
  if (p.adminApprovedBy) return `approved ${p.adminApprovedBy}`;
  if (p.pmApprovedBy) return `PM ✓ ${p.pmApprovedBy}`;
  return `raised ${p.raisedBy}${p.raisedByDesignation ? ` · ${p.raisedByDesignation}` : ""}`;
}

/**
 * The two buttons the web's PO row carries, in its own words — "✓ PM approve"
 * and "✓ Admin approve" — each with the remark the row sends with it.
 */
export function poRowActions(
  p: { id: string; status: string },
  can: { approvePm: boolean; approveAdmin: boolean },
): RecordAction[] {
  if (p.status === "PENDING_PM" && can.approvePm) {
    return [{
      key: "approvePm",
      label: "✓ PM approve",
      emphasis: "approve",
      action: "material/purchase-orders/approvePoPm",
      args: [p.id, "Approved from the purchase order list"],
      remark: "none",
      confirm: "It goes to the Admin for the second approval.",
    }];
  }
  if (p.status === "PENDING_ADMIN" && can.approveAdmin) {
    return [{
      key: "approveAdmin",
      label: "✓ Admin approve",
      emphasis: "approve",
      action: "material/purchase-orders/approvePoAdmin",
      args: [p.id, "Approved from the purchase order list"],
      remark: "none",
      confirm: "The order is placed with the vendor and goods can be received against it.",
    }];
  }
  return [];
}

export function poScreenRow(
  p: PoRowInput,
  nowMs: number,
  showRate: boolean,
  can: { approvePm: boolean; approveAdmin: boolean },
): ScreenRow {
  const delivery = deliveryLabel(p.expectedDate, p.status, nowMs);
  const more = p.lineCount - 1;

  return {
    id: p.id,
    title: p.poNo,
    ...(p.revision > 0 ? { chips: [{ text: `rev ${p.revision}`, tone: webTone("warn") }] } : {}),
    meta: `from ${p.sourceIndentNo ?? "—"} · ${formatDate(p.poDate)} · ${poCredit(p)}`,
    lines: [
      { label: "Vendor", value: p.vendor },
      {
        label: "Items",
        value: p.firstItem
          ? `${p.firstItem.name} · ${qty(p.firstItem.orderedQty, 3)} ${p.firstItem.uom}${more > 0 ? ` +${more}` : ""}`
          : "—",
      },
      { label: "Delivery", value: delivery.text },
    ],
    ...(showRate ? { trailing: { value: moneyShort(p.totalAmount), label: "Value" } } : {}),
    status: {
      label: PO_STATUS_LABEL[p.status] ?? p.status,
      tone: webTone(PO_STATUS_TONE[p.status] ?? "slate"),
    },
    actions: poRowActions(p, can),
  };
}

export function poEmpty(filtered: boolean) {
  return {
    title: filtered ? "No purchase orders match" : "No purchase orders yet",
    description:
      "A PO is raised from an approved indent, carrying only the shortfall left after the stock check.",
  };
}

export const PO_NOTE =
  "Every PO records who raised it and both approvals (Project Manager → Admin). Editing an " +
  "approved PO creates a new revision and restarts approval.";
