import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { projectScopeFilter } from "@/lib/rbac/context";

/**
 * Purchase orders still expecting material, each with its lines.
 *
 * The lines come along deliberately: the design picks the purchase order and
 * receives against it inside one drawer (`grNoApproved` → `grHasPO`), so the
 * switch has to happen without a round trip.
 */
export async function grnLookups(ctx: AuthContext) {
  const scope = projectScopeFilter(ctx);

  const [openPos, stores] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { ...scope, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } },
      orderBy: { poDate: "asc" },
      take: 50,
      include: {
        vendor: { select: { name: true } },
        project: { select: { id: true, code: true, name: true } },
        items: {
          include: { item: { select: { id: true, code: true, name: true, uom: { select: { name: true } } } } },
        },
      },
    }),
    prisma.store.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, projectId: true },
    }),
  ]);

  return {
    stores: stores.map((s) => ({ id: s.id, name: s.name, code: s.code, projectId: s.projectId })),
    openPos: openPos.map((p) => ({
      id: p.id,
      poNo: p.poNo,
      vendorName: p.vendor.name,
      projectId: p.projectId,
      projectCode: p.project.code,
      projectName: p.project.name,
      expectedDate: p.expectedDate?.toISOString() ?? null,
      totalAmount: Number(p.totalAmount),
      lines: p.items.map((l) => ({
        poItemId: l.id,
        itemId: l.item.id,
        code: l.item.code,
        name: l.item.name,
        uom: l.item.uom.name,
        orderedQty: Number(l.orderedQty),
        alreadyReceived: Number(l.receivedQty),
        rate: Number(l.rate),
      })),
    })),
  };
}

export type GrnLookups = Awaited<ReturnType<typeof grnLookups>>;
