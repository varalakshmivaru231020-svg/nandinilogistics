"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

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
      where: { activityId, status: "PENDING" },
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

/** The Project Manager's decision. Approving is what actually moves the date. */
export async function decideExtensionAction(
  id: string,
  approve: boolean,
  note: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.schedule.extension.approve);

    const request = await prisma.scheduleExtension.findUnique({
      where: { id },
      include: { activity: true },
    });
    if (!request) throw new Error("Request not found.");
    assertProjectAccess(ctx, request.activity.projectId);
    if (request.status !== "PENDING") throw new Error("This request has already been decided.");
    if (!approve && !note.trim()) throw new Error("Say why the extension is refused.");

    await prisma.$transaction(async (tx) => {
      await tx.scheduleExtension.update({
        where: { id },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          decidedById: ctx.id,
          decidedAt: new Date(),
          decisionNote: note.trim() || null,
        },
      });

      // Only the planned date moves. The baseline stays where it was.
      if (approve) {
        await tx.scheduleActivity.update({
          where: { id: request.activityId },
          data: { plannedEnd: request.requestedDate },
        });
      }
    });

    await recordAudit({
      action: approve ? "APPROVE" : "REJECT",
      entity: "ScheduleExtension",
      entityId: id,
      userId: ctx.id,
      projectId: request.activity.projectId,
      summary:
        `${approve ? "Approved" : "Refused"} a ${request.requestedDays}-day extension on ` +
        `${request.activity.code}${note.trim() ? ` — ${note.trim()}` : ""}` +
        (approve ? ` (planned finish moved; baseline unchanged)` : ""),
    });

    revalidatePath("/schedule");
    return null;
  });
}
