import Link from "next/link";
import { BookCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, moneyShort } from "@/lib/utils";

export const metadata = { title: "Bookings" };

const STATUS_TONE: Record<string, "slate" | "green" | "violet" | "sky" | "red"> = {
  DRAFT: "slate", CONFIRMED: "green", AGREEMENT: "sky", REGISTERED: "violet", CANCELLED: "red",
};

type Row = {
  id: string; bookingNo: string; status: string; bookingDate: Date;
  totalAmount: unknown; receivedAmount: unknown;
  unit: { unitNumber: string }; customer: { name: string; phone: string };
  project: { code: string }; soldBy: { name: string } | null;
  demands: Array<{ status: string; dueDate: Date; totalAmount: unknown; receivedAmount: unknown }>;
};

export default async function BookingsPage() {
  const ctx = await requirePermission(PERM.sales.booking.view);

  const bookings = await prisma.booking.findMany({
    where: projectScopeFilter(ctx),
    orderBy: { bookingDate: "desc" },
    take: 100,
    include: {
      unit: { select: { unitNumber: true } },
      customer: { select: { name: true, phone: true } },
      project: { select: { code: true } },
      soldBy: { select: { name: true } },
      demands: { select: { status: true, dueDate: true, totalAmount: true, receivedAmount: true } },
    },
  });

  const now = new Date();
  const totalValue = bookings
    .filter((b) => b.status !== "CANCELLED")
    .reduce((s, b) => s + Number(b.totalAmount), 0);
  const collected = bookings
    .filter((b) => b.status !== "CANCELLED")
    .reduce((s, b) => s + Number(b.receivedAmount), 0);

  const columns: Column<Row>[] = [
    {
      key: "booking",
      header: "Booking",
      render: (b) => (
        <div>
          <Link href={`/sales/bookings/${b.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-600">
            {b.bookingNo}
          </Link>
          <p className="text-xs text-slate-500">{b.project.code} · unit {b.unit.unitNumber}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (b) => (
        <div>
          <p className="text-sm text-slate-800">{b.customer.name}</p>
          <p className="text-xs text-slate-500">{b.customer.phone}</p>
        </div>
      ),
    },
    { key: "date", header: "Booked", render: (b) => <span className="text-xs text-slate-500">{formatDate(b.bookingDate)}</span> },
    { key: "value", header: "Value", align: "right", className: "num", render: (b) => money(b.totalAmount) },
    {
      key: "collected", header: "Collected", align: "right", className: "num",
      render: (b) => {
        const pct = Number(b.totalAmount) > 0
          ? Math.round((Number(b.receivedAmount) / Number(b.totalAmount)) * 100) : 0;
        return (
          <span className="text-xs">
            <span className="font-medium text-emerald-700">{money(b.receivedAmount)}</span>
            <span className="text-slate-400"> · {pct}%</span>
          </span>
        );
      },
    },
    {
      key: "overdue",
      header: "Overdue",
      align: "right",
      className: "num",
      render: (b) => {
        const overdue = b.demands.filter(
          (d) => ["RAISED", "PARTIALLY_PAID"].includes(d.status) && new Date(d.dueDate) < now,
        );
        if (overdue.length === 0) return <span className="text-slate-400">—</span>;
        const amount = overdue.reduce(
          (s, d) => s + (Number(d.totalAmount) - Number(d.receivedAmount)), 0,
        );
        return <span className="text-xs font-medium text-red-600">{money(amount)}</span>;
      },
    },
    { key: "soldBy", header: "Sold by", render: (b) => <span className="text-xs text-slate-600">{b.soldBy?.name ?? "—"}</span> },
    {
      key: "status", header: "Status", align: "center",
      render: (b) => <Badge tone={STATUS_TONE[b.status] ?? "slate"}>{b.status}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Bookings"
        description="Customer, cost sheet, payment schedule and collection status — all hanging off the unit record."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="slate">{moneyShort(totalValue)} booked</Badge>
            <Badge tone="green">{moneyShort(collected)} collected</Badge>
          </div>
        }
      />

      {bookings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookCheck className="h-8 w-8" />}
            title="No bookings yet"
            description="A booking starts from an approved cost sheet — it moves the unit off the board and raises the payment schedule."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={bookings} rowKey={(b) => b.id} dense />
      )}
    </div>
  );
}
