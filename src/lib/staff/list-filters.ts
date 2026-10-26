import { isMonth } from "./payslip";

/**
 * What narrows the payslip list, as a `where` nothing has to restate. Pure,
 * shared by the page, the export route and the phone's list.
 */

export interface PayslipListParams {
  month: string;
  employee: string;
  q: string;
}

const one = (v: string | string[] | undefined | null) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function readPayslipListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): PayslipListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  const month = read("month");
  return { month: isMonth(month) ? month : "", employee: read("employee"), q: read("q") };
}

export function payslipListWhere(params: PayslipListParams): Record<string, unknown> {
  const { month, employee, q } = params;
  const search = q.trim();
  return {
    ...(month ? { month } : {}),
    ...(employee ? { employeeId: employee } : {}),
    ...(search
      ? {
          OR: [
            { employee: { name: { contains: search, mode: "insensitive" as const } } },
            { employee: { employeeCode: { contains: search, mode: "insensitive" as const } } },
            { month: { contains: search } },
          ],
        }
      : {}),
  };
}

export function describePayslipFilters(params: PayslipListParams, employeeName: string | null): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    params.month ? `Month ${params.month}` : null,
    employeeName,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All payslips";
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export function payslipBandFigures(
  rows: ReadonlyArray<{ gross: unknown; advance: unknown; deductions: unknown; netPay: unknown }>,
): Array<{ value: string; label: string; tone?: "bad" | "warn" | "good" | "brand" }> {
  const sum = (k: "gross" | "advance" | "deductions" | "netPay") => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return [
    { value: String(rows.length), label: "Payslips" },
    { value: inr(sum("gross")), label: "Gross" },
    { value: inr(sum("advance")), label: "Advance recovered", tone: sum("advance") > 0 ? "warn" : undefined },
    { value: inr(sum("deductions")), label: "Deductions" },
    { value: inr(sum("netPay")), label: "Net pay", tone: "good" },
  ];
}

export const PAYSLIP_EMPTY_NONE = { title: "No payslips yet — generate the first one for an internal staff member." };
export const PAYSLIP_EMPTY_FILTERED = { title: "No payslip matches that filter." };
