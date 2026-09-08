import Link from "next/link";
import { IndianRupee } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, moneyShort } from "@/lib/utils";

export const metadata = { title: "Collection Receipts" };

type Row = {
  id: string; receiptNo: string; receiptDate: Date; amount: unknown;
  mode: string; referenceNo: string | null;
  booking: { id: string; bookingNo: string; unit: { unitNumber: string }; customer: { name: string }; project: { code: string } };
  demand: { milestone: string } | null;
  bank: { name: string } | null;
};

export default async function ReceiptsPage() {
  const ctx = await requirePermission(PERM.sales.receipt.view);

  const receipts = await prisma.receipt.findMany({
    where: { booking: projectScopeFilter(ctx) },
    orderBy: { receiptDate: "desc" },
    take: 150,
    include: {
      booking: {
        select: {
          id: true, bookingNo: true,
          unit: { select: { unitNumber: true } },
          customer: { select: { name: true } },
          project: { select: { code: true } },
        },
      },
      demand: { select: { milestone: true } },
      bank: { select: { name: true } },
    },
  });

  const total = receipts.reduce((s, r) => s + Number(r.amount), 0);

  const columns: Column<Row>[] = [
    {
      key: "receipt",
      header: "Receipt",
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{r.receiptNo}</p>
          <p className="text-xs text-slate-500">
            {r.booking.project.code} · unit {r.booking.unit.unitNumber}
          </p>
        </div>
      ),
    },
    { key: "customer", header: "Customer", render: (r) => <span className="text-sm">{r.booking.customer.name}</span> },
    {
      key: "against",
      header: "Against",
      render: (r) => (
        <div className="text-xs">
          <Link href={`/sales/bookings/${r.booking.id}`} className="text-brand-600 hover:underline">
            {r.booking.bookingNo}
          </Link>
          {r.demand && <p className="text-slate-500">{r.demand.milestone}</p>}
        </div>
      ),
    },
    { key: "date", header: "Received", render: (r) => <span className="text-xs text-slate-500">{formatDate(r.receiptDate)}</span> },
    { key: "mode", header: "Mode", align: "center", render: (r) => <Badge tone="slate">{r.mode}</Badge> },
    {
      key: "ref",
      header: "Reference",
      render: (r) => (
        <div className="text-xs text-slate-600">
          {r.referenceNo ?? "—"}
          {r.bank && <p className="text-slate-400">{r.bank.name}</p>}
        </div>
      ),
    },
    {
      key: "amount", header: "Amount", align: "right", className: "num",
      render: (r) => <span className="font-medium text-emerald-700">{money(r.amount)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Collection Receipts"
        description="Money received against a booking milestone, keeping the collection position current."
        actions={<Badge tone="green">{moneyShort(total)} collected</Badge>}
      />

      {receipts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IndianRupee className="h-8 w-8" />}
            title="Nothing collected yet"
            description="Receipts are recorded from a booking, against a raised milestone demand."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={receipts} rowKey={(r) => r.id} dense />
      )}
    </div>
  );
}
