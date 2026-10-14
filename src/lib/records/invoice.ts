import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One vendor invoice, and the three-way match that decides whether it is paid.
 *
 * The match verdict is the headline on the web screen, and it is the only
 * thing worth carrying first: a mismatch lists the variances that block
 * payment, each in the words the matcher wrote. Approving a mismatched invoice
 * is an explicit override and is recorded against the approver's name — so the
 * override is a second argument on the action rather than a different button.
 */
export async function invoiceRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true, gstin: true } },
      purchaseOrder: {
        select: {
          id: true, poNo: true, projectId: true,
          project: { select: { code: true, name: true } },
        },
      },
      items: {
        include: { item: { select: { code: true, name: true, uom: { select: { name: true } } } } },
      },
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });
  if (!invoice) return null;
  assertProjectAccess(ctx, invoice.purchaseOrder.projectId);

  const match = invoice.matchResult as unknown as
    | { matched: boolean; issues: string[] }
    | null;

  const total = Number(invoice.totalAmount);
  const paid = Number(invoice.paidAmount);
  const outstanding = total - paid;

  const mismatched = invoice.status === "MISMATCH";
  const approvable = ["DRAFT", "MATCHED", "MISMATCH"].includes(invoice.status);
  const payable = ["APPROVED", "PARTIALLY_PAID"].includes(invoice.status) && outstanding > 0.01;
  const open = !["PAID", "CANCELLED"].includes(invoice.status);

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];

  if (approvable && ctx.has(PERM.material.vendorInvoice.approve)) {
    const mayOverride = ctx.has(PERM.material.vendorInvoice.overrideMismatch);
    // A mismatch may only be approved by somebody allowed to override it, and
    // then the justification is required rather than optional.
    if (!mismatched || mayOverride) {
      actions.push({
        key: "approve",
        label: mismatched ? "Approve with override" : "Approve for payment",
        emphasis: "approve",
        action: "material/invoices/approveInvoice",
        args: [id, "$remarks", mismatched],
        remark: "none",
        fields: [
          {
            name: "remarks",
            label: mismatched ? "Justification" : "Remarks",
            kind: "textarea",
            required: mismatched,
            wide: true,
          },
        ],
        confirm: mismatched
          ? "Approving a variance is an override, and it is recorded against your name."
          : "Payment can be released against it.",
      });
    }
  }

  if (payable && ctx.has(PERM.material.vendorPayment.create)) {
    actions.push({
      key: "pay",
      label: "Record payment",
      emphasis: "primary",
      action: "material/invoices/recordPayment",
      args: [id, "$amount", "$mode", "$referenceNo", "$remarks"],
      remark: "none",
      fields: [
        {
          name: "amount",
          label: "Amount (₹)",
          kind: "money",
          required: true,
          initial: Math.round(outstanding * 100) / 100,
        },
        {
          name: "mode",
          label: "Mode",
          kind: "select",
          required: true,
          initial: "NEFT",
          options: ["NEFT", "RTGS", "CHEQUE", "UPI", "CASH"].map((m) => ({ value: m, label: m })),
        },
        {
          name: "referenceNo",
          label: "Reference number",
          kind: "text",
          placeholder: "UTR / cheque number",
        },
        { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
      ],
      confirm: `${money(outstanding)} is outstanding. Paying all of it marks the invoice paid.`,
    });
  }

  if (open && ctx.has(PERM.material.vendorInvoice.match)) {
    actions.push({
      key: "rematch",
      label: "Re-run the match",
      emphasis: "outline",
      action: "material/invoices/rematchInvoice",
      args: [id],
      remark: "none",
      confirm: "Compares the order, the receipts and this invoice again, line by line.",
    });
  }

  if (open && ctx.has(PERM.material.vendorInvoice.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel invoice",
      emphasis: "reject",
      action: "material/invoices/cancelInvoice",
      args: [id, "$remarks"],
      remark: "none",
      fields: [{ name: "remarks", label: "Why", kind: "textarea", required: true, wide: true }],
      confirm: "A cancelled invoice cannot be paid.",
    });
  }

  /* ----------------------------------------------------------- the record */

  return {
    key: "material/invoices",
    id: invoice.id,
    title: invoice.invoiceNo,
    subtitle: `${invoice.vendor.name} · against ${invoice.purchaseOrder.poNo}`,
    pills: [
      { label: words(invoice.status), tone: toneOf(invoice.status) },
      match
        ? match.matched
          ? { label: "Match passed", tone: "good" }
          : { label: `${match.issues.length} variance(s) blocking payment`, tone: "bad" }
        : { label: "No match stored", tone: "draft" },
    ],
    sections: [
      {
        label: "Three-way match",
        fields: [
          {
            label: "Verdict",
            value: !match
              ? "No comparison stored for this invoice."
              : match.matched
                ? "Purchase order, goods receipt and invoice agree on every line."
                : `${match.issues.length} variance(s) blocking payment`,
            wide: true,
          },
          // Each variance in the matcher's own words, which is what has to be
          // resolved — usually by posting the outstanding goods receipt.
          ...(match && !match.matched
            ? match.issues.map((issue, i) => ({
                label: `Variance ${i + 1}`,
                value: issue,
                wide: true as const,
              }))
            : []),
        ],
      },
      {
        label: "Invoice details",
        fields: [
          { label: "Purchase order", value: invoice.purchaseOrder.poNo },
          {
            label: "Project",
            value: `${invoice.purchaseOrder.project.code} — ${invoice.purchaseOrder.project.name}`,
          },
          { label: "Vendor", value: invoice.vendor.name },
          { label: "GSTIN", value: invoice.vendor.gstin },
          { label: "Invoice date", value: invoice.invoiceDate.toISOString(), format: "date" },
          { label: "Received on", value: invoice.receivedDate.toISOString(), format: "date" },
          { label: "Remarks", value: invoice.remarks, wide: true },
        ],
      },
      {
        label: "Amount",
        fields: [
          { label: "Sub-total", value: Number(invoice.subTotal), format: "money" },
          { label: "Tax", value: Number(invoice.taxAmount), format: "money" },
          { label: "Total", value: total, format: "money" },
          { label: "Paid", value: paid, format: "money" },
          { label: "Outstanding", value: outstanding, format: "money" },
        ],
      },
    ],
    collections: [
      {
        key: `lines:${id}`,
        label: `Lines (${invoice.items.length})`,
        rows: invoice.items.map((l) => ({
          id: l.id,
          title: l.item.name,
          subtitle: `${l.item.code} · ${qty(Number(l.invoicedQty), 3)} ${l.item.uom.name} at ${money(Number(l.rate))} · GST ${Number(l.taxPct)}%`,
          trailing: money(Number(l.amount)),
        })),
        emptyMessage: "This invoice has no lines.",
      },
      {
        key: `payments:${id}`,
        label: `Payments (${invoice.payments.length})`,
        rows: invoice.payments.map((p) => ({
          id: p.id,
          title: p.paymentNo,
          subtitle: [p.mode, p.referenceNo, p.remarks].filter(Boolean).join(" · "),
          trailing: money(Number(p.amount)),
          pills: [{ label: p.paymentDate.toISOString().slice(0, 10), tone: "draft" as const }],
        })),
        emptyMessage: "Nothing has been paid against it.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
