"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { isLinkType } from "@/lib/schedule/engine";
import { buildTemplate, clashingCodes, instantiateTemplate, type TemplateShape } from "@/lib/schedule/template";
import { assertLinkIsAcyclic, reschedule } from "@/lib/schedule/service";

/**
 * The design's schedule builds itself: "+ Main category" names a package of
 * work and the dates it should run between, "+ Sub-activity" puts an activity
 * inside it. Neither asks for a code — the code is derived here, the way every
 * other document number is, so two people adding at once cannot collide.
 */
function codeFrom(name: string, taken: Set<string>): string {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.slice(0, 3))
      .join("-")
      .slice(0, 14) || "WP";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const next = `${base}-${n}`;
    if (!taken.has(next)) return next;
  }
}

const AddSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  // "5" is a name someone typed, not a missing one — say what is actually wrong.
  name: z.string().trim().min(1, "Name is required")
    .refine((v) => v.trim().length >= 2, "Give the activity a name of at least two characters."),
  plannedStart: z.string().min(1, "Planned start is required"),
  plannedEnd: z.string().min(1, "Planned end is required"),
});

export async function addMainCategoryAction(
  projectId: string, name: string, plannedStart: string, plannedEnd: string, manager = "",
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.project.workPackage.create);
    const v = AddSchema.parse({ projectId, name, plannedStart, plannedEnd });
    assertProjectAccess(ctx, v.projectId);

    const start = new Date(v.plannedStart);
    const end = new Date(v.plannedEnd);
    if (end < start) throw new Error("Planned end cannot be before planned start.");

    // The manager is chosen from the people mapped to this project. Empty means
    // the project's own manager runs it.
    const wanted = manager.trim();
    let managerId: string | null = null;
    if (wanted) {
      const person = await prisma.user.findFirst({
        where: {
          id: wanted,
          status: "ACTIVE",
          OR: [
            { projectAccess: { some: { projectId: v.projectId } } },
            { managedProjects: { some: { id: v.projectId } } },
          ],
        },
        select: { id: true },
      });
      if (!person) throw new Error("That person is not on this project.");
      managerId = person.id;
    }

    const created = await prisma.$transaction(async (tx) => {
      // A main category lives under a phase; a project that has never had one
      // gets a single phase to hold its schedule.
      const phase =
        (await tx.projectPhase.findFirst({ where: { projectId: v.projectId }, orderBy: { sequence: "asc" } })) ??
        (await tx.projectPhase.create({
          data: { projectId: v.projectId, code: "SCHEDULE", name: "Schedule", sequence: 0 },
        }));

      const siblings = await tx.workPackage.findMany({
        where: { phaseId: phase.id },
        select: { code: true, sequence: true },
      });
      return tx.workPackage.create({
        data: {
          phaseId: phase.id,
          code: codeFrom(v.name, new Set(siblings.map((w) => w.code))),
          name: v.name,
          sequence: siblings.length,
          managerId,
          startDate: start,
          endDate: end,
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "WorkPackage", entityId: created.id, userId: ctx.id, projectId: v.projectId,
      summary: `Added main category ${created.code} — ${created.name}`,
    });
    revalidatePath("/schedule");
    return { id: created.id };
  });
}

export async function addSubActivityAction(
  projectId: string, workPackageId: string, name: string, plannedStart: string, plannedEnd: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.activity.create);
    const v = AddSchema.parse({ projectId, name, plannedStart, plannedEnd });
    assertProjectAccess(ctx, v.projectId);
    if (!workPackageId) throw new Error("Pick the main category it belongs to.");

    const start = new Date(v.plannedStart);
    const end = new Date(v.plannedEnd);
    if (end < start) throw new Error("Planned end cannot be before planned start.");

    const siblings = await prisma.scheduleActivity.findMany({
      where: { projectId: v.projectId },
      select: { code: true, sequence: true },
    });
    const activity = await prisma.scheduleActivity.create({
      data: {
        projectId: v.projectId,
        workPackageId,
        code: codeFrom(v.name, new Set(siblings.map((a) => a.code))),
        name: v.name,
        sequence: siblings.length,
        plannedStart: start,
        plannedEnd: end,
        // The baseline is captured at creation and never edited afterwards.
        baselineStart: start,
        baselineEnd: end,
      },
    });

    await recordAudit({
      action: "CREATE", entity: "ScheduleActivity", entityId: activity.id, userId: ctx.id,
      projectId: v.projectId,
      summary: `Added sub-activity ${activity.code} — ${activity.name}`,
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

/* -------------------------------- Templates ------------------------------- */

/** The structure a stored template must have before it is trusted. */
const TemplateShapeSchema = z.object({
  activities: z
    .array(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        sequence: z.number().int(),
        offsetDays: z.number().int().min(0),
        durationDays: z.number().int().min(0),
        isMilestone: z.boolean(),
      }),
    )
    .min(1),
  links: z.array(
    z.object({
      predecessorCode: z.string().min(1),
      successorCode: z.string().min(1),
      type: z.enum(["FS", "SS", "FF", "SF"]),
      lagDays: z.number().int(),
    }),
  ),
});

/**
 * Capture a project's schedule as a template: each activity's offset from the
 * first start, its duration, and the links between activities. Actual dates
 * and progress are deliberately not captured — a template is a plan, not a
 * record of how a particular project went.
 */
export async function saveScheduleAsTemplateAction(
  projectId: string,
  name: string,
  description: string,
): Promise<ActionResult<{ id: string; activityCount: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.template.save);
    assertProjectAccess(ctx, projectId);

    const trimmed = name.trim();
    if (trimmed.length < 3) throw new Error("Give the template a name of at least three characters.");
    if (await prisma.scheduleTemplate.findUnique({ where: { name: trimmed } })) {
      throw new Error(`A template called "${trimmed}" already exists.`);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { projectTypeId: true, code: true },
    });
    if (!project) throw new Error("Project not found.");

    const rows = await prisma.scheduleActivity.findMany({
      where: { projectId, plannedStart: { not: null }, plannedEnd: { not: null } },
      select: {
        id: true, code: true, name: true, sequence: true,
        plannedStart: true, plannedEnd: true, isMilestone: true,
      },
    });
    const links = await prisma.scheduleDependency.findMany({
      where: { predecessor: { projectId } },
      select: { predecessorId: true, successorId: true, type: true, lagDays: true },
    });

    const shape = buildTemplate(
      rows.map((r) => ({ ...r, plannedStart: r.plannedStart!.getTime(), plannedEnd: r.plannedEnd!.getTime() })),
      links,
    );

    const template = await prisma.scheduleTemplate.create({
      data: {
        name: trimmed,
        description: description.trim() || null,
        projectTypeId: project.projectTypeId,
        activityCount: shape.activities.length,
        shape: shape as unknown as Prisma.InputJsonValue,
        createdById: ctx.id,
      },
    });

    await recordAudit({
      action: "CREATE", entity: "ScheduleTemplate", entityId: template.id, userId: ctx.id, projectId,
      summary: `Saved ${project.code}'s schedule as the template "${trimmed}" — ${shape.activities.length} activities, ${shape.links.length} links`,
    });

    revalidatePath("/schedule");
    return { id: template.id, activityCount: shape.activities.length };
  });
}

/**
 * Lay a template onto a project from a start date. Every activity, its
 * baseline and its links are created in one transaction and the project is
 * rescheduled from them, so a template never lands half-applied.
 */
export async function applyTemplateAction(
  templateId: string,
  projectId: string,
  startDate: string,
): Promise<ActionResult<{ created: number; shifted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.template.apply);
    assertProjectAccess(ctx, projectId);

    const start = new Date(startDate);
    if (!startDate || Number.isNaN(start.getTime())) throw new Error("Pick the date the schedule starts from.");

    const template = await prisma.scheduleTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error("Template not found.");

    const parsed = TemplateShapeSchema.safeParse(template.shape);
    if (!parsed.success) {
      throw new Error(`The template "${template.name}" is damaged and cannot be applied.`);
    }
    const shape = parsed.data as TemplateShape;

    const existing = await prisma.scheduleActivity.findMany({ where: { projectId }, select: { code: true } });
    const clashes = clashingCodes(shape, existing.map((e) => e.code));
    if (clashes.length) {
      throw new Error(
        `This project already has ${clashes.length === 1 ? "an activity" : "activities"} coded ` +
        `${clashes.join(", ")}. Rename ${clashes.length === 1 ? "it" : "them"} before applying the template.`,
      );
    }

    const plan = instantiateTemplate(shape, start.getTime());

    const { shifted } = await prisma.$transaction(async (tx) => {
      const idByCode = new Map<string, string>();
      for (const a of plan.activities) {
        const row = await tx.scheduleActivity.create({
          data: {
            projectId,
            code: a.code,
            name: a.name,
            sequence: a.sequence,
            isMilestone: a.isMilestone,
            plannedStart: new Date(a.start),
            plannedEnd: new Date(a.end),
            // A template's dates become this project's baseline, frozen from here.
            baselineStart: new Date(a.start),
            baselineEnd: new Date(a.end),
          },
        });
        idByCode.set(a.code, row.id);
      }
      for (const l of plan.links) {
        await tx.scheduleDependency.create({
          data: {
            predecessorId: idByCode.get(l.predecessorCode)!,
            successorId: idByCode.get(l.successorCode)!,
            type: l.type,
            lagDays: l.lagDays,
          },
        });
      }
      return reschedule(tx, projectId);
    });

    await recordAudit({
      action: "CREATE", entity: "ScheduleActivity", userId: ctx.id, projectId,
      summary: `Applied the template "${template.name}" from ${startDate} — ${plan.activities.length} activities, ${plan.links.length} links`,
    });

    revalidatePath("/schedule");
    return { created: plan.activities.length, shifted: shifted.length };
  });
}

/** Removes the template only. Schedules already built from it stay as they are. */
export async function deleteTemplateAction(templateId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.template.delete);
    const template = await prisma.scheduleTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error("Template not found.");

    await prisma.scheduleTemplate.delete({ where: { id: templateId } });
    await recordAudit({
      action: "DELETE", entity: "ScheduleTemplate", entityId: templateId, userId: ctx.id,
      summary: `Deleted the schedule template "${template.name}"`,
    });

    revalidatePath("/schedule");
    return null;
  });
}
