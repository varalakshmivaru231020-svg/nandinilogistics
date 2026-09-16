"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { assertProjectAccess, authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

export interface PlannedUnit {
  floorNumber: number;
  unitNumber: string;
  unitTypeId: string | null;
}

/**
 * The design's "Generate N units": one tower, its floors, and the flats on
 * each. Written in a single transaction so a half-built tower is impossible,
 * and refused if any of the numbers already exist in the project.
 */
export async function generateUnitsAction(
  projectId: string,
  towerName: string,
  units: PlannedUnit[],
): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.create);
    assertProjectAccess(ctx, projectId);

    const name = towerName.trim();
    if (!name) throw new Error("A tower or block name is required.");
    if (units.length === 0) throw new Error("There are no units to create.");

    const numbers = units.map((u) => u.unitNumber.trim());
    if (numbers.some((n) => !n)) throw new Error("Every flat needs a number.");
    if (new Set(numbers).size !== numbers.length) {
      throw new Error("Two flats have been given the same number.");
    }

    const clash = await prisma.unit.findFirst({
      where: { projectId, unitNumber: { in: numbers } },
      select: { unitNumber: true },
    });
    if (clash) throw new Error(`Unit ${clash.unitNumber} already exists in this project.`);

    const created = await prisma.$transaction(async (tx) => {
      const floors = new Set(units.map((u) => u.floorNumber));
      const block = await tx.block.create({
        data: {
          projectId,
          name,
          code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12),
          totalFloors: floors.size,
        },
      });
      await tx.unit.createMany({
        data: units.map((u) => ({
          projectId,
          blockId: block.id,
          unitTypeId: u.unitTypeId,
          unitNumber: u.unitNumber.trim(),
          floorNumber: u.floorNumber,
        })),
      });
      return units.length;
    });

    await recordAudit({
      action: "CREATE", entity: "Block", userId: ctx.id,
      summary: `Created ${name} with ${created} unit${created === 1 ? "" : "s"}`,
    });
    revalidatePath("/units/board");
    return { created };
  });
}
