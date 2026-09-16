import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import { TasksScreen } from "./tasks-screen";

export const metadata = { title: "Task Management" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { filter = "All" } = await searchParams;

  const scope = projectScopeFilter(ctx);
  const where = { OR: [scope, { projectId: null }] };

  const [tasks, projects, people] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true, taskNo: true, title: true, location: true, dueDate: true,
        priority: true, status: true, evidence: true,
        project: { select: { id: true, code: true } },
        assignee: { select: { id: true, name: true } },
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
  ]);

  return (
    <TasksScreen
      filter={filter}
      nowMs={new Date().getTime()}
      projects={projects}
      people={people}
      tasks={tasks.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        projectId: t.project?.id ?? null,
        projectCode: t.project?.code ?? null,
        location: t.location,
        assigneeId: t.assignee.id,
        assignee: t.assignee.name,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        priority: t.priority,
        status: t.status,
        evidence: t.evidence,
      }))}
      can={{
        create: ctx.has(PERM.task.task.create),
        update: ctx.has(PERM.task.task.update),
        assign: ctx.has(PERM.task.task.assign),
        delete: ctx.has(PERM.task.task.delete),
      }}
    />
  );
}
