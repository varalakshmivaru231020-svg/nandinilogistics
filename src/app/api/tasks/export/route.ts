import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
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
      priority: true, status: true, round: true, createdAt: true,
      project: { select: { code: true } },
      assignee: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { comments: true, attachments: true } },
    },
  });

  const { rows, note } = capRows(tasks);

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
    format: gate.format,
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
