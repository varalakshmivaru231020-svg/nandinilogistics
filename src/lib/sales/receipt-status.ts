import type { Prisma } from "@prisma/client";

/**
 * Whether the money on a collection receipt has actually been realised.
 *
 * Status is derived, never stored: a bounce or a clearance stamps a date on the
 * receipt and everything else follows from those two dates and the mode. That
 * is why existing electronic receipts need no backfill — they read as cleared.
 *
 * Pure, Prisma-free at runtime, shared by the screen, the export, the print
 * view and the clearance service.
 */

/** Modes whose money is realised the moment it is recorded. */
export const CLEARED_ON_ENTRY_MODES = ["NEFT", "RTGS", "UPI", "CASH"] as const;
/** Instruments the bank has to realise — they clear, or bounce, later. */
export const CLEARABLE_MODES = ["CHEQUE", "DD"] as const;

export const RECEIPT_STATUSES = ["CLEARED", "PENDING_CLEARANCE", "BOUNCED"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  CLEARED: "Cleared",
  PENDING_CLEARANCE: "Pending clearance",
  BOUNCED: "Bounced",
};

/** The list filter's URL values, mapped to a status. */
export const RECEIPT_STATUS_PARAMS = {
  cleared: "CLEARED",
  pending: "PENDING_CLEARANCE",
  bounced: "BOUNCED",
} as const satisfies Record<string, ReceiptStatus>;

export function clearsOnEntry(mode: string): boolean {
  return (CLEARED_ON_ENTRY_MODES as readonly string[]).includes(mode);
}

export function isClearableMode(mode: string): boolean {
  return (CLEARABLE_MODES as readonly string[]).includes(mode);
}

export interface ReceiptStatusInput {
  mode: string;
  clearedAt: Date | string | null;
  bouncedAt: Date | string | null;
}

export function receiptStatus(r: ReceiptStatusInput): ReceiptStatus {
  if (r.bouncedAt) return "BOUNCED";
  if (r.clearedAt || clearsOnEntry(r.mode)) return "CLEARED";
  return "PENDING_CLEARANCE";
}

/**
 * The database condition matching exactly the receipts `receiptStatus` gives
 * that status. Kept beside the function so the two cannot drift apart. A mode
 * that is neither electronic nor a known instrument reads as pending in both.
 */
export function receiptStatusWhere(status: ReceiptStatus): Prisma.ReceiptWhereInput {
  const electronic = [...CLEARED_ON_ENTRY_MODES];
  switch (status) {
    case "BOUNCED":
      return { bouncedAt: { not: null } };
    case "CLEARED":
      return { bouncedAt: null, OR: [{ clearedAt: { not: null } }, { mode: { in: electronic } }] };
    case "PENDING_CLEARANCE":
      return { bouncedAt: null, clearedAt: null, mode: { notIn: electronic } };
  }
}

/* ------------------------------ Clearance date ----------------------------- */

/** The calendar day an instant falls on in India, as yyyy-mm-dd. */
export function indiaDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Validates the day a cheque or DD was realised. The day is compared in India
 * time — a receipt entered at 01:00 IST belongs to that IST day — and stored as
 * UTC midnight, the way every other typed date in the app is stored.
 */
export function parseClearedOn(
  clearedOn: string,
  receiptDate: Date,
  now: Date,
): { ok: true; clearedAt: Date } | { ok: false; error: string } {
  const value = clearedOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, error: "Enter the date the instrument cleared." };
  const clearedAt = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(clearedAt.getTime()) || clearedAt.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "Enter a valid clearance date." };
  }
  if (value > indiaDay(now)) return { ok: false, error: "The clearance date cannot be in the future." };
  if (value < indiaDay(receiptDate)) {
    return { ok: false, error: "The clearance date cannot be before the receipt date." };
  }
  return { ok: true, clearedAt };
}

/* --------------------------- Demand recomputation -------------------------- */

export interface DemandSettlementInput {
  totalAmount: number;
  /** The sum of the demand's receipts that have not bounced. */
  receivedAmount: number;
  raisedAt: Date | string | null;
}

/**
 * A demand's status from what has actually been received against it. OVERDUE
 * is never produced: nothing in the system sets it, and a receipt recorded
 * against a demand has always moved it to PARTIALLY_PAID or PAID regardless.
 */
export function demandStatusFor(d: DemandSettlementInput): "PAID" | "PARTIALLY_PAID" | "RAISED" | "PENDING" {
  if (d.receivedAmount >= d.totalAmount - 0.01) return "PAID";
  if (d.receivedAmount > 0) return "PARTIALLY_PAID";
  return d.raisedAt ? "RAISED" : "PENDING";
}
