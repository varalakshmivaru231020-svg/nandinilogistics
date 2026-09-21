import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { projectScopeFilter } from "@/lib/rbac/context";

/**
 * Purchase orders that can be invoiced, with the lines and the accepted
 * quantity that caps what may be billed. Carried together so the drawer can
 * choose a purchase order and bill against it without a round trip.
 */
export async function invoiceLookups(ctx: AuthContext) {
  const scope = projectScopeFilter(ctx);

  // Only POs with something actually received can be invoiced.
  const pos = await prisma.purchaseOrder.findMany({
    where: { ...scope, status: { in: ["PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] } },
    orderBy: { poDate: "desc" },
    take: 50,
    include: {
      vendor: { select: { name: true, gstin: true } },
      project: { select: { code: true, name: true } },
      _count: { select: { invoices: true } },
      items: { include: { item: { select: { id: true, code: true, name: true, uom: { select: { name: true } } } } } },
      grns: { where: { status: "POSTED" }, include: { items: true } },
    },
  });

  return {
    invoiceable: pos.map((po) => {
      // Accepted quantity from posted receipts is the ceiling for billing.
      const receivedByItem = new Map<string, number>();
      for (const g of po.grns) {
        for (const l of g.items) {
          receivedByItem.set(l.itemId, (receivedByItem.get(l.itemId) ?? 0) + Number(l.acceptedQty));
        }
      }

      return {
        id: po.id,
        poNo: po.poNo,
        vendorName: po.vendor.name,
        vendorGstin: po.vendor.gstin,
        projectCode: po.project.code,
        invoiceCount: po._count.invoices,
        totalAmount: Number(po.totalAmount),
        lines: po.items.map((l) => ({
          itemId: l.item.id,
          code: l.item.code,
          name: l.item.name,
          uom: l.item.uom.name,
          orderedQty: Number(l.orderedQty),
          receivedQty: receivedByItem.get(l.item.id) ?? 0,
          poRate: Number(l.rate),
          taxPct: Number(l.taxPct),
        })),
      };
    }),
  };
}

export type InvoiceLookups = Awaited<ReturnType<typeof invoiceLookups>>;
