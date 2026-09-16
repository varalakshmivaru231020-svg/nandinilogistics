import Link from "next/link";
import { IndianRupee, Printer } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { toSearchParams } from "@/lib/sales/list-common";
import { RECEIPT_MODES, readReceiptListParams, receiptListWhere } from "@/lib/sales/receipt-list";
import {
  RECEIPT_STATUS_LABEL, indiaDay, receiptStatus, type ReceiptStatus,
} from "@/lib/sales/receipt-status";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Can } from "@/components/rbac/can";
import { Badge, Card, EmptyState, PageHeader, type BadgeTone } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money, moneyShort } from "@/lib/utils";
import { ReceiptClearanceControls } from "./receipt-clearance-controls";

export const metadata = { title: "Collection Receipts" };

const STATUS_TONE: Record<ReceiptStatus, BadgeTone> = {
  CLEARED: "good",
  PENDING_CLEARANCE: "warn",
  BOUNCED: "bad",
};

type Row = {
  id: string; receiptNo: string; receiptDate: Date; amount: unknown;
  mode: string; referenceNo: string | null;
  clearedAt: Date | null; bouncedAt: Date | null; bounceReason: string | null;
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
  const filtered = Boolean(params.q || params.mode || params.status || params.project || params.from || params.to);
  // "Today" is read once here, so the date picker's bounds match the server's.
  const today = indiaDay(new Date());

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

  // A bounced instrument brought nothing in.
  const total = receipts.reduce((s, r) => (r.bouncedAt ? s : s + Number(r.amount)), 0);

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
      key: "status",
      header: "Status",
      align: "center",
      render: (r) => {
        const status = receiptStatus(r);
        return (
          <div className="text-center">
            <Badge tone={STATUS_TONE[status]}>{RECEIPT_STATUS_LABEL[status]}</Badge>
            {status === "BOUNCED" && r.bounceReason && (
              <p className="mt-0.5 max-w-[14rem] truncate text-[10.5px] text-bad-600" title={r.bounceReason}>
                {r.bounceReason}
              </p>
            )}
            {status === "CLEARED" && r.clearedAt && (r.mode === "CHEQUE" || r.mode === "DD") && (
              <p className="mt-0.5 text-[10.5px] text-muted-500">on {formatDate(r.clearedAt)}</p>
            )}
          </div>
        );
      },
    },
    {
      key: "amount", header: "Amount", align: "right", className: "num",
      render: (r) => (
        <span className={r.bouncedAt ? "font-medium text-muted-400 line-through" : "font-medium text-good-700"}>
          {money(r.amount)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {receiptStatus(r) === "PENDING_CLEARANCE" && (
            <ReceiptClearanceControls
              receiptId={r.id}
              receiptNo={r.receiptNo}
              mode={r.mode}
              amount={Number(r.amount)}
              receiptDay={indiaDay(r.receiptDate)}
              today={today}
            />
          )}
          <Can I={PERM.sales.receipt.print}>
            <Link
              href={`/print/receipts/${r.id}`}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:underline"
              title={`Print ${r.receiptNo}`}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Link>
          </Can>
        </div>
      ),
    },
  ];

  const query = toSearchParams(raw);

  return (
    <div>
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
            name: "status",
            label: "Status",
            allLabel: "All statuses",
            options: [
              { value: "cleared", label: RECEIPT_STATUS_LABEL.CLEARED },
              { value: "pending", label: RECEIPT_STATUS_LABEL.PENDING_CLEARANCE },
              { value: "bounced", label: RECEIPT_STATUS_LABEL.BOUNCED },
            ],
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
              description="Try a different search, mode, status, project or date range."
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
