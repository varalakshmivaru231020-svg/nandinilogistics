import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { invoiceBandFigures, invoiceListWhere, readInvoiceListParams } from "@/lib/accounts/list-filters";
import { outstandingOf } from "@/lib/accounts/status";
import { sweepOverdueInvoices } from "@/lib/accounts/sweep";
import { InvoicesScreen } from "./invoices-screen";

export const metadata = { title: "Vendor Invoices" };

/**
 * Accounts — invoices expected from each client company (SOW §3.5).
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string; from?: string; to?: string; q?: string }>;
}) {
  const ctx = await requirePermission(PERM.accounts.invoice.view);
  const nowMs = new Date().getTime();

  try {
    await sweepOverdueInvoices(prisma, nowMs);
  } catch (error) {
    console.error("Invoice overdue sweep failed", error);
  }

  const params = readInvoiceListParams(await searchParams);
  const [invoices, companies] = await Promise.all([
    prisma.clientInvoice.findMany({
      where: invoiceListWhere(params),
      orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }],
      include: {
        company: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
      },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <InvoicesScreen
      figures={invoiceBandFigures(invoices)}
      picked={{ company: params.company, status: params.status, from: params.from, to: params.to }}
      q={params.q}
      companies={companies}
      invoices={invoices.map((i) => ({
        id: i.id,
        invoiceNo: i.invoiceNo,
        companyId: i.company.id,
        company: i.company.name,
        invoiceDate: i.invoiceDate.toISOString(),
        dueDate: i.dueDate ? i.dueDate.toISOString() : null,
        amount: Number(i.amount),
        outstanding: outstandingOf(i.amount, i.payments),
        status: i.status,
        notes: i.notes,
        payments: i.payments.length,
      }))}
      can={{
        create: ctx.has(PERM.accounts.invoice.create),
        update: ctx.has(PERM.accounts.invoice.update),
        delete: ctx.has(PERM.accounts.invoice.delete),
        recordPayment: ctx.has(PERM.accounts.invoice.recordPayment),
        export: ctx.has(PERM.accounts.invoice.export),
      }}
    />
  );
}
