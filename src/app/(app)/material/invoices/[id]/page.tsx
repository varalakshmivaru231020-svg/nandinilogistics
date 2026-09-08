import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { InvoiceDetail } from "./invoice-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = await prisma.vendorInvoice.findUnique({ where: { id }, select: { invoiceNo: true } });
  return { title: i?.invoiceNo ?? "Vendor Invoice" };
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.vendorInvoice.view);

  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true, gstin: true } },
      purchaseOrder: {
        select: { id: true, poNo: true, projectId: true, project: { select: { code: true } } },
      },
      items: { include: { item: { select: { code: true, name: true, uom: { select: { code: true } } } } } },
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });
  if (!invoice) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(invoice.purchaseOrder.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  const match = invoice.matchResult as unknown as {
    matched: boolean;
    issues: string[];
    lines: Array<{ itemName: string; qtyVariance: number; rateVariance: number; issues: string[] }>;
  } | null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={invoice.invoiceNo}
        description={`${invoice.vendor.name} · ${invoice.purchaseOrder.project.code}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/invoices" className="hover:text-brand-600">Vendor Invoices</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{invoice.invoiceNo}</span>
          </span>
        }
        actions={
          <Badge tone={invoice.status === "MISMATCH" ? "bad" : invoice.status === "PAID" ? "navy" : "slate"}>
            {invoice.status.replace(/_/g, " ")}
          </Badge>
        }
      />

      <InvoiceDetail
        invoice={{
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          status: invoice.status,
          invoiceDate: invoice.invoiceDate.toISOString(),
          receivedDate: invoice.receivedDate.toISOString(),
          subTotal: Number(invoice.subTotal),
          taxAmount: Number(invoice.taxAmount),
          totalAmount: Number(invoice.totalAmount),
          paidAmount: Number(invoice.paidAmount),
          remarks: invoice.remarks,
          vendorName: invoice.vendor.name,
          vendorGstin: invoice.vendor.gstin,
          poId: invoice.purchaseOrder.id,
          poNo: invoice.purchaseOrder.poNo,
          projectCode: invoice.purchaseOrder.project.code,
        }}
        items={invoice.items.map((l) => ({
          id: l.id,
          code: l.item.code,
          name: l.item.name,
          uom: l.item.uom.code,
          invoicedQty: Number(l.invoicedQty),
          rate: Number(l.rate),
          taxPct: Number(l.taxPct),
          amount: Number(l.amount),
        }))}
        match={match}
        payments={invoice.payments.map((p) => ({
          id: p.id,
          paymentNo: p.paymentNo,
          paymentDate: p.paymentDate.toISOString(),
          amount: Number(p.amount),
          mode: p.mode,
          referenceNo: p.referenceNo,
        }))}
        can={{
          match: ctx.has(PERM.material.vendorInvoice.match),
          approve: ctx.has(PERM.material.vendorInvoice.approve),
          override: ctx.has(PERM.material.vendorInvoice.overrideMismatch),
          cancel: ctx.has(PERM.material.vendorInvoice.cancel),
          pay: ctx.has(PERM.material.vendorPayment.create),
        }}
      />
    </div>
  );
}
