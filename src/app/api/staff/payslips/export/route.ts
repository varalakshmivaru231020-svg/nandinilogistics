import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { PAYSLIP_EMPTY_FILTERED, PAYSLIP_EMPTY_NONE, payslipScreenRow } from "@/lib/screens/rows/payslip";
import { payslipDecisions } from "@/lib/records/payslip";
import {
  describePayslipFilters, payslipBandFigures, payslipListWhere, readPayslipListParams,
} from "@/lib/staff/list-filters";
import { monthLabel } from "@/lib/staff/payslip";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/** Every payslip matching the screen's filters. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.staff.payslip.view, PERM.staff.payslip.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readPayslipListParams(gate.params);
  const [payslips, employee] = await Promise.all([
    prisma.payslip.findMany({
      where: payslipListWhere(params),
      orderBy: [{ month: "desc" }, { employee: { name: "asc" } }],
      include: { employee: { select: { name: true, employeeCode: true } } },
    }),
    params.employee ? prisma.employee.findUnique({ where: { id: params.employee }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(payslips);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const can = { remove: ctx.has(PERM.staff.payslip.delete) };
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((p) =>
        payslipScreenRow(
          {
            id: p.id, employee: p.employee.name, code: p.employee.employeeCode, month: p.month,
            payableDays: p.payableDays, gross: Number(p.gross), advance: Number(p.advance),
            deductions: Number(p.deductions), netPay: Number(p.netPay),
          },
          payslipDecisions({ id: p.id, month: p.month }, can),
        ),
      ),
      band: bandOf(payslipBandFigures(payslips)),
      empty: rows.length === 0 ? PAYSLIP_EMPTY_NONE : PAYSLIP_EMPTY_FILTERED,
    };
  }

  const columns: ReportColumn[] = [
    { key: "code", header: "Employee ID" },
    { key: "name", header: "Name" },
    { key: "month", header: "Month" },
    { key: "payableDays", header: "Payable days", align: "right", format: "number" },
    { key: "gross", header: "Gross", align: "right", format: "money" },
    { key: "advance", header: "Advance", align: "right", format: "money" },
    { key: "deductions", header: "Deductions", align: "right", format: "money" },
    { key: "netPay", header: "Net pay", align: "right", format: "money" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Payslips",
    entity: "Payslip",
    filters: describePayslipFilters(params, employee?.name ?? null),
    result: {
      columns,
      rows: rows.map((p) => ({
        id: p.id,
        code: p.employee.employeeCode,
        name: p.employee.name,
        month: monthLabel(p.month),
        payableDays: p.payableDays ?? "",
        gross: Number(p.gross),
        advance: Number(p.advance),
        deductions: Number(p.deductions),
        netPay: Number(p.netPay),
      })),
      summary: [{ label: "Payslips", value: note }],
      emptyMessage: "No payslips match these filters.",
    },
  });
}
