import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { taskScreenRow } from "@/lib/screens/rows/task";
import { isOverdue } from "@/lib/tasks/lifecycle";
import {
  stageOf, TASK_EMPTY_FILTERED, TASK_EMPTY_NONE, taskBandFigures,
} from "@/lib/tasks/list-display";
import { scoreTasks } from "@/lib/tasks/performance";
import { bandOf } from "@/lib/screens/rows";
import { describeTaskFilters, readTaskListParams, taskListWhere } from "@/lib/tasks/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every task matching the screen's filters.
 *
 * `taskListWhere` is the screen's own clause, including the rule that without
 * `task.task.viewAll` a person sees the tasks they raised, the tasks they were
 * given and any they were named to review — so this cannot show more than the
 * screen does.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.task.task.view, PERM.task.task.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readTaskListParams(gate.params);
  const seesEverything = ctx.has(PERM.task.task.viewAll);

  const tasks = await prisma.task.findMany({
    where: taskListWhere(ctx, params),
    orderBy: { createdAt: "desc" },
    select: {
      id: true, taskNo: true, title: true, location: true, dueAt: true, kind: true,
      priority: true, status: true, round: true, createdAt: true, assigneeId: true,
      project: { select: { code: true } },
      assignee: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { comments: true, attachments: true } },
    },
  });

  const { rows, note } = capRows(tasks);

  /*
   * The screen, for the app: the table's own row. The stage a task is waiting
   * at — "Under review L2 · with Anil" — needs its review and approval levels,
   * so those are read for the window being sent.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = new Date().getTime();
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    const extra = await prisma.task.findMany({
      where: { id: { in: window.map((t) => t.id) } },
      select: {
        id: true, round: true,
        levels: {
          select: {
            kind: true, level: true,
            user: { select: { name: true } },
            actions: { select: { round: true } },
          },
        },
        extensions: { where: { decidedAt: null }, select: { id: true } },
      },
    });
    const byId = new Map(extra.map((t) => [t.id, t]));

    /*
     * The band — §4.1's widgets, over every task this person can see rather
     * than the page on screen, and read through the same `taskBandFigures` the
     * web screen calls.
     */
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(endOfToday.getTime() + 6 * 86_400_000);
    const openish = (t: { status: string }) =>
      !["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status);
    const bandRows = await prisma.task.findMany({
      where: taskListWhere(ctx, params),
      select: {
        status: true, dueAt: true, priority: true, kind: true, createdById: true,
        extensions: { where: { status: "REQUESTED" }, select: { id: true } },
      },
    });
    const summary = {
      dueToday: bandRows.filter((t) => openish(t) && t.dueAt <= endOfToday && t.dueAt.getTime() >= nowMs).length,
      dueThisWeek: bandRows.filter((t) => openish(t) && t.dueAt <= endOfWeek && t.dueAt.getTime() >= nowMs).length,
      pendingApprovals:
        bandRows.filter((t) => t.createdById === ctx.id && t.status === "COMPLETED" && t.kind === "STANDALONE").length +
        bandRows.filter((t) => t.createdById === ctx.id && t.extensions.length > 0).length,
      high: bandRows.filter((t) => openish(t) && t.priority === "HIGH").length,
      medium: bandRows.filter((t) => openish(t) && t.priority === "MEDIUM").length,
      low: bandRows.filter((t) => openish(t) && t.priority === "LOW").length,
    };
    const overdueCount = bandRows.filter((t) => isOverdue(t, nowMs)).length;

    // Your own score, where the role includes seeing it — §4.3.
    const myTasks = ctx.has(PERM.task.performance.view)
      ? await prisma.task.findMany({
          where: { assigneeId: ctx.id },
          select: {
            status: true, completedAt: true, effectiveDueAt: true,
            extensions: {
              where: { status: "APPROVED" },
              select: { control: true, previousDueAt: true, revisedDueAt: true },
            },
          },
        })
      : [];
    const myScore = ctx.has(PERM.task.performance.view) ? scoreTasks(myTasks, nowMs) : null;
    screen = {
      rows: window.map((t) => {
        const e = byId.get(t.id);
        const stage = e
          ? stageOf({ status: t.status, round: e.round, levels: e.levels })
          : null;
        return taskScreenRow(
          {
            id: t.id,
            taskNo: t.taskNo,
            title: t.title,
            kind: t.kind,
            location: t.location,
            assignee: t.assignee.name,
            dueAt: t.dueAt,
            status: t.status,
            priority: t.priority,
            attachments: t._count.attachments,
            stage: stage?.label ?? null,
            stageWho: stage?.who ?? null,
            extensionWaiting: (e?.extensions.length ?? 0) > 0,
          },
          nowMs,
          t.assigneeId === ctx.id,
        );
      }),
      band: bandOf(taskBandFigures(overdueCount, summary, myScore)),
      empty: rows.length === 0 ? TASK_EMPTY_NONE : TASK_EMPTY_FILTERED,
    };
  }

  const columns: ReportColumn[] = [
    { key: "taskNo", header: "Task No" },
    { key: "title", header: "Title" },
    { key: "project", header: "Project" },
    { key: "assignee", header: "Given to" },
    { key: "raisedBy", header: "Raised by" },
    { key: "priority", header: "Priority" },
    { key: "dueAt", header: "Due", format: "date" },
    { key: "status", header: "Status" },
    { key: "kind", header: "Kind" },
    { key: "location", header: "Location" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Tasks",
    entity: "Task",
    filters: describeTaskFilters(params, seesEverything),
    result: {
      columns,
      rows: rows.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        project: t.project?.code ?? "",
        assignee: t.assignee?.name ?? "",
        raisedBy: t.createdBy?.name ?? "",
        priority: t.priority,
        dueAt: t.dueAt,
        // One status is one phrase everywhere; the list says the same words.
        status: t.status.replace(/_/g, " "),
        kind: t.kind === "CHECKLIST" ? "Checklist" : "Plain",
        location: t.location ?? "",
      })),
      summary: [{ label: "Tasks", value: note }],
      emptyMessage: "No tasks match these filters.",
    },
  });
}
