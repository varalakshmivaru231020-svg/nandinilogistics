import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import { scoreTasks } from "@/lib/tasks/performance";
import {
  articleFigures, customerFigures, employeeFigures, followUpFigures, grnFigures,
  indentFigures, itemFigures, leadFigures, projectFigures, purchaseOrderFigures,
  unitFigures, vendorFigures, type StatFigure,
} from "@/lib/metrics/figures";
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
  // Two shapes of the same scope. Most rows carry a projectId of their own;
  // a Project is scoped by its own id. Passing the wrong one is not a type
  // error — a Prisma where clause is a plain object — so it only shows up as a
  // 500 for anyone whose scope is not empty, which is everyone but the Owner.
  const scope = projectScopeFilter(ctx);
  const projectScope = projectScopeFilter(ctx, "id");
  const now = new Date();
  const nowMs = now.getTime();

  const cards: ModuleCard[] = [];

  /**
   * A card built from the figures a module's own screen opens with.
   *
   * The dashboard and the module band then cannot disagree, because there is
   * one piece of arithmetic and both read it. The first figure leads the card;
   * the rest sit under it.
   */
  function cardFrom(
    key: string,
    title: string,
    href: string,
    figures: StatFigure[],
    lead = 0,
  ) {
    const head = figures[lead];
    if (!head) return;
    const rest = figures.filter((_, i) => i !== lead);
    cards.push({
      key,
      title,
      href,
      headline: head.value,
      headlineLabel: head.label.toLowerCase(),
      tone: head.tone === "brand" ? "plain" : head.tone ?? "plain",
      rows: rest.map((f) => ({
        label: f.label,
        value: f.value,
        tone: f.tone === "brand" ? undefined : f.tone,
      })),
    });
  }

  /* -------------------------------- Projects -------------------------------- */
  if (ctx.has(PERM.project.project.view)) {
    const rows = await prisma.project.findMany({
      where: projectScope,
      select: {
        status: true, targetDate: true, actualEndDate: true,
        activities: { select: { status: true } },
        _count: { select: { units: true } },
      },
    });
    const figures = projectFigures(
      rows.map((r) => ({
        status: r.status, targetDate: r.targetDate, actualEndDate: r.actualEndDate,
        units: r._count.units, activities: r.activities,
      })),
      nowMs,
    );
    // Lead on schedule progress — the one figure that says whether the
    // portfolio is moving, rather than how many projects there are.
    cardFrom("projects", "Project Management", "/projects", figures, 4);
  }

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
    /*
     * Measured per point, not per task.
     *
     * A checklist task no longer goes to Rework — a denied point starts its own
     * next round and goes back to reviewer 1 while the rest carry on — so the
     * old reading of this card, which counted tasks at status REWORK, could
     * only ever report nothing. What is worth knowing is how many points had to
     * be judged more than once, which is the same question the old figure was
     * reaching for.
     */
    const checklistTasks = tasks.filter((t) => t.kind === "CHECKLIST");
    const inReview = checklistTasks.filter((t) => ["UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status));
    const closed = checklistTasks.filter((t) => t.status === "CLOSED");

    const points = await prisma.taskChecklistItem.findMany({
      where: { taskChecklist: { task: seesAll ? {} : { OR: [{ assigneeId: ctx.id }, { createdById: ctx.id }] } } },
      select: { round: true, reviews: { select: { id: true }, take: 1 } },
    });
    const judged = points.filter((p) => p.reviews.length > 0);
    const sentBack = points.filter((p) => p.round > 1);
    const firstPass = judged.length
      ? Math.round(((judged.length - sentBack.length) / judged.length) * 100)
      : null;

    cards.push({
      key: "checklists",
      title: "Checklists",
      href: "/checklists",
      headline: String(checklistTasks.length),
      headlineLabel: "checklist tasks",
      tone: sentBack.length ? "warn" : "plain",
      rows: [
        { label: "Being checked", value: String(inReview.length) },
        { label: "Points sent back", value: String(sentBack.length), tone: sentBack.length ? "warn" : undefined },
        { label: "Closed", value: String(closed.length) },
        {
          label: "Points passed first time",
          value: firstPass === null ? "—" : `${firstPass}%`,
          tone: firstPass !== null && firstPass < 70 ? "warn" : undefined,
        },
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
  if (ctx.has(PERM.material.indent.view)) {
    const rows = await prisma.indent.findMany({
      where: scope,
      select: {
        status: true, estimatedValue: true, raisedAt: true,
        approvals: { select: { approvedAt: true }, orderBy: { approvedAt: "asc" }, take: 1 },
      },
    });
    cardFrom("indents", "Requirement Indents", "/material/indents", indentFigures(rows), 1);
  }

  if (ctx.has(PERM.material.purchaseOrder.view)) {
    const rows = await prisma.purchaseOrder.findMany({
      where: scope,
      select: { status: true, totalAmount: true, expectedDate: true },
    });
    // Lead on deliveries that have slipped — the figure somebody has to chase.
    cardFrom("purchase-orders", "Purchase Orders", "/material/purchase-orders",
      purchaseOrderFigures(rows, nowMs), 3);
  }

  if (ctx.has(PERM.material.grn.view)) {
    const [rows, mismatched] = await Promise.all([
      prisma.grn.findMany({
        select: {
          status: true, grnDate: true,
          items: { select: { acceptedQty: true, rejectedQty: true } },
        },
      }),
      prisma.vendorInvoice.count({ where: { status: "MISMATCH" } }),
    ]);
    const figures = grnFigures(
      rows.map((g) => ({ status: g.status, receivedAt: g.grnDate, items: g.items })),
      nowMs,
    );
    // The three-way match belongs here and nowhere else: it is the receipt that
    // did not agree with what was ordered or what was billed.
    figures.push({
      value: String(mismatched),
      label: "Invoice mismatches",
      tone: mismatched ? "bad" : undefined,
    });
    cardFrom("grn", "Goods Receipt", "/material/grn", figures, 3);
  }

  if (ctx.has(PERM.material.stock.view)) {
    const rows = await prisma.item.findMany({
      where: { status: "ACTIVE" },
      select: { reorderLevel: true, stockBalances: { select: { quantity: true, avgRate: true } } },
    });
    const figures = itemFigures(
      rows.map((i) => ({
        reorderLevel: i.reorderLevel,
        balances: i.stockBalances.map((b) => ({ quantity: b.quantity, valuationRate: b.avgRate })),
      })),
    );
    cardFrom("stock", "Item Master & Stock", "/material/stock", figures, 1);
  }

  if (ctx.has(PERM.masters.vendor.view)) {
    const rows = await prisma.vendor.findMany({
      select: { status: true, rating: true, purchaseOrders: { select: { totalAmount: true } } },
    });
    cardFrom("vendors", "Vendors", "/material/vendors", vendorFigures(rows), 3);
  }

  /* ---------------------------------- Sales --------------------------------- */
  if (ctx.has(PERM.sales.lead.view)) {
    const seesAllLeads = ctx.has(PERM.sales.lead.viewAll);
    const ownership = seesAllLeads ? {} : { ownerId: ctx.id };
    const rows = await prisma.lead.findMany({
      where: ownership,
      select: { state: true, createdAt: true, budgetMax: true },
    });
    const figures = leadFigures(
      rows.map((l) => ({ stage: l.state, createdAt: l.createdAt, budgetMax: l.budgetMax })),
      nowMs,
    );
    // Lead on conversion: the one figure that says whether selling is working.
    cardFrom("sales", "Leads & Sales", "/sales/leads", figures, 4);

    if (ctx.has(PERM.sales.followUp.view)) {
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);
      const [open, logged] = await Promise.all([
        prisma.lead.findMany({
          where: { ...ownership, nextActionAt: { not: null }, state: { notIn: ["BOOKED", "LOST"] } },
          select: { nextActionAt: true },
        }),
        prisma.leadFollowUp.count({ where: { lead: ownership } }),
      ]);
      cardFrom(
        "follow-ups", "Follow-ups", "/sales/follow-ups",
        followUpFigures(
          open.flatMap((l) => (l.nextActionAt ? [{ dueAt: l.nextActionAt }] : [])),
          logged, nowMs, endOfToday.getTime(),
        ),
        1,
      );
    }
  }

  if (ctx.has(PERM.sales.customer.view)) {
    const rows = await prisma.customer.findMany({
      select: { bookings: { select: { totalAmount: true, receivedAmount: true } } },
    });
    // Lead on what is still owed — the figure collections is judged on.
    cardFrom("customers", "Customers", "/sales/customers", customerFigures(rows), 4);
  }

  /* ---------------------------------- Flats --------------------------------- */
  if (ctx.has(PERM.unit.unit.view)) {
    const rows = await prisma.unit.findMany({
      // A unit carries its own projectId, so it is scoped directly.
      where: scope,
      select: { status: true, superBuiltUpArea: true },
    });
    cardFrom("units", "Available Flats", "/units/board", unitFigures(rows), 4);
  }

  /* -------------------------------- Workforce ------------------------------- */
  if (ctx.has(PERM.hr.employee.view)) {
    const today = new Date(now.toISOString().slice(0, 10));
    const rows = await prisma.employee.findMany({
      select: {
        status: true,
        attendance: { where: { attendanceOn: today }, select: { status: true, overtimeHours: true } },
      },
    });
    // Lead on who has not been accounted for today.
    cardFrom("hr", "Users & Attendance", "/hr", employeeFigures(rows), 4);
  }

  /* ----------------------------- Knowledge base ----------------------------- */
  if (ctx.has(PERM.kb.article.view)) {
    const rows = await prisma.kbArticle.findMany({
      select: { isPublished: true, attachments: { select: { id: true } } },
    });
    cardFrom("kb", "Knowledge Base", "/kb", articleFigures(rows), 1);
  }

  return (
    <PerformanceDashboard
      cards={cards}
      people={ctx.has(PERM.task.performance.viewAll) ? people : people.filter((p) => p.id === ctx.id)}
      seesEveryone={ctx.has(PERM.task.performance.viewAll)}
    />
  );
}
