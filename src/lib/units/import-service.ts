import type { Prisma } from "@prisma/client";

import { unitKey, type UnitImportInput } from "./unit-import";

type Tx = Prisma.TransactionClient;

/**
 * Writes planned units inside the caller's transaction.
 *
 * The planner has already checked every row; this re-checks the invariants a
 * caller could otherwise get wrong, against the database as it stands inside
 * the transaction — so an import can never land a unit in a block of another
 * project, repeat a unit number, or start a unit anywhere but AVAILABLE.
 * Any failure throws, and the whole transaction rolls back.
 */
export async function writeUnitImport(tx: Tx, inputs: UnitImportInput[]): Promise<{ created: number }> {
  if (inputs.length === 0) return { created: 0 };

  const blockIds = [...new Set(inputs.map((i) => i.blockId))];
  const blocks = await tx.block.findMany({ where: { id: { in: blockIds } }, select: { id: true, projectId: true, name: true } });
  const blockProject = new Map(blocks.map((b) => [b.id, b]));

  const projectIds = [...new Set(inputs.map((i) => i.projectId))];
  const existing = await tx.unit.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, unitNumber: true },
  });
  const taken = new Set(existing.map((u) => unitKey(u.projectId, u.unitNumber)));

  for (const i of inputs) {
    const block = blockProject.get(i.blockId);
    if (!block) throw new Error(`A block these rows use was removed while you were importing. Preview the file again.`);
    if (block.projectId !== i.projectId) {
      throw new Error(`Block ${block.name} does not belong to the project unit ${i.unitNumber} is in.`);
    }
    if (i.carpetArea <= 0 || i.superBuiltUpArea <= 0) {
      throw new Error(`Unit ${i.unitNumber} needs a carpet and super built-up area.`);
    }
    const key = unitKey(i.projectId, i.unitNumber);
    if (taken.has(key)) {
      throw new Error(`Unit ${i.unitNumber} already exists in that project — someone may have added it while you were importing. Preview the file again.`);
    }
    taken.add(key);
  }

  const { count } = await tx.unit.createMany({
    data: inputs.map((i) => ({
      projectId: i.projectId,
      blockId: i.blockId,
      unitTypeId: i.unitTypeId,
      unitNumber: i.unitNumber,
      floorNumber: i.floorNumber,
      carpetArea: i.carpetArea,
      builtUpArea: i.builtUpArea,
      superBuiltUpArea: i.superBuiltUpArea,
      facing: i.facing,
      plcTag: i.plcTag,
      parkingSlots: i.parkingSlots,
      // Holds and bookings have their own flows; nothing is imported already sold.
      status: "AVAILABLE" as const,
    })),
  });
  return { created: count };
}
