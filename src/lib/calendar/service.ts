import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter, type AuthContext } from "@/lib/rbac/context";

import type { AgendaItem } from "./agenda";

/**
 * Gathering the calendar from the modules that own its contents.
 *
 * Nothing here decides anything — the arithmetic is in `agenda.ts`. This reads
 * each source the viewer is allowed to see, inside their project scope, and
 * turns it into the one shape the calendar draws. A source the viewer has no
 * permission for is not queried at all, so the calendar costs only what the
 * person can actually see.
 */

export interface AgendaWindow {
  /** Inclusive start and exclusive end of the range being drawn. */
  from: Date;
  to: Date;
}

/** Everything on this viewer's calendar between two instants. */
export async function loadAgenda(ctx: AuthContext, window: AgendaWindow): Promise<AgendaItem[]> {
  const scope = projectScopeFilter(ctx);
  const inRange = { gte: window.from, lt: window.to };
  const mine = ctx.has(PERM.calendar.agenda.viewAll) ? null : ctx.id;

  const [events, tasks, leads, visits, activities, indents, orders] = await Promise.all([
    calendarEvents(ctx, inRange),
    ctx.has(PERM.task.task.view) ? taskRows(ctx, mine, inRange) : [],
    ctx.has(PERM.sales.followUp.view) ? followUpRows(ctx, mine, inRange) : [],
    ctx.has(PERM.sales.siteVisit.view) ? siteVisitRows(ctx, mine, inRange) : [],
    ctx.has(PERM.schedule.activity.view) ? activityRows(scope, window) : [],
    ctx.has(PERM.material.indent.view) ? indentRows(ctx, scope, inRange) : [],
    ctx.has(PERM.material.purchaseOrder.view) ? orderRows(ctx, scope, inRange) : [],
  ]);

  return [...events, ...tasks, ...leads, ...visits, ...activities, ...indents, ...orders];
}

/* ------------------------------ the calendar ------------------------------ */

async function calendarEvents(
  ctx: AuthContext,
  inRange: { gte: Date; lt: Date },
): Promise<AgendaItem[]> {
  if (!ctx.has(PERM.calendar.event.view)) return [];

  // Yours if you raised it or it was assigned to you — unless you may see
  // everyone's, in which case the whole window.
  const where = ctx.has(PERM.calendar.agenda.viewAll)
    ? { startAt: inRange, status: { not: "CANCELLED" as const } }
    : {
        startAt: inRange,
        status: { not: "CANCELLED" as const },
        OR: [
          { createdById: ctx.id },
          // Yours while you have not said no. Declining takes it off your
          // calendar — you said it is not yours, and leaving it there is noise.
          // Whoever raised it still sees it, and sees that you declined.
          { attendees: { some: { userId: ctx.id, response: { not: "DECLINED" as const } } } },
        ],
      };

  const rows = await prisma.calendarEvent.findMany({
    where,
    orderBy: { startAt: "asc" },
    select: {
      id: true, title: true, description: true, startAt: true, endAt: true,
      allDay: true, location: true, status: true,
      originalEndAt: true, extendedCount: true,
      completedAt: true, completedBy: { select: { name: true } },
      createdBy: { select: { id: true, name: true } },
      project: { select: { name: true } },
      attendees: { select: { userId: true, response: true, user: { select: { name: true } } } },
    },
  });

  return rows.map((e) => {
    const me = e.attendees.find((a) => a.userId === ctx.id);
    const done = e.status === "COMPLETED";
    // A finished task is not waiting on anybody, whatever the invitation says.
    const waiting = !done && me?.response === "PENDING";
    const accepted = e.attendees.filter((a) => a.response === "ACCEPTED").length;
    const subtitle = [
      done ? `Done${e.completedBy ? ` by ${e.completedBy.name}` : ""}` : null,
      e.extendedCount > 0
        ? `moved ${e.extendedCount} time${e.extendedCount === 1 ? "" : "s"}`
        : null,
      e.location,
      e.project?.name,
      e.attendees.length
        ? `${accepted} of ${e.attendees.length} accepted`
        : null,
      e.createdBy.id === ctx.id ? null : `by ${e.createdBy.name}`,
    ].filter(Boolean).join(" · ") || null;

    return {
      id: `event:${e.id}`,
      kind: waiting ? ("INVITE" as const) : ("EVENT" as const),
      title: e.title,
      subtitle,
      at: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      allDay: e.allDay,
      href: `/calendar?event=${e.id}`,
      tone: done ? ("good" as const) : waiting ? ("plum" as const) : ("brand" as const),
      needsResponse: waiting,
      done,
      movedFrom: e.originalEndAt ? e.originalEndAt.toISOString() : null,
      extendedCount: e.extendedCount,
    };
  });
}

/* --------------------------------- tasks ---------------------------------- */

async function taskRows(
  ctx: AuthContext,
  mine: string | null,
  inRange: { gte: Date; lt: Date },
): Promise<AgendaItem[]> {
  const seesAll = ctx.has(PERM.task.task.viewAll) && mine === null;
  const rows = await prisma.task.findMany({
    where: {
      dueAt: inRange,
      status: { notIn: ["CLOSED", "COMPLETED"] },
      ...(seesAll ? {} : { OR: [{ assigneeId: ctx.id }, { createdById: ctx.id }] }),
    },
    orderBy: { dueAt: "asc" },
    select: {
      id: true, taskNo: true, title: true, dueAt: true, status: true, priority: true,
      assignee: { select: { name: true } },
    },
  });

  return rows.map((t) => ({
    id: `task:${t.id}`,
    kind: "TASK" as const,
    title: t.title,
    subtitle: `${t.taskNo} · ${t.assignee.name}`,
    at: t.dueAt.toISOString(),
    endAt: null,
    allDay: false,
    href: `/tasks/${t.id}`,
    tone: t.priority === "HIGH" ? ("bad" as const) : ("warn" as const),
  }));
}

/* ------------------------------- follow-ups ------------------------------- */

async function followUpRows(
  ctx: AuthContext,
  mine: string | null,
  inRange: { gte: Date; lt: Date },
): Promise<AgendaItem[]> {
  const seesAll = ctx.has(PERM.sales.lead.viewAll) && mine === null;
  const rows = await prisma.lead.findMany({
    where: {
      nextActionAt: inRange,
      state: { notIn: ["BOOKED", "LOST"] },
      ...(seesAll ? {} : { ownerId: ctx.id }),
    },
    orderBy: { nextActionAt: "asc" },
    select: {
      id: true, name: true, phone: true, nextActionAt: true,
      owner: { select: { name: true } },
    },
  });

  return rows.flatMap((l) =>
    l.nextActionAt
      ? [{
          id: `lead:${l.id}`,
          kind: "FOLLOW_UP" as const,
          title: `Follow up ${l.name}`,
          subtitle: [l.phone, l.owner?.name].filter(Boolean).join(" · ") || null,
          at: l.nextActionAt.toISOString(),
          endAt: null,
          allDay: false,
          href: `/sales/leads/${l.id}`,
          tone: "good" as const,
        }]
      : [],
  );
}

/* ------------------------------- site visits ------------------------------ */

async function siteVisitRows(
  ctx: AuthContext,
  mine: string | null,
  inRange: { gte: Date; lt: Date },
): Promise<AgendaItem[]> {
  const seesAll = ctx.has(PERM.sales.lead.viewAll) && mine === null;
  const rows = await prisma.siteVisit.findMany({
    where: {
      scheduledAt: inRange,
      visitedAt: null,
      ...(seesAll ? {} : { lead: { ownerId: ctx.id } }),
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true, scheduledAt: true,
      lead: { select: { id: true, name: true, phone: true } },
    },
  });

  return rows.map((v) => ({
    id: `visit:${v.id}`,
    kind: "SITE_VISIT" as const,
    title: `Site visit — ${v.lead.name}`,
    subtitle: v.lead.phone,
    at: v.scheduledAt.toISOString(),
    endAt: null,
    allDay: false,
    href: `/sales/leads/${v.lead.id}`,
    tone: "brand" as const,
  }));
}

/* ---------------------------- schedule activities -------------------------- */

async function activityRows(
  scope: Record<string, unknown>,
  window: AgendaWindow,
): Promise<AgendaItem[]> {
  // An activity belongs on every day it runs, so it counts when its span
  // overlaps the window rather than when it starts inside it.
  const rows = await prisma.scheduleActivity.findMany({
    where: {
      ...scope,
      status: { not: "COMPLETED" },
      plannedStart: { lt: window.to },
      plannedEnd: { gte: window.from },
    },
    orderBy: { plannedStart: "asc" },
    take: 200,
    select: {
      id: true, code: true, name: true, plannedStart: true, plannedEnd: true,
      project: { select: { name: true } },
    },
  });

  return rows.flatMap((a) =>
    a.plannedStart && a.plannedEnd
      ? [{
          id: `activity:${a.id}`,
          kind: "ACTIVITY" as const,
          title: a.name,
          subtitle: `${a.code} · ${a.project.name}`,
          at: a.plannedStart.toISOString(),
          endAt: a.plannedEnd.toISOString(),
          allDay: true,
          href: "/schedule",
          tone: "slate" as const,
        }]
      : [],
  );
}

/* ------------------------------- approvals -------------------------------- */

/**
 * The two approvals that carry a date of their own.
 *
 * An indent is needed by a day and a purchase order is expected on one, so both
 * belong on the calendar at that date. The rest of the approvals queue has no
 * date to sit on — it is simply waiting — and lives on the Approvals screen,
 * which the calendar links to rather than duplicating.
 */
async function indentRows(
  ctx: AuthContext,
  scope: Record<string, unknown>,
  inRange: { gte: Date; lt: Date },
): Promise<AgendaItem[]> {
  const rows = await prisma.indent.findMany({
    where: { ...scope, requiredByDate: inRange, status: { in: ["SUBMITTED", "PM_APPROVED"] } },
    orderBy: { requiredByDate: "asc" },
    select: {
      id: true, indentNo: true, purpose: true, requiredByDate: true, status: true,
      project: { select: { name: true } },
    },
  });

  return rows.map((i) => ({
    id: `indent:${i.id}`,
    kind: "APPROVAL" as const,
    title: `${i.indentNo} needed`,
    subtitle: [
      i.purpose,
      i.project.name,
      i.status === "SUBMITTED" ? "awaiting PM" : "awaiting Admin",
    ].filter(Boolean).join(" · "),
    at: i.requiredByDate.toISOString(),
    endAt: null,
    allDay: true,
    href: `/material/indents/${i.id}`,
    tone: "warn" as const,
  }));
}

async function orderRows(
  ctx: AuthContext,
  scope: Record<string, unknown>,
  inRange: { gte: Date; lt: Date },
): Promise<AgendaItem[]> {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      ...scope,
      expectedDate: inRange,
      status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] },
    },
    orderBy: { expectedDate: "asc" },
    select: {
      id: true, poNo: true, expectedDate: true,
      vendor: { select: { name: true } },
    },
  });

  return rows.flatMap((p) =>
    p.expectedDate
      ? [{
          id: `po:${p.id}`,
          kind: "APPROVAL" as const,
          title: `${p.poNo} delivery due`,
          subtitle: p.vendor.name,
          at: p.expectedDate.toISOString(),
          endAt: null,
          allDay: true,
          href: `/material/purchase-orders/${p.id}`,
          tone: "warn" as const,
        }]
      : [],
  );
}
