import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { GrnDetail } from "./grn-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await prisma.grn.findUnique({ where: { id }, select: { grnNo: true } });
  return { title: g?.grnNo ?? "Goods Receipt" };
}

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.grn.view);

  const grn = await prisma.grn.findUnique({
    where: { id },
    include: {
      store: { select: { name: true, code: true } },
      vendor: { select: { name: true } },
      receivedBy: { select: { name: true } },
      purchaseOrder: { select: { id: true, poNo: true, projectId: true, project: { select: { code: true, name: true } } } },
      items: {
        include: { item: { select: { code: true, name: true, uom: { select: { code: true } } } } },
      },
    },
  });
  if (!grn) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(grn.purchaseOrder.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  // Where this stock landed, once posted.
  const ledger =
    grn.status === "POSTED"
      ? await prisma.stockLedger.findMany({
          where: { grnId: grn.id },
          include: { item: { select: { name: true } } },
        })
      : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={grn.grnNo}
        description={`${grn.vendor.name} · ${grn.store.name}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/grn" className="hover:text-brand-600">Goods Receipt</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{grn.grnNo}</span>
          </span>
        }
        actions={
          <Badge tone={grn.status === "POSTED" ? "good" : grn.status === "CANCELLED" ? "bad" : "warn"}>
            {grn.status}
          </Badge>
        }
      />

      <GrnDetail
        grn={{
          id: grn.id,
          grnNo: grn.grnNo,
          status: grn.status,
          grnDate: grn.grnDate.toISOString(),
          challanNo: grn.challanNo,
          challanDate: grn.challanDate?.toISOString() ?? null,
          vehicleNo: grn.vehicleNo,
          remarks: grn.remarks,
          inspectedAt: grn.inspectedAt?.toISOString() ?? null,
          storeName: grn.store.name,
          vendorName: grn.vendor.name,
          receivedByName: grn.receivedBy.name,
          poId: grn.purchaseOrder.id,
          poNo: grn.purchaseOrder.poNo,
          projectCode: grn.purchaseOrder.project.code,
        }}
        items={grn.items.map((l) => ({
          id: l.id,
          code: l.item.code,
          name: l.item.name,
          uom: l.item.uom.code,
          receivedQty: Number(l.receivedQty),
          acceptedQty: Number(l.acceptedQty),
          rejectedQty: Number(l.rejectedQty),
          shortQty: Number(l.shortQty),
          rate: Number(l.rate),
          rejectionReason: l.rejectionReason,
        }))}
        ledger={ledger.map((l) => ({
          id: l.id,
          itemName: l.item.name,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          value: Number(l.value),
          balanceQty: Number(l.balanceQty),
        }))}
        can={{
          inspect: ctx.has(PERM.material.grn.inspect),
          post: ctx.has(PERM.material.grn.post),
          cancel: ctx.has(PERM.material.grn.cancel),
          print: ctx.has(PERM.material.grn.print),
          viewValuation: ctx.has(PERM.material.stock.viewValuation),
        }}
      />
    </div>
  );
}
