import Link from "next/link";
import { BookCheck } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { BOOKING_STATUSES, bookingListWhere, readBookingListParams } from "@/lib/sales/booking-list";
import { toSearchParams } from "@/lib/sales/list-common";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, moneyShort } from "@/lib/utils";

export const metadata = { title: "Bookings" };

const STATUS_TONE: Record<string, "slate" | "good" | "navy" | "brand" | "bad"> = {
  DRAFT: "slate", CONFIRMED: "good", AGREEMENT: "brand", REGISTERED: "navy", CANCELLED: "bad",
};

type Row = {
  id: string; bookingNo: string; status: string; bookingDate: Date;
  totalAmount: unknown; receivedAmount: unknown;
  unit: { unitNumber: string }; customer: { name: string; phone: string };
  project: { code: string }; soldBy: { name: string } | null;
  demands: Array<{ status: string; dueDate: Date; totalAmount: unknown; receivedAmount: unknown }>;
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.sales.booking.view);
  const raw = await searchParams;
  const params = readBookingListParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);

  const [bookings, projects] = await Promise.all([
    prisma.booking.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: bookingListWhere(ctx, params),
      orderBy: { bookingDate: "desc" },
      take: 100,
      include: {
        unit: { select: { unitNumber: true } },
        customer: { select: { name: true, phone: true } },
        project: { select: { code: true } },
        soldBy: { select: { name: true } },
        demands: { select: { status: true, dueDate: true, totalAmount: true, receivedAmount: true } },
      },
    }),
    prisma.project.findMany({
      where: projectScopeFilter(ctx, "id"),
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
          <Link href={`/sales/bookings/${b.id}`} className="text-sm font-medium text-navy-950 hover:text-brand-600">
            {b.bookingNo}
          </Link>
          <p className="text-xs text-muted-500">{b.project.code} · unit {b.unit.unitNumber}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (b) => (
        <div>
          <p className="text-sm text-navy-900">{b.customer.name}</p>
          <p className="text-xs text-muted-500">{b.customer.phone}</p>
        </div>
      ),
    },
    { key: "date", header: "Booked", render: (b) => <span className="text-xs text-muted-500">{formatDate(b.bookingDate)}</span> },
    { key: "value", header: "Value", align: "right", className: "num", render: (b) => money(b.totalAmount) },
    {
      key: "collected", header: "Collected", align: "right", className: "num",
      render: (b) => {
        const pct = Number(b.totalAmount) > 0
          ? Math.round((Number(b.receivedAmount) / Number(b.totalAmount)) * 100) : 0;
        return (
          <span className="text-xs">
            <span className="font-medium text-good-700">{money(b.receivedAmount)}</span>
            <span className="text-muted-400"> · {pct}%</span>
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
        if (overdue.length === 0) return <span className="text-muted-400">—</span>;
        const amount = overdue.reduce(
          (s, d) => s + (Number(d.totalAmount) - Number(d.receivedAmount)), 0,
        );
        return <span className="text-xs font-medium text-bad-600">{money(amount)}</span>;
      },
    },
    { key: "soldBy", header: "Sold by", render: (b) => <span className="text-xs text-muted-600">{b.soldBy?.name ?? "—"}</span> },
    {
      key: "status", header: "Status", align: "center",
      render: (b) => <Badge tone={STATUS_TONE[b.status] ?? "slate"}>{b.status}</Badge>,
    },
  ];

  const query = toSearchParams(raw);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Bookings"
        description="Customer, cost sheet, payment schedule and collection status — all hanging off the unit record."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="slate">{moneyShort(totalValue)} booked</Badge>
            <Badge tone="good">{moneyShort(collected)} collected</Badge>
          </div>
        }
      />

      <ListToolbar
        searchPlaceholder="Search booking no, customer, phone, unit…"
        filters={[
          {
            name: "status",
            label: "Status",
            allLabel: "All statuses",
            options: BOOKING_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })),
          },
          {
            name: "project",
            label: "Projects",
            options: projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
          },
        ]}
        dateRange={{ label: "Booked" }}
        count={bookings.length}
      >
        {ctx.has(PERM.sales.booking.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/sales/bookings/export", format, query)}
            disabled={bookings.length === 0}
          />
        )}
      </ListToolbar>

      {bookings.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={<BookCheck className="h-8 w-8" />}
              title="No bookings match"
              description="Try a different search, status, project or date range."
            />
          ) : (
            <EmptyState
              icon={<BookCheck className="h-8 w-8" />}
              title="No bookings yet"
              description="A booking starts from an approved cost sheet — it moves the unit off the board and raises the payment schedule."
            />
          )}
        </Card>
      ) : (
        <DataTable columns={columns} rows={bookings} rowKey={(b) => b.id} dense />
      )}
    </div>
  );
}
