import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { CostSheetDetail } from "./cost-sheet-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.costSheet.findUnique({ where: { id }, select: { costSheetNo: true } });
  return { title: s?.costSheetNo ?? "Cost Sheet" };
}

export default async function CostSheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.sales.costSheet.view);

  const sheet = await prisma.costSheet.findUnique({
    where: { id },
    include: {
      unit: {
        select: {
          id: true, unitNumber: true, floorNumber: true, superBuiltUpArea: true,
          carpetArea: true, parkingSlots: true, plcTag: true, status: true, projectId: true,
          project: { select: { code: true, name: true } },
          unitType: { select: { name: true } },
        },
      },
      lead: { select: { id: true, name: true, leadNo: true, phone: true } },
      lines: { orderBy: { sortOrder: "asc" }, include: { chargeHead: { select: { code: true } } } },
      bookings: { select: { id: true, bookingNo: true, status: true } },
    },
  });
  if (!sheet) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(sheet.unit.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  const customers = ctx.has(PERM.sales.booking.create)
    ? await prisma.customer.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, customerNo: true, phone: true, kycVerifiedAt: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={sheet.costSheetNo}
        description={`${sheet.unit.project.code} · unit ${sheet.unit.unitNumber}${sheet.unit.unitType ? ` · ${sheet.unit.unitType.name}` : ""}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/sales/cost-sheets" className="hover:text-brand-600">Cost Sheets</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{sheet.costSheetNo}</span>
          </span>
        }
        actions={
          sheet.bookings.length > 0
            ? <Badge tone="good">Booked</Badge>
            : <Badge tone="slate">Quoted</Badge>
        }
      />

      <CostSheetDetail
        sheet={{
          id: sheet.id,
          costSheetNo: sheet.costSheetNo,
          createdAt: sheet.createdAt.toISOString(),
          validUntil: sheet.validUntil?.toISOString() ?? null,
          baseRate: Number(sheet.baseRate),
          subTotal: Number(sheet.subTotal),
          discountAmount: Number(sheet.discountAmount),
          discountApprovedAt: sheet.discountApprovedAt?.toISOString() ?? null,
          taxAmount: Number(sheet.taxAmount),
          totalAmount: Number(sheet.totalAmount),
          unitId: sheet.unit.id,
          unitNumber: sheet.unit.unitNumber,
          unitStatus: sheet.unit.status,
          floorNumber: sheet.unit.floorNumber,
          superBuiltUpArea: Number(sheet.unit.superBuiltUpArea),
          carpetArea: Number(sheet.unit.carpetArea),
          parkingSlots: sheet.unit.parkingSlots,
          plcTag: sheet.unit.plcTag,
          projectName: sheet.unit.project.name,
          projectCode: sheet.unit.project.code,
          leadId: sheet.lead?.id ?? null,
          leadName: sheet.lead?.name ?? null,
          leadNo: sheet.lead?.leadNo ?? null,
        }}
        lines={sheet.lines.map((l) => ({
          id: l.id,
          code: l.chargeHead.code,
          label: l.label,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          amount: Number(l.amount),
          taxPct: Number(l.taxPct),
          taxAmount: Number(l.taxAmount),
        }))}
        booking={sheet.bookings[0] ?? null}
        customers={customers.map((c) => ({
          id: c.id, name: c.name, customerNo: c.customerNo,
          phone: c.phone, kycVerified: Boolean(c.kycVerifiedAt),
        }))}
        can={{
          approveDiscount: ctx.has(PERM.sales.costSheet.approveDiscount),
          book: ctx.has(PERM.sales.booking.create),
          print: ctx.has(PERM.sales.costSheet.print),
        }}
        discountCeiling={ctx.approvalLimitFor("sales.discount")}
      />
    </div>
  );
}
