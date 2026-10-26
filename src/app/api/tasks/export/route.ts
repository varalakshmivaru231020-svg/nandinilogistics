import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { taskScreenRow } from "@/lib/screens/rows/task";
import {
  TASK_EMPTY_FILTERED, TASK_EMPTY_NONE, taskBandFigures, taskSummaryOf,
} from "@/lib/tasks/list-display";
import { bandOf } from "@/lib/screens/rows";
import { describeTaskFilters, readTaskListParams, taskListWhere } from "@/lib/tasks/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every task matching the screen's filters.
 *
 * `taskListWhere` is the screen's own clause, including the rule that without
 * `task.task.viewAll` a person sees the tasks they were given and the tasks
 * they raised — so this cannot show more than the screen does.
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
      id: true, taskNo: true, title: true, dueAt: true,
      priority: true, status: true, createdAt: true, completionRemark: true,
      assignees: { select: { userId: true, user: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      _count: { select: { comments: true, attachments: true } },
    },
  });

  const { rows, note } = capRows(tasks);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const nowMs = new Date().getTime();
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);

    screen = {
      rows: window.map((t) =>
        taskScreenRow(
          {
            id: t.id,
            taskNo: t.taskNo,
            title: t.title,
            assignees: t.assignees.map((a) => a.user.name).join(", "),
            dueAt: t.dueAt,
            status: t.status,
            priority: t.priority,
            attachments: t._count.attachments,
          },
          nowMs,
          t.assignees.some((a) => a.userId === ctx.id),
        ),
      ),
      // The band, over every task this person can see rather than the page on
      // screen, read through the same `taskBandFigures` the web screen calls.
      band: bandOf(taskBandFigures(taskSummaryOf(tasks, nowMs))),
      empty: rows.length === 0 ? TASK_EMPTY_NONE : TASK_EMPTY_FILTERED,
    };
  }

  const columns: ReportColumn[] = [
    { key: "taskNo", header: "Task No" },
    { key: "title", header: "Title" },
    { key: "assignees", header: "Assigned to" },
    { key: "raisedBy", header: "Raised by" },
    { key: "priority", header: "Priority" },
    { key: "dueAt", header: "Due", format: "date" },
    { key: "status", header: "Status" },
    { key: "remark", header: "Closing remark" },
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
        assignees: t.assignees.map((a) => a.user.name).join(", "),
        raisedBy: t.createdBy?.name ?? "",
        priority: t.priority,
        dueAt: t.dueAt,
        // One status is one phrase everywhere; the list says the same words.
        status: t.status.replace(/_/g, " "),
        remark: t.completionRemark ?? "",
      })),
      summary: [{ label: "Tasks", value: note }],
      emptyMessage: "No tasks match these filters.",
    },
  });
}
