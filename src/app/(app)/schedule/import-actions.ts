"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import type { ImportPlan, ImportSummary } from "@/lib/import/columns";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess, authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { planActivityImport } from "@/lib/schedule/activity-import";
import { writeActivityImport } from "@/lib/schedule/activity-import-service";
import { isLinkType, type EngineLink } from "@/lib/schedule/engine";

async function planActivityUpload(projectId: string, formData: FormData) {
  let sheet;
  try {
    sheet = await parseUploadFrom(formData);
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw new Error("The file could not be read. Save it again as .csv or .xlsx and retry.");
  }

  const [existing, links] = await Promise.all([
    prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true, code: true } }),
    prisma.scheduleDependency.findMany({
      where: { predecessor: { projectId } },
      select: { predecessorId: true, successorId: true, type: true, lagDays: true },
    }),
  ]);
  const existingLinks: EngineLink[] = links
    .filter((l) => isLinkType(l.type))
    .map((l) => ({ ...l, type: l.type as EngineLink["type"] }));

  return planActivityImport(sheet, { existing, existingLinks });
}

async function mustProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true } });
  if (!project) throw new Error("Project not found.");
  return project;
}

/** Checks every row of a schedule upload against the project. Writes nothing. */
export async function previewActivityImportAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ImportPlan>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.import);
    assertProjectAccess(ctx, projectId);
    await mustProject(projectId);
    const plan = await planActivityUpload(projectId, formData);
    return { ...plan, rows: plan.rows.map(({ row, label, errors, notes }) => ({ row, label, errors, notes })) };
  });
}

/**
 * Imports every valid row into the project: activities with their baselines,
 * finish-to-start links, then a reschedule — one transaction, so the schedule
 * never lands half-imported. The file is planned again rather than trusting
 * the preview.
 */
export async function importActivitiesAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.import);
    assertProjectAccess(ctx, projectId);
    const project = await mustProject(projectId);

    const plan = await planActivityUpload(projectId, formData);
    if (plan.missing.length > 0) throw new Error(`The file is missing: ${plan.missing.join(", ")}.`);

    const inputs = plan.rows.flatMap((r) => (r.input ? [r.input] : []));
    if (inputs.length === 0) {
      throw new Error("No row in the file can be imported. Fix the rows marked in the preview and try again.");
    }

    let result: Awaited<ReturnType<typeof writeActivityImport>>;
    try {
      result = await prisma.$transaction((tx) => writeActivityImport(tx, projectId, inputs), {
        timeout: 120_000,
        maxWait: 10_000,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        throw new Error("Some of these activity codes were added by someone else while you were importing. Preview the file again.");
      }
      if (code === "P2003") {
        throw new Error("An activity these rows wait on was removed while you were importing. Preview the file again.");
      }
      throw err;
    }

    const file = formData.get("file");
    const fileName = file && typeof file !== "string" ? file.name : "a file";
    const skipped = plan.invalid;
    const details = [
      result.links ? `${result.links} link${result.links === 1 ? "" : "s"}` : null,
      result.shifted ? `${result.shifted} activit${result.shifted === 1 ? "y" : "ies"} moved by their predecessors` : null,
      skipped ? `${skipped} row(s) skipped` : null,
    ].filter(Boolean);

    await recordAudit({
      action: "CREATE",
      entity: "ScheduleActivity",
      userId: ctx.id,
      projectId,
      summary: `Imported ${result.created} activities into ${project.code} from ${fileName}${details.length ? ` — ${details.join(", ")}` : ""}`,
    });

    revalidatePath("/schedule");
    return {
      created: result.created,
      skipped,
      message: `Imported ${result.created} activit${result.created === 1 ? "y" : "ies"}${details.length ? `: ${details.join(", ")}` : ""}.`,
    };
  });
}
