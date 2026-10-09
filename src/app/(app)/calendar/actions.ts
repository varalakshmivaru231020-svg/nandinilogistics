"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { spanProblem } from "@/lib/calendar/agenda";

/**
 * The calendar's own writes.
 *
 * Only the calendar task belongs to this module — everything else the calendar
 * shows is read from the module that owns it and is changed there. So there are
 * four actions: raise one, change one, call it off, and answer one.
 */

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

/** The people on a calendar task, as the form sends them. */
function attendeeIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("attendeeIds").map(String).filter(Boolean))];
}

function readSpan(formData: FormData) {
  const allDay = String(formData.get("allDay") ?? "") === "on";
  const startRaw = String(formData.get("startAt") ?? "").trim();
  const endRaw = String(formData.get("endAt") ?? "").trim();
  if (!startRaw) throw new Error("Say when it starts.");
  if (!endRaw) throw new Error("Say when it ends.");

  // A whole-day entry runs from midnight to the last moment of its end day, so
  // it lands on every square between the two.
  const startAt = allDay ? new Date(`${startRaw.slice(0, 10)}T00:00:00`) : new Date(startRaw);
  const endAt = allDay ? new Date(`${endRaw.slice(0, 10)}T23:59:00`) : new Date(endRaw);

  const problem = spanProblem(startAt, endAt);
  if (problem) throw new Error(problem);
  return { startAt, endAt, allDay };
}

export async function createCalendarTaskAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.calendar.event.create);

    const title = String(formData.get("title") ?? "").trim();
    if (title.length < 2) throw new Error("Give the calendar task a title.");

    const { startAt, endAt, allDay } = readSpan(formData);
    const projectId = String(formData.get("projectId") ?? "").trim() || null;
    if (projectId) assertProjectAccess(ctx, projectId);

    const people = attendeeIds(formData);
    if (people.length > 0 && !ctx.has(PERM.calendar.event.assign)) {
      throw new Error("You may raise a calendar task but not put it on somebody else.");
    }

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          title,
          description: String(formData.get("description") ?? "").trim() || null,
          location: String(formData.get("location") ?? "").trim() || null,
          startAt, endAt, allDay, projectId,
          createdById: ctx.id,
          // Whoever raised it has already taken it on; everyone else is asked.
          attendees: {
            create: people.map((userId) => ({
              userId,
              ...(userId === ctx.id
                ? { response: "ACCEPTED" as const, respondedAt: new Date() }
                : {}),
            })),
          },
        },
        select: { id: true },
      });

      const invited = people.filter((id) => id !== ctx.id);
      if (invited.length > 0) {
        await tx.notification.createMany({
          data: invited.map((userId) => ({
            userId,
            kind: "CALENDAR_INVITED",
            title: `Calendar task: ${title}`,
            body: "Accept it to put it on your calendar.",
            href: `/calendar?event=${created.id}`,
            entity: "CalendarEvent",
            entityId: created.id,
          })),
        });
      }
      return created;
    });

    await recordAudit({
      action: "CREATE", entity: "CalendarEvent", entityId: event.id, userId: ctx.id,
      projectId: projectId ?? undefined,
      summary:
        `Raised calendar task "${title}"` +
        (people.length ? ` for ${people.length} ${people.length === 1 ? "person" : "people"}` : ""),
    });

    refresh();
    return { id: event.id };
  });
}

export async function updateCalendarTaskAction(
  id: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.calendar.event.update);

    const before = await prisma.calendarEvent.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true, projectId: true },
    });
    if (!before) throw new Error("That calendar task no longer exists.");
    // Admin may correct anyone's; everybody else only their own.
    if (before.createdById !== ctx.id && !ctx.has(PERM.calendar.agenda.viewAll)) {
      throw new Error("Only whoever raised a calendar task can change it.");
    }

    const title = String(formData.get("title") ?? "").trim();
    if (title.length < 2) throw new Error("Give the calendar task a title.");
    const { startAt, endAt, allDay } = readSpan(formData);

    await prisma.calendarEvent.update({
      where: { id },
      data: {
        title,
        description: String(formData.get("description") ?? "").trim() || null,
        location: String(formData.get("location") ?? "").trim() || null,
        startAt, endAt, allDay,
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "CalendarEvent", entityId: id, userId: ctx.id,
      projectId: before.projectId ?? undefined,
      summary: `Changed calendar task "${before.title}"`,
    });

    refresh();
    return null;
  });
}

export async function cancelCalendarTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.calendar.event.cancel);

    const event = await prisma.calendarEvent.findUnique({
      where: { id },
      select: {
        id: true, title: true, createdById: true, projectId: true, status: true,
        attendees: { select: { userId: true } },
      },
    });
    if (!event) throw new Error("That calendar task no longer exists.");
    if (event.status === "CANCELLED") throw new Error("It is already cancelled.");
    if (event.createdById !== ctx.id && !ctx.has(PERM.calendar.agenda.viewAll)) {
      throw new Error("Only whoever raised a calendar task can call it off.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({ where: { id }, data: { status: "CANCELLED" } });

      const tell = event.attendees.map((a) => a.userId).filter((u) => u !== ctx.id);
      if (tell.length > 0) {
        await tx.notification.createMany({
          data: tell.map((userId) => ({
            userId,
            kind: "CALENDAR_CANCELLED",
            title: `Cancelled: ${event.title}`,
            body: remark.trim() || null,
            href: "/calendar",
            entity: "CalendarEvent",
            entityId: id,
          })),
        });
      }
    });

    await recordAudit({
      action: "CANCEL", entity: "CalendarEvent", entityId: id, userId: ctx.id,
      projectId: event.projectId ?? undefined,
      summary: `Cancelled calendar task "${event.title}"` + (remark.trim() ? ` — ${remark.trim()}` : ""),
    });

    refresh();
    return null;
  });
}

/**
 * Marking a calendar task done.
 *
 * Whoever raised it can, and so can anybody who accepted it — they are the ones
 * who did the thing. Somebody who declined it cannot: it was not theirs.
 */
export async function completeCalendarTaskAction(
  id: string,
  remark: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.calendar.event.complete);

    const event = await prisma.calendarEvent.findUnique({
      where: { id },
      select: {
        id: true, title: true, status: true, createdById: true, projectId: true,
        attendees: { select: { userId: true, response: true } },
      },
    });
    if (!event) throw new Error("That calendar task no longer exists.");
    if (event.status === "CANCELLED") throw new Error("That calendar task was cancelled.");
    if (event.status === "COMPLETED") throw new Error("It is already marked done.");

    const accepted = event.attendees.some((a) => a.userId === ctx.id && a.response === "ACCEPTED");
    const admin = ctx.has(PERM.calendar.agenda.viewAll);
    if (event.createdById !== ctx.id && !accepted && !admin) {
      throw new Error("Only whoever raised this or took it on can mark it done.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date(), completedById: ctx.id },
      });

      const tell = [event.createdById, ...event.attendees.map((a) => a.userId)]
        .filter((u) => u !== ctx.id);
      if (tell.length > 0) {
        await tx.notification.createMany({
          data: [...new Set(tell)].map((userId) => ({
            userId,
            kind: "CALENDAR_COMPLETED",
            title: `Done: ${event.title}`,
            body: remark.trim() || `Marked done by ${ctx.name}.`,
            href: `/calendar?event=${id}`,
            entity: "CalendarEvent",
            entityId: id,
          })),
        });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "CalendarEvent", entityId: id, userId: ctx.id,
      projectId: event.projectId ?? undefined,
      summary: `Marked calendar task "${event.title}" done` + (remark.trim() ? ` — ${remark.trim()}` : ""),
    });

    refresh();
    return null;
  });
}

/**
 * Pushing a calendar task's finish out.
 *
 * The first extension keeps the original end, and every later one leaves it
 * where it is — so "this was meant to be done on the 12th" survives however
 * many times the date moves. A reason is required: an extension with no reason
 * is a date nobody can account for later.
 */
export async function extendCalendarTaskAction(
  id: string,
  newEndAt: string,
  reason: string,
): Promise<ActionResult<{ extendedCount: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.calendar.event.extend);

    const event = await prisma.calendarEvent.findUnique({
      where: { id },
      select: {
        id: true, title: true, status: true, startAt: true, endAt: true,
        originalEndAt: true, extendedCount: true, createdById: true, projectId: true,
        attendees: { select: { userId: true } },
      },
    });
    if (!event) throw new Error("That calendar task no longer exists.");
    if (event.status === "CANCELLED") throw new Error("That calendar task was cancelled.");
    if (event.status === "COMPLETED") throw new Error("It is already done — there is nothing to extend.");
    if (event.createdById !== ctx.id && !ctx.has(PERM.calendar.agenda.viewAll)) {
      throw new Error("Only whoever raised a calendar task can move its finish.");
    }
    if (!reason.trim()) throw new Error("Say why it needs longer.");

    const end = new Date(newEndAt);
    const problem = spanProblem(event.startAt, end);
    if (problem) throw new Error(problem);
    if (end.getTime() <= event.endAt.getTime()) {
      throw new Error("An extension has to move the finish later than it is now.");
    }

    const extendedCount = event.extendedCount + 1;
    await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id },
        data: {
          endAt: end,
          extendedCount,
          // Written once. A later extension leaves it where it is.
          ...(event.originalEndAt === null ? { originalEndAt: event.endAt } : {}),
        },
      });

      const tell = event.attendees.map((a) => a.userId).filter((u) => u !== ctx.id);
      if (tell.length > 0) {
        await tx.notification.createMany({
          data: tell.map((userId) => ({
            userId,
            kind: "CALENDAR_EXTENDED",
            title: `Moved: ${event.title}`,
            body: reason.trim(),
            href: `/calendar?event=${id}`,
            entity: "CalendarEvent",
            entityId: id,
          })),
        });
      }
    });

    const day = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
    await recordAudit({
      action: "UPDATE", entity: "CalendarEvent", entityId: id, userId: ctx.id,
      projectId: event.projectId ?? undefined,
      summary:
        `Extended calendar task "${event.title}" from ${day(event.endAt)} to ${day(end)}` +
        ` (extension ${extendedCount}) — ${reason.trim()}`,
    });

    refresh();
    return { extendedCount };
  });
}

/**
 * Accepting or declining a calendar task you were put on.
 *
 * This is the whole point of assigning being an invitation: until somebody
 * answers, the task is on nobody. A decline is not a failure — it is the
 * answer the organiser needed, and it says why.
 */
export async function respondToCalendarTaskAction(
  eventId: string,
  accept: boolean,
  remark: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.calendar.event.respond);

    const invite = await prisma.calendarAttendee.findUnique({
      where: { eventId_userId: { eventId, userId: ctx.id } },
      select: {
        id: true, response: true,
        event: { select: { id: true, title: true, createdById: true, status: true, projectId: true } },
      },
    });
    if (!invite) throw new Error("This calendar task is not on you.");
    if (invite.event.status === "CANCELLED") throw new Error("That calendar task was cancelled.");
    if (!accept && !remark.trim()) throw new Error("Say why you cannot take it on.");

    const response = accept ? ("ACCEPTED" as const) : ("DECLINED" as const);

    await prisma.$transaction(async (tx) => {
      await tx.calendarAttendee.update({
        where: { id: invite.id },
        data: { response, respondedAt: new Date(), remark: remark.trim() || null },
      });

      if (invite.event.createdById !== ctx.id) {
        await tx.notification.create({
          data: {
            userId: invite.event.createdById,
            kind: accept ? "CALENDAR_ACCEPTED" : "CALENDAR_DECLINED",
            title: `${ctx.name} ${accept ? "accepted" : "declined"}: ${invite.event.title}`,
            body: remark.trim() || null,
            href: `/calendar?event=${eventId}`,
            entity: "CalendarEvent",
            entityId: eventId,
          },
        });
      }
    });

    await recordAudit({
      action: accept ? "APPROVE" : "REJECT",
      entity: "CalendarEvent", entityId: eventId, userId: ctx.id,
      projectId: invite.event.projectId ?? undefined,
      summary:
        `${accept ? "Accepted" : "Declined"} calendar task "${invite.event.title}"` +
        (remark.trim() ? ` — ${remark.trim()}` : ""),
    });

    refresh();
    return null;
  });
}
