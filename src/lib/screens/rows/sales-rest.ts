import "server-only";

import { webTone } from "@/lib/records/shared";
import {
  RECEIPT_STATUS_LABEL, receiptStatus, type ReceiptStatus,
} from "@/lib/sales/receipt-status";
import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import { formatDate, money } from "@/lib/utils";

/**
 * Two more sales rows: a collection receipt and a cost sheet, as the tables in
 * `src/app/(app)/sales/receipts/page.tsx` and `.../cost-sheets/page.tsx` draw
 * them.
 */

/* --------------------------------------------------------------- receipts */

export const RECEIPT_STATUS_TONE: Record<ReceiptStatus, "good" | "warn" | "bad"> = {
  CLEARED: "good",
  PENDING_CLEARANCE: "warn",
  BOUNCED: "bad",
};

export interface ReceiptRowInput {
  id: string;
  receiptNo: string;
  projectCode: string;
  unitNumber: string;
  customerName: string;
  bookingNo: string;
  milestone: string | null;
  receiptDate: Date | string;
  mode: string;
  referenceNo: string | null;
  bankName: string | null;
  amount: number;
  clearedAt: Date | string | null;
  bouncedAt: Date | string | null;
  bounceReason: string | null;
}

export function receiptScreenRow(
  r: ReceiptRowInput,
  /** The receipt's own decisions — the web row names them "Clear" and "Bounce". */
  actions: RecordAction[] = [],
): ScreenRow {
  const status = receiptStatus({
    mode: r.mode,
    clearedAt: r.clearedAt === null ? null : new Date(r.clearedAt),
    bouncedAt: r.bouncedAt === null ? null : new Date(r.bouncedAt),
  });

  return {
    id: r.id,
    title: r.receiptNo,
    meta: `${r.projectCode} · unit ${r.unitNumber}`,
    chips: [{ text: r.mode, tone: "draft" }],
    lines: [
      { label: "Customer", value: r.customerName },
      { label: "Against", value: r.bookingNo + (r.milestone ? ` · ${r.milestone}` : "") },
      { label: "Received", value: formatDate(r.receiptDate) },
      { label: "Reference", value: (r.referenceNo ?? "—") + (r.bankName ? ` · ${r.bankName}` : "") },
      ...(status === "BOUNCED" && r.bounceReason ? [{ value: r.bounceReason }] : []),
      ...(status === "CLEARED" && r.clearedAt && (r.mode === "CHEQUE" || r.mode === "DD")
        ? [{ value: `on ${formatDate(r.clearedAt)}` }]
        : []),
    ],
    trailing: { value: money(r.amount), label: "Amount" },
    status: { label: RECEIPT_STATUS_LABEL[status], tone: webTone(RECEIPT_STATUS_TONE[status]) },
    actions: asRowActions(actions, { clear: "Clear", bounce: "Bounce" }),
  };
}

export function receiptEmpty(filtered: boolean) {
  return filtered
    ? { title: "No receipts match", description: "Try a different search, mode, status, project or date range." }
    : {
        title: "Nothing collected yet",
        description: "Receipts are recorded from a booking, against a raised milestone demand.",
      };
}

/* ------------------------------------------------------------- cost sheets */

export interface CostSheetRowInput {
  id: string;
  costSheetNo: string;
  projectCode: string;
  unitNumber: string;
  leadName: string | null;
  createdAt: Date | string;
  validUntil: Date | string | null;
  discountAmount: number;
  discountApproved: boolean;
  totalAmount: number;
  bookings: number;
}

export function costSheetScreenRow(s: CostSheetRowInput, nowMs: number): ScreenRow {
  const expired = s.validUntil ? new Date(s.validUntil).getTime() < nowMs : false;

  return {
    id: s.id,
    title: s.costSheetNo,
    meta: `${s.projectCode} · unit ${s.unitNumber}`,
    lines: [
      { label: "For", value: s.leadName ?? "—" },
      { label: "Generated", value: formatDate(s.createdAt) },
      {
        label: "Valid until",
        value: s.validUntil ? formatDate(s.validUntil) + (expired ? " · expired" : "") : "—",
      },
      {
        label: "Discount",
        value:
          s.discountAmount > 0
            ? `${money(s.discountAmount)} ${s.discountApproved ? "approved" : "pending"}`
            : "—",
      },
    ],
    trailing: { value: money(s.totalAmount), label: "Total" },
    status: s.bookings > 0
      ? { label: "Booked", tone: "good" }
      : { label: "Quoted", tone: "draft" },
  };
}

export function costSheetEmpty(filtered: boolean) {
  return filtered
    ? { title: "No cost sheets match", description: "Try a different search, status or project." }
    : {
        title: "No cost sheets yet",
        description:
          "Pick an available unit and the cost sheet is generated from the price list active on that date.",
      };
}
