import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { payslipBandFigures, payslipListWhere, readPayslipListParams } from "@/lib/staff/list-filters";
import { internalStaff } from "@/lib/staff/service";
import { PayslipsScreen } from "./payslips-screen";

export const metadata = { title: "Payslips" };

/** Internal staff payslips — SOW §3.8. */
export default async function PayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; employee?: string; q?: string }>;
}) {
  const ctx = await requirePermission(PERM.staff.payslip.view);
  const params = readPayslipListParams(await searchParams);

  const [payslips, staff] = await Promise.all([
    prisma.payslip.findMany({
      where: payslipListWhere(params),
      orderBy: [{ month: "desc" }, { employee: { name: "asc" } }],
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    }),
    internalStaff(prisma),
  ]);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <PayslipsScreen
      figures={payslipBandFigures(payslips)}
      picked={{ month: params.month, employee: params.employee }}
      q={params.q}
      thisMonth={thisMonth}
      staff={staff.map((s) => ({
        id: s.id, name: s.name, code: s.employeeCode,
        monthlySalary: s.monthlySalary === null ? null : Number(s.monthlySalary),
        designation: s.designation?.name ?? null,
      }))}
      payslips={payslips.map((p) => ({
        id: p.id,
        month: p.month,
        employeeId: p.employee.id,
        employee: p.employee.name,
        code: p.employee.employeeCode,
        gross: Number(p.gross),
        advance: Number(p.advance),
        deductions: Number(p.deductions),
        netPay: Number(p.netPay),
        payableDays: p.payableDays,
        hasPdf: Boolean(p.pdfKey),
      }))}
      can={{
        create: ctx.has(PERM.staff.payslip.create),
        delete: ctx.has(PERM.staff.payslip.delete),
        export: ctx.has(PERM.staff.payslip.export),
      }}
    />
  );
}
