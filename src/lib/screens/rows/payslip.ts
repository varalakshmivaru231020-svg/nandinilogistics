import "server-only";

import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import { monthLabel } from "@/lib/staff/payslip";
import { money } from "@/lib/utils";

export { PAYSLIP_EMPTY_FILTERED, PAYSLIP_EMPTY_NONE } from "@/lib/staff/list-filters";

/**
 * The payslip row, as the table in `payslips-screen.tsx` draws one: the
 * staff member, the month, the days, and gross through to net pay.
 */
export interface PayslipRowInput {
  id: string;
  employee: string;
  code: string;
  month: string;
  payableDays: number | null;
  gross: number;
  advance: number;
  deductions: number;
  netPay: number;
}

export function payslipScreenRow(p: PayslipRowInput, actions: RecordAction[] = []): ScreenRow {
  return {
    id: p.id,
    title: p.employee,
    meta: `${p.code} · ${monthLabel(p.month)}`,
    lines: [
      { label: "Days", value: p.payableDays === null ? "—" : String(p.payableDays) },
      { label: "Gross", value: money(p.gross) },
      { label: "Advance", value: money(p.advance) },
      { label: "Deductions", value: money(p.deductions) },
    ],
    trailing: { value: money(p.netPay), label: "Net pay" },
    actions: asRowActions(actions, { delete: "Delete" }),
  };
}
