import "server-only";

import { prisma } from "@/lib/db";
import { grnMatch } from "@/lib/material/list-filters";
import {
  deliveryLabel, pendingApproval, PO_STATUS_LABEL, PO_STATUS_TONE,
} from "@/lib/material/po-display";
import { isPoEditable } from "@/lib/material/procurement";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, toneOf, webTone, type RecordAction, type RecordView } from "./shared";

/**
 * One purchase order: what was ordered, what has arrived, and whose approval
 * it is standing in front of.
 *
 * Two levels decide a PO, and which one is waiting comes from
 * `pendingApproval()` — the same function the web detail screen asks — so the
 * phone offers "PM approve" or "Admin approve" exactly when the desk does, and
 * neither when the order is not waiting.
 *
 * Every write carries `po.updatedAt` as `expectedUpdatedAt`. That is the stale
 * guard the web passes: if the order moved on while the screen was open — a
 * revision, somebody else's approval — the action refuses rather than applying
 * a decision to a document the decider never saw.
 */
export async function purchaseOrderRecord(
  ctx: AuthContext,
  id: string,
): Promise<RecordView | null> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      vendor: { select: { name: true } },
      paymentTerm: { select: { name: true } },
      createdBy: { select: { name: true, designation: { select: { name: true } } } },
      pmApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { name: true } } } },
          indent: { select: { indentNo: true } },
        },
      },
      sourceIndent: { select: { indentNo: true } },
      grns: {
        orderBy: { grnDate: "desc" },
        include: {
          receivedBy: { select: { name: true } },
          items: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true, shortQty: true } },
        },
      },
      invoices: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
    },
  });
  if (!po) return null;
  assertProjectAccess(ctx, po.projectId);

  const nowMs = Date.now();
  const canSeeRate = ctx.has(PERM.material.purchaseOrder.viewRate);
  const waiting = pendingApproval(po.status);
  const stale = po.updatedAt.toISOString();
  // An invoice is raised against the order, not one delivery, so every receipt
  // on an invoiced order counts as matched.
  const invoiced = po.invoices.length > 0;

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];

  if (waiting === "PM" && ctx.has(PERM.material.purchaseOrder.approvePm)) {
    actions.push({
      key: "approvePm",
      label: "PM approve",
      emphasis: "approve",
      action: "material/purchase-orders/approvePoPm",
      args: [id, "$remarks", stale],
      remark: "none",
      fields: [{ name: "remarks", label: "Remarks", kind: "textarea", wide: true }],
      confirm: "It goes to the Admin for the second approval.",
    });
  }
  if (waiting === "ADMIN" && ctx.has(PERM.material.purchaseOrder.approveAdmin)) {
    actions.push({
      key: "approveAdmin",
      label: "Admin approve",
      emphasis: "approve",
      action: "material/purchase-orders/approvePoAdmin",
      args: [id, "$remarks", stale],
      remark: "none",
      fields: [{ name: "remarks", label: "Remarks", kind: "textarea", wide: true }],
      confirm: "The order is approved and goes to the vendor.",
    });
  }

  const open = !["CLOSED", "CANCELLED"].includes(po.status);

  if (open && ctx.has(PERM.material.purchaseOrder.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel order",
      emphasis: "reject",
      action: "material/purchase-orders/cancelPurchaseOrder",
      args: [id, "$remarks", stale],
      remark: "none",
      fields: [{ name: "remarks", label: "Why", kind: "textarea", required: true, wide: true }],
      confirm: "The vendor's order is called off. Say why — it stays on the record.",
    });
  }

  if (open && po.status !== "DRAFT" && ctx.has(PERM.material.purchaseOrder.close)) {
    actions.push({
      key: "close",
      label: "Close order",
      emphasis: "primary",
      action: "material/purchase-orders/closePurchaseOrder",
      args: [id, stale],
      remark: "none",
      confirm: "Nothing more can be received against it.",
    });
  }

  // Editing an approved order is a revision, and a revision restarts approval
  // at the Project Manager. The reason is the record of why.
  if (!isPoEditable(po) && open && ctx.has(PERM.material.purchaseOrder.revise)) {
    actions.push({
      key: "revise",
      label: "Raise a revision",
      emphasis: "outline",
      action: "material/purchase-orders/revisePurchaseOrder",
      args: [id, "$reason", stale],
      remark: "none",
      fields: [{ name: "reason", label: "Reason", kind: "textarea", required: true, wide: true }],
      confirm: "Approval restarts at the Project Manager. The lines are edited on the web.",
    });
  }

  /*
   * Receiving at the gate, which is the reason a store keeper has a phone.
   * The web picks the order and then shows what it is still waiting for; here
   * the order is already in hand, so the lines arrive pre-filled with the
   * balance still to come and the rate the order was placed at.
   *
   * Accepted plus rejected may not exceed what was received — the line's own
   * rule — and what is marked accepted enters the store immediately.
   */
  const pendingLines = po.items
    .map((l) => ({
      line: l,
      pending: Math.max(0, Number(l.orderedQty) - Number(l.receivedQty)),
    }))
    .filter((l) => l.pending > 0);

  if (
    pendingLines.length > 0 &&
    ["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status) &&
    ctx.has(PERM.material.grn.create)
  ) {
    const stores = await prisma.store.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, project: { select: { code: true } } },
    });
    actions.push({
      key: "receive",
      label: "Receive goods",
      emphasis: "primary",
      action: "material/grn/createGrn",
      args: [
        {
          poId: id,
          storeId: "$storeId",
          challanNo: "$challanNo",
          challanDate: "$challanDate",
          vehicleNo: "$vehicleNo",
          remarks: "$remarks",
          items: "$items",
        },
      ],
      remark: "none",
      fields: [
        {
          name: "storeId",
          label: "Receiving store",
          kind: "lookup",
          required: true,
          placeholder: "Search stores…",
          options: stores.map((st) => ({
            value: st.id,
            label: st.name,
            hint: st.project?.code ?? undefined,
          })),
        },
        { name: "challanNo", label: "Challan number", kind: "text", placeholder: "DC-4471" },
        { name: "challanDate", label: "Challan date", kind: "date" },
        {
          name: "vehicleNo",
          label: "Vehicle number",
          kind: "text",
          placeholder: "KA 01 AB 1234",
          caps: true,
        },
        { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
        {
          name: "items",
          label: "What arrived",
          kind: "rows",
          fixedRows: true,
          wide: true,
          initialRows: pendingLines.map(({ line, pending }) => ({
            _label: `${line.item.name} · ${qty(pending, 3)} ${line.item.uom.name} still to come`,
            poItemId: line.id,
            itemId: line.itemId,
            rate: Number(line.rate),
            receivedQty: pending,
            acceptedQty: pending,
          })),
          row: [
            { name: "poItemId", label: "Line", kind: "text", hidden: true },
            { name: "itemId", label: "Item", kind: "text", hidden: true },
            { name: "rate", label: "Rate", kind: "number", hidden: true },
            { name: "receivedQty", label: "Received", kind: "number", required: true },
            { name: "acceptedQty", label: "Accepted", kind: "number", required: true },
            { name: "rejectedQty", label: "Rejected", kind: "number" },
            { name: "shortQty", label: "Short", kind: "number" },
            { name: "rejectionReason", label: "Rejection reason", kind: "text" },
          ],
        },
      ],
      confirm:
        "What you mark accepted enters the store as soon as this is created, at the order's rate.",
    });
  }

  if (po.status === "DRAFT" && ctx.has(PERM.material.purchaseOrder.delete)) {
    actions.push({
      key: "delete",
      label: "Delete",
      emphasis: "reject",
      action: "material/purchase-orders/deletePurchaseOrder",
      args: [id, stale],
      remark: "none",
      confirm: "A draft order is removed for good.",
    });
  }

  /* ----------------------------------------------------------- the record */

  const refs = [
    ...new Set(
      [po.sourceIndent?.indentNo, ...po.items.map((l) => l.indent?.indentNo)].filter(
        (r): r is string => Boolean(r),
      ),
    ),
  ];

  const delivery = deliveryLabel(po.expectedDate, po.status, nowMs);

  return {
    key: "material/purchase-orders",
    id: po.id,
    title: po.poNo,
    subtitle: `${po.vendor.name} · ${po.project.code} · ${delivery.text}`,
    pills: [
      {
        label: PO_STATUS_LABEL[po.status] ?? po.status,
        tone: webTone(PO_STATUS_TONE[po.status] ?? "muted"),
      },
      { label: po.revision ? `Revision ${po.revision}` : "Original", tone: "warn" },
      ...(delivery.tone === "bad" ? [{ label: delivery.text, tone: "bad" as const }] : []),
    ],
    // Raised → PM → Admin, as the approval trail draws it.
    chain: [
      { initials: "R", state: "done" },
      {
        initials: "PM",
        state: po.pmApprovedAt ? "done" : waiting === "PM" ? "current" : "pending",
      },
      {
        initials: "AD",
        state: po.adminApprovedAt ? "done" : waiting === "ADMIN" ? "current" : "pending",
      },
    ],
    sections: [
      {
        label: "The order",
        fields: [
          { label: "PO no.", value: po.poNo },
          { label: "Vendor", value: po.vendor.name },
          { label: "Project", value: `${po.project.code} — ${po.project.name}` },
          { label: "PO date", value: po.poDate.toISOString(), format: "date" },
          { label: "Delivery", value: delivery.text },
          {
            label: "Terms",
            value: [po.paymentTerm?.name, po.terms].filter(Boolean).join(" · ") || null,
          },
          {
            label: "Against indent",
            value: refs.length ? refs.join(", ") : "Direct purchase — no indent",
          },
          { label: "Deliver to", value: po.deliveryAddress, wide: true },
        ],
      },
      {
        label: "Value",
        fields: canSeeRate
          ? [
              { label: "Sub-total", value: Number(po.subTotal), format: "money" },
              { label: "Tax", value: Number(po.taxAmount), format: "money" },
              { label: "Total", value: Number(po.totalAmount), format: "money" },
            ]
          : // The rate permission is what the web hides these behind.
            [{ label: "Rates", value: "Hidden — you may not see order rates", wide: true }],
      },
      {
        label: "Approval trail",
        fields: [
          {
            label: "Raised by",
            value: po.createdBy.designation
              ? `${po.createdBy.name} · ${po.createdBy.designation.name}`
              : po.createdBy.name,
          },
          { label: "PM approval", value: po.pmApprovedBy?.name ?? "Pending" },
          {
            label: "PM approved",
            value: po.pmApprovedAt?.toISOString() ?? null,
            format: "datetime",
          },
          { label: "Admin approval", value: po.adminApprovedBy?.name ?? "Pending" },
          {
            label: "Admin approved",
            value: po.adminApprovedAt?.toISOString() ?? null,
            format: "datetime",
          },
        ],
      },
    ],
    collections: [
      {
        key: `lines:${id}`,
        label: canSeeRate
          ? `${po.items.length} ${po.items.length === 1 ? "line" : "lines"} · ${money(Number(po.totalAmount))}`
          : `${po.items.length} ${po.items.length === 1 ? "line" : "lines"}`,
        rows: po.items.map((l) => {
          const ordered = Number(l.orderedQty);
          const received = Number(l.receivedQty);
          const pending = Math.max(0, ordered - received);
          return {
            id: l.id,
            title: l.item.name,
            subtitle: `${l.item.code}${canSeeRate ? ` · ${money(Number(l.rate))} each` : ""}`,
            trailing: `${qty(ordered, 3)} ${l.item.uom.name}`,
            pills: [
              pending === 0
                ? { label: "Fulfilled", tone: "good" as const }
                : received > 0
                  ? { label: `${qty(pending, 3)} still to come`, tone: "warn" as const }
                  : { label: "Not received", tone: "draft" as const },
            ],
          };
        }),
        emptyMessage: "This order has no lines.",
      },
      {
        key: `grns:${id}`,
        label: `Goods receipts · ${po.grns.length}`,
        rows: po.grns.map((g) => {
          const rejected = g.items.reduce((s, i) => s + Number(i.rejectedQty), 0);
          const short = g.items.reduce((s, i) => s + Number(i.shortQty), 0);
          const accepted = g.items.reduce((s, i) => s + Number(i.acceptedQty), 0);
          const match = grnMatch(g.status, rejected, short, invoiced ? 1 : 0);
          return {
            id: g.id,
            title: g.grnNo,
            subtitle: [
              g.receivedBy?.name,
              `${qty(accepted, 3)} accepted`,
              rejected ? `${qty(rejected, 3)} rejected` : null,
              short ? `${qty(short, 3)} short` : null,
            ].filter(Boolean).join(" · "),
            trailing: g.grnDate.toISOString().slice(0, 10),
            pills: [{ label: match.label, tone: webTone(match.tone) }],
          };
        }),
        emptyMessage: "Nothing has been received against this order yet.",
      },
      {
        key: `invoices:${id}`,
        label: `Vendor invoices · ${po.invoices.length}`,
        rows: po.invoices.map((i) => ({
          id: i.id,
          title: i.invoiceNo,
          trailing: canSeeRate ? money(Number(i.totalAmount)) : null,
          pills: [{ label: i.status.replace(/_/g, " "), tone: toneOf(i.status) }],
        })),
        emptyMessage: "No invoice has been recorded against it.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
