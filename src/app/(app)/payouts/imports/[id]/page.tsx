import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { INTERNAL_COMPANY_CODE, INTERNAL_STAFF_TYPE } from "@/lib/payouts/service";
import { PageHeader } from "@/components/ui/primitives";
import { ImportDetail } from "./import-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imp = await prisma.payoutImport.findUnique({ where: { id }, select: { fileName: true } });
  return { title: imp ? `Payout sheet — ${imp.fileName}` : "Payout sheet" };
}

/** One sheet, row by row: match what the sheet got wrong, then post. */
export default async function PayoutImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.payout.import.view);

  const imp = await prisma.payoutImport.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, code: true } },
      uploadedBy: { select: { name: true } },
      postedBy: { select: { name: true } },
      lines: {
        orderBy: { riderCode: "asc" },
        include: { employee: { select: { id: true, name: true, employeeCode: true } } },
      },
    },
  });
  if (!imp) notFound();

  // Who a line may be matched to: the riders this sheet could name.
  const candidates = imp.status === "DRAFT" && ctx.has(PERM.payout.import.correct)
    ? await prisma.employee.findMany({
        where: {
          onboardingStatus: "ACCEPTED",
          ...(imp.company.code === INTERNAL_COMPANY_CODE
            ? { employmentType: { name: INTERNAL_STAFF_TYPE } }
            : { companies: { some: { companyId: imp.company.id } } }),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, employeeCode: true },
      })
    : [];

  return (
    <div>
      <PageHeader
        title={`${imp.company.name} · ${imp.fileName}`}
        description={`Period ${imp.periodFrom.toISOString().slice(0, 10)} to ${imp.periodTo.toISOString().slice(0, 10)} · uploaded by ${imp.uploadedBy.name}${imp.postedBy ? ` · posted by ${imp.postedBy.name}` : ""}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/payouts" className="hover:text-brand-600">Payouts</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/payouts/imports" className="hover:text-brand-600">Sheets</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{imp.company.name}</span>
          </span>
        }
      />
      <ImportDetail
        importId={imp.id}
        status={imp.status}
        lines={imp.lines.map((l) => ({
          id: l.id,
          riderCode: l.riderCode,
          employeeId: l.employeeId,
          employeeName: l.employee?.name ?? null,
          totalPayout: Number(l.totalPayout),
          advance: Number(l.advance),
          bikeRental: Number(l.bikeRental),
          tds: Number(l.tds),
          finalPayout: Number(l.finalPayout),
          status: l.status,
          holdReason: l.holdReason,
        }))}
        candidates={candidates.map((c) => ({ id: c.id, label: `${c.employeeCode} — ${c.name}` }))}
        can={{
          post: ctx.has(PERM.payout.import.post),
          correct: ctx.has(PERM.payout.import.correct),
          delete: ctx.has(PERM.payout.import.delete),
          hold: ctx.has(PERM.payout.payout.hold),
        }}
      />
    </div>
  );
}
