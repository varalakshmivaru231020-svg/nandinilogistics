import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, INVOICE_STATUSES, invoiceListWhere, readInvoiceListParams, toSearchParams,
} from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { invoiceLookups } from "./lookups";
import { NewInvoiceDrawer } from "./new-invoice-drawer";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
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

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.vendorInvoice.view);
  const raw = await searchParams;
  const params = readInvoiceListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);

  const lookups = ctx.has(PERM.material.vendorInvoice.create) ? await invoiceLookups(ctx) : null;

  const [invoices, projects] = await Promise.all([
    prisma.vendorInvoice.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: invoiceListWhere(ctx, params),
      orderBy: { invoiceDate: "desc" },
      take: 100,
      include: {
        vendor: { select: { name: true } },
        purchaseOrder: { select: { id: true, poNo: true } },
      },
    }),
    projectOptions(ctx),
  ]);

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
              <NewInvoiceDrawer invoiceable={lookups!.invoiceable} />
            )}
          </div>
        }
      />

      <ListToolbar
        searchPlaceholder="Search invoice, vendor or PO…"
        filters={[
          { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(INVOICE_STATUSES) },
          { name: "project", label: "Projects", options: projects },
        ]}
        dateRange={{ label: "Invoice date" }}
        count={invoices.length}
      >
        {ctx.has(PERM.material.vendorInvoice.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/material/invoices/export", format, query)}
            disabled={invoices.length === 0}
          />
        )}
      </ListToolbar>

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ReceiptText className="h-8 w-8" />}
            title={filtered ? "No invoices match these filters" : "No invoices recorded"}
            description="An invoice is captured against its purchase order and matched to what was actually received."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={invoices} rowKey={(i) => i.id} dense />
      )}
    </div>
  );
}
