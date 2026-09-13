"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import type { ImportPlan, ImportSummary } from "@/lib/import/columns";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { writeUnitImport } from "@/lib/units/import-service";
import { planUnitImport, unitKey } from "@/lib/units/unit-import";

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
