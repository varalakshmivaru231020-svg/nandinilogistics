import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { monthLabel } from "@/lib/staff/payslip";
import { Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { formatDateTime, money } from "@/lib/utils";
import { PayslipActions } from "./payslip-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.payslip.findUnique({ where: { id }, select: { month: true, employee: { select: { name: true } } } });
  return { title: p ? `${p.employee.name} · ${p.month}` : "Payslip" };
}

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.staff.payslip.view);

  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true, designation: { select: { name: true } } } },
      generatedBy: { select: { name: true } },
    },
  });
  if (!payslip) notFound();

  const rows: Array<[string, string]> = [
    ["Staff member", `${payslip.employee.name} (${payslip.employee.employeeCode})`],
    ["Designation", payslip.employee.designation?.name ?? "—"],
    ["Month", monthLabel(payslip.month)],
    ["Payable days", payslip.payableDays === null ? "—" : String(payslip.payableDays)],
    ["Gross salary", money(Number(payslip.gross))],
    ["Advance recovery", money(Number(payslip.advance))],
    ["Other deductions", money(Number(payslip.deductions))],
    ["Net pay", money(Number(payslip.netPay))],
    ["Generated", `${formatDateTime(payslip.createdAt)} by ${payslip.generatedBy.name}`],
  ];

  return (
    <div>
      <PageHeader
        title={`${payslip.employee.name} · ${monthLabel(payslip.month)}`}
        description="Internal staff payslip"
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/staff/payslips" className="hover:text-brand-600">Payslips</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{payslip.month}</span>
          </span>
        }
        actions={
          <PayslipActions
            id={payslip.id}
            hasPdf={Boolean(payslip.pdfKey)}
            canDelete={ctx.has(PERM.staff.payslip.delete)}
          />
        }
      />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Payslip</CardTitle></CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-line-200">
            {rows.map(([label, value]) => (
              <li key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[12.5px] font-medium text-navy-600">{label}</span>
                <span className={`num text-[13px] font-semibold ${label === "Net pay" ? "text-good-700" : "text-navy-950"}`}>{value}</span>
              </li>
            ))}
            {payslip.notes && (
              <li className="px-4 py-2.5">
                <p className="text-[11px] font-semibold text-muted-500">Notes</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] font-medium text-navy-700">{payslip.notes}</p>
              </li>
            )}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
