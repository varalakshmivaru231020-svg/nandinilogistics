import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { BookingDetail } from "./booking-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await prisma.booking.findUnique({ where: { id }, select: { bookingNo: true } });
  return { title: b?.bookingNo ?? "Booking" };
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.sales.booking.view);

  const [booking, banks] = await Promise.all([
    prisma.booking.findUnique({
      where: { id },
      include: {
        unit: { select: { unitNumber: true, floorNumber: true, superBuiltUpArea: true } },
        customer: { select: { id: true, name: true, customerNo: true, phone: true, email: true, kycVerifiedAt: true } },
        project: { select: { code: true, name: true } },
        soldBy: { select: { name: true } },
        costSheet: { select: { id: true, costSheetNo: true } },
        demands: { orderBy: { sortOrder: "asc" } },
        receipts: { orderBy: { receiptDate: "desc" }, include: { bank: { select: { name: true } } } },
      },
    }),
    prisma.bank.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
  ]);
  if (!booking) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(booking.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={booking.bookingNo}
        description={`${booking.project.code} · unit ${booking.unit.unitNumber} · ${booking.customer.name}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/sales/bookings" className="hover:text-brand-600">Bookings</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{booking.bookingNo}</span>
          </span>
        }
        actions={<Badge tone={booking.status === "CANCELLED" ? "bad" : "good"}>{booking.status}</Badge>}
      />

      <BookingDetail
        booking={{
          id: booking.id,
          bookingNo: booking.bookingNo,
          status: booking.status,
          bookingDate: booking.bookingDate.toISOString(),
          agreementDate: booking.agreementDate?.toISOString() ?? null,
          registrationDate: booking.registrationDate?.toISOString() ?? null,
          totalAmount: Number(booking.totalAmount),
          receivedAmount: Number(booking.receivedAmount),
          remarks: booking.remarks,
          unitNumber: booking.unit.unitNumber,
          floorNumber: booking.unit.floorNumber,
          superBuiltUpArea: Number(booking.unit.superBuiltUpArea),
          projectCode: booking.project.code,
          projectName: booking.project.name,
          customerName: booking.customer.name,
          customerNo: booking.customer.customerNo,
          customerPhone: booking.customer.phone,
          customerEmail: booking.customer.email,
          kycVerified: Boolean(booking.customer.kycVerifiedAt),
          soldByName: booking.soldBy?.name ?? null,
          costSheetId: booking.costSheet?.id ?? null,
          costSheetNo: booking.costSheet?.costSheetNo ?? null,
        }}
        demands={booking.demands.map((d) => ({
          id: d.id,
          demandNo: d.demandNo,
          milestone: d.milestone,
          dueDate: d.dueDate.toISOString(),
          totalAmount: Number(d.totalAmount),
          receivedAmount: Number(d.receivedAmount),
          status: d.status,
          raisedAt: d.raisedAt?.toISOString() ?? null,
        }))}
        receipts={booking.receipts.map((r) => ({
          id: r.id,
          receiptNo: r.receiptNo,
          receiptDate: r.receiptDate.toISOString(),
          amount: Number(r.amount),
          mode: r.mode,
          referenceNo: r.referenceNo,
          bankName: r.bank?.name ?? null,
          demandId: r.demandId,
        }))}
        banks={banks}
        nowMs={new Date().getTime()}
        can={{
          raiseDemand: ctx.has(PERM.sales.demand.raise),
          createReceipt: ctx.has(PERM.sales.receipt.create),
          agreement: ctx.has(PERM.sales.booking.agreement),
          register: ctx.has(PERM.sales.booking.register),
          cancel: ctx.has(PERM.sales.booking.cancel),
          tabDemands: ctx.has(PERM.sales.booking.tabDemands),
          tabReceipts: ctx.has(PERM.sales.booking.tabReceipts),
          viewKyc: ctx.has(PERM.sales.customer.viewKyc),
          print: ctx.has(PERM.sales.booking.print),
          printDemand: ctx.has(PERM.sales.demand.view) && ctx.has(PERM.sales.demand.print),
        }}
      />
    </div>
  );
}
