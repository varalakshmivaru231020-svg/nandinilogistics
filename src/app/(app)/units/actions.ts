"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, UnitStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { diff, recordAudit } from "@/lib/audit";
import type { ImportPlan, ImportSummary } from "@/lib/import/columns";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { assertProjectAccess, authorize, PermissionError, runAction, type ActionResult } from "@/lib/rbac/guard";
import { writeUnitImport } from "@/lib/units/import-service";
import { planUnitImport, unitKey } from "@/lib/units/unit-import";
import { UNIT_STATUSES } from "@/lib/units/unit-list";
import type { UnitDraft } from "@/lib/units/unit-rules";
import {
  changeUnitStatus, createUnit, deleteUnit, unitWriteErrorMessage, updateUnit,
} from "@/lib/units/unit-service";

async function planUnitUpload(ctx: AuthContext, formData: FormData) {
  let sheet;
  try {
    sheet = await parseUploadFrom(formData);
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw new Error("The file could not be read. Save it again as .csv or .xlsx and retry.");
  }

  const scope = ctx.canAccessAllProjects ? {} : { projectId: { in: ctx.projectIds } };
  const [projects, blocks, unitTypes, existing] = await Promise.all([
    prisma.project.findMany({ select: { id: true, code: true } }),
    prisma.block.findMany({
      where: { status: "ACTIVE", ...scope },
      select: { id: true, projectId: true, code: true, name: true, totalFloors: true },
    }),
    prisma.unitType.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true } }),
    prisma.unit.findMany({ where: scope, select: { projectId: true, unitNumber: true } }),
  ]);

  return planUnitImport(sheet, {
    projects,
    accessibleProjectIds: ctx.canAccessAllProjects ? "all" : new Set(ctx.projectIds),
    blocks,
    unitTypes,
    existingUnits: new Set(existing.map((u) => unitKey(u.projectId, u.unitNumber))),
  });
}

/** Checks every row of a unit upload and reports what an import would do. Writes nothing. */
export async function previewUnitImportAction(formData: FormData): Promise<ActionResult<ImportPlan>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.import);
    const plan = await planUnitUpload(ctx, formData);
    // Only what the user needs to see — the prepared rows are rebuilt on import.
    return { ...plan, rows: plan.rows.map(({ row, label, errors, notes }) => ({ row, label, errors, notes })) };
  });
}

/**
 * Imports every valid row of a unit upload. The file is planned again rather
 * than trusting the preview; all rows go in one transaction, so the import
 * lands whole or not at all. Every unit starts AVAILABLE.
 */
export async function importUnitsAction(formData: FormData): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.import);
    const plan = await planUnitUpload(ctx, formData);
    if (plan.missing.length > 0) throw new Error(`The file is missing: ${plan.missing.join(", ")}.`);

    const inputs = plan.rows.flatMap((r) => (r.input ? [r.input] : []));
    if (inputs.length === 0) {
      throw new Error("No row in the file can be imported. Fix the rows marked in the preview and try again.");
    }

    let created: number;
    try {
      ({ created } = await prisma.$transaction((tx) => writeUnitImport(tx, inputs), { timeout: 120_000, maxWait: 10_000 }));
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        throw new Error("Some of these units were added by someone else while you were importing. Preview the file again.");
      }
      if (code === "P2003") {
        throw new Error("A project, block or unit type these rows refer to was removed while you were importing. Preview the file again.");
      }
      throw err;
    }

    const file = formData.get("file");
    const fileName = file && typeof file !== "string" ? file.name : "a file";
    const skipped = plan.invalid;
    const projectIds = [...new Set(inputs.map((i) => i.projectId))];

    await recordAudit({
      action: "CREATE",
      entity: "Unit",
      userId: ctx.id,
      projectId: projectIds.length === 1 ? projectIds[0] : null,
      summary: `Imported ${created} units from ${fileName}${skipped ? ` — ${skipped} row(s) skipped` : ""}`,
    });

    revalidatePath("/units");
    revalidatePath("/units/board");
    return {
      created,
      skipped,
      message: `Imported ${created} unit${created === 1 ? "" : "s"}` +
        (skipped ? `; ${skipped} row(s) with problems were skipped.` : "."),
    };
  });
}

/* ------------------------------ Unit management ----------------------------- */

const DRAFT_KEYS = [
  "projectId", "blockId", "unitTypeId", "unitNumber", "floorNumber",
  "carpetArea", "builtUpArea", "superBuiltUpArea", "facing", "plcTag", "parkingSlots",
] as const satisfies ReadonlyArray<keyof UnitDraft>;

/** Areas shown only to those who may see pricing inputs — as on the list and in the export. */
const PRICED_AREA_KEYS = ["carpetArea", "builtUpArea"] as const;

/** The fields the form actually sent. A disabled (locked) field is not sent, and keeps its stored value. */
function sentFields(formData: FormData): Partial<UnitDraft> {
  const out: Partial<UnitDraft> = {};
  for (const key of DRAFT_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

/** Runs a unit write in a transaction, turning database refusals into words. */
async function unitTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, unitNumber?: string): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (err) {
    const message = unitWriteErrorMessage(err, unitNumber);
    if (message) throw new Error(message);
    throw err;
  }
}

function revalidateUnits() {
  revalidatePath("/units");
  revalidatePath("/units/board");
}

async function scopedUnit(ctx: Awaited<ReturnType<typeof authorize>>, unitId: string) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, projectId: true, unitNumber: true } });
  if (!unit) throw new Error("This unit no longer exists.");
  assertProjectAccess(ctx, unit.projectId);
  return unit;
}

/**
 * Creates one unit, through the same rules as the import. Carpet area is
 * required and hidden without unit.unit.viewPrice, so creating needs both.
 */
export async function createUnitAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.create, PERM.unit.unit.viewPrice);
    const sent = sentFields(formData);
    const draft: UnitDraft = Object.fromEntries(DRAFT_KEYS.map((k) => [k, sent[k] ?? ""])) as unknown as UnitDraft;
    if (!draft.projectId) throw new Error("Project is required.");
    assertProjectAccess(ctx, draft.projectId);

    const unit = await unitTransaction((tx) => createUnit(tx, draft, ctx), draft.unitNumber.trim());

    await recordAudit({
      action: "CREATE",
      entity: "Unit",
      entityId: unit.id,
      userId: ctx.id,
      projectId: unit.projectId,
      summary: `Created unit ${unit.unitNumber}`,
      changes: diff({}, {
        unitNumber: unit.unitNumber, blockId: unit.blockId, unitTypeId: unit.unitTypeId, floorNumber: unit.floorNumber,
        carpetArea: Number(unit.carpetArea), builtUpArea: Number(unit.builtUpArea), superBuiltUpArea: Number(unit.superBuiltUpArea),
        facing: unit.facing, plcTag: unit.plcTag, parkingSlots: unit.parkingSlots, status: unit.status,
      }),
    });

    revalidateUnits();
    return { id: unit.id };
  });
}

/**
 * Edits a unit. The form sends `updatedAt` as loaded; a unit changed since —
 * by another edit, a hold or a booking — is refused rather than overwritten.
 * Locked fields (see unitEditLocks) are refused if changed.
 */
export async function updateUnitAction(unitId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.update);
    const current = await scopedUnit(ctx, unitId);

    const changes = sentFields(formData);
    if (!ctx.has(PERM.unit.unit.viewPrice) && PRICED_AREA_KEYS.some((k) => changes[k] !== undefined)) {
      throw new PermissionError(PERM.unit.unit.viewPrice, "You cannot change carpet or built-up area without permission to see them.");
    }

    const stamp = formData.get("updatedAt");
    const expectedUpdatedAt = new Date(typeof stamp === "string" ? stamp : "");
    if (Number.isNaN(expectedUpdatedAt.getTime())) throw new Error("Reload the unit before editing it.");

    const { before, after } = await unitTransaction(
      (tx) => updateUnit(tx, { unitId, expectedUpdatedAt, changes }, ctx),
      changes.unitNumber?.trim() ?? current.unitNumber,
    );

    const changed = diff({ ...before }, { ...after });
    await recordAudit({
      action: "UPDATE",
      entity: "Unit",
      entityId: unitId,
      userId: ctx.id,
      projectId: current.projectId,
      summary: `Edited unit ${after.unitNumber}${changed ? ` — ${Object.keys(changed).join(", ")}` : " (no changes)"}`,
      changes: changed,
    });

    revalidateUnits();
    return null;
  });
}

/**
 * Blocks or unblocks a unit — the only statuses set by hand. `expected` is the
 * status the user saw; if a hold or booking has moved the unit since, it wins.
 */
export async function changeUnitStatusAction(
  unitId: string,
  expected: UnitStatus,
  to: UnitStatus,
  reason: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.changeStatus);
    const known = UNIT_STATUSES as readonly string[];
    if (!known.includes(expected) || !known.includes(to)) throw new Error("Unknown unit status.");
    const current = await scopedUnit(ctx, unitId);

    const note = (reason ?? "").trim();
    const unit = await unitTransaction((tx) => changeUnitStatus(tx, { unitId, expected, to, reason: note }));

    await recordAudit({
      action: "UPDATE",
      entity: "Unit",
      entityId: unitId,
      userId: ctx.id,
      projectId: current.projectId,
      summary: to === "BLOCKED"
        ? `Blocked unit ${unit.unitNumber}: ${note}`
        : `Unblocked unit ${unit.unitNumber}${note ? `: ${note}` : ""}`,
      changes: { status: { from: expected, to } },
    });

    revalidateUnits();
    return null;
  });
}

/** Deletes an untouched unit. Anything with sales history is refused — block it instead. */
export async function deleteUnitAction(unitId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.unit.delete);
    const current = await scopedUnit(ctx, unitId);

    const unit = await unitTransaction((tx) => deleteUnit(tx, unitId));

    await recordAudit({
      action: "DELETE",
      entity: "Unit",
      entityId: unitId,
      userId: ctx.id,
      projectId: current.projectId,
      summary: `Deleted unit ${unit.unitNumber}`,
      changes: diff(
        { unitNumber: unit.unitNumber, status: unit.status, floorNumber: unit.floorNumber, superBuiltUpArea: Number(unit.superBuiltUpArea) },
        {},
      ),
    });

    revalidateUnits();
    return null;
  });
}
