import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { recordAudit } from "@/lib/audit";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/** Streams a payslip's PDF — the SOW's "PDF download". */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.staff.payslip.view)) {
    return new NextResponse("You do not have permission to open payslips.", { status: 403 });
  }

  const payslip = await prisma.payslip.findUnique({
    where: { id },
    select: { pdfKey: true, month: true, employee: { select: { employeeCode: true, name: true } } },
  });
  if (!payslip) return new NextResponse("Payslip not found.", { status: 404 });
  if (!payslip.pdfKey) return new NextResponse("No PDF was generated for this payslip.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(payslip.pdfKey);
  } catch {
    return new NextResponse("The stored file is missing.", { status: 410 });
  }

  await recordAudit({
    action: "EXPORT", entity: "Payslip", entityId: id, userId: ctx.id,
    summary: `Downloaded the ${payslip.month} payslip of ${payslip.employee.name}`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payslip-${payslip.employee.employeeCode}-${payslip.month}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
