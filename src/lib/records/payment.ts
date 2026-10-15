import "server-only";

import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";

import { toneOf, words, type RecordView } from "./shared";

/**
 * One payment to a vendor, and the invoice it settled.
 *
 * Nothing can be done to a payment — it is a record of money that left — so
 * this carries no actions. What it answers is which invoice, which order, and
 * how much of that invoice is still outstanding.
 */
export async function paymentRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const payment = await prisma.vendorPayment.findUnique({
    where: { id },
    include: {
      invoice: {
        select: {
          id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true,
          vendor: { select: { name: true } },
          purchaseOrder: {
            select: {
              poNo: true, projectId: true,
              project: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!payment) return null;
  assertProjectAccess(ctx, payment.invoice.purchaseOrder.projectId);

  const outstanding = Number(payment.invoice.totalAmount) - Number(payment.invoice.paidAmount);

  return {
    key: "material/payments",
    id: payment.id,
    title: payment.paymentNo,
    subtitle: `${payment.invoice.vendor.name} · against ${payment.invoice.invoiceNo}`,
    pills: [
      { label: payment.mode, tone: "draft" },
      { label: words(payment.invoice.status), tone: toneOf(payment.invoice.status) },
    ],
    sections: [
      {
        label: "The payment",
        fields: [
          { label: "Payment no.", value: payment.paymentNo },
          { label: "Amount", value: Number(payment.amount), format: "money" },
          { label: "Paid on", value: payment.paymentDate.toISOString(), format: "date" },
          { label: "Mode", value: payment.mode },
          { label: "Reference number", value: payment.referenceNo },
          { label: "Remarks", value: payment.remarks, wide: true },
        ],
      },
      {
        label: "Against",
        fields: [
          { label: "Invoice", value: payment.invoice.invoiceNo },
          { label: "Vendor", value: payment.invoice.vendor.name },
          { label: "Purchase order", value: payment.invoice.purchaseOrder.poNo },
          {
            label: "Project",
            value: `${payment.invoice.purchaseOrder.project.code} — ${payment.invoice.purchaseOrder.project.name}`,
          },
          { label: "Invoice total", value: Number(payment.invoice.totalAmount), format: "money" },
          { label: "Paid so far", value: Number(payment.invoice.paidAmount), format: "money" },
          { label: "Still outstanding", value: outstanding, format: "money" },
        ],
      },
    ],
    collections: [],
    actions: [],
    serverTime: new Date().toISOString(),
  };
}
