import "dotenv/config";
/**
 * Re-renders every stored payslip PDF from its record on the current
 * letterhead. The figures are not recomputed — the file is made to say what
 * the row already says, in the new layout.
 *
 *   pnpm payslips:regen
 */
import { PrismaClient } from "@prisma/client";

import { PAYSLIP_EMPLOYEE_SELECT, payslipIssuer, payslipPdfInput, storePayslipPdf } from "../src/lib/staff/payslip-render";
import { remove } from "../src/lib/storage";

const prisma = new PrismaClient();

async function main() {
  const issuer = await payslipIssuer(prisma);
  const slips = await prisma.payslip.findMany({
    orderBy: [{ month: "asc" }, { employee: { employeeCode: "asc" } }],
    include: { employee: { select: PAYSLIP_EMPLOYEE_SELECT }, generatedBy: { select: { name: true } } },
  });
  for (const s of slips) {
    const key = await storePayslipPdf(s.employeeId, payslipPdfInput(s.employee, {
      month: s.month,
      payDays: s.payDays,
      payableDays: s.payableDays,
      basic: Number(s.basic), hra: Number(s.hra), others: Number(s.others), gross: Number(s.gross),
      pf: Number(s.pf), esi: Number(s.esi), advance: Number(s.advance), deductions: Number(s.deductions),
      netPay: Number(s.netPay),
      notes: s.notes,
      generatedBy: s.generatedBy.name,
      generatedAt: s.createdAt,
      issuer,
    }));
    if (s.pdfKey && s.pdfKey !== key) await remove(s.pdfKey).catch(() => undefined);
    await prisma.payslip.update({ where: { id: s.id }, data: { pdfKey: key } });
    console.log(`  ${s.employee.employeeCode} ${s.employee.name} ${s.month} → regenerated`);
  }
  console.log(`\n${slips.length} payslip(s) regenerated.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
