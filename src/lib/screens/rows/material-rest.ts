import "server-only";

import { TRANSFER_STATUS_TONE } from "@/lib/material/transfer-display";
import { webTone } from "@/lib/records/shared";
import type { RecordAction } from "@/lib/records/types";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, money, qty } from "@/lib/utils";

/**
 * Four rows the procurement screens draw inline rather than in a card of their
 * own: a store transfer, a vendor invoice, a vendor payment and a reorder
 * alert. Each page imports its tone map and its empty wording from here, so
 * the word on the phone is the word on the screen.
 */

/* -------------------------------------------------------------- transfers */

export function transferScreenRow(
  t: {
    id: string;
    transferNo: string;
    status: string;
    fromStoreName: string;
    toStoreName: string;
    transferDate: Date | string;
    lineCount: number;
  },
  /** The transfer's own decisions — the web row calls approving "despatch". */
  actions: RecordAction[] = [],
): ScreenRow {
  return {
    id: t.id,
    title: t.transferNo,
    status: {
      label: t.status.replace(/_/g, " "),
      tone: webTone(TRANSFER_STATUS_TONE[t.status] ?? "slate"),
    },
    meta: `${t.fromStoreName} → ${t.toStoreName} · ${formatDate(t.transferDate)} · ${t.lineCount} line(s)`,
    actions: asRowActions(actions, {
      approve: "Approve & despatch",
      receive: "Receive",
    }),
  };
}

/* --------------------------------------------------------------- invoices */

export const INVOICE_STATUS_TONE: Record<string, "slate" | "good" | "bad" | "warn" | "brand" | "navy"> = {
  DRAFT: "slate", MATCHED: "brand", MISMATCH: "bad", APPROVED: "good",
  PARTIALLY_PAID: "warn", PAID: "navy", CANCELLED: "slate",
};

export function invoiceScreenRow(i: {
  id: string;
  invoiceNo: string;
  poNo: string;
  vendor: string;
  invoiceDate: Date | string;
  totalAmount: number;
  paidAmount: number;
  status: string;
}): ScreenRow {
  const out = i.totalAmount - i.paidAmount;
  return {
    id: i.id,
    title: i.invoiceNo,
    meta: `against ${i.poNo} · ${i.vendor} · ${formatDate(i.invoiceDate)}`,
    lines: [
      { label: "Paid", value: i.paidAmount > 0 ? money(i.paidAmount) : "—" },
      { label: "Outstanding", value: out > 0.01 ? money(out) : "—" },
    ],
    trailing: { value: money(i.totalAmount), label: "Amount" },
    status: {
      label: i.status.replace(/_/g, " "),
      tone: webTone(INVOICE_STATUS_TONE[i.status] ?? "slate"),
    },
  };
}

export function invoiceEmpty(filtered: boolean) {
  return {
    title: filtered ? "No invoices match these filters" : "No invoices recorded",
    description:
      "An invoice is captured against its purchase order and matched to what was actually received.",
  };
}

/* --------------------------------------------------------------- payments */

export function paymentScreenRow(p: {
  id: string;
  paymentNo: string;
  invoiceNo: string;
  vendor: string;
  paymentDate: Date | string;
  mode: string;
  referenceNo: string | null;
  amount: number;
}): ScreenRow {
  return {
    id: p.id,
    title: p.paymentNo,
    meta: `against ${p.invoiceNo} · ${p.vendor} · ${formatDate(p.paymentDate)}`,
    chips: [{ text: p.mode, tone: "draft" }],
    lines: [{ label: "Reference", value: p.referenceNo ?? "—" }],
    trailing: { value: money(p.amount), label: "Amount" },
  };
}

export function paymentEmpty(filtered: boolean) {
  return {
    title: filtered ? "No payments match these filters" : "No payments yet",
    description: "Payments are recorded from the invoice, once it is approved.",
  };
}

/* ---------------------------------------------------------------- reorder */

export function reorderScreenRow(
  r: {
    id: string;
    code: string;
    name: string;
    category: string;
    uom: string;
    onHand: number;
    reorderLevel: number;
    standardRate: number;
  },
  showValue: boolean,
): ScreenRow {
  const shortfall = Math.max(0, r.reorderLevel - r.onHand);
  return {
    id: r.id,
    title: r.name,
    meta: `${r.code} · ${r.category}`,
    lines: [
      { label: "On hand", value: `${qty(r.onHand, 3)} ${r.uom}` },
      { label: "Reorder level", value: `${qty(r.reorderLevel, 3)} ${r.uom}` },
      ...(showValue
        ? [{ label: "Est. cost to replenish", value: money(shortfall * r.standardRate) }]
        : []),
    ],
    trailing: { value: qty(shortfall, 3), label: "Shortfall" },
  };
}

export function reorderEmpty(filtered: boolean, anyAlerts: boolean) {
  return {
    title: filtered && anyAlerts ? "No reorder alerts match these filters" : "Nothing needs reordering",
    description: "Every item with a reorder level is currently above it.",
  };
}
