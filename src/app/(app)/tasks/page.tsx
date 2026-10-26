import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { taskSummaryOf } from "@/lib/tasks/list-display";
import { readTaskListParams, taskListWhere } from "@/lib/tasks/list-filters";
import { TasksScreen } from "./tasks-screen";

export const metadata = { title: "Task Management" };

/**
 * The task list.
 *
 * Without `task.task.viewAll` a person sees the tasks they were given and the
 * tasks they raised — not the organisation's. The SOW gives the whole view to
 * Admin alone.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string; priority?: string; assignee?: string; from?: string; to?: string; q?: string;
  }>;
}) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { status, priority, assignee, from, to, q } = await searchParams;

  // The filters and the ownership rule live in src/lib/tasks/list-filters.ts,
  // so this screen, its export and the mobile list cannot disagree about what
  // the list contains.
  const params = readTaskListParams({ status, priority, assignee, from, to, q });
  const where = taskListWhere(ctx, params);

  const [tasks, leaderIds] = await Promise.all([
    prisma.task.findMany({
      where,
      // Newest first: the task just raised is the one being looked for.
      orderBy: { createdAt: "desc" },
      select: {
        id: true, taskNo: true, title: true, dueAt: true,
        priority: true, status: true, createdById: true,
        assignees: { select: { userId: true, user: { select: { name: true } } } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    }),
    usersHolding(prisma, PERM.task.task.start),
  ]);
  const people = await prisma.user.findMany({
    where: { id: { in: leaderIds }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const nowMs = new Date().getTime();

  return (
    <TasksScreen
      summary={taskSummaryOf(tasks, nowMs)}
      picked={{
        status: status ?? "",
        priority: priority ?? "",
        assignee: assignee ?? "",
        from: from ?? "",
        to: to ?? "",
      }}
      q={q ?? ""}
      nowMs={nowMs}
      viewerId={ctx.id}
      people={people}
      tasks={tasks.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        assigneeIds: t.assignees.map((a) => a.userId),
        assignees: t.assignees.map((a) => a.user.name).join(", "),
        assigner: t.createdBy.name,
        dueAt: t.dueAt.toISOString(),
        priority: t.priority,
        status: t.status,
        comments: t._count.comments,
        attachments: t._count.attachments,
      }))}
      can={{
        create: ctx.has(PERM.task.task.create),
        start: ctx.has(PERM.task.task.start),
        delete: ctx.has(PERM.task.task.delete),
        viewAll: ctx.has(PERM.task.task.viewAll),
      }}
    />
  );
}
