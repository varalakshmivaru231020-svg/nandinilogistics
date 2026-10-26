import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { INVOICE_EMPTY_FILTERED, INVOICE_EMPTY_NONE, invoiceScreenRow } from "@/lib/screens/rows/invoice";
import { invoiceDecisions } from "@/lib/records/invoice";
import {
  describeInvoiceFilters, invoiceBandFigures, invoiceListWhere, readInvoiceListParams,
} from "@/lib/accounts/list-filters";
import { INVOICE_STATUS_LABEL, outstandingOf, type InvoiceStatus } from "@/lib/accounts/status";
import { sweepOverdueInvoices } from "@/lib/accounts/sweep";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every client invoice matching the screen's filters — the same `where` the
 * page uses, so the file holds exactly what the screen showed.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.accounts.invoice.view, PERM.accounts.invoice.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const nowMs = new Date().getTime();
  await sweepOverdueInvoices(prisma, nowMs).catch(() => undefined);

  const params = readInvoiceListParams(gate.params);
  const [invoices, company] = await Promise.all([
    prisma.clientInvoice.findMany({
      where: invoiceListWhere(params),
      orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }],
      include: { company: { select: { name: true } }, payments: { select: { amount: true } } },
    }),
    params.company ? prisma.company.findUnique({ where: { id: params.company }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(invoices);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const can = {
      update: ctx.has(PERM.accounts.invoice.update),
      recordPayment: ctx.has(PERM.accounts.invoice.recordPayment),
      remove: ctx.has(PERM.accounts.invoice.delete),
    };
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((i) => {
        const outstanding = outstandingOf(i.amount, i.payments);
        return invoiceScreenRow(
          {
            id: i.id, invoiceNo: i.invoiceNo, company: i.company.name,
            invoiceDate: i.invoiceDate, dueDate: i.dueDate,
            amount: Number(i.amount), outstanding, status: i.status,
          },
          invoiceDecisions({ id: i.id, invoiceNo: i.invoiceNo, status: i.status, payments: i.payments.length, outstanding }, can),
        );
      }),
      band: bandOf(invoiceBandFigures(invoices)),
      empty: rows.length === 0 ? INVOICE_EMPTY_NONE : INVOICE_EMPTY_FILTERED,
    };
  }

  const columns: ReportColumn[] = [
    { key: "invoiceNo", header: "Invoice No" },
    { key: "company", header: "Company" },
    { key: "invoiceDate", header: "Invoice date", format: "date" },
    { key: "dueDate", header: "Due date", format: "date" },
    { key: "amount", header: "Amount", align: "right", format: "money" },
    { key: "received", header: "Received", align: "right", format: "money" },
    { key: "outstanding", header: "Outstanding", align: "right", format: "money" },
    { key: "status", header: "Status" },
    { key: "notes", header: "Notes" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Vendor Invoices",
    entity: "ClientInvoice",
    filters: describeInvoiceFilters(params, company?.name ?? null),
    result: {
      columns,
      rows: rows.map((i) => {
        const outstanding = outstandingOf(i.amount, i.payments);
        return {
          id: i.id,
          invoiceNo: i.invoiceNo,
          company: i.company.name,
          invoiceDate: i.invoiceDate,
          dueDate: i.dueDate,
          amount: Number(i.amount),
          received: Number(i.amount) - outstanding,
          outstanding,
          status: INVOICE_STATUS_LABEL[i.status as InvoiceStatus] ?? i.status,
          notes: i.notes ?? "",
        };
      }),
      summary: [{ label: "Invoices", value: note }],
      emptyMessage: "No invoices match these filters.",
    },
  });
}
