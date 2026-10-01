"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn, formatDateTime } from "@/lib/utils";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";

interface Row {
  id: string; taskNo: string; title: string; status: TaskStatus; priority: TaskPriority;
  assignee: string; assigner: string;
  dueAt: string; originalDueAt: string; effectiveDueAt: string;
  completedAt: string | null; closedAt: string | null;
  extensions: Array<{
    control: string | null; reason: string;
    previousDueAt: string; revisedDueAt: string | null; decidedBy: string;
  }>;
}

interface Score {
  id: string; name: string; total: number; onTime: number; late: number; stillOverdue: number;
  averageDelayDays: number; controllableExtensions: number; uncontrollableExtensions: number;
  score: number | null;
}

const REPORTS = [
  ["status", "Task status"],
  ["overdue", "Overdue"],
  ["extension", "Extensions"],
  ["performance", "Employee performance"],
] as const;

const DAY = 86_400_000;

/** The scope's four reports, each a table that can be taken away as a CSV. */
export function TaskReports({
  report, from, to, tasks, performance, nowMs, canExport,
}: {
  report: string;
  from: string;
  to: string;
  tasks: Row[];
  performance: Score[];
  nowMs: number;
  canExport: boolean;
}) {
  const router = useRouter();

  function go(next: Partial<Record<"report" | "from" | "to", string | null>>) {
    const params = new URLSearchParams();
    const now: Record<string, string | null> = { report, from, to, ...next };
    for (const [k, v] of Object.entries(now)) if (v) params.set(k, v);
    router.push(`/tasks/reports${params.toString() ? `?${params}` : ""}`);
  }

  const overdue = tasks.filter((t) => isOverdue(t, nowMs));
  const withExtensions = tasks.filter((t) => t.extensions.length > 0);

  const table = (() => {
    if (report === "overdue") {
      return {
        head: ["Task", "Assignee", "Due", "Days overdue", "Status"],
        rows: overdue.map((t) => [
          `${t.taskNo} — ${t.title}`,
          t.assignee,
          formatDateTime(t.dueAt),
          String(Math.floor((nowMs - new Date(t.dueAt).getTime()) / DAY)),
          STATUS_LABEL[t.status],
        ]),
        empty: "Nothing is overdue.",
      };
    }
    if (report === "extension") {
      return {
        head: ["Task", "Assignee", "Original due", "Revised due", "Reason", "Classified", "Approved by"],
        rows: withExtensions.flatMap((t) =>
          t.extensions.map((e) => [
            `${t.taskNo} — ${t.title}`,
            t.assignee,
            formatDateTime(e.previousDueAt),
            e.revisedDueAt ? formatDateTime(e.revisedDueAt) : "—",
            e.reason,
            e.control ? e.control[0] + e.control.slice(1).toLowerCase() : "—",
            e.decidedBy,
          ]),
        ),
        empty: "No extension has been approved in this period.",
      };
    }
    if (report === "performance") {
      return {
        head: ["Employee", "Total", "On time", "Late", "Still overdue", "Avg delay (days)", "Controllable", "Uncontrollable", "Score"],
        rows: performance.map((p) => [
          p.name,
          String(p.total),
          String(p.onTime),
          String(p.late),
          String(p.stillOverdue),
          String(p.averageDelayDays),
          String(p.controllableExtensions),
          String(p.uncontrollableExtensions),
          p.score === null ? "—" : `${p.score}%`,
        ]),
        empty: "Nobody has finished a task in this period.",
      };
    }
    return {
      head: ["Task", "Assignee", "Assigner", "Due", "Priority", "Status", "Completed"],
      rows: tasks.map((t) => [
        `${t.taskNo} — ${t.title}`,
        t.assignee,
        t.assigner,
        formatDateTime(t.dueAt),
        t.priority[0] + t.priority.slice(1).toLowerCase(),
        STATUS_LABEL[t.status],
        t.completedAt ? formatDateTime(t.completedAt) : "—",
      ]),
      empty: "No task falls in this period.",
    };
  })();

  function download() {
    const csv = [table.head, ...table.rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-${report}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Task reports"
        description="Status, overdue, extensions and the performance score, for a period you choose."
        actions={<Link href="/tasks" className="text-[12px] font-semibold text-brand-700 hover:underline">← Back to tasks</Link>}
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-[7px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        {REPORTS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => go({ report: key })}
            className={cn(
              "cursor-pointer rounded-full border px-[11px] py-[6px] text-[11px] font-semibold transition-colors",
              report === key
                ? "border-brand-500 bg-brand-100 text-brand-700"
                : "border-line-400 bg-white text-muted-600 hover:border-brand-500",
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1.5 h-[22px] w-px bg-line-400" />
        <span className="text-[11px] font-semibold text-muted-400">Due between</span>
        <input
          type="date" value={from} onChange={(e) => go({ from: e.target.value || null })}
          className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium"
        />
        <input
          type="date" value={to} onChange={(e) => go({ to: e.target.value || null })}
          className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium"
        />
        <div className="flex-1" />
        {canExport && table.rows.length > 0 && (
          <button
            type="button"
            onClick={download}
            className="cursor-pointer rounded-[8px] border border-line-400 bg-white px-3 py-1.5 text-[11.5px] font-bold text-brand-700 hover:border-brand-500"
          >
            ↓ Export CSV
          </button>
        )}
      </div>

      {report === "performance" && performance.length > 0 && (
        <div className="mb-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {performance.slice(0, 4).map((p) => (
            <Card key={p.id}>
              <CardBody>
                <p className="text-[11px] font-semibold text-muted-500">{p.name}</p>
                <p className="num mt-1 font-display text-[24px] font-extrabold text-navy-950">
                  {p.score === null ? "—" : `${p.score}%`}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-muted-400">
                  {p.onTime} on time · {p.late} late
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {table.rows.length === 0 ? (
        <Card><EmptyState title="Nothing to report" description={table.empty} /></Card>
      ) : (
        <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h} className="border-b border-line-150 bg-surface-sunken px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="hover:bg-surface-tint">
                  {r.map((c, j) => (
                    <td key={j} className={cn(
                      "border-b border-line-100 px-4 py-[11px] text-[12px]",
                      j === 0 ? "font-semibold text-navy-900" : "font-medium text-muted-600",
                    )}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report === "performance" && (
        <p className="mt-3 text-[12px] font-medium text-muted-400">
          A task counts as on time if it was completed on or before its effective due date — the
          original date plus only the time granted for uncontrollable delays. Every task weighs the
          same whatever its priority, and a failed checklist review does not count against the assignee.
        </p>
      )}
    </div>
  );
}
