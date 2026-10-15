import Link from "next/link";
import { Banknote, Printer } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, PAYMENT_MODES, paymentListWhere, readPaymentListParams, toSearchParams,
} from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { paymentEmpty } from "@/lib/screens/rows/material-rest";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, money } from "@/lib/utils";

export const metadata = { title: "Vendor Payments" };

type Row = {
  id: string; paymentNo: string; paymentDate: Date; amount: unknown;
  mode: string; referenceNo: string | null;
  invoice: { id: string; invoiceNo: string; vendor: { name: string } };
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.vendorPayment.view);
  const raw = await searchParams;
  const params = readPaymentListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.mode || params.project || params.from || params.to);

  const [payments, projects] = await Promise.all([
    prisma.vendorPayment.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: paymentListWhere(ctx, params),
      orderBy: { paymentDate: "desc" },
      take: 100,
      include: {
        invoice: { select: { id: true, invoiceNo: true, vendor: { select: { name: true } } } },
      },
    }),
    projectOptions(ctx),
  ]);

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
    ...(ctx.has(PERM.material.vendorPayment.print)
      ? [{
          key: "print", header: "", align: "right" as const,
          render: (p: Row) => (
            <Link
              href={`/print/vendor-payments/${p.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              <Printer className="h-3.5 w-3.5" />
              Voucher
            </Link>
          ),
        }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Vendor Payments"
        description="Money leaves only against an approved invoice that passed the three-way match."
        actions={<Badge tone="slate">{money(total)} paid</Badge>}
      />

      <ListToolbar
        searchPlaceholder="Search payment, invoice, vendor or reference…"
        filters={[
          { name: "mode", label: "Modes", options: enumOptions(PAYMENT_MODES) },
          { name: "project", label: "Projects", options: projects },
        ]}
        dateRange={{ label: "Paid on" }}
        count={payments.length}
      >
        {ctx.has(PERM.material.vendorPayment.export) && (
          <ExportMenu
            href={(format) => exportHref("/api/material/payments/export", format, query)}
            disabled={payments.length === 0}
          />
        )}
      </ListToolbar>

      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Banknote className="h-8 w-8" />}
            title={paymentEmpty(filtered).title}
            description={paymentEmpty(filtered).description}
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={payments} rowKey={(p) => p.id} dense />
      )}
    </div>
  );
}
