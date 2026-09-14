/**
 * The arithmetic behind the printed documents.
 *
 * Pure and free of Prisma and React, so every figure a print view derives —
 * rather than reads straight off a stored column — can be asserted directly
 * (tests/unit/print-figures.test.ts). Stored totals are always preferred; these
 * helpers only fill the gaps the schema leaves (balances, running totals).
 */

import { roundQty, unreturnedQty } from "@/lib/material/return-caps";

/** Rupees to the paisa, without floating-point drift. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Joins the non-empty parts of an address or a line of facts. */
export function place(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && p.trim()).join(", ");
}

/* -------------------------------------------------------------------------- */
/* Vendor payment voucher                                                      */
/* -------------------------------------------------------------------------- */

export interface PaymentFact {
  id: string;
  paymentDate: Date | string;
  createdAt: Date | string;
  amount: number;
}

export interface InvoiceSettlement {
  invoiceTotal: number;
  /** Everything paid against the invoice before this voucher. */
  paidBefore: number;
  thisPayment: number;
  /** Paid including this voucher. */
  paidToDate: number;
  /** What remains payable once this voucher is counted. Never negative. */
  balanceAfter: number;
}

function when(d: Date | string): number {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}

/**
 * Where one payment sits in the settlement of its invoice. Payments are ordered
 * by payment date, then by entry, so a voucher printed today shows the same
 * "paid before" it would have shown on the day it was made.
 */
export function invoiceSettlement(
  invoiceTotal: number,
  payments: PaymentFact[],
  paymentId: string,
): InvoiceSettlement {
  const ordered = [...payments].sort(
    (a, b) => when(a.paymentDate) - when(b.paymentDate) || when(a.createdAt) - when(b.createdAt) || a.id.localeCompare(b.id),
  );
  const index = ordered.findIndex((p) => p.id === paymentId);
  if (index < 0) throw new Error("The payment is not one of the invoice's payments.");

  const paidBefore = roundMoney(ordered.slice(0, index).reduce((s, p) => s + p.amount, 0));
  const thisPayment = roundMoney(ordered[index].amount);
  const paidToDate = roundMoney(paidBefore + thisPayment);
  return {
    invoiceTotal: roundMoney(invoiceTotal),
    paidBefore,
    thisPayment,
    paidToDate,
    balanceAfter: Math.max(0, roundMoney(invoiceTotal - paidToDate)),
  };
}

/* -------------------------------------------------------------------------- */
/* Demands and the payment schedule                                            */
/* -------------------------------------------------------------------------- */

export interface DemandFact {
  amount: number;
  taxAmount: number;
  totalAmount: number;
  receivedAmount: number;
}

export interface DemandFigures {
  amount: number;
  tax: number;
  total: number;
  received: number;
  /** Still payable on the demand. Never negative — an excess is not a credit here. */
  balance: number;
}

export function demandFigures(d: DemandFact): DemandFigures {
  const total = roundMoney(d.totalAmount);
  const received = roundMoney(d.receivedAmount);
  return {
    amount: roundMoney(d.amount),
    tax: roundMoney(d.taxAmount),
    total,
    received,
    balance: Math.max(0, roundMoney(total - received)),
  };
}

/** Column totals for a payment schedule; the balance is summed per demand, so one overpaid milestone cannot hide another's shortfall. */
export function scheduleTotals(demands: DemandFact[]): DemandFigures {
  const rows = demands.map(demandFigures);
  const sum = (pick: (r: DemandFigures) => number) => roundMoney(rows.reduce((s, r) => s + pick(r), 0));
  return {
    amount: sum((r) => r.amount),
    tax: sum((r) => r.tax),
    total: sum((r) => r.total),
    received: sum((r) => r.received),
    balance: sum((r) => r.balance),
  };
}

/** Outstanding on a booking as the booking screen shows it: consideration less collections, floored at nil. */
export function bookingOutstanding(totalAmount: number, receivedAmount: number): number {
  return Math.max(0, roundMoney(totalAmount - receivedAmount));
}

/* -------------------------------------------------------------------------- */
/* Cost sheet                                                                  */
/* -------------------------------------------------------------------------- */

export interface ChargeLineFact {
  amount: number;
  taxPct: number;
  taxAmount: number;
}

/** A charge line's total as the cost sheet screen shows it: amount plus its GST. */
export function chargeLineTotal(l: ChargeLineFact): number {
  return roundMoney(l.amount + l.taxAmount);
}

/** GST grouped by rate, highest first, for the tax summary under the charges. */
export function taxByRate(lines: ChargeLineFact[]): Array<{ rate: number; taxable: number; tax: number }> {
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    if (!(l.taxPct > 0)) continue;
    const row = byRate.get(l.taxPct) ?? { taxable: 0, tax: 0 };
    row.taxable += l.amount;
    row.tax += l.taxAmount;
    byRate.set(l.taxPct, row);
  }
  return [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, r]) => ({ rate, taxable: roundMoney(r.taxable), tax: roundMoney(r.tax) }));
}

export type DiscountState = "none" | "pending" | "approved";

/** Same rule as the cost sheet screen: a discount blocks booking until it is approved. */
export function discountState(discountAmount: number, discountApprovedAt: Date | string | null): DiscountState {
  if (!(discountAmount > 0)) return "none";
  return discountApprovedAt ? "approved" : "pending";
}

/** A quote lapses at the end of the moment it is valid until; a booked sheet never lapses. */
export function quoteExpired(validUntil: Date | string | null, booked: boolean, nowMs: number): boolean {
  if (booked || !validUntil) return false;
  return when(validUntil) < nowMs;
}

/* -------------------------------------------------------------------------- */
/* Indent and issue slip                                                       */
/* -------------------------------------------------------------------------- */

export interface IndentLineFact {
  requestedQty: number;
  approvedQty: number | null;
  estimatedRate: number;
}

/** The indent screen's line amount: the approved quantity once there is one, else the requested. */
export function indentLineAmount(l: IndentLineFact): number {
  return roundMoney((l.approvedQty ?? l.requestedQty) * l.estimatedRate);
}

export function indentLinesTotal(lines: IndentLineFact[]): number {
  return roundMoney(lines.reduce((s, l) => s + indentLineAmount(l), 0));
}

export interface IssueLineFact {
  issuedQty: number;
  returnedQty: number;
  value: number;
}

export function issueTotals(lines: IssueLineFact[]): { issued: number; returned: number; outstanding: number; value: number } {
  return {
    issued: roundQty(lines.reduce((s, l) => s + l.issuedQty, 0)),
    returned: roundQty(lines.reduce((s, l) => s + l.returnedQty, 0)),
    outstanding: roundQty(lines.reduce((s, l) => s + unreturnedQty(l.issuedQty, l.returnedQty), 0)),
    value: roundMoney(lines.reduce((s, l) => s + l.value, 0)),
  };
}
