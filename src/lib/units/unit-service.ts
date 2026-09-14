import type { Prisma, UnitStatus } from "@prisma/client";

import type { ProjectScope } from "./unit-list";
import {
  checkStatusChange, checkUnitDeletable, checkUnitValues, findLockedChanges, indexUnitLookups, unitEditLocks,
  unitKey, validateUnitDraft, UNIT_IN_USE_MESSAGE,
  type UnitDraft, type UnitInput, type UnitIssue,
} from "./unit-rules";

type Tx = Prisma.TransactionClient;

/**
 * Creating, editing, blocking and deleting units, inside the caller's
 * transaction. The action checks permissions and project access; everything a
 * unit must satisfy is enforced here, against the database as it stands inside
 * the transaction, so no other caller can get around it.
 */

/** A refusal the user can act on. `issues` carries per-field detail for a form. */
export class UnitRuleError extends Error {
  readonly issues: UnitIssue[];
  constructor(message: string, issues: UnitIssue[] = []) {
    super(message);
    this.name = "UnitRuleError";
    this.issues = issues;
  }
}

const STALE = "This unit was changed since you opened it — by an edit, a hold or a booking. Reload and try again.";

const refuse = (issues: UnitIssue[]): never => {
  throw new UnitRuleError(issues.map((i) => i.message).join(". ") + ".", issues);
};

/** The stored unit as the validator's input shape. */
function inputOf(u: {
  projectId: string; blockId: string | null; unitTypeId: string | null; unitNumber: string; floorNumber: number;
  carpetArea: Prisma.Decimal; builtUpArea: Prisma.Decimal; superBuiltUpArea: Prisma.Decimal;
  facing: string | null; plcTag: string | null; parkingSlots: number;
}): UnitInput {
  return {
    projectId: u.projectId,
    blockId: u.blockId ?? "",
    unitTypeId: u.unitTypeId ?? "",
    unitNumber: u.unitNumber,
    floorNumber: u.floorNumber,
    carpetArea: Number(u.carpetArea),
    builtUpArea: Number(u.builtUpArea),
    superBuiltUpArea: Number(u.superBuiltUpArea),
    facing: u.facing,
    plcTag: u.plcTag,
    parkingSlots: u.parkingSlots,
  };
}

/**
 * Lookups for one project: its active blocks, the active unit types, and the
 * unit numbers already used there. An edited unit keeps its own block and type
 * even if they have since been retired, and its own number does not count.
 */
async function lookupsFor(
  tx: Tx,
  projectId: string,
  scope: ProjectScope,
  keep: { unitId?: string; blockId?: string | null; unitTypeId?: string | null } = {},
) {
  const [projects, blocks, unitTypes, existing] = await Promise.all([
    tx.project.findMany({ where: { id: projectId }, select: { id: true, code: true } }),
    tx.block.findMany({
      where: { projectId, OR: [{ status: "ACTIVE" }, ...(keep.blockId ? [{ id: keep.blockId }] : [])] },
      select: { id: true, projectId: true, code: true, name: true, totalFloors: true },
    }),
    tx.unitType.findMany({
      where: { OR: [{ status: "ACTIVE" }, ...(keep.unitTypeId ? [{ id: keep.unitTypeId }] : [])] },
      select: { id: true, code: true, name: true },
    }),
    tx.unit.findMany({
      where: { projectId, ...(keep.unitId ? { id: { not: keep.unitId } } : {}) },
      select: { projectId: true, unitNumber: true },
    }),
  ]);
  return indexUnitLookups({
    projects,
    accessibleProjectIds: scope.canAccessAllProjects ? "all" : new Set(scope.projectIds),
    blocks,
    unitTypes,
    existingUnits: new Set(existing.map((u) => unitKey(u.projectId, u.unitNumber))),
  });
}

/** Holds the unit's row for the rest of the transaction, so a hold, cost sheet or booking on it waits. */
async function lockUnit(tx: Tx, unitId: string) {
  await tx.$queryRaw`SELECT id FROM units WHERE id = ${unitId} FOR UPDATE`;
}

/* --------------------------------- Create --------------------------------- */

export async function createUnit(tx: Tx, draft: UnitDraft, scope: ProjectScope) {
  const index = await lookupsFor(tx, draft.projectId.trim(), scope);
  const { issues, input } = validateUnitDraft(draft, index);
  if (!input) return refuse(issues);

  return tx.unit.create({
    data: { ...input, status: "AVAILABLE" },
  });
}

/* ---------------------------------- Edit ---------------------------------- */

export interface UnitEdit {
  unitId: string;
  /** The updatedAt the editor loaded. Anything since — an edit, a hold, a booking — wins. */
  expectedUpdatedAt: Date;
  /** Only the fields the form sent; the rest keep their stored values. */
  changes: Partial<UnitDraft>;
}

export async function updateUnit(tx: Tx, edit: UnitEdit, scope: ProjectScope) {
  await lockUnit(tx, edit.unitId);
  const unit = await tx.unit.findUnique({
    where: { id: edit.unitId },
    include: { _count: { select: { holds: true, bookings: true, costSheets: true } } },
  });
  if (!unit) throw new UnitRuleError("This unit no longer exists.");
  if (unit.updatedAt.getTime() !== edit.expectedUpdatedAt.getTime()) throw new UnitRuleError(STALE);

  const before = inputOf(unit);
  const sent = Object.fromEntries(Object.entries(edit.changes).filter(([, v]) => typeof v === "string"));
  const draft: UnitDraft = {
    projectId: before.projectId,
    blockId: before.blockId,
    unitTypeId: before.unitTypeId,
    unitNumber: before.unitNumber,
    floorNumber: String(before.floorNumber),
    carpetArea: String(before.carpetArea),
    builtUpArea: String(before.builtUpArea),
    superBuiltUpArea: String(before.superBuiltUpArea),
    facing: before.facing ?? "",
    plcTag: before.plcTag ?? "",
    parkingSlots: String(before.parkingSlots),
    ...sent,
  };

  const locks = unitEditLocks({
    status: unit.status,
    holds: unit._count.holds,
    bookings: unit._count.bookings,
    costSheets: unit._count.costSheets,
  });

  // What the edit asks for, parsed through the shared rules whether or not it is valid.
  const after: UnitInput = {
    projectId: draft.projectId.trim(),
    blockId: draft.blockId.trim(),
    unitTypeId: draft.unitTypeId.trim(),
    ...checkUnitValues(draft).values,
  };

  // A change to a locked field is refused first, whatever else is wrong.
  const lockedChanges = findLockedChanges(before, after, locks);
  if (lockedChanges.length > 0) refuse(lockedChanges);

  // Every locked field now holds its stored value. A problem with one of those
  // is not the editor's to fix — a block since given fewer floors must not stop
  // someone correcting the facing — so only the fields they may change count.
  const index = await lookupsFor(tx, after.projectId, scope, {
    unitId: unit.id, blockId: unit.blockId, unitTypeId: unit.unitTypeId,
  });
  const issues = validateUnitDraft(draft, index).issues.filter((i) => !locks.locked.has(i.field));
  if (issues.length > 0) refuse(issues);

  const { count } = await tx.unit.updateMany({
    where: { id: unit.id, updatedAt: unit.updatedAt },
    data: {
      blockId: after.blockId || null,
      unitTypeId: after.unitTypeId || null,
      unitNumber: after.unitNumber,
      floorNumber: after.floorNumber,
      carpetArea: after.carpetArea,
      builtUpArea: after.builtUpArea,
      superBuiltUpArea: after.superBuiltUpArea,
      facing: after.facing,
      plcTag: after.plcTag,
      parkingSlots: after.parkingSlots,
    },
  });
  if (count === 0) throw new UnitRuleError(STALE);

  return { unit, before, after };
}

/* --------------------------------- Status --------------------------------- */

export interface UnitStatusChange {
  unitId: string;
  /** The status the user saw. The write only lands if the unit is still in it. */
  expected: UnitStatus;
  to: UnitStatus;
  reason: string;
}

export async function changeUnitStatus(tx: Tx, change: UnitStatusChange) {
  const refusal = checkStatusChange(change.expected, change.to, change.reason);
  if (refusal) throw new UnitRuleError(refusal);

  // Guarded on the status the user saw: a hold or booking taken meanwhile wins.
  const { count } = await tx.unit.updateMany({
    where: { id: change.unitId, status: change.expected },
    data: { status: change.to },
  });
  const unit = await tx.unit.findUnique({
    where: { id: change.unitId },
    select: { id: true, unitNumber: true, projectId: true, status: true },
  });
  if (!unit) throw new UnitRuleError("This unit no longer exists.");
  if (count === 0) {
    throw new UnitRuleError(
      `Unit ${unit.unitNumber} is now ${unit.status.toLowerCase()} — it changed since you loaded it. Nothing was changed.`,
    );
  }
  return unit;
}

/* --------------------------------- Delete --------------------------------- */

export async function deleteUnit(tx: Tx, unitId: string) {
  await lockUnit(tx, unitId);
  const unit = await tx.unit.findUnique({
    where: { id: unitId },
    include: { _count: { select: { holds: true, bookings: true, costSheets: true, priceItems: true } } },
  });
  if (!unit) throw new UnitRuleError("This unit no longer exists.");

  const refusal = checkUnitDeletable({ unitNumber: unit.unitNumber, status: unit.status, ...unit._count });
  if (refusal) throw new UnitRuleError(refusal);

  const { count } = await tx.unit.deleteMany({
    where: { id: unitId, status: { in: ["AVAILABLE", "BLOCKED"] } },
  });
  if (count === 0) throw new UnitRuleError(UNIT_IN_USE_MESSAGE);
  return unit;
}

/** Turns a database refusal into words, or returns null for anything else. */
export function unitWriteErrorMessage(err: unknown, unitNumber?: string): string | null {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2002") {
    return `Unit number ${unitNumber ? `${unitNumber} ` : ""}already exists in this project.`;
  }
  if (code === "P2003") return UNIT_IN_USE_MESSAGE;
  return null;
}
