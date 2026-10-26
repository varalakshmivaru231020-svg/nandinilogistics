"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { diff, recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { nextDocumentNumber } from "@/lib/numbering";
import { checkPayment, invoiceStatusOf, outstandingOf } from "@/lib/accounts/status";

/**
 * Accounts — invoices expected from each client company (SOW §3.5): raised,
 * sent, paid in part or in full, overdue. The status is never typed; it is
 * worked out by `invoiceStatusOf` on every write.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const InvoiceSchema = z.object({
  companyId: z.string().min(1, "Choose the company."),
  invoiceDate: z.string().regex(ISO_DAY, "Pick the invoice date."),
  dueDate: z.string().regex(ISO_DAY, "The due date must be a date.").or(z.literal("")).optional(),
  amount: z.coerce.number().positive("Enter the invoice amount."),
  notes: z.string().trim().max(2000).optional(),
});

const day = (v: string | undefined | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

const paths = (id?: string) => {
  revalidatePath("/accounts/invoices");
  if (id) revalidatePath(`/accounts/invoices/${id}`);
};

async function reconcile(id: string, sent: boolean, nowMs: number) {
  const invoice = await prisma.clientInvoice.findUniqueOrThrow({
    where: { id },
    include: { payments: { select: { amount: true } } },
  });
  const status = invoiceStatusOf({ amount: invoice.amount, dueDate: invoice.dueDate, sent }, invoice.payments, nowMs);
  if (status !== invoice.status) await prisma.clientInvoice.update({ where: { id }, data: { status } });
  return status;
}

export async function createInvoiceAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.accounts.invoice.create);
    const parsed = InvoiceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    if (v.dueDate && v.dueDate < v.invoiceDate) throw new Error("The due date cannot be before the invoice date.");

    const company = await prisma.company.findUnique({ where: { id: v.companyId }, select: { name: true } });
    if (!company) throw new Error("Company not found.");

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNo = await nextDocumentNumber(tx, "INVOICE");
      return tx.clientInvoice.create({
        data: {
          invoiceNo,
          companyId: v.companyId,
          invoiceDate: day(v.invoiceDate)!,
          dueDate: day(v.dueDate),
          amount: v.amount,
          notes: v.notes || null,
          status: invoiceStatusOf({ amount: v.amount, dueDate: day(v.dueDate), sent: false }, [], Date.now()),
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "ClientInvoice", entityId: invoice.id, userId: ctx.id,
      summary: `Raised invoice ${invoice.invoiceNo} on ${company.name} for ₹${v.amount.toLocaleString("en-IN")}`,
    });
    paths();
    return { id: invoice.id };
  });
}

export async function updateInvoiceAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.accounts.invoice.update);
    const existing = await prisma.clientInvoice.findUnique({ where: { id }, include: { payments: { select: { amount: true } } } });
    if (!existing) throw new Error("Invoice not found.");
    const parsed = InvoiceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    if (v.dueDate && v.dueDate < v.invoiceDate) throw new Error("The due date cannot be before the invoice date.");
    const received = existing.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (v.amount < received) throw new Error(`₹${received.toLocaleString("en-IN")} has already been received against it.`);

    const before = { companyId: existing.companyId, invoiceDate: existing.invoiceDate, dueDate: existing.dueDate, amount: Number(existing.amount), notes: existing.notes };
    const after = { companyId: v.companyId, invoiceDate: day(v.invoiceDate)!, dueDate: day(v.dueDate), amount: v.amount, notes: v.notes || null };
    await prisma.clientInvoice.update({ where: { id }, data: after });
    await reconcile(id, existing.status !== "RAISED", Date.now());

    await recordAudit({
      action: "UPDATE", entity: "ClientInvoice", entityId: id, userId: ctx.id,
      summary: `Edited invoice ${existing.invoiceNo}`,
      changes: diff(before, after),
    });
    paths(id);
    return null;
  });
}

/** Raised → Sent: the invoice has gone to the client. */
export async function markInvoiceSentAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.accounts.invoice.update);
    const existing = await prisma.clientInvoice.findUnique({ where: { id }, select: { invoiceNo: true, status: true } });
    if (!existing) throw new Error("Invoice not found.");
    if (existing.status !== "RAISED") throw new Error("Only a raised invoice can be marked sent.");
    const status = await reconcile(id, true, Date.now());
    await recordAudit({
      action: "UPDATE", entity: "ClientInvoice", entityId: id, userId: ctx.id,
      summary: `Marked invoice ${existing.invoiceNo} sent`,
      changes: { status: { from: "RAISED", to: status } },
    });
    paths(id);
    return null;
  });
}

export async function recordInvoicePaymentAction(id: string, formData: FormData): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.accounts.invoice.recordPayment);
    const existing = await prisma.clientInvoice.findUnique({ where: { id }, include: { payments: { select: { amount: true } } } });
    if (!existing) throw new Error("Invoice not found.");

    const amount = Number(String(formData.get("amount") ?? "").replace(/[₹,\s]/g, ""));
    const paidOn = String(formData.get("paidOn") ?? "").trim();
    const reference = String(formData.get("reference") ?? "").trim() || null;
    checkPayment({ amount, paidOn }, outstandingOf(existing.amount, existing.payments));

    await prisma.clientInvoicePayment.create({ data: { invoiceId: id, amount, paidOn: day(paidOn)!, reference } });
    const status = await reconcile(id, true, Date.now());

    await recordAudit({
      action: "UPDATE", entity: "ClientInvoice", entityId: id, userId: ctx.id,
      summary: `Received ₹${amount.toLocaleString("en-IN")} against invoice ${existing.invoiceNo}${reference ? ` (${reference})` : ""}`,
      changes: { status: { from: existing.status, to: status } },
    });
    paths(id);
    return { status };
  });
}

export async function deleteInvoiceAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.accounts.invoice.delete);
    const existing = await prisma.clientInvoice.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
    if (!existing) throw new Error("Invoice not found.");
    if (existing._count.payments > 0) {
      throw new Error("Payments have been recorded against this invoice — it cannot be deleted.");
    }
    await prisma.clientInvoice.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "ClientInvoice", entityId: id, userId: ctx.id,
      summary: `Deleted invoice ${existing.invoiceNo}`,
    });
    paths();
    return null;
  });
}
