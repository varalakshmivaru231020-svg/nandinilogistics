import "server-only";

import { prisma } from "@/lib/db";
import { grnMatch } from "@/lib/material/list-filters";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, webTone, words, type RecordAction, type RecordView } from "./shared";

/**
 * One goods receipt: what the order said, what arrived, and what the store
 * took in.
 *
 * Ordered against received against rejected is the whole document — the list
 * row says "Mismatch" and nothing about which line it was. The three-way match
 * line comes from `grnMatch()`, the same helper the web's row and detail both
 * read, so the phone cannot call a receipt matched that the desk calls blocked.
 */
export async function grnRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const grn = await prisma.grn.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      store: { select: { name: true } },
      receivedBy: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      purchaseOrder: {
        select: {
          id: true, poNo: true, projectId: true, totalAmount: true, expectedDate: true,
          status: true, adminApprovedAt: true,
          adminApprovedBy: { select: { name: true } },
          project: { select: { code: true, name: true } },
          sourceIndent: { select: { indentNo: true } },
          items: { select: { indent: { select: { indentNo: true } } } },
        },
      },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { name: true } } } },
          poItem: { select: { orderedQty: true } },
        },
      },
      attachments: {
        select: { id: true, fileName: true, label: true, fileSize: true },
      },
    },
  });
  if (!grn) return null;
  assertProjectAccess(ctx, grn.purchaseOrder.projectId);

  const invoice = await prisma.vendorInvoice.findFirst({
    where: { poId: grn.purchaseOrder.id },
    orderBy: { invoiceDate: "desc" },
    select: { invoiceNo: true },
  });

  const accepted = grn.items.reduce((s, i) => s + Number(i.acceptedQty), 0);
  const rejected = grn.items.reduce((s, i) => s + Number(i.rejectedQty), 0);
  const short = grn.items.reduce((s, i) => s + Number(i.shortQty), 0);
  const match = grnMatch(grn.status, rejected, short, invoice ? 1 : 0);
  const canSeeRate = ctx.has(PERM.material.purchaseOrder.viewRate);

  const refs = [
    ...new Set(
      [
        grn.purchaseOrder.sourceIndent?.indentNo,
        ...grn.purchaseOrder.items.map((l) => l.indent?.indentNo),
      ].filter((r): r is string => Boolean(r)),
    ),
  ];

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];

  /*
   * A receipt reaches the ledger as it is created, where anything was
   * accepted. One that did not — nothing accepted at the gate, inspected
   * afterwards — is sitting outside stock with no way back in, and this is the
   * permission that exists for exactly that.
   */
  if (grn.status !== "POSTED" && grn.status !== "CANCELLED" && accepted > 0 &&
      ctx.has(PERM.material.grn.post)) {
    actions.push({
      key: "post",
      label: "Post to stock",
      emphasis: "approve",
      action: "material/grn/postGrn",
      args: [id],
      remark: "none",
      confirm: "The accepted quantities enter the stock ledger at the receipt rate.",
    });
  }

  if (grn.status !== "POSTED" && grn.status !== "CANCELLED" && ctx.has(PERM.material.grn.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel receipt",
      emphasis: "reject",
      action: "material/grn/cancelGrn",
      args: [id, "$remarks"],
      remark: "none",
      fields: [{ name: "remarks", label: "Why", kind: "textarea", required: true, wide: true }],
      confirm: "A posted receipt cannot be cancelled — the ledger is corrected by an adjustment.",
    });
  }

  if (ctx.has(PERM.material.grn.update)) {
    actions.push({
      key: "edit",
      label: "Edit receipt",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "material/grn:edit",
      confirm:
        "The challan, the vehicle and the remarks. A posted quantity is corrected by a stock adjustment, never rewritten.",
    });
  }

  if (ctx.has(PERM.material.grn.delete)) {
    actions.push({
      key: "delete",
      label: "Delete",
      emphasis: "reject",
      action: "material/grn/deleteGrn",
      args: [id, grn.updatedAt.toISOString()],
      remark: "none",
      confirm: "Only a receipt that never reached the ledger can be removed.",
    });
  }

  /* ----------------------------------------------------------- the record */

  const unit = grn.items[0]?.item.uom.name ?? "";

  return {
    key: "material/grn",
    id: grn.id,
    title: grn.grnNo,
    subtitle: `${grn.purchaseOrder.poNo} · ${grn.vendor.name} · ${grn.store.name}`,
    pills: [
      { label: words(grn.status), tone: webTone(grn.status === "POSTED" ? "good" : "muted") },
      { label: match.label, tone: webTone(match.tone) },
    ],
    sections: [
      {
        label: "The order",
        fields: [
          { label: "PO number", value: grn.purchaseOrder.poNo },
          { label: "Vendor", value: grn.vendor.name },
          {
            label: "Project",
            value: `${grn.purchaseOrder.project.code} — ${grn.purchaseOrder.project.name}`,
          },
          {
            label: "PO value",
            value: canSeeRate ? Number(grn.purchaseOrder.totalAmount) : null,
            format: "money",
          },
          {
            label: "PO approved by",
            value: grn.purchaseOrder.adminApprovedBy?.name ?? "Pending",
          },
          {
            label: "Linked indents",
            value: refs.length ? refs.join(", ") : "Direct purchase — no indent",
          },
        ],
      },
      {
        label: "Receipt",
        fields: [
          { label: "Received by", value: grn.receivedBy.name },
          { label: "Received at", value: grn.grnDate.toISOString(), format: "datetime" },
          { label: "Store", value: grn.store.name },
          { label: "Accepted", value: `${qty(accepted, 3)} ${unit}` },
          { label: "Rejected", value: rejected ? `${qty(rejected, 3)} ${unit}` : "none" },
          { label: "Short", value: short ? `${qty(short, 3)} ${unit}` : "none" },
          { label: "Challan", value: grn.challanNo },
          { label: "Vehicle", value: grn.vehicleNo },
          {
            label: "Challan photo",
            value: grn.challanPhotoUrl ? (grn.challanPhotoUrl.split("/").pop() ?? "attached") : "Not attached",
          },
          { label: "Inspected by", value: grn.inspectedBy?.name ?? null },
          { label: "Remarks", value: grn.remarks, wide: true },
        ],
      },
      {
        label: "Vendor invoice",
        fields: [
          { label: "Invoice", value: invoice?.invoiceNo ?? "Invoice pending" },
          {
            label: "Payment",
            value: invoice
              ? "Three-way match complete — PO ↔ GRN ↔ Invoice. Payment can be released."
              : "Goods are in store, but payment stays blocked until the vendor invoice is attached and matched.",
            wide: true,
          },
        ],
      },
    ],
    collections: [
      {
        key: `lines:${id}`,
        label: `Ordered vs received · ${grn.items.length} ${grn.items.length === 1 ? "line" : "lines"}`,
        rows: grn.items.map((l) => {
          const ordered = Number(l.poItem?.orderedQty ?? 0);
          const rej = Number(l.rejectedQty);
          const sh = Number(l.shortQty);
          const u = l.item.uom.name;
          return {
            id: l.id,
            title: l.item.name,
            subtitle: [
              l.item.code,
              `ordered ${qty(ordered, 3)} ${u}`,
              canSeeRate ? `${money(Number(l.rate))} each` : null,
              l.rejectionReason,
            ].filter(Boolean).join(" · "),
            trailing: `${qty(Number(l.receivedQty), 3)} ${u}`,
            // The web's own three verdicts, in its own words.
            pills: [
              sh
                ? { label: `Short ${qty(sh, 3)} ${u}`, tone: "warn" as const }
                : rej
                  ? { label: "Received with rejection", tone: "bad" as const }
                  : { label: "Fully received", tone: "good" as const },
            ],
          };
        }),
        emptyMessage: "This receipt has no lines.",
      },
      {
        key: `files:${id}`,
        label: `Attachments · ${grn.attachments.length}`,
        rows: grn.attachments.map((a) => ({
          id: a.id,
          title: a.fileName,
          subtitle: a.label,
          trailing: `${Math.max(1, Math.round(a.fileSize / 1024))} KB`,
        })),
        emptyMessage: "Challans, weighbridge slips and photos are added on the web.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
