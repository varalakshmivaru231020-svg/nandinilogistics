"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const ActivitySchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  workPackageId: z.string().optional(),
  code: z.string().trim().min(1, "Activity code is required"),
  name: z.string().trim().min(2, "Activity name is required"),
  plannedStart: z.string().min(1, "Planned start is required"),
  plannedEnd: z.string().min(1, "Planned finish is required"),
  isMilestone: z.coerce.boolean().default(false),
  sequence: z.coerce.number().int().min(0).default(0),
});

export async function createActivityAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.create);
    const parsed = ActivitySchema.safeParse({
      ...Object.fromEntries(formData),
      isMilestone: formData.get("isMilestone") === "on",
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    assertProjectAccess(ctx, v.projectId);
    const start = new Date(v.plannedStart);
    const end = new Date(v.plannedEnd);
    if (end < start) throw new Error("The finish date cannot be before the start date.");

    const activity = await prisma.scheduleActivity.create({
      data: {
        projectId: v.projectId,
        workPackageId: v.workPackageId || null,
        code: v.code.toUpperCase(),
        name: v.name,
        sequence: v.sequence,
        plannedStart: start,
        plannedEnd: end,
        // The baseline is captured at creation and never edited afterwards.
        baselineStart: start,
        baselineEnd: end,
        isMilestone: v.isMilestone,
      },
    });

    await recordAudit({
      action: "CREATE", entity: "ScheduleActivity", entityId: activity.id, userId: ctx.id,
      projectId: v.projectId,
      summary: `Added schedule activity ${activity.code} — ${activity.name}`,
    });

    revalidatePath("/schedule");
    return { id: activity.id };
  });
}

/**
 * Records progress. Slipping past the planned finish requires a delay reason,
 * so the review meeting starts with facts rather than recollection.
 */
export async function updateActivityProgressAction(
  id: string,
  progressPct: number,
  actualStart: string | null,
  actualEnd: string | null,
  delayReasonId: string | null,
  delayNotes: string,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.updateProgress);

    const activity = await prisma.scheduleActivity.findUnique({ where: { id } });
    if (!activity) throw new Error("Activity not found.");
    assertProjectAccess(ctx, activity.projectId);

    const pct = Math.max(0, Math.min(100, progressPct));
    const start = actualStart ? new Date(actualStart) : activity.actualStart;
    const end = actualEnd ? new Date(actualEnd) : pct >= 100 ? new Date() : null;

    // Delayed = finished late, or unfinished past the planned finish.
    const plannedEnd = activity.plannedEnd;
    const late =
      plannedEnd !== null &&
      ((end !== null && end > plannedEnd) || (end === null && pct < 100 && new Date() > plannedEnd));

    if (late && !delayReasonId && !activity.delayReasonId) {
      throw new Error(
        "This activity has slipped past its planned finish. Capture a delay reason before saving.",
      );
    }

    const status = pct >= 100 ? "COMPLETED" : late ? "DELAYED" : pct > 0 ? "IN_PROGRESS" : "NOT_STARTED";

    await prisma.scheduleActivity.update({
      where: { id },
      data: {
        progressPct: pct,
        actualStart: start,
        actualEnd: pct >= 100 ? end : null,
        status: status as never,
        delayReasonId: delayReasonId ?? activity.delayReasonId,
        delayNotes: delayNotes || activity.delayNotes,
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "ScheduleActivity", entityId: id, userId: ctx.id,
      projectId: activity.projectId,
      summary:
        `Updated ${activity.code} to ${pct}% (${status.toLowerCase().replace("_", " ")})` +
        (late ? " — recorded as delayed" : ""),
      changes: { progressPct: { from: activity.progressPct, to: pct } },
    });

    revalidatePath("/schedule");
    return { status };
  });
}

export async function setCriticalPathAction(
  id: string,
  isCritical: boolean,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.dependency.manage);

    const activity = await prisma.scheduleActivity.findUnique({ where: { id } });
    if (!activity) throw new Error("Activity not found.");
    assertProjectAccess(ctx, activity.projectId);

    await prisma.scheduleActivity.update({ where: { id }, data: { isCriticalPath: isCritical } });
    await recordAudit({
      action: "UPDATE", entity: "ScheduleActivity", entityId: id, userId: ctx.id,
      projectId: activity.projectId,
      summary: `${isCritical ? "Marked" : "Cleared"} ${activity.code} ${isCritical ? "as on" : "from"} the critical path`,
    });

    revalidatePath("/schedule");
    return null;
  });
}
