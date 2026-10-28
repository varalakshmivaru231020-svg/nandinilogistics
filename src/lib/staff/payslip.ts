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
  basic: number;
  hra: number;
  others: number;
  gross: number;
  pf: number;
  esi: number;
  advance: number;
  deductions: number;
  netPay: number;
}

const money = (v: unknown, label: string): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[₹,s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number, zero or more.`);
  return Math.round(n * 100) / 100;
};

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Employee PF: 12% of basic. */
export const PF_RATE = 0.12;
/** Employee ESI: 0.75% of gross, rounded up to the rupee. */
export const ESI_RATE = 0.0075;
/** ESI applies only while monthly gross is at or under this. */
export const ESI_CEILING = 21000;

/**
 * The statutory deductions a salary sheet starts from — PF on basic, ESI on
 * gross while under the ceiling. Suggestions only; the form may override them.
 */
export function statutoryDeductions(basic: number, gross: number): { pf: number; esi: number } {
  const pf = Math.round(basic * PF_RATE);
  const esi = gross > 0 && gross <= ESI_CEILING ? Math.ceil(gross * ESI_RATE) : 0;
  return { pf, esi };
}

/**
 * The payslip from its parts. Earnings are basic + HRA + others when the
 * split is given (gross is then their total, not typed); otherwise the gross
 * as entered. Net is gross less PF, ESI, advance and other deductions, and a
 * slip that pays out less than nothing is refused — that is a mistake, not a
 * payslip.
 */
export function computePayslip(input: {
  gross?: unknown; basic?: unknown; hra?: unknown; others?: unknown;
  pf?: unknown; esi?: unknown; advance?: unknown; deductions?: unknown;
}): PayslipFigures {
  const split = !blank(input.basic) || !blank(input.hra) || !blank(input.others);
  const basic = split ? money(input.basic ?? 0, "Basic") : 0;
  const hra = split ? money(input.hra ?? 0, "HRA") : 0;
  const others = split ? money(input.others ?? 0, "Others") : 0;
  const gross = split ? round2(basic + hra + others) : money(input.gross, "Gross");
  const pf = money(input.pf ?? 0, "PF");
  const esi = money(input.esi ?? 0, "ESI");
  const advance = money(input.advance ?? 0, "Advance");
  const deductions = money(input.deductions ?? 0, "Deductions");
  if (gross <= 0) throw new Error("Gross salary must be more than zero.");
  const netPay = round2(gross - pf - esi - advance - deductions);
  if (netPay < 0) throw new Error("PF, ESI, advance and deductions come to more than the gross salary.");
  return { basic: split ? basic : gross, hra, others, gross, pf, esi, advance, deductions, netPay };
}

/** Days in the month — the salary sheet's Pay Days. */
export function daysInMonth(month: string): number {
  const { from, to } = monthRange(month);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
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
