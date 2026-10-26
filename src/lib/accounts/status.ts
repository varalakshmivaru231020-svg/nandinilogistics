/**
 * Where an invoice raised to a client company stands — SOW §3.5: Raised,
 * Sent, Partially Paid, Paid, Overdue.
 *
 * Pure. The status is worked out from what has been received against the
 * amount and whether the due date has passed, and stored on every write so a
 * list can filter on it; `invoiceStatusOf` is the one place that decides.
 */

export const INVOICE_STATUSES = ["RAISED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  RAISED: "Raised",
  SENT: "Sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "draft" | "info" | "warn" | "good" | "bad"> = {
  RAISED: "draft",
  SENT: "info",
  PARTIALLY_PAID: "warn",
  PAID: "good",
  OVERDUE: "bad",
};

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

const DAY = 86_400_000;

/** Rupees received against the invoice, rounded to the paisa. */
export function receivedOf(payments: ReadonlyArray<{ amount: unknown }>): number {
  return Math.round(payments.reduce((s, p) => s + Number(p.amount ?? 0), 0) * 100) / 100;
}

/**
 * The status the invoice should carry now.
 *
 * - Paid in full (received ≥ amount): PAID, whatever the dates.
 * - Something received, short of the amount: PARTIALLY_PAID — unless the due
 *   date has passed, when the shortfall makes it OVERDUE.
 * - Nothing received and past due: OVERDUE.
 * - Otherwise what it was marked — RAISED until it is sent, SENT after.
 */
export function invoiceStatusOf(
  invoice: { amount: unknown; dueDate: Date | string | null; sent: boolean },
  payments: ReadonlyArray<{ amount: unknown }>,
  nowMs: number,
): InvoiceStatus {
  const amount = Number(invoice.amount ?? 0);
  const received = receivedOf(payments);
  if (amount > 0 && received >= amount) return "PAID";

  const due = invoice.dueDate ? new Date(invoice.dueDate).getTime() : null;
  // Due "on" a day means the whole of it: overdue from the day after.
  const overdue = due !== null && nowMs >= due + DAY;
  if (overdue) return "OVERDUE";
  if (received > 0) return "PARTIALLY_PAID";
  return invoice.sent ? "SENT" : "RAISED";
}

/** What is still to come in, never negative. */
export function outstandingOf(amount: unknown, payments: ReadonlyArray<{ amount: unknown }>): number {
  return Math.max(0, Math.round((Number(amount ?? 0) - receivedOf(payments)) * 100) / 100);
}

/**
 * Checks a payment before it is recorded: a positive amount, no more than
 * what is still outstanding, on a real day.
 */
export function checkPayment(
  input: { amount: number; paidOn: string },
  outstanding: number,
): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter the amount received.");
  if (input.amount > outstanding + 0.005) {
    throw new Error(`Only ₹${outstanding.toLocaleString("en-IN")} is outstanding on this invoice.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || Number.isNaN(new Date(input.paidOn).getTime())) {
    throw new Error("Pick the day the payment was received.");
  }
}
