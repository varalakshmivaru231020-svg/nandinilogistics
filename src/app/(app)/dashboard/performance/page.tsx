import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import { scoreTasks } from "@/lib/tasks/performance";
import { PerformanceDashboard, type ModuleCard } from "./performance-dashboard";

export const metadata = { title: "Performance" };

/**
 * Every module's health on one screen.
 *
 * Each card is built only when the viewer may see that module, so the screen
 * shrinks to what a person is actually allowed to know rather than showing
 * them a row of blanks. The figures are the ones each module already decides
 * its own screens by — the same overdue rule, the same scoring — so the
 * dashboard cannot disagree with the module it summarises.
 */
export default async function PerformancePage() {
  const ctx = await requirePermission(PERM.dashboard.performance.view);
  const scope = projectScopeFilter(ctx);
  const now = new Date();
  const nowMs = now.getTime();
  const weekAgo = new Date(nowMs - 7 * 86_400_000);

  const cards: ModuleCard[] = [];

  /* ----------------------------- Task Management ---------------------------- */
  let people: Array<{
    id: string; name: string; total: number; onTime: number; late: number;
    stillOverdue: number; averageDelayDays: number;
    controllableExtensions: number; uncontrollableExtensions: number; score: number | null;
  }> = [];

  if (ctx.has(PERM.task.task.view)) {
    const seesAll = ctx.has(PERM.task.task.viewAll);
    const where = seesAll ? {} : { OR: [{ assigneeId: ctx.id }, { createdById: ctx.id }] };

    const tasks = await prisma.task.findMany({
      where,
      select: {
        status: true, completedAt: true, effectiveDueAt: true, dueAt: true, kind: true,
        assignee: { select: { id: true, name: true } },
        extensions: {
          where: { status: "APPROVED" },
          select: { control: true, previousDueAt: true, revisedDueAt: true },
        },
      },
    });

    const open = tasks.filter((t) => !["COMPLETED", "CLOSED", "APPROVED"].includes(t.status));
    const overdue = open.filter((t) => t.dueAt.getTime() < nowMs);
    const org = scoreTasks(tasks, nowMs);

    cards.push({
      key: "tasks",
      title: "Task Management",
      href: "/tasks",
      headline: org.score === null ? "—" : `${org.score}%`,
      headlineLabel: "on time",
      tone: org.score === null ? "plain" : org.score >= 85 ? "good" : org.score >= 70 ? "warn" : "bad",
      rows: [
        { label: "Open", value: String(open.length) },
        { label: "Overdue", value: String(overdue.length), tone: overdue.length ? "bad" : undefined },
        { label: "On time", value: String(org.onTime) },
        { label: "Late", value: String(org.late), tone: org.late ? "warn" : undefined },
        { label: "Avg delay", value: org.late ? `${org.averageDelayDays} d` : "—" },
      ],
    });

    // Per person, for the matrix.
    const byPerson = new Map<string, { name: string; rows: typeof tasks }>();
    for (const t of tasks) {
      const e = byPerson.get(t.assignee.id) ?? { name: t.assignee.name, rows: [] as typeof tasks };
      e.rows.push(t);
      byPerson.set(t.assignee.id, e);
    }
    people = [...byPerson.entries()]
      .map(([id, e]) => ({ id, name: e.name, ...scoreTasks(e.rows, nowMs) }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    /* ------------------------------- Checklists ----------------------------- */
    const checklistTasks = tasks.filter((t) => t.kind === "CHECKLIST");
    const inReview = checklistTasks.filter((t) => ["UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status));
    const rework = checklistTasks.filter((t) => t.status === "REWORK");
    const closed = checklistTasks.filter((t) => t.status === "CLOSED");
    const firstPass = closed.length
      ? Math.round(((closed.length - rework.length) / closed.length) * 100)
      : null;

    cards.push({
      key: "checklists",
      title: "Checklists",
      href: "/checklists",
      headline: String(checklistTasks.length),
      headlineLabel: "checklist tasks",
      tone: rework.length ? "warn" : "plain",
      rows: [
        { label: "Being checked", value: String(inReview.length) },
        { label: "Sent back", value: String(rework.length), tone: rework.length ? "warn" : undefined },
        { label: "Closed", value: String(closed.length) },
        { label: "Passed first time", value: firstPass === null ? "—" : `${firstPass}%` },
      ],
    });
  }

  /* -------------------------------- Approvals ------------------------------- */
  if (ctx.has(PERM.approvals.queue.view)) {
    const [indents, pos, taskClosures, taskExtensions, atLevels] = await Promise.all([
      prisma.indent.count({ where: { ...scope, status: { in: ["SUBMITTED", "PM_APPROVED"] } } }),
      prisma.purchaseOrder.count({
        where: { ...scope, status: { in: ["DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL"] } },
      }),
      prisma.task.count({ where: { status: "COMPLETED", kind: "STANDALONE" } }),
      prisma.taskExtension.count({ where: { status: "REQUESTED" } }),
      prisma.task.count({ where: { status: { in: ["UNDER_REVIEW", "UNDER_APPROVAL"] } } }),
    ]);
    const waiting = indents + pos + taskClosures + taskExtensions + atLevels;

    const oldest = await prisma.indent.findFirst({
      where: { ...scope, status: { in: ["SUBMITTED", "PM_APPROVED"] } },
      orderBy: { raisedAt: "asc" },
      select: { raisedAt: true },
    });
    const waitingDays = oldest
      ? Math.floor((nowMs - oldest.raisedAt.getTime()) / 86_400_000)
      : null;

    cards.push({
      key: "approvals",
      title: "Approvals",
      href: "/approvals",
      headline: String(waiting),
      headlineLabel: "waiting on a decision",
      tone: waiting > 10 ? "bad" : waiting > 0 ? "warn" : "good",
      rows: [
        { label: "Indents", value: String(indents) },
        { label: "Purchase orders", value: String(pos) },
        { label: "Task closures", value: String(taskClosures) },
        { label: "Task extensions", value: String(taskExtensions) },
        { label: "Checklist levels", value: String(atLevels) },
        ...(waitingDays !== null
          ? [{ label: "Longest wait", value: `${waitingDays} d`, tone: waitingDays > 7 ? ("bad" as const) : undefined }]
          : []),
      ],
    });
  }

  /* -------------------------------- Schedule -------------------------------- */
  if (ctx.has(PERM.schedule.activity.view)) {
    const activities = await prisma.scheduleActivity.findMany({
      select: { status: true, plannedEnd: true, actualEnd: true },
    });
    const done = activities.filter((a) => a.status === "COMPLETED");
    const onTime = done.filter((a) => a.actualEnd && a.plannedEnd && a.actualEnd <= a.plannedEnd);
    const running = activities.filter((a) => a.status !== "COMPLETED");
    const late = running.filter((a) => a.plannedEnd && a.plannedEnd.getTime() < nowMs);
    const pct = done.length ? Math.round((onTime.length / done.length) * 100) : null;

    cards.push({
      key: "schedule",
      title: "Project Schedule",
      href: "/schedule",
      headline: pct === null ? "—" : `${pct}%`,
      headlineLabel: "finished on time",
      tone: pct === null ? "plain" : pct >= 85 ? "good" : pct >= 70 ? "warn" : "bad",
      rows: [
        { label: "Activities", value: String(activities.length) },
        { label: "Running", value: String(running.length) },
        { label: "Behind", value: String(late.length), tone: late.length ? "bad" : undefined },
        { label: "Completed", value: String(done.length) },
      ],
    });
  }

  /* ------------------------------- Procurement ------------------------------ */
  if (ctx.has(PERM.material.grn.view)) {
    const [grns, mismatched, openPos, reorder] = await Promise.all([
      prisma.grn.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.vendorInvoice.count({ where: { status: "MISMATCH" } }),
      prisma.purchaseOrder.count({ where: { ...scope, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } } }),
      ctx.has(PERM.material.reorder.view)
        ? prisma.stockBalance.count({ where: { quantity: { lte: 0 } } })
        : Promise.resolve(0),
    ]);

    cards.push({
      key: "material",
      title: "Material & Inventory",
      href: "/material/grn",
      headline: String(openPos),
      headlineLabel: "orders still arriving",
      tone: mismatched ? "bad" : "plain",
      rows: [
        { label: "Receipts this week", value: String(grns) },
        { label: "Invoice mismatches", value: String(mismatched), tone: mismatched ? "bad" : undefined },
        { label: "Out of stock", value: String(reorder), tone: reorder ? "warn" : undefined },
      ],
    });
  }

  /* ---------------------------------- Sales --------------------------------- */
  if (ctx.has(PERM.sales.lead.view)) {
    const [leads, booked, lost, overdueFollowUps] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { state: "BOOKED" } }),
      prisma.lead.count({ where: { state: "LOST" } }),
      ctx.has(PERM.sales.followUp.view)
        ? prisma.lead.count({ where: { nextActionAt: { lt: now }, state: { notIn: ["BOOKED", "LOST"] } } })
        : Promise.resolve(0),
    ]);
    const decided = booked + lost;
    const conversion = decided ? Math.round((booked / decided) * 100) : null;

    cards.push({
      key: "sales",
      title: "Leads & Sales",
      href: "/sales/leads",
      headline: conversion === null ? "—" : `${conversion}%`,
      headlineLabel: "of decided leads booked",
      tone: conversion === null ? "plain" : conversion >= 30 ? "good" : conversion >= 15 ? "warn" : "bad",
      rows: [
        { label: "Leads", value: String(leads) },
        { label: "Booked", value: String(booked) },
        { label: "Lost", value: String(lost) },
        { label: "Follow-ups overdue", value: String(overdueFollowUps), tone: overdueFollowUps ? "bad" : undefined },
      ],
    });
  }

  /* ---------------------------------- Flats --------------------------------- */
  if (ctx.has(PERM.unit.unit.view)) {
    const units = await prisma.unit.groupBy({ by: ["status"], _count: true });
    const count = (s: string) => units.find((u) => u.status === s)?._count ?? 0;
    const total = units.reduce((n, u) => n + u._count, 0);
    const sold = count("BOOKED") + count("AGREEMENT") + count("REGISTERED");
    const pct = total ? Math.round((sold / total) * 100) : null;

    cards.push({
      key: "units",
      title: "Available Flats",
      href: "/units/board",
      headline: pct === null ? "—" : `${pct}%`,
      headlineLabel: "sold",
      tone: "plain",
      rows: [
        { label: "Available", value: String(count("AVAILABLE")) },
        { label: "Held", value: String(count("HELD")) },
        { label: "Booked", value: String(sold) },
        { label: "Total", value: String(total) },
      ],
    });
  }

  /* -------------------------------- Workforce ------------------------------- */
  if (ctx.has(PERM.hr.employee.view)) {
    const [employees, presentToday] = await Promise.all([
      prisma.employee.count({ where: { status: "ACTIVE" } }),
      prisma.attendanceEntry.count({
        where: {
          attendanceOn: new Date(now.toISOString().slice(0, 10)),
          status: { in: ["PRESENT", "HALF_DAY"] },
        },
      }),
    ]);
    const pct = employees ? Math.round((presentToday / employees) * 100) : null;

    cards.push({
      key: "hr",
      title: "Workforce",
      href: "/hr",
      headline: pct === null ? "—" : `${pct}%`,
      headlineLabel: "marked present today",
      tone: pct === null ? "plain" : pct >= 85 ? "good" : "warn",
      rows: [
        { label: "Active employees", value: String(employees) },
        { label: "Present today", value: String(presentToday) },
      ],
    });
  }

  return (
    <PerformanceDashboard
      cards={cards}
      people={ctx.has(PERM.task.performance.viewAll) ? people : people.filter((p) => p.id === ctx.id)}
      seesEveryone={ctx.has(PERM.task.performance.viewAll)}
    />
  );
}
