import "server-only";

import { prisma } from "@/lib/db";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/lib/material/po-display";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { phone as phoneNumber, qty } from "@/lib/utils";

import { money, webTone, type RecordAction, type RecordView } from "./shared";

/**
 * One vendor: who to call, how they are paid, and every order on them.
 *
 * On-time delivery is measured where it can be — orders that were received,
 * against the date the order promised — which is the web page's own rule, not
 * a second guess at it.
 */
export async function vendorRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      city: { select: { name: true } },
      paymentTerm: { select: { name: true } },
      categories: { include: { category: { select: { name: true } } } },
      purchaseOrders: {
        orderBy: { poDate: "desc" },
        select: {
          id: true, poNo: true, status: true, totalAmount: true, expectedDate: true,
          items: {
            select: {
              orderedQty: true,
              item: { select: { name: true, uom: { select: { name: true } } } },
            },
          },
          grns: { select: { grnDate: true } },
        },
      },
    },
  });
  if (!vendor) return null;

  const delivered = vendor.purchaseOrders.filter((p) => p.grns.length > 0 && p.expectedDate);
  const onTime = delivered.filter(
    (p) => Math.min(...p.grns.map((g) => g.grnDate.getTime())) <= p.expectedDate!.getTime(),
  ).length;
  const spend = vendor.purchaseOrders.reduce((s, p) => s + Number(p.totalAmount), 0);
  const canSeeRate = ctx.has(PERM.material.purchaseOrder.viewRate);

  const actions: RecordAction[] = [];
  if (ctx.has(PERM.masters.vendor.update)) {
    actions.push({
      key: "edit",
      label: "Edit vendor",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "material/vendors:edit",
      confirm: "The vendor code is generated and cannot be typed.",
    });
  }

  if (ctx.has(PERM.material.purchaseOrder.create)) {
    // The web's "Raise a PO" on this screen. The order itself is built on the
    // web, where the lines and rates are.
    actions.push({
      key: "raisePo",
      label: "Raise a PO",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "material/purchase-orders:create",
      confirm: `A new order on ${vendor.name}.`,
    });
  }

  return {
    key: "material/vendors",
    id: vendor.id,
    title: vendor.name,
    subtitle: [
      vendor.code,
      vendor.rating ? `rated ${vendor.rating.toFixed(1)}` : null,
      delivered.length ? `${Math.round((onTime / delivered.length) * 100)}% on time` : null,
      canSeeRate && spend > 0 ? `${money(spend)} ordered` : null,
    ].filter(Boolean).join(" · "),
    pills: [
      vendor.status === "ACTIVE"
        ? { label: "Active", tone: "good" }
        : // The vendor list words this "On hold", and so does this.
          { label: "On hold", tone: "warn" },
    ],
    sections: [
      {
        label: "Vendor details",
        fields: [
          { label: "Contact person", value: vendor.contactPerson },
          { label: "Mobile", value: vendor.phone ? phoneNumber(vendor.phone) : null },
          { label: "Email", value: vendor.email },
          {
            label: "Supply categories",
            value: vendor.categories.map((c) => c.category.name).join(" · ") || null,
            wide: true,
          },
          { label: "GSTIN", value: vendor.gstin },
          { label: "PAN", value: vendor.pan },
          { label: "Payment terms", value: vendor.paymentTerm?.name ?? null },
          {
            label: "Address",
            value:
              [vendor.addressLine, vendor.city?.name, vendor.pincode].filter(Boolean).join(", ") ||
              null,
            wide: true,
          },
        ],
      },
      {
        label: "Payment",
        fields: [
          { label: "Bank account number", value: vendor.accountNumber },
          { label: "IFSC code", value: vendor.ifsc },
          { label: "Bank & branch", value: vendor.bankName },
          { label: "UPI ID", value: vendor.upiId },
        ],
      },
    ],
    collections: [
      {
        key: `orders:${id}`,
        label: `${vendor.purchaseOrders.length} ${vendor.purchaseOrders.length === 1 ? "purchase order" : "purchase orders"}`,
        rows: vendor.purchaseOrders.map((p) => {
          const first = p.items[0];
          return {
            id: p.id,
            title: p.poNo,
            subtitle: first
              ? `${first.item.name} · ${qty(Number(first.orderedQty), 3)} ${first.item.uom.name}${p.items.length > 1 ? ` +${p.items.length - 1} more` : ""}`
              : "No lines",
            trailing: canSeeRate ? money(Number(p.totalAmount)) : null,
            pills: [
              {
                label: PO_STATUS_LABEL[p.status] ?? p.status,
                tone: webTone(PO_STATUS_TONE[p.status] ?? "muted"),
              },
            ],
          };
        }),
        emptyMessage: "No purchase orders raised on this vendor yet",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
