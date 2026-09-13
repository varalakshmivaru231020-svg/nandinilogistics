import Link from "next/link";
import { IndianRupee } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { toSearchParams } from "@/lib/sales/list-common";
import { RECEIPT_MODES, readReceiptListParams, receiptListWhere } from "@/lib/sales/receipt-list";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ListToolbar } from "@/components/list/list-toolbar";
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

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.sales.receipt.view);
  const raw = await searchParams;
  const params = readReceiptListParams(raw);
  const filtered = Boolean(params.q || params.mode || params.project || params.from || params.to);

  const [receipts, projects] = await Promise.all([
    prisma.receipt.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: receiptListWhere(ctx, params),
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
    }),
    prisma.project.findMany({
      where: projectScopeFilter(ctx, "id"),
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const total = receipts.reduce((s, r) => s + Number(r.amount), 0);

  const columns: Column<Row>[] = [
    {
      key: "receipt",
      header: "Receipt",
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-navy-950">{r.receiptNo}</p>
          <p className="text-xs text-muted-500">
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
          {r.demand && <p className="text-muted-500">{r.demand.milestone}</p>}
        </div>
      ),
    },
    { key: "date", header: "Received", render: (r) => <span className="text-xs text-muted-500">{formatDate(r.receiptDate)}</span> },
    { key: "mode", header: "Mode", align: "center", render: (r) => <Badge tone="slate">{r.mode}</Badge> },
    {
      key: "ref",
      header: "Reference",
      render: (r) => (
        <div className="text-xs text-muted-600">
          {r.referenceNo ?? "—"}
          {r.bank && <p className="text-muted-400">{r.bank.name}</p>}
        </div>
      ),
    },
    {
      key: "amount", header: "Amount", align: "right", className: "num",
      render: (r) => <span className="font-medium text-good-700">{money(r.amount)}</span>,
    },
  ];

  const query = toSearchParams(raw);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Collection Receipts"
        description="Money received against a booking milestone, keeping the collection position current."
        actions={<Badge tone="good">{moneyShort(total)} collected</Badge>}
      />

      <ListToolbar
        searchPlaceholder="Search receipt no, reference, booking, customer, unit…"
        filters={[
          {
            name: "mode",
            label: "Mode",
            allLabel: "All modes",
            options: RECEIPT_MODES.map((m) => ({ value: m, label: m })),
          },
          {
            name: "project",
            label: "Projects",
            options: projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
          },
        ]}
        dateRange={{ label: "Received" }}
        count={receipts.length}
      >
        {ctx.has(PERM.sales.receipt.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/sales/receipts/export", format, query)}
            disabled={receipts.length === 0}
          />
        )}
      </ListToolbar>

      {receipts.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={<IndianRupee className="h-8 w-8" />}
              title="No receipts match"
              description="Try a different search, mode, project or date range."
            />
          ) : (
            <EmptyState
              icon={<IndianRupee className="h-8 w-8" />}
              title="Nothing collected yet"
              description="Receipts are recorded from a booking, against a raised milestone demand."
            />
          )}
        </Card>
      ) : (
        <DataTable columns={columns} rows={receipts} rowKey={(r) => r.id} dense />
      )}
    </div>
  );
}
