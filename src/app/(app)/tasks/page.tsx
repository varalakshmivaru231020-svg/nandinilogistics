import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { scoreTasks } from "@/lib/tasks/performance";
import { TasksScreen } from "./tasks-screen";

export const metadata = { title: "Task Management" };

/**
 * The task list.
 *
 * Without `task.task.viewAll` a person sees the tasks they raised and the tasks
 * they were given, plus any they were named to review or approve — not the
 * organisation's. The scope gives the whole view to Admin alone.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string; mine?: string; priority?: string;
    assignee?: string; assigner?: string; from?: string; to?: string;
  }>;
}) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { filter = "All", mine, priority, assignee, assigner, from, to } = await searchParams;

  const seesEverything = ctx.has(PERM.task.task.viewAll);
  const projectScope = ctx.canAccessAllProjects
    ? {}
    : { OR: [{ projectId: { in: ctx.projectIds } }, { projectId: null }] };

  const ownScope = {
    OR: [
      { assigneeId: ctx.id },
      { createdById: ctx.id },
      { levels: { some: { userId: ctx.id } } },
    ],
  };

  // The scope's §3.4: status and "mine" as chips, the rest as a filter bar.
  const dueRange =
    from || to
      ? {
          dueAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {};

  const where = {
    ...(seesEverything ? projectScope : {}),
    ...(seesEverything ? {} : ownScope),
    ...(mine === "to" ? { assigneeId: ctx.id } : {}),
    ...(mine === "by" ? { createdById: ctx.id } : {}),
    ...(priority && ["HIGH", "MEDIUM", "LOW"].includes(priority)
      ? { priority: priority as "HIGH" | "MEDIUM" | "LOW" }
      : {}),
    ...(assignee ? { assigneeId: assignee } : {}),
    ...(assigner ? { createdById: assigner } : {}),
    ...dueRange,
  };

  const [tasks, projects, people, checklists] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, taskNo: true, title: true, location: true, dueAt: true, kind: true,
        priority: true, status: true, round: true, createdById: true, assigneeId: true,
        project: { select: { id: true, code: true } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
        extensions: { where: { status: "REQUESTED" }, select: { id: true } },
      },
    }),
    prisma.project.findMany({
      where: ctx.canAccessAllProjects ? { status: "ACTIVE" } : { status: "ACTIVE", id: { in: ctx.projectIds } },
      orderBy: { name: "asc" },
      select: { id: true, code: true },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.checklist.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
  ]);

  // The scope's §4.1 widgets, for the tasks this person can see.
  const nowMs = new Date().getTime();
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(endOfToday.getTime() + 6 * 86_400_000);
  const openish = (t: { status: string }) =>
    !["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status);

  const summary = {
    dueToday: tasks.filter((t) => openish(t) && t.dueAt <= endOfToday && t.dueAt.getTime() >= nowMs).length,
    dueThisWeek: tasks.filter((t) => openish(t) && t.dueAt <= endOfWeek && t.dueAt.getTime() >= nowMs).length,
    // What is waiting on this viewer as an Assigner: closures and extensions.
    pendingApprovals:
      tasks.filter((t) => t.createdById === ctx.id && t.status === "COMPLETED" && t.kind === "STANDALONE").length +
      tasks.filter((t) => t.createdById === ctx.id && t.extensions.length > 0).length,
    high: tasks.filter((t) => openish(t) && t.priority === "HIGH").length,
    medium: tasks.filter((t) => openish(t) && t.priority === "MEDIUM").length,
    low: tasks.filter((t) => openish(t) && t.priority === "LOW").length,
  };

  // Your own score, when your role includes seeing it; §4.3.
  const seesOwnScore = ctx.has(PERM.task.performance.view);
  const myTasks = seesOwnScore ? await prisma.task.findMany({
    where: { assigneeId: ctx.id },
    select: {
      status: true, completedAt: true, effectiveDueAt: true,
      extensions: {
        where: { status: "APPROVED" },
        select: { control: true, previousDueAt: true, revisedDueAt: true },
      },
    },
  }) : [];
  const myScore = scoreTasks(myTasks, nowMs);

  return (
    <TasksScreen
      summary={summary}
      myScore={seesOwnScore ? myScore : null}
      filter={filter}
      mine={mine === "to" ? "to" : mine === "by" ? "by" : null}
      picked={{
        priority: priority ?? "",
        assignee: assignee ?? "",
        assigner: assigner ?? "",
        from: from ?? "",
        to: to ?? "",
      }}
      nowMs={nowMs}
      viewerId={ctx.id}
      projects={projects}
      people={people}
      checklists={checklists.map((c) => ({ id: c.id, name: c.name, category: c.category.name }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        kind: t.kind,
        projectId: t.project?.id ?? null,
        projectCode: t.project?.code ?? null,
        location: t.location,
        assigneeId: t.assignee.id,
        assignee: t.assignee.name,
        assignerId: t.createdBy.id,
        assigner: t.createdBy.name,
        dueAt: t.dueAt.toISOString(),
        priority: t.priority,
        status: t.status,
        comments: t._count.comments,
        attachments: t._count.attachments,
        extensionWaiting: t.extensions.length > 0,
      }))}
      can={{
        create: ctx.has(PERM.task.task.create),
        update: ctx.has(PERM.task.task.update),
        reassign: ctx.has(PERM.task.task.reassign),
        delete: ctx.has(PERM.task.task.delete),
        viewAll: seesEverything,
      }}
    />
  );
}
