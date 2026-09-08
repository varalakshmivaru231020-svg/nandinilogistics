import Link from "next/link";
import { Banknote } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money } from "@/lib/utils";

export const metadata = { title: "Vendor Payments" };

type Row = {
  id: string; paymentNo: string; paymentDate: Date; amount: unknown;
  mode: string; referenceNo: string | null;
  invoice: { id: string; invoiceNo: string; vendor: { name: string } };
};

export default async function PaymentsPage() {
  const ctx = await requirePermission(PERM.material.vendorPayment.view);

  const payments = await prisma.vendorPayment.findMany({
    where: { invoice: { purchaseOrder: projectScopeFilter(ctx) } },
    orderBy: { paymentDate: "desc" },
    take: 100,
    include: {
      invoice: { select: { id: true, invoiceNo: true, vendor: { select: { name: true } } } },
    },
  });

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  const columns: Column<Row>[] = [
    {
      key: "payment",
      header: "Payment",
      render: (p) => (
        <div>
          <p className="text-sm font-medium text-navy-950">{p.paymentNo}</p>
          <p className="text-xs text-muted-500">
            against{" "}
            <Link href={`/material/invoices/${p.invoice.id}`} className="hover:text-brand-600">
              {p.invoice.invoiceNo}
            </Link>
          </p>
        </div>
      ),
    },
    { key: "vendor", header: "Vendor", render: (p) => <span className="text-sm">{p.invoice.vendor.name}</span> },
    { key: "date", header: "Paid on", render: (p) => <span className="text-xs text-muted-500">{formatDate(p.paymentDate)}</span> },
    { key: "mode", header: "Mode", align: "center", render: (p) => <Badge tone="slate">{p.mode}</Badge> },
    { key: "ref", header: "Reference", render: (p) => <span className="text-xs text-muted-600">{p.referenceNo ?? "—"}</span> },
    {
      key: "amount", header: "Amount", align: "right", className: "num",
      render: (p) => <span className="font-medium text-navy-950">{money(p.amount)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Vendor Payments"
        description="Money leaves only against an approved invoice that passed the three-way match."
        actions={<Badge tone="slate">{money(total)} paid</Badge>}
      />

      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Banknote className="h-8 w-8" />}
            title="No payments yet"
            description="Payments are recorded from the invoice, once it is approved."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={payments} rowKey={(p) => p.id} dense />
      )}
    </div>
  );
}
