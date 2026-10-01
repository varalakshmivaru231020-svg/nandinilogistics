import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { scoreTasks } from "@/lib/tasks/performance";
import { TaskReports } from "./task-reports";

export const metadata = { title: "Task reports" };

/**
 * The scope's §4.2 and §4.3 in one screen: the four reports and the score.
 *
 * Without `task.performance.viewAll` a person sees their own figures only,
 * which is what the permission matrix says.
 */
export default async function TaskReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; from?: string; to?: string }>;
}) {
  const ctx = await requirePermission(PERM.task.report.view);
  const { report = "status", from, to } = await searchParams;

  const seesAll = ctx.has(PERM.task.performance.viewAll) || ctx.has(PERM.task.task.viewAll);
  const range = {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  };

  const where = {
    ...(seesAll ? {} : { OR: [{ assigneeId: ctx.id }, { createdById: ctx.id }] }),
    ...(from || to ? { dueAt: range } : {}),
  };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { dueAt: "asc" },
    select: {
      id: true, taskNo: true, title: true, status: true, priority: true,
      dueAt: true, originalDueAt: true, effectiveDueAt: true, completedAt: true, closedAt: true,
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      extensions: {
        where: { status: "APPROVED" },
        select: {
          control: true, previousDueAt: true, revisedDueAt: true, reason: true,
          decidedBy: { select: { name: true } },
        },
      },
    },
  });

  const nowMs = new Date().getTime();

  // Per employee, for the performance report.
  const byPerson = new Map<string, { name: string; rows: typeof tasks }>();
  for (const t of tasks) {
    const e = byPerson.get(t.assignee.id) ?? { name: t.assignee.name, rows: [] as typeof tasks };
    e.rows.push(t);
    byPerson.set(t.assignee.id, e);
  }

  const performance = [...byPerson.entries()].map(([id, e]) => ({
    id,
    name: e.name,
    ...scoreTasks(
      e.rows.map((t) => ({
        status: t.status,
        completedAt: t.completedAt,
        effectiveDueAt: t.effectiveDueAt,
        extensions: t.extensions,
      })),
      nowMs,
    ),
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return (
    <TaskReports
      report={report}
      from={from ?? ""}
      to={to ?? ""}
      nowMs={nowMs}
      canExport={ctx.has(PERM.task.report.export)}
      tasks={tasks.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee.name,
        assigner: t.createdBy.name,
        dueAt: t.dueAt.toISOString(),
        originalDueAt: t.originalDueAt.toISOString(),
        effectiveDueAt: t.effectiveDueAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        closedAt: t.closedAt ? t.closedAt.toISOString() : null,
        extensions: t.extensions.map((e) => ({
          control: e.control,
          reason: e.reason,
          previousDueAt: e.previousDueAt.toISOString(),
          revisedDueAt: e.revisedDueAt ? e.revisedDueAt.toISOString() : null,
          decidedBy: e.decidedBy?.name ?? "—",
        })),
      }))}
      performance={performance}
    />
  );
}
