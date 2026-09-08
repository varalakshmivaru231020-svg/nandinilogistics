import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money } from "@/lib/utils";

export const metadata = { title: "Vendor Invoices" };

const STATUS_TONE: Record<string, "slate" | "good" | "bad" | "warn" | "brand" | "navy"> = {
  DRAFT: "slate", MATCHED: "brand", MISMATCH: "bad", APPROVED: "good",
  PARTIALLY_PAID: "warn", PAID: "navy", CANCELLED: "slate",
};

type Row = {
  id: string; invoiceNo: string; status: string; invoiceDate: Date;
  totalAmount: unknown; paidAmount: unknown;
  vendor: { name: string }; purchaseOrder: { id: string; poNo: string };
};

export default async function InvoicesPage() {
  const ctx = await requirePermission(PERM.material.vendorInvoice.view);

  const invoices = await prisma.vendorInvoice.findMany({
    where: { purchaseOrder: projectScopeFilter(ctx) },
    orderBy: { invoiceDate: "desc" },
    take: 100,
    include: {
      vendor: { select: { name: true } },
      purchaseOrder: { select: { id: true, poNo: true } },
    },
  });

  const mismatched = invoices.filter((i) => i.status === "MISMATCH").length;
  const outstanding = invoices
    .filter((i) => !["PAID", "CANCELLED"].includes(i.status))
    .reduce((s, i) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0);

  const columns: Column<Row>[] = [
    {
      key: "invoice",
      header: "Invoice",
      render: (i) => (
        <div>
          <Link href={`/material/invoices/${i.id}`} className="text-sm font-medium text-navy-950 hover:text-brand-600">
            {i.invoiceNo}
          </Link>
          <p className="text-xs text-muted-500">
            against{" "}
            <Link href={`/material/purchase-orders/${i.purchaseOrder.id}`} className="hover:text-brand-600">
              {i.purchaseOrder.poNo}
            </Link>
          </p>
        </div>
      ),
    },
    { key: "vendor", header: "Vendor", render: (i) => <span className="text-sm">{i.vendor.name}</span> },
    { key: "date", header: "Invoice date", render: (i) => <span className="text-xs text-muted-500">{formatDate(i.invoiceDate)}</span> },
    { key: "amount", header: "Amount", align: "right", className: "num", render: (i) => money(i.totalAmount) },
    {
      key: "paid", header: "Paid", align: "right", className: "num",
      render: (i) => {
        const paid = Number(i.paidAmount);
        return paid > 0
          ? <span className="text-good-700">{money(paid)}</span>
          : <span className="text-muted-400">—</span>;
      },
    },
    {
      key: "outstanding", header: "Outstanding", align: "right", className: "num",
      render: (i) => {
        const out = Number(i.totalAmount) - Number(i.paidAmount);
        return out > 0.01
          ? <span className="font-medium text-navy-900">{money(out)}</span>
          : <span className="text-muted-400">—</span>;
      },
    },
    {
      key: "status", header: "Status", align: "center",
      render: (i) => <Badge tone={STATUS_TONE[i.status] ?? "slate"}>{i.status.replace(/_/g, " ")}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Vendor Invoices"
        description="Purchase Order ↔ GRN ↔ Invoice. A mismatch is blocked or flagged, never quietly paid."
        actions={
          <div className="flex items-center gap-2">
            {mismatched > 0 && <Badge tone="bad">{mismatched} mismatched</Badge>}
            <Badge tone="slate">{money(outstanding)} outstanding</Badge>
            {ctx.has(PERM.material.vendorInvoice.create) && (
              <Link href="/material/invoices/new">
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Record invoice
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReceiptText className="h-8 w-8" />}
            title="No invoices recorded"
            description="An invoice is captured against its purchase order and matched to what was actually received."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={invoices} rowKey={(i) => i.id} dense />
      )}
    </div>
  );
}
