"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { isLinkType } from "@/lib/schedule/engine";
import { assertLinkIsAcyclic, reschedule } from "@/lib/schedule/service";

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
): Promise<ActionResult<{ status: string; shifted: number }>> {
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

    // A real start or finish can push everything downstream of it, so the
    // cascade runs in the same transaction as the update that caused it.
    const { shifted } = await prisma.$transaction(async (tx) => {
      await tx.scheduleActivity.update({
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
      return reschedule(tx, activity.projectId);
    });

    await recordAudit({
      action: "UPDATE", entity: "ScheduleActivity", entityId: id, userId: ctx.id,
      projectId: activity.projectId,
      summary:
        `Updated ${activity.code} to ${pct}% (${status.toLowerCase().replace("_", " ")})` +
        (late ? " — recorded as delayed" : "") +
        (shifted.length ? ` — moved ${shifted.length} downstream activit${shifted.length === 1 ? "y" : "ies"}` : ""),
      changes: { progressPct: { from: activity.progressPct, to: pct } },
    });

    revalidatePath("/schedule");
    return { status, shifted: shifted.length };
  });
}


/**
 * The design's one-click row actions. They are the same write as the progress
 * dialog, narrowed: Start stamps the actual start, Completed stamps the actual
 * finish at 100%. Neither touches the baseline — that only ever moves when an
 * extension is approved, and even then only plannedEnd.
 */
export async function startActivityAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.start);

    const activity = await prisma.scheduleActivity.findUnique({ where: { id } });
    if (!activity) throw new Error("Activity not found.");
    assertProjectAccess(ctx, activity.projectId);
    if (activity.actualStart) throw new Error(`${activity.name} is already started.`);
    if (activity.status === "COMPLETED") throw new Error(`${activity.name} is already complete.`);

    const now = new Date();
    // A late start moves anything linked start-to-start.
    await prisma.$transaction(async (tx) => {
      await tx.scheduleActivity.update({
        where: { id },
        data: { actualStart: now, status: "IN_PROGRESS", progressPct: Math.max(1, activity.progressPct) },
      });
      await reschedule(tx, activity.projectId);
    });
    await recordAudit({
      action: "UPDATE", entity: "ScheduleActivity", entityId: id, userId: ctx.id,
      projectId: activity.projectId,
      summary: `Started ${activity.code} — ${activity.name}`,
    });
    revalidatePath("/schedule");
    return null;
  });
}

export async function completeActivityAction(id: string): Promise<ActionResult<{ late: boolean; shifted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.complete);

    const activity = await prisma.scheduleActivity.findUnique({ where: { id } });
    if (!activity) throw new Error("Activity not found.");
    assertProjectAccess(ctx, activity.projectId);
    if (activity.status === "COMPLETED") throw new Error(`${activity.name} is already complete.`);

    const now = new Date();
    const late = activity.plannedEnd !== null && now > activity.plannedEnd;

    const { shifted } = await prisma.$transaction(async (tx) => {
      await tx.scheduleActivity.update({
        where: { id },
        data: {
          progressPct: 100,
          actualStart: activity.actualStart ?? now,
          actualEnd: now,
          status: "COMPLETED",
        },
      });
      // Finishing past the plan pushes everything waiting on this activity.
      return reschedule(tx, activity.projectId);
    });
    await recordAudit({
      action: "UPDATE", entity: "ScheduleActivity", entityId: id, userId: ctx.id,
      projectId: activity.projectId,
      summary: `Completed ${activity.code} — ${activity.name}${late ? " (behind plan)" : ""}`,
    });
    revalidatePath("/schedule");
    return { late, shifted: shifted.length };
  });
}

/* ------------------------------ Dependencies ------------------------------ */

const LAG_LIMIT_DAYS = 365;

/**
 * Make one activity wait on another.
 *
 * The link is checked for loops before it is saved, and the project is
 * rescheduled in the same transaction: adding a constraint can only push work
 * later, never earlier. The critical path is recomputed from the result —
 * there is no longer a way to set it by hand, because a hand-set flag would be
 * silently overwritten the next time anything moved.
 */
export async function addDependencyAction(
  successorId: string,
  predecessorId: string,
  type: string,
  lagDays: number,
): Promise<ActionResult<{ shifted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.dependency.manage);

    if (!isLinkType(type)) throw new Error("Choose how the two activities are linked.");
    if (!Number.isInteger(lagDays) || Math.abs(lagDays) > LAG_LIMIT_DAYS) {
      throw new Error(`Lag must be a whole number of days, within ±${LAG_LIMIT_DAYS}.`);
    }

    const [successor, predecessor] = await Promise.all([
      prisma.scheduleActivity.findUnique({ where: { id: successorId }, select: { code: true, projectId: true } }),
      prisma.scheduleActivity.findUnique({ where: { id: predecessorId }, select: { code: true, projectId: true } }),
    ]);
    if (!successor || !predecessor) throw new Error("Activity not found.");
    assertProjectAccess(ctx, successor.projectId);
    if (successor.projectId !== predecessor.projectId) {
      throw new Error("An activity can only wait on another in the same project.");
    }

    const existing = await prisma.scheduleDependency.findFirst({ where: { predecessorId, successorId } });
    if (existing) throw new Error(`${successor.code} already depends on ${predecessor.code}.`);

    const candidate = { predecessorId, successorId, type, lagDays };
    const { shifted } = await prisma.$transaction(async (tx) => {
      await assertLinkIsAcyclic(tx, successor.projectId, candidate);
      await tx.scheduleDependency.create({ data: candidate });
      return reschedule(tx, successor.projectId);
    });

    await recordAudit({
      action: "CREATE", entity: "ScheduleDependency", userId: ctx.id, projectId: successor.projectId,
      summary:
        `${successor.code} now waits on ${predecessor.code} (${type}${lagDays ? `, ${lagDays > 0 ? "+" : ""}${lagDays}d` : ""})` +
        (shifted.length ? ` — ${shifted.length} activit${shifted.length === 1 ? "y" : "ies"} moved` : ""),
    });

    revalidatePath("/schedule");
    return { shifted: shifted.length };
  });
}

/**
 * Remove a link. Because the cascade only pushes, taking a constraint away
 * leaves every date where it is — nobody is told to start sooner — and only
 * the critical path can change.
 */
export async function removeDependencyAction(id: string): Promise<ActionResult<{ shifted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.dependency.manage);

    const dependency = await prisma.scheduleDependency.findUnique({
      where: { id },
      include: {
        predecessor: { select: { code: true, projectId: true } },
        successor: { select: { code: true } },
      },
    });
    if (!dependency) throw new Error("That link no longer exists.");
    assertProjectAccess(ctx, dependency.predecessor.projectId);

    const { shifted } = await prisma.$transaction(async (tx) => {
      await tx.scheduleDependency.delete({ where: { id } });
      return reschedule(tx, dependency.predecessor.projectId);
    });

    await recordAudit({
      action: "DELETE", entity: "ScheduleDependency", entityId: id, userId: ctx.id,
      projectId: dependency.predecessor.projectId,
      summary: `${dependency.successor.code} no longer waits on ${dependency.predecessor.code}`,
    });

    revalidatePath("/schedule");
    return { shifted: shifted.length };
  });
}
