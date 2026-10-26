/**
 * Internal staff payslips — SOW §3.8 — the arithmetic, pure.
 *
 * A payslip is gross, less advance, less deductions, equals net. Gross starts
 * from the staff member's monthly salary; payable days are read off the
 * month's attendance; the advance comes from what is being recovered. The
 * database side is in src/app/(app)/staff/payslips/actions.ts.
 */

const MONTH = /^(\d{4})-(\d{2})$/;

export function isMonth(value: string): boolean {
  const m = MONTH.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

/** The first day of the month and the first day of the next, in UTC. */
export function monthRange(month: string): { from: Date; to: Date } {
  if (!isMonth(month)) throw new Error("Pick a month as yyyy-mm.");
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** "October 2026", for the payslip's heading. */
export function monthLabel(month: string): string {
  const { from } = monthRange(month);
  return from.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Payable days from the month's marks: a present day counts one, a half day
 * half, an absence nothing. Overtime is not a day.
 */
export function payableDays(entries: ReadonlyArray<{ status: string }>): number {
  let days = 0;
  for (const e of entries) {
    if (e.status === "PRESENT") days += 1;
    else if (e.status === "HALF_DAY") days += 0.5;
  }
  return days;
}

export interface PayslipFigures {
  gross: number;
  advance: number;
  deductions: number;
  netPay: number;
}

const money = (v: unknown, label: string): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number, zero or more.`);
  return Math.round(n * 100) / 100;
};

/**
 * Net pay from the three figures, refusing a slip that pays out less than
 * nothing — a deduction larger than the gross is a mistake, not a payslip.
 */
export function computePayslip(input: { gross: unknown; advance: unknown; deductions: unknown }): PayslipFigures {
  const gross = money(input.gross, "Gross");
  const advance = money(input.advance, "Advance");
  const deductions = money(input.deductions, "Deductions");
  if (gross <= 0) throw new Error("Gross salary must be more than zero.");
  const netPay = Math.round((gross - advance - deductions) * 100) / 100;
  if (netPay < 0) throw new Error("Advance and deductions come to more than the gross salary.");
  return { gross, advance, deductions, netPay };
}

/**
 * The advance recovery due this month: each approved advance contributes its
 * per-period recovery, capped at what is still outstanding on it.
 */
export function advanceDueThisMonth(
  advances: ReadonlyArray<{ amount: unknown; recoveredAmount: unknown; recoveryPerPeriod: unknown }>,
): number {
  let due = 0;
  for (const a of advances) {
    const outstanding = Math.max(0, Number(a.amount ?? 0) - Number(a.recoveredAmount ?? 0));
    const per = Number(a.recoveryPerPeriod ?? 0);
    due += per > 0 ? Math.min(per, outstanding) : outstanding;
  }
  return Math.round(due * 100) / 100;
}
