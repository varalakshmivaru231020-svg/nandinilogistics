import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
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
  searchParams: Promise<{ filter?: string; mine?: string }>;
}) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { filter = "All", mine } = await searchParams;

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

  const where = {
    ...(seesEverything ? projectScope : {}),
    ...(seesEverything ? {} : ownScope),
    ...(mine === "to" ? { assigneeId: ctx.id } : {}),
    ...(mine === "by" ? { createdById: ctx.id } : {}),
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

  return (
    <TasksScreen
      filter={filter}
      mine={mine === "to" ? "to" : mine === "by" ? "by" : null}
      nowMs={new Date().getTime()}
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
        viewAll: seesEverything,
      }}
    />
  );
}
