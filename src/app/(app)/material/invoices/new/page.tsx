import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { money } from "@/lib/utils";
import { InvoiceForm } from "./invoice-form";
import { projectScopeFilter } from "@/lib/rbac/context";

export const metadata = { title: "Record Vendor Invoice" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.vendorInvoice.create);
  const { po: poId } = await searchParams;

  const scope = projectScopeFilter(ctx);

  // Only POs with something actually received can be invoiced.
  const invoiceable = await prisma.purchaseOrder.findMany({
    where: { ...scope, status: { in: ["PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] } },
    orderBy: { poDate: "desc" },
    take: 50,
    include: {
      vendor: { select: { name: true } },
      project: { select: { code: true } },
      _count: { select: { invoices: true } },
    },
  });

  const po = poId
    ? await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: {
          vendor: { select: { name: true, gstin: true } },
          project: { select: { code: true, name: true } },
          items: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { name: true } } } } } },
          grns: { where: { status: "POSTED" }, include: { items: true } },
        },
      })
    : null;

  // Accepted quantity from posted receipts is the ceiling for billing.
  const receivedByItem = new Map<string, number>();
  if (po) {
    for (const g of po.grns) {
      for (const l of g.items) {
        receivedByItem.set(l.itemId, (receivedByItem.get(l.itemId) ?? 0) + Number(l.acceptedQty));
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Record vendor invoice"
        description="Matched against the purchase order and against what was actually received and accepted."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/invoices" className="hover:text-brand-600">Vendor Invoices</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      {!po ? (
        invoiceable.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ReceiptText className="h-8 w-8" />}
              title="Nothing is ready to invoice"
              description="An invoice can only be recorded against a purchase order that has received material."
            />
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Which purchase order is this invoice for?</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-line-200">
                {invoiceable.map((p) => (
                  <li key={p.id}>
                    <Link href={`/material/invoices/new?po=${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover">
                      <div>
                        <p className="text-sm font-medium text-navy-900">{p.poNo}</p>
                        <p className="text-xs text-muted-500">
                          {p.project.code} · {p.vendor.name}
                          {p._count.invoices > 0 && ` · ${p._count.invoices} invoice(s) already recorded`}
                        </p>
                      </div>
                      <span className="num text-sm text-muted-600">{money(p.totalAmount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )
      ) : (
        <InvoiceForm
          po={{
            id: po.id,
            poNo: po.poNo,
            vendorName: po.vendor.name,
            vendorGstin: po.vendor.gstin,
            projectCode: po.project.code,
          }}
          lines={po.items.map((l) => ({
            itemId: l.item.id,
            code: l.item.code,
            name: l.item.name,
            uom: l.item.uom.name,
            orderedQty: Number(l.orderedQty),
            receivedQty: receivedByItem.get(l.item.id) ?? 0,
            poRate: Number(l.rate),
            taxPct: Number(l.taxPct),
          }))}
        />
      )}
    </div>
  );
}
