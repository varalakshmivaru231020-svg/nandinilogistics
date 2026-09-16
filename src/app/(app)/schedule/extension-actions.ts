"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { reschedule } from "@/lib/schedule/service";

/**
 * Requests a new finish date for an activity.
 *
 * The baseline is never touched — only the planned date can move, and only
 * once a Project Manager has approved the request.
 */
export async function requestExtensionAction(
  activityId: string,
  days: number,
  reason: string,
): Promise<ActionResult<{ requestedDate: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.extension.request);

    if (!(days > 0)) throw new Error("Enter the number of days you need.");
    if (!reason.trim()) throw new Error("A reason is required — it is what the variance report reads.");

    const activity = await prisma.scheduleActivity.findUnique({ where: { id: activityId } });
    if (!activity) throw new Error("Activity not found.");
    assertProjectAccess(ctx, activity.projectId);
    if (activity.status === "COMPLETED") {
      throw new Error("This activity is already complete — there is nothing to extend.");
    }

    const open = await prisma.scheduleExtension.findFirst({
      where: { activityId, status: { in: ["AWAITING_PM", "AWAITING_ADMIN"] } },
    });
    if (open) throw new Error("An extension request is already pending on this activity.");

    const base = activity.plannedEnd ?? activity.baselineEnd ?? new Date();
    const requestedDate = new Date(base.getTime() + days * 86_400_000);

    await prisma.scheduleExtension.create({
      data: {
        activityId, requestedDays: days, reason: reason.trim(),
        requestedDate, requestedById: ctx.id,
      },
    });

    await recordAudit({
      action: "SUBMIT", entity: "ScheduleExtension", entityId: activityId, userId: ctx.id,
      projectId: activity.projectId,
      summary: `Requested ${days} day(s) on ${activity.code} — ${activity.name}: ${reason.trim()}`,
    });

    revalidatePath("/schedule");
    return { requestedDate: requestedDate.toISOString() };
  });
}

/**
 * The Project Manager's decision — the first of the two.
 *
 * Passing it does not move any date: it puts the request in front of the
 * Admin, who is the only one who can grant the revised date.
 */
export async function decideExtensionPmAction(
  id: string,
  approve: boolean,
  remark: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.extension.approve);

    const request = await prisma.scheduleExtension.findUnique({
      where: { id },
      include: { activity: true },
    });
    if (!request) throw new Error("Request not found.");
    assertProjectAccess(ctx, request.activity.projectId);
    if (request.status !== "AWAITING_PM") {
      throw new Error("This request is no longer waiting on the Project Manager.");
    }
    if (!approve && !remark.trim()) throw new Error("Say why the extension is refused.");

    await prisma.scheduleExtension.update({
      where: { id },
      data: {
        status: approve ? "AWAITING_ADMIN" : "REFUSED",
        pmDecidedById: ctx.id,
        pmDecidedAt: new Date(),
        pmRemark: remark.trim() || null,
      },
    });

    await recordAudit({
      action: approve ? "APPROVE" : "REJECT",
      entity: "ScheduleExtension",
      entityId: id,
      userId: ctx.id,
      projectId: request.activity.projectId,
      summary:
        `${approve ? "Passed" : "Refused"} a ${request.requestedDays}-day extension on ` +
        `${request.activity.code} at Project Manager level` +
        (remark.trim() ? ` — ${remark.trim()}` : ""),
    });

    revalidatePath("/schedule");
    return null;
  });
}

/**
 * The Admin's decision. Granting is what actually moves the planned finish —
 * the baseline stays where it was, which is what keeps the variance report
 * honest — and records whether the delay was genuine or avoidable.
 */
export async function decideExtensionAdminAction(
  id: string,
  approve: boolean,
  remark: string,
  performance: "Genuine" | "Avoidable",
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.extension.approveAdmin);

    const request = await prisma.scheduleExtension.findUnique({
      where: { id },
      include: { activity: true },
    });
    if (!request) throw new Error("Request not found.");
    assertProjectAccess(ctx, request.activity.projectId);
    if (request.status !== "AWAITING_ADMIN") {
      throw new Error("This request is not waiting on the Admin.");
    }
    if (!approve && !remark.trim()) throw new Error("Say why the extension is refused.");

    let shifted = 0;
    await prisma.$transaction(async (tx) => {
      await tx.scheduleExtension.update({
        where: { id },
        data: {
          status: approve ? "GRANTED" : "REFUSED",
          adminDecidedById: ctx.id,
          adminDecidedAt: new Date(),
          adminRemark: remark.trim() || null,
          performance,
        },
      });

      // Only the planned date moves. The baseline stays where it was.
      if (approve) {
        await tx.scheduleActivity.update({
          where: { id: request.activityId },
          data: { plannedEnd: request.requestedDate },
        });
        // A later finish pushes everything waiting on it, in the same transaction.
        shifted = (await reschedule(tx, request.activity.projectId)).shifted.length;
      }
    });

    await recordAudit({
      action: approve ? "APPROVE" : "REJECT",
      entity: "ScheduleExtension",
      entityId: id,
      userId: ctx.id,
      projectId: request.activity.projectId,
      summary:
        `${approve ? "Granted" : "Refused"} a ${request.requestedDays}-day extension on ` +
        `${request.activity.code} — ${performance.toLowerCase()} delay` +
        (remark.trim() ? ` — ${remark.trim()}` : "") +
        (approve ? " (planned finish moved; baseline unchanged)" : "") +
        (shifted ? ` — ${shifted} downstream activit${shifted === 1 ? "y" : "ies"} moved with it` : ""),
    });

    revalidatePath("/schedule");
    return null;
  });
}
