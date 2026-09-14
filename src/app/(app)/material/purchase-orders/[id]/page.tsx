import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { isPoEditable } from "@/lib/material/procurement";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { PoDetail } from "./po-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } });
  return { title: po?.poNo ?? "Purchase Order" };
}

export default async function PoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.purchaseOrder.view);

  // Old links carried ?print=1; the printable order now has its own route.
  if ((await searchParams).print === "1" && ctx.has(PERM.material.purchaseOrder.print)) {
    redirect(`/print/purchase-orders/${id}`);
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      vendor: { select: { name: true, contactPerson: true, phone: true, gstin: true } },
      paymentTerm: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { code: true } } } },
          indent: { select: { id: true, indentNo: true } },
        },
      },
      grns: {
        orderBy: { grnDate: "desc" },
        include: { store: { select: { name: true } }, _count: { select: { items: true } } },
      },
      invoices: { orderBy: { invoiceDate: "desc" } },
    },
  });
  if (!po) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(po.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={po.poNo}
        description={`${po.project.code} · ${po.vendor.name}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/purchase-orders" className="hover:text-brand-600">Purchase Orders</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{po.poNo}</span>
          </span>
        }
        actions={<Badge tone="slate">{po.status.replace(/_/g, " ")}</Badge>}
      />

      <PoDetail
        po={{
          id: po.id,
          poNo: po.poNo,
          status: po.status,
          updatedAt: po.updatedAt.toISOString(),
          poDate: po.poDate.toISOString(),
          expectedDate: po.expectedDate?.toISOString() ?? null,
          approvedAt: po.approvedAt?.toISOString() ?? null,
          subTotal: Number(po.subTotal),
          taxAmount: Number(po.taxAmount),
          otherCharges: Number(po.otherCharges),
          totalAmount: Number(po.totalAmount),
          deliveryAddress: po.deliveryAddress,
          terms: po.terms,
          projectName: po.project.name,
          projectCode: po.project.code,
          vendorName: po.vendor.name,
          vendorContact: po.vendor.contactPerson,
          vendorPhone: po.vendor.phone,
          vendorGstin: po.vendor.gstin,
          paymentTerm: po.paymentTerm?.name ?? null,
          createdByName: po.createdBy.name,
        }}
        items={po.items.map((l) => ({
          id: l.id,
          code: l.item.code,
          name: l.item.name,
          uom: l.item.uom.code,
          orderedQty: Number(l.orderedQty),
          receivedQty: Number(l.receivedQty),
          rate: Number(l.rate),
          discountPct: Number(l.discountPct),
          taxPct: Number(l.taxPct),
          amount: Number(l.amount),
          specification: l.specification,
          indentNo: l.indent?.indentNo ?? null,
          indentId: l.indent?.id ?? null,
        }))}
        receipts={po.grns.map((g) => ({
          id: g.id,
          grnNo: g.grnNo,
          grnDate: g.grnDate.toISOString(),
          status: g.status,
          storeName: g.store.name,
          lineCount: g._count.items,
        }))}
        invoices={po.invoices.map((i) => ({
          id: i.id,
          invoiceNo: i.invoiceNo,
          invoiceDate: i.invoiceDate.toISOString(),
          status: i.status,
          totalAmount: Number(i.totalAmount),
          paidAmount: Number(i.paidAmount),
        }))}
        can={{
          approve: ctx.has(PERM.material.purchaseOrder.approve),
          approvePm: ctx.has(PERM.material.purchaseOrder.approvePm),
          approveAdmin: ctx.has(PERM.material.purchaseOrder.approveAdmin),
          revise: ctx.has(PERM.material.purchaseOrder.revise),
          cancel: ctx.has(PERM.material.purchaseOrder.cancel),
          close: ctx.has(PERM.material.purchaseOrder.close),
          print: ctx.has(PERM.material.purchaseOrder.print),
          viewRate: ctx.has(PERM.material.purchaseOrder.viewRate),
          tabItems: ctx.has(PERM.material.purchaseOrder.tabItems),
          tabReceipts: ctx.has(PERM.material.purchaseOrder.tabReceipts),
          tabInvoices: ctx.has(PERM.material.purchaseOrder.tabInvoices),
          createGrn: ctx.has(PERM.material.grn.create),
          createInvoice: ctx.has(PERM.material.vendorInvoice.create),
          // Rates are part of the edit, so editing needs the rate permission too.
          update: ctx.has(PERM.material.purchaseOrder.update) && ctx.has(PERM.material.purchaseOrder.viewRate),
        }}
        editable={isPoEditable(po)}
        approvalCeiling={ctx.approvalLimitFor("material.po")}
      />
    </div>
  );
}
