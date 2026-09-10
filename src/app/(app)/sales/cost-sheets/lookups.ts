import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * Everything a cost sheet is generated from — quotable units, the leads it can
 * be raised for, the charge heads and the rate from each project's active
 * price list. Shared by the full /new page and the drawer the list opens.
 */
export async function costSheetLookups(ctx: AuthContext) {
  const scope = ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } };

  const [units, leads, heads, priceLists] = await Promise.all([
    prisma.unit.findMany({
      where: { ...scope, status: { in: ["AVAILABLE", "HELD"] } },
      orderBy: { unitNumber: "asc" },
      take: 500,
      select: {
        id: true, unitNumber: true, floorNumber: true, status: true,
        superBuiltUpArea: true, parkingSlots: true, plcTag: true,
        project: { select: { id: true, code: true, name: true } },
        unitType: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        state: { notIn: ["BOOKED", "LOST"] },
        ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, leadNo: true },
    }),
    prisma.chargeHead.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
      include: { taxRate: { select: { percentage: true } } },
    }),
    prisma.priceList.findMany({
      where: { isActive: true, status: "ACTIVE" },
      include: { items: true, project: { select: { id: true } } },
    }),
  ]);

  return {
    units: units.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      floorNumber: u.floorNumber,
      status: u.status,
      superBuiltUpArea: Number(u.superBuiltUpArea),
      parkingSlots: u.parkingSlots,
      plcTag: u.plcTag,
      projectId: u.project.id,
      projectCode: u.project.code,
      unitType: u.unitType?.name ?? null,
    })),
    leads,
    chargeHeads: heads.map((h) => ({
      id: h.id,
      code: h.code,
      name: h.name,
      calcType: h.calcType,
      defaultValue: Number(h.defaultValue),
      taxPct: h.taxRate ? Number(h.taxRate.percentage) : 0,
      sortOrder: h.sortOrder,
      isMandatory: h.isMandatory,
    })),
    rates: Object.fromEntries(
      priceLists.map((p) => [
        p.project.id,
        {
          baseRate: Number(p.items[0]?.baseRate ?? 0),
          floorRise: Number(p.items[0]?.floorRise ?? 0),
          plcAmount: Number(p.items[0]?.plcAmount ?? 0),
          name: p.name,
        },
      ]),
    ),
  };
}

export type CostSheetLookups = Awaited<ReturnType<typeof costSheetLookups>>;
