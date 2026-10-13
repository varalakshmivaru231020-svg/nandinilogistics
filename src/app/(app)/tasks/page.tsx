import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { scoreTasks } from "@/lib/tasks/performance";
import { readTaskListParams, taskListWhere } from "@/lib/tasks/list-filters";
import { TasksScreen } from "./tasks-screen";

export const metadata = { title: "Task Management" };

/**
 * The task list.
 *
 * Without `task.task.viewAll` a person sees the tasks they raised and the tasks
 * they were given, plus any they were named to review or approve — not the
 * organisation's. The scope gives the whole view to Admin alone.
 */
/**
 * Which level a checklist task is actually sitting at.
 *
 * "Under Review" says nothing about where it has got to; "Under review L2" is
 * the status a person means when they ask for one, so it is what the status
 * column shows. The name of whoever is holding it goes beside the task.
 */
function stageOf(t: {
  status: string;
  round: number;
  levels: Array<{ kind: string; level: number; user: { name: string }; actions: Array<{ round: number }> }>;
}): { label: string; who: string } | null {
  const kind = t.status === "UNDER_REVIEW" ? "REVIEW" : t.status === "UNDER_APPROVAL" ? "APPROVAL" : null;
  if (!kind) return null;
  const done = new Set(
    t.levels.filter((l) => l.kind === kind && l.actions.some((a) => a.round === t.round)).map((l) => l.level),
  );
  const next = t.levels
    .filter((l) => l.kind === kind && !done.has(l.level))
    .sort((a, b) => a.level - b.level)[0];
  if (!next) return null;
  return {
    label: `Under ${kind === "REVIEW" ? "review" : "approval"} L${next.level}`,
    who: next.user.name,
  };
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string; mine?: string; priority?: string;
    assignee?: string; assigner?: string; from?: string; to?: string;
    q?: string; has?: string;
  }>;
}) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { filter = "All", mine, priority, assignee, assigner, from, to, q, has } = await searchParams;

  const seesEverything = ctx.has(PERM.task.task.viewAll);

  // The filters, the ownership rule and the project scope all live in
  // src/lib/tasks/list-filters.ts, so this screen, its export and the mobile
  // list cannot disagree about what the list contains.
  const params = readTaskListParams({ mine, priority, assignee, assigner, from, to, q, has });
  const where = taskListWhere(ctx, params);

  const [tasks, people] = await Promise.all([
    prisma.task.findMany({
      where,
      // Newest first: the task just raised is the one being looked for.
      orderBy: { createdAt: "desc" },
      select: {
        id: true, taskNo: true, title: true, location: true, dueAt: true, kind: true,
        priority: true, status: true, round: true, createdById: true, assigneeId: true,
        project: { select: { id: true, code: true } },
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
        extensions: { where: { status: "REQUESTED" }, select: { id: true } },
        levels: {
          select: {
            kind: true, level: true,
            user: { select: { name: true } },
            actions: { select: { round: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
      q={q ?? ""}
      has={has === "checklist" ? "checklist" : has === "plain" ? "plain" : ""}
      picked={{
        priority: priority ?? "",
        assignee: assignee ?? "",
        assigner: assigner ?? "",
        from: from ?? "",
        to: to ?? "",
      }}
      nowMs={nowMs}
      viewerId={ctx.id}
      people={people}
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
        stage: stageOf(t)?.label ?? null,
        stageWho: stageOf(t)?.who ?? null,
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
