import "server-only";

import type { Prisma } from "@prisma/client";

import { buildCostSheet, type ChargeHeadFacts } from "./cost-sheet";

/**
 * Loads everything a cost sheet needs and generates it, so the same numbers
 * come out whether the caller is the cost-sheet screen or the booking flow.
 *
 * The price list is chosen by effective date: a unit booked today is quoted on
 * the version active today, and a past booking keeps whatever it was sold at.
 */
export async function generateCostSheetFor(
  tx: Prisma.TransactionClient,
  unitId: string,
  options: { discountAmount?: number; includeOptional?: string[]; asOf?: Date } = {},
) {
  const asOf = options.asOf ?? new Date();

  const unit = await tx.unit.findUnique({
    where: { id: unitId },
    include: { project: { select: { id: true, name: true, code: true } } },
  });
  if (!unit) throw new Error("Unit not found.");

  // Resolution is purely by effective date — deliberately NOT filtered on
  // `isActive`. A quote dated before a revision must still find the version
  // that was live then, which is what "a past booking keeps its rate" means.
  // `isActive` only marks which version is current for the UI.
  const priceList = await tx.priceList.findFirst({
    where: {
      projectId: unit.projectId,
      status: "ACTIVE",
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: { items: true },
  });
  if (!priceList) {
    throw new Error(
      `No active price list for ${unit.project.name} on this date. Create one before quoting.`,
    );
  }

  // Prefer a rate set for this specific unit, else the project-wide row.
  const unitRate = priceList.items.find((i) => i.unitId === unit.id) ?? priceList.items[0];
  if (!unitRate) throw new Error("The active price list has no rates configured.");

  const heads = await tx.chargeHead.findMany({
    where: { status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    include: { taxRate: { select: { percentage: true } } },
  });

  const chargeHeads: ChargeHeadFacts[] = heads.map((h) => ({
    id: h.id,
    code: h.code,
    name: h.name,
    calcType: h.calcType,
    defaultValue: Number(h.defaultValue),
    taxPct: h.taxRate ? Number(h.taxRate.percentage) : 0,
    sortOrder: h.sortOrder,
    isMandatory: h.isMandatory,
  }));

  const sheet = buildCostSheet(
    {
      unitNumber: unit.unitNumber,
      floorNumber: unit.floorNumber,
      superBuiltUpArea: Number(unit.superBuiltUpArea),
      carpetArea: Number(unit.carpetArea),
      parkingSlots: unit.parkingSlots,
      plcTag: unit.plcTag,
    },
    {
      baseRate: Number(unitRate.baseRate),
      floorRise: Number(unitRate.floorRise),
      plcAmount: Number(unitRate.plcAmount),
    },
    chargeHeads,
    { discountAmount: options.discountAmount, includeOptional: options.includeOptional },
  );

  return { unit, priceList, baseRate: Number(unitRate.baseRate), sheet };
}

/** Releases holds whose expiry has passed. Called before any availability read. */
export async function expireStaleHolds(tx: Prisma.TransactionClient): Promise<number> {
  const stale = await tx.unitHold.findMany({
    where: { isActive: true, expiresAt: { lt: new Date() } },
    select: { id: true, unitId: true },
  });
  if (stale.length === 0) return 0;

  await tx.unitHold.updateMany({
    where: { id: { in: stale.map((h) => h.id) } },
    data: { isActive: false, releasedAt: new Date(), releaseNote: "Hold expired automatically" },
  });

  // A unit only returns to AVAILABLE if nothing else has claimed it since.
  await tx.unit.updateMany({
    where: { id: { in: stale.map((h) => h.unitId) }, status: "HELD" },
    data: { status: "AVAILABLE" },
  });

  return stale.length;
}
