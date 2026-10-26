import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, outstandingOf, type InvoiceStatus } from "@/lib/accounts/status";
import { money } from "@/lib/utils";

import type { RecordAction, RecordView } from "./shared";

/**
 * What may be done to a client invoice, decided once. The web's row and its
 * detail screen offer the same: send it, record a payment, edit, delete.
 */
export function invoiceDecisions(
  i: { id: string; invoiceNo: string; status: string; payments: number; outstanding: number },
  can: { update: boolean; recordPayment: boolean; remove: boolean },
): RecordAction[] {
  const actions: RecordAction[] = [];
  if (can.update && i.status === "RAISED") {
    actions.push({
      key: "send", label: "Mark sent to the client", emphasis: "outline",
      action: "accounts/invoices/markInvoiceSent", args: [i.id], remark: "none",
      confirm: "It moves from Raised to Sent.",
    });
  }
  if (can.recordPayment && i.status !== "PAID") {
    actions.push({
      key: "payment", label: "Record payment", emphasis: "primary",
      action: "accounts/invoices/recordInvoicePayment", args: [i.id, "$values"], remark: "none",
      fields: [
        { name: "amount", label: "Amount received (₹)", kind: "money", required: true, initial: i.outstanding },
        { name: "paidOn", label: "Received on", kind: "date", required: true },
        { name: "reference", label: "Reference", kind: "text", placeholder: "UTR / cheque no." },
      ],
      confirm: `${money(i.outstanding)} is outstanding.`,
    });
  }
  if (can.remove && i.payments === 0) {
    actions.push({
      key: "delete", label: "Delete invoice", emphasis: "reject",
      action: "accounts/invoices/deleteInvoice", args: [i.id], remark: "none",
      confirm: "Only an invoice with no payments can be deleted.",
    });
  }
  return actions;
}

export async function invoiceRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const invoice = await prisma.clientInvoice.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      payments: { orderBy: { paidOn: "desc" } },
    },
  });
  if (!invoice) return null;

  const status = invoice.status as InvoiceStatus;
  const outstanding = outstandingOf(invoice.amount, invoice.payments);
  const received = Number(invoice.amount) - outstanding;

  return {
    key: "accounts/invoices",
    id: invoice.id,
    title: invoice.invoiceNo,
    subtitle: invoice.company.name,
    pills: [{ label: INVOICE_STATUS_LABEL[status] ?? invoice.status, tone: INVOICE_STATUS_TONE[status] ?? "draft" }],
    sections: [
      {
        label: "Invoice",
        fields: [
          { label: "Company", value: invoice.company.name },
          { label: "Invoice date", value: invoice.invoiceDate.toISOString(), format: "date" },
          { label: "Due date", value: invoice.dueDate ? invoice.dueDate.toISOString() : null, format: "date" },
          { label: "Amount", value: Number(invoice.amount), format: "money" },
          { label: "Received", value: received, format: "money" },
          { label: "Outstanding", value: outstanding, format: "money" },
          { label: "Notes", value: invoice.notes, wide: true },
        ],
      },
    ],
    collections: [
      {
        key: "payments",
        label: `${invoice.payments.length} payment${invoice.payments.length === 1 ? "" : "s"} · ${money(received)}`,
        rows: invoice.payments.map((p) => ({
          id: p.id,
          title: p.paidOn.toISOString().slice(0, 10),
          subtitle: p.reference ?? "No reference",
          trailing: money(Number(p.amount)),
        })),
        emptyMessage: "Nothing received yet.",
      },
    ],
    actions: invoiceDecisions(
      { id: invoice.id, invoiceNo: invoice.invoiceNo, status: invoice.status, payments: invoice.payments.length, outstanding },
      {
        update: ctx.has(PERM.accounts.invoice.update),
        recordPayment: ctx.has(PERM.accounts.invoice.recordPayment),
        remove: ctx.has(PERM.accounts.invoice.delete),
      },
    ),
    serverTime: new Date().toISOString(),
  };
}
