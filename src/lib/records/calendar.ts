import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { toneOf, type RecordAction, type RecordView, type Tone } from "./shared";

/**
 * One calendar task, with the people it is on.
 *
 * The calendar's rows are links — `/calendar?event=<id>` — and tapping one on
 * the phone did nothing at all, so a calendar task could be raised on the web
 * and then neither accepted, finished, moved nor called off from a site. This
 * is that screen.
 *
 * The invitation is the thing worth drawing: until somebody accepts, the task
 * is on nobody, and who has answered is the question the organiser actually
 * has. So every attendee is listed with their answer, in the words the web
 * uses.
 *
 * The buttons follow the **action's** own rules rather than the web's button
 * row, which is drawn on the permission alone: only whoever raised a calendar
 * task can move or cancel it, and `extendCalendarTaskAction` says so. Offering
 * a button that is certain to be refused is worse than not drawing it.
 */

const RESPONSE_LABEL: Record<string, string> = {
  PENDING: "Waiting on them",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

const RESPONSE_TONE: Record<string, Tone> = {
  PENDING: "plum",
  ACCEPTED: "good",
  DECLINED: "bad",
};

export async function calendarRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, startAt: true, endAt: true,
      allDay: true, location: true, status: true,
      originalEndAt: true, extendedCount: true,
      completedAt: true,
      completedBy: { select: { name: true } },
      createdBy: { select: { id: true, name: true } },
      project: { select: { code: true, name: true } },
      attendees: {
        orderBy: { user: { name: "asc" } },
        select: {
          userId: true, response: true, respondedAt: true, remark: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!event) return null;

  const mine = event.attendees.find((a) => a.userId === ctx.id);
  const raisedIt = event.createdBy.id === ctx.id;
  const admin = ctx.has(PERM.calendar.agenda.viewAll);

  /*
   * The same rule the agenda reads with: yours if you raised it or it is on
   * you and you have not declined it. Declining takes it off your calendar, so
   * it is 404 afterwards — not 403, which would confirm it exists.
   */
  if (!admin && !raisedIt && (!mine || mine.response === "DECLINED")) return null;

  const done = event.status === "COMPLETED";
  const cancelled = event.status === "CANCELLED";
  const waiting = !done && !cancelled && mine?.response === "PENDING";
  const accepted = event.attendees.filter((a) => a.response === "ACCEPTED").length;

  const pills: RecordView["pills"] = [{ label: "Calendar task", tone: "plum" }];
  if (cancelled) pills.push({ label: "Cancelled", tone: "bad" });
  else if (done) pills.push({ label: "Done", tone: "good" });
  else if (waiting) pills.push({ label: "Waiting on you", tone: "plum" });
  else pills.push({ label: "Scheduled", tone: toneOf("SCHEDULED") });
  if (event.extendedCount > 0) {
    pills.push({
      label: `Moved ${event.extendedCount} time${event.extendedCount === 1 ? "" : "s"}`,
      tone: "warn",
    });
  }

  const actions: RecordAction[] = [];

  // Accepting or declining comes first: it is what the task is waiting for.
  if (waiting && ctx.has(PERM.calendar.event.respond)) {
    actions.push({
      key: "accept", label: "Accept", emphasis: "approve",
      action: "calendar/respondToCalendarTask", args: [id, true], remark: "optional",
      remarkLabel: "Remark",
      confirm: "It lands on your calendar and whoever raised it is told.",
    });
    actions.push({
      key: "decline", label: "Decline", emphasis: "reject",
      action: "calendar/respondToCalendarTask", args: [id, false], remark: "required",
      remarkLabel: "Why",
      confirm: "Whoever raised it sees your reason, so they can put it on somebody else.",
    });
  }

  const onIt = raisedIt || mine?.response === "ACCEPTED" || admin;
  if (!done && !cancelled && onIt && ctx.has(PERM.calendar.event.complete)) {
    actions.push({
      key: "complete", label: "Mark as completed", emphasis: "approve",
      action: "calendar/completeCalendarTask", args: [id], remark: "optional",
      remarkLabel: "Remark",
      confirm: "Everyone on it is told either way.",
    });
  }

  if (!done && !cancelled && (raisedIt || admin) && ctx.has(PERM.calendar.event.extend)) {
    actions.push({
      key: "extend", label: "Extend", emphasis: "outline",
      action: "calendar/extendCalendarTask", args: [id, "$newEndAt"], remark: "required",
      remarkLabel: "Why",
      fields: [
        {
          name: "newEndAt",
          label: "New finish",
          kind: event.allDay ? "date" : "datetime",
          required: true,
          hint: "It has to be later than it ends now.",
          initial: event.endAt.toISOString(),
        },
      ],
      confirm: "The first move keeps the original finish, so the slip stays answerable.",
    });
  }

  if (!cancelled && (raisedIt || admin) && ctx.has(PERM.calendar.event.cancel)) {
    actions.push({
      key: "cancel", label: "Cancel", emphasis: "reject",
      action: "calendar/cancelCalendarTask", args: [id], remark: "required",
      remarkLabel: "Why",
      confirm: "It comes off everybody's calendar. They are told, with your reason.",
    });
  }

  const when = {
    label: "When",
    fields: [
      {
        label: event.allDay ? "First day" : "Starts",
        value: event.startAt.toISOString(),
        format: (event.allDay ? "date" : "datetime") as "date" | "datetime",
      },
      {
        label: event.allDay ? "Last day" : "Ends",
        value: event.endAt.toISOString(),
        format: (event.allDay ? "date" : "datetime") as "date" | "datetime",
      },
      { label: "Runs all day", value: event.allDay, format: "bool" as const },
      {
        label: "Was due to end",
        value: event.originalEndAt ? event.originalEndAt.toISOString() : null,
        format: (event.allDay ? "date" : "datetime") as "date" | "datetime",
      },
    ],
  };

  const about = {
    label: "The task",
    fields: [
      { label: "Where", value: event.location },
      {
        label: "Project",
        value: event.project ? `${event.project.code} — ${event.project.name}` : null,
      },
      { label: "Raised by", value: event.createdBy.name },
      {
        label: "Finished by",
        value: event.completedBy?.name ?? null,
      },
      {
        label: "Finished at",
        value: event.completedAt ? event.completedAt.toISOString() : null,
        format: "datetime" as const,
      },
      { label: "Details", value: event.description, wide: true },
    ],
  };

  return {
    key: "calendar",
    id: event.id,
    title: event.title,
    subtitle: [
      event.attendees.length ? `${accepted} of ${event.attendees.length} accepted` : "On you alone",
      raisedIt ? null : `by ${event.createdBy.name}`,
    ].filter(Boolean).join(" · ") || null,
    pills,
    sections: [when, about],
    collections: [
      {
        key: `attendees:${event.id}`,
        label: event.attendees.length
          ? `On it · ${event.attendees.length} ${event.attendees.length === 1 ? "person" : "people"}`
          : "On it",
        rows: event.attendees.map((a) => ({
          id: a.userId,
          title: a.user.name + (a.userId === ctx.id ? " (you)" : ""),
          subtitle: a.remark,
          pills: [
            { label: RESPONSE_LABEL[a.response] ?? a.response, tone: RESPONSE_TONE[a.response] ?? "draft" },
          ],
        })),
        emptyMessage: "Nobody else is on this one.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
