import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import { scoreTasks } from "@/lib/tasks/performance";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * The task performance report: one row per person, scored.
 *
 * `scoreTasks` is the same function the screen uses, so the percentage here is
 * the percentage there. Without `task.performance.viewAll` a person gets their
 * own figures and nobody else's, which is what the permission matrix says — and
 * which is why this cannot simply read every task.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.task.report.view, PERM.task.report.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();
  const seesAll = ctx.has(PERM.task.performance.viewAll) || ctx.has(PERM.task.task.viewAll);

  const range = {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  };

  const tasks = await prisma.task.findMany({
    where: {
      ...(seesAll ? {} : { OR: [{ assigneeId: ctx.id }, { createdById: ctx.id }] }),
      ...(from || to ? { dueAt: range } : {}),
    },
    orderBy: { dueAt: "asc" },
    select: {
      id: true, status: true, dueAt: true, originalDueAt: true, effectiveDueAt: true,
      completedAt: true, closedAt: true,
      assignee: { select: { id: true, name: true } },
      extensions: {
        where: { status: "APPROVED" },
        select: { control: true, previousDueAt: true, revisedDueAt: true },
      },
    },
  });

  const nowMs = Date.now();

  const byPerson = new Map<string, { name: string; rows: typeof tasks }>();
  for (const t of tasks) {
    const entry = byPerson.get(t.assignee.id) ?? { name: t.assignee.name, rows: [] as typeof tasks };
    entry.rows.push(t);
    byPerson.set(t.assignee.id, entry);
  }

  const scored = [...byPerson.entries()]
    .map(([id, { name, rows }]) => ({ id, name, ...scoreTasks(rows, nowMs) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const { rows, note } = capRows(scored);

  const columns: ReportColumn[] = [
    { key: "name", header: "Person" },
    { key: "total", header: "Tasks", align: "right", format: "number" },
    { key: "onTime", header: "On time", align: "right", format: "number" },
    { key: "late", header: "Late", align: "right", format: "number" },
    { key: "stillOverdue", header: "Still overdue", align: "right", format: "number" },
    { key: "score", header: "Score", align: "right", format: "number" },
    { key: "averageDelayDays", header: "Avg days late", align: "right", format: "number" },
    { key: "controllableExtensions", header: "Controllable extensions", align: "right", format: "number" },
    { key: "uncontrollableExtensions", header: "Uncontrollable extensions", align: "right", format: "number" },
  ];

  const whole = scoreTasks(tasks, nowMs);

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Task performance",
    entity: "Task",
    filters: [
      from || to ? `Due ${from || "any"} to ${to || "any"}` : "All dates",
      seesAll ? null : "Your tasks only",
    ].filter(Boolean).join(" · "),
    result: {
      columns,
      rows: rows.map((p) => ({
        id: p.id,
        name: p.name,
        total: p.total,
        onTime: p.onTime,
        late: p.late,
        stillOverdue: p.stillOverdue,
        // `score` is what the screen shows; null when there is nothing to score.
        score: p.score,
        averageDelayDays: p.averageDelayDays,
        controllableExtensions: p.controllableExtensions,
        uncontrollableExtensions: p.uncontrollableExtensions,
      })),
      summary: [
        { label: "People", value: note },
        { label: "Tasks scored", value: String(whole.total) },
        { label: "Scored", value: whole.score === null ? "—" : `${whole.score}%` },
      ],
      emptyMessage: "No tasks in this range.",
    },
  });
}
