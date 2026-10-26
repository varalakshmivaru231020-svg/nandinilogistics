import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { outstandingOf } from "@/lib/accounts/status";
import { sweepOverdueInvoices } from "@/lib/accounts/sweep";
import { PageHeader } from "@/components/ui/primitives";
import { InvoiceDetail } from "./invoice-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.clientInvoice.findUnique({ where: { id }, select: { invoiceNo: true } });
  return { title: invoice ? invoice.invoiceNo : "Invoice" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.accounts.invoice.view);
  const nowMs = new Date().getTime();

  try {
    await sweepOverdueInvoices(prisma, nowMs);
  } catch (error) {
    console.error("Invoice overdue sweep failed", error);
  }

  const [invoice, companies] = await Promise.all([
    prisma.clientInvoice.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        payments: { orderBy: { paidOn: "desc" } },
      },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!invoice) notFound();

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNo}
        description={`${invoice.company.name} · raised on ${invoice.invoiceDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/accounts/invoices" className="hover:text-brand-600">Vendor Invoices</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{invoice.invoiceNo}</span>
          </span>
        }
      />
      <InvoiceDetail
        invoice={{
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          companyId: invoice.company.id,
          company: invoice.company.name,
          invoiceDate: invoice.invoiceDate.toISOString(),
          dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
          amount: Number(invoice.amount),
          outstanding: outstandingOf(invoice.amount, invoice.payments),
          status: invoice.status,
          notes: invoice.notes,
          payments: invoice.payments.length,
        }}
        payments={invoice.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidOn: p.paidOn.toISOString(),
          reference: p.reference,
        }))}
        companies={companies}
        can={{
          update: ctx.has(PERM.accounts.invoice.update),
          delete: ctx.has(PERM.accounts.invoice.delete),
          recordPayment: ctx.has(PERM.accounts.invoice.recordPayment),
        }}
      />
    </div>
  );
}
