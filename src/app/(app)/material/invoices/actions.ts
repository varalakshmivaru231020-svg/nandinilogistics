"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, PermissionError, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { threeWayMatch, type MatchLine } from "@/lib/inventory";
import { PERM } from "@/lib/permissions/codes";

/** Rate variance tolerated before the match is called a mismatch. */
const RATE_TOLERANCE_PCT = 0;

const InvoiceLineSchema = z.object({
  itemId: z.string().min(1),
  invoicedQty: z.coerce.number().min(0),
  rate: z.coerce.number().min(0),
  taxPct: z.coerce.number().min(0).max(100).default(0),
});

const InvoiceSchema = z.object({
  poId: z.string().min(1, "Purchase order is required"),
  invoiceNo: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  fileUrl: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  items: z.array(InvoiceLineSchema).min(1, "Add at least one line"),
});

type InvoiceInput = z.infer<typeof InvoiceSchema>;

/**
 * Builds the PO ↔ GRN ↔ invoice comparison for one purchase order.
 * Received quantity is the *accepted* quantity from posted GRNs only —
 * material that was rejected or never posted was never really received.
 */
async function buildMatchLines(
  poId: string,
  invoiced: Array<{ itemId: string; invoicedQty: number; rate: number }>,
): Promise<MatchLine[]> {
  const [poItems, grnItems] = await Promise.all([
    prisma.purchaseOrderItem.findMany({
      where: { poId },
      include: { item: { select: { name: true } } },
    }),
    prisma.grnItem.findMany({
      where: { grn: { poId, status: "POSTED" } },
      select: { itemId: true, acceptedQty: true },
    }),
  ]);

  const receivedByItem = new Map<string, number>();
  for (const g of grnItems) {
    receivedByItem.set(g.itemId, (receivedByItem.get(g.itemId) ?? 0) + Number(g.acceptedQty));
  }
  const invoicedByItem = new Map(invoiced.map((i) => [i.itemId, i]));

  return poItems.map((p) => {
    const inv = invoicedByItem.get(p.itemId);
    return {
      itemId: p.itemId,
      itemName: p.item.name,
      orderedQty: Number(p.orderedQty),
      receivedQty: receivedByItem.get(p.itemId) ?? 0,
      invoicedQty: inv?.invoicedQty ?? 0,
      poRate: Number(p.rate),
      invoiceRate: inv?.rate ?? Number(p.rate),
    };
  });
}

export async function createVendorInvoiceAction(
  input: InvoiceInput,
): Promise<ActionResult<{ id: string; matched: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.vendorInvoice.create);
    const parsed = InvoiceSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: v.poId },
      select: { id: true, poNo: true, vendorId: true, projectId: true },
    });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);

    const duplicate = await prisma.vendorInvoice.findFirst({
      where: { vendorId: po.vendorId, invoiceNo: v.invoiceNo },
    });
    if (duplicate) {
      throw new Error(`Invoice ${v.invoiceNo} from this vendor is already recorded.`);
    }

    // Match on the way in, so a mismatch is visible before anyone tries to pay.
    const matchLines = await buildMatchLines(v.poId, v.items);
    const match = threeWayMatch(matchLines, RATE_TOLERANCE_PCT);

    const subTotal = v.items.reduce((s, l) => s + l.invoicedQty * l.rate, 0);
    const taxAmount = v.items.reduce((s, l) => s + (l.invoicedQty * l.rate * l.taxPct) / 100, 0);

    const invoice = await prisma.vendorInvoice.create({
      data: {
        invoiceNo: v.invoiceNo,
        poId: po.id,
        vendorId: po.vendorId,
        invoiceDate: new Date(v.invoiceDate),
        subTotal,
        taxAmount,
        totalAmount: subTotal + taxAmount,
        matchResult: match as unknown as Prisma.InputJsonValue,
        status: match.matched ? "MATCHED" : "MISMATCH",
        fileUrl: v.fileUrl || null,
        remarks: v.remarks || null,
        items: {
          create: v.items
            .filter((l) => l.invoicedQty > 0)
            .map((l) => ({
              itemId: l.itemId,
              invoicedQty: l.invoicedQty,
              rate: l.rate,
              taxPct: l.taxPct,
              amount: l.invoicedQty * l.rate * (1 + l.taxPct / 100),
            })),
        },
      },
    });

    await recordAudit({
      action: "CREATE",
      entity: "VendorInvoice",
      entityId: invoice.id,
      userId: ctx.id,
      projectId: po.projectId,
      summary:
        `Recorded invoice ${v.invoiceNo} against ${po.poNo} for ₹${(subTotal + taxAmount).toLocaleString("en-IN")} — ` +
        (match.matched ? "three-way match passed" : `MISMATCH: ${match.issues.join("; ")}`),
    });

    revalidatePath("/material/invoices");
    return { id: invoice.id, matched: match.matched };
  });
}

/**
 * Re-runs the match against the invoice's own stored lines. Useful once a later
 * GRN is posted and the received quantity finally covers what was billed.
 */
export async function rematchInvoiceAction(id: string): Promise<ActionResult<{ matched: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.vendorInvoice.match);

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id },
      include: {
        items: true,
        purchaseOrder: { select: { id: true, projectId: true, poNo: true } },
      },
    });
    if (!invoice) throw new Error("Invoice not found.");
    assertProjectAccess(ctx, invoice.purchaseOrder.projectId);
    if (["PAID", "CANCELLED"].includes(invoice.status)) {
      throw new Error("A paid or cancelled invoice cannot be re-matched.");
    }

    const lines = await buildMatchLines(
      invoice.poId,
      invoice.items.map((l) => ({
        itemId: l.itemId,
        invoicedQty: Number(l.invoicedQty),
        rate: Number(l.rate),
      })),
    );
    const match = threeWayMatch(lines, RATE_TOLERANCE_PCT);

    await prisma.vendorInvoice.update({
      where: { id },
      data: {
        matchResult: match as unknown as Prisma.InputJsonValue,
        status: match.matched ? "MATCHED" : "MISMATCH",
      },
    });

    await recordAudit({
      action: "UPDATE",
      entity: "VendorInvoice",
      entityId: id,
      userId: ctx.id,
      projectId: invoice.purchaseOrder.projectId,
      summary:
        `Re-ran the three-way match on ${invoice.invoiceNo} — ` +
        (match.matched ? "now matched" : `still mismatched: ${match.issues.join("; ")}`),
    });

    revalidatePath(`/material/invoices/${id}`);
    return { matched: match.matched };
  });
}

/**
 * Approves an invoice for payment.
 *
 * A mismatch is blocked. Clearing one requires the separate override
 * permission, and the override is always named in the audit trail.
 */
export async function approveInvoiceAction(
  id: string,
  remarks: string,
  overrideMismatch = false,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.vendorInvoice.approve);

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id },
      include: { purchaseOrder: { select: { projectId: true, poNo: true } } },
    });
    if (!invoice) throw new Error("Invoice not found.");
    assertProjectAccess(ctx, invoice.purchaseOrder.projectId);

    if (!["DRAFT", "MATCHED", "MISMATCH"].includes(invoice.status)) {
      throw new Error(`This invoice is ${invoice.status.replace(/_/g, " ").toLowerCase()} and cannot be approved.`);
    }

    if (invoice.status === "MISMATCH") {
      if (!overrideMismatch) {
        throw new Error(
          "This invoice failed the three-way match. Resolve the variance, or approve it explicitly as an override.",
        );
      }
      if (!ctx.has(PERM.material.vendorInvoice.overrideMismatch)) {
        throw new PermissionError(
          PERM.material.vendorInvoice.overrideMismatch,
          "Clearing a blocked mismatch needs the override permission.",
        );
      }
      if (!remarks.trim()) {
        throw new Error("An override must carry a written justification.");
      }
    }

    await prisma.vendorInvoice.update({ where: { id }, data: { status: "APPROVED" } });

    await recordAudit({
      action: "APPROVE",
      entity: "VendorInvoice",
      entityId: id,
      userId: ctx.id,
      projectId: invoice.purchaseOrder.projectId,
      summary:
        `Approved invoice ${invoice.invoiceNo} for payment (₹${Number(invoice.totalAmount).toLocaleString("en-IN")})` +
        (invoice.status === "MISMATCH" ? ` — MISMATCH OVERRIDDEN: ${remarks}` : "") +
        (invoice.status !== "MISMATCH" && remarks ? ` — ${remarks}` : ""),
    });

    revalidatePath("/material/invoices");
    revalidatePath(`/material/invoices/${id}`);
    return null;
  });
}

export async function cancelInvoiceAction(id: string, remarks: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.vendorInvoice.cancel);
    if (!remarks.trim()) throw new Error("A reason is required when cancelling an invoice.");

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id },
      include: { purchaseOrder: { select: { projectId: true } }, _count: { select: { payments: true } } },
    });
    if (!invoice) throw new Error("Invoice not found.");
    assertProjectAccess(ctx, invoice.purchaseOrder.projectId);
    if (invoice._count.payments > 0) {
      throw new Error("Payments have already been made against this invoice, so it cannot be cancelled.");
    }

    await prisma.vendorInvoice.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({
      action: "CANCEL", entity: "VendorInvoice", entityId: id, userId: ctx.id,
      projectId: invoice.purchaseOrder.projectId,
      summary: `Cancelled invoice ${invoice.invoiceNo}: ${remarks}`,
    });
    revalidatePath("/material/invoices");
    revalidatePath(`/material/invoices/${id}`);
    return null;
  });
}

/* -------------------------------- Payments -------------------------------- */

export async function recordPaymentAction(
  invoiceId: string,
  amount: number,
  mode: string,
  referenceNo: string,
  remarks: string,
): Promise<ActionResult<{ paymentNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.vendorPayment.create);

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
      include: { purchaseOrder: { select: { projectId: true } }, vendor: { select: { name: true } } },
    });
    if (!invoice) throw new Error("Invoice not found.");
    assertProjectAccess(ctx, invoice.purchaseOrder.projectId);

    // Nothing is paid without an approved, matched invoice behind it.
    if (!["APPROVED", "PARTIALLY_PAID"].includes(invoice.status)) {
      throw new Error("Only an approved invoice can be paid. Approve it first.");
    }
    if (!(amount > 0)) throw new Error("Enter a payment amount greater than zero.");

    const outstanding = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (amount > outstanding + 0.01) {
      throw new Error(
        `That is more than the ₹${outstanding.toLocaleString("en-IN")} still outstanding on this invoice.`,
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const paymentNo = await nextDocumentNumber(tx, "PAYMENT", invoice.purchaseOrder.projectId);
      const created = await tx.vendorPayment.create({
        data: {
          paymentNo,
          invoiceId,
          amount,
          mode,
          referenceNo: referenceNo || null,
          remarks: remarks || null,
        },
      });

      const newPaid = Number(invoice.paidAmount) + amount;
      const fullyPaid = newPaid >= Number(invoice.totalAmount) - 0.01;
      await tx.vendorInvoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid, status: fullyPaid ? "PAID" : "PARTIALLY_PAID" },
      });

      return created;
    });

    await recordAudit({
      action: "CREATE",
      entity: "VendorPayment",
      entityId: payment.id,
      userId: ctx.id,
      projectId: invoice.purchaseOrder.projectId,
      summary: `Paid ₹${amount.toLocaleString("en-IN")} to ${invoice.vendor.name} against invoice ${invoice.invoiceNo} (${mode})`,
    });

    revalidatePath("/material/invoices");
    revalidatePath("/material/payments");
    revalidatePath(`/material/invoices/${invoiceId}`);
    return { paymentNo: payment.paymentNo };
  });
}
