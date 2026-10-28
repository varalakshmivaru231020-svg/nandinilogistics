import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { isMonth } from "@/lib/staff/payslip";
import { toSalarySheet } from "@/lib/staff/salary-sheet";

export const dynamic = "force-dynamic";

/** The month's salary sheet as Excel, from the payslips generated for it. */
export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.staff.payslip.view) || !ctx.has(PERM.staff.payslip.export)) {
    return new NextResponse("You do not have permission to export payslips.", { status: 403 });
  }

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!isMonth(month)) return new NextResponse("Pick a month as yyyy-mm.", { status: 400 });

  const payslips = await prisma.payslip.findMany({
    where: { month },
    orderBy: { employee: { employeeCode: "asc" } },
    include: { employee: { select: { name: true, employeeCode: true } } },
  });

  const bytes = await toSalarySheet(month, payslips.map((p) => ({
    code: p.employee.employeeCode,
    name: p.employee.name,
    payDays: p.payDays,
    presentDays: p.payableDays,
    basic: Number(p.basic),
    hra: Number(p.hra),
    others: Number(p.others),
    gross: Number(p.gross),
    pf: Number(p.pf),
    esi: Number(p.esi),
    advance: Number(p.advance),
    deductions: Number(p.deductions),
    netPay: Number(p.netPay),
  })));

  await recordAudit({
    action: "EXPORT", entity: "Payslip", userId: ctx.id,
    summary: `Exported the ${month} salary sheet (${payslips.length} staff)`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salary-sheet-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
