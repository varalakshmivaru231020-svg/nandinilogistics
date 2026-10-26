"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import { ModuleStats } from "@/components/list/module-stats";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";
import {
  TASK_EMPTY_FILTERED, TASK_EMPTY_NONE, taskBandFigures, type TaskSummary,
} from "@/lib/tasks/list-display";
import { deleteTasksAction, startTaskAction } from "./actions";

interface Task {
  id: string;
  taskNo: string;
  title: string;
  assigneeIds: string[];
  assignees: string;
  assigner: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  comments: number;
  attachments: number;
}

const STATUS_PILL: Record<TaskStatus, string> = {
  OPEN: "bg-surface-field text-navy-600",
  IN_PROGRESS: "bg-brand-100 text-brand-700",
  DONE: "bg-good-050 text-good-700",
};

const PRIORITY_PILL: Record<TaskPriority, string> = {
  HIGH: "bg-bad-050 text-bad-700",
  MEDIUM: "bg-warn-050 text-warn-800",
  LOW: "bg-surface-field text-muted-600",
};

export function TasksScreen({
  tasks, people, picked, q, summary, nowMs, viewerId, can,
}: {
  tasks: Task[];
  people: Array<{ id: string; name: string }>;
  picked: { status: string; priority: string; assignee: string; from: string; to: string };
  q: string;
  summary: TaskSummary;
  nowMs: number;
  viewerId: string;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work."); return; }
    toast(done);
    setSel([]);
    router.refresh();
  }

  function go(next: Partial<Record<"status" | "priority" | "assignee" | "from" | "to" | "q", string | null>>) {
    const params = new URLSearchParams();
    const now: Record<string, string | null> = { q, ...picked, ...next };
    for (const [k, v] of Object.entries(now)) {
      if (v) params.set(k, v);
    }
    router.push(`/tasks${params.toString() ? `?${params}` : ""}`);
  }

  const filtered = picked.status || picked.priority || picked.assignee || picked.from || picked.to || q;
  const overdue = tasks.filter((t) => isOverdue(t, nowMs)).length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Task Management"
        description="Work Admin assigns to Team Leaders, from Open through In progress to Done."
        actions={
          can.create ? (
            <Link
              href="/tasks/new"
              className="rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              + New task
            </Link>
          ) : undefined
        }
      />

      <ModuleStats figures={taskBandFigures(summary)} />

      <div className="mb-3.5 flex flex-wrap items-center gap-[7px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <Chip picked={!picked.status} onClick={() => go({ status: null })}>
          All <span className="num opacity-70">{tasks.length}</span>
        </Chip>
        {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
          <Chip key={s} picked={picked.status === s} onClick={() => go({ status: s })}>
            {STATUS_LABEL[s]}
          </Chip>
        ))}
        <span className="mx-1.5 h-[22px] w-px bg-line-400" />
        <span className={cn("text-[11.5px] font-semibold", overdue > 0 ? "text-bad-600" : "text-muted-500")}>
          {overdue} overdue
        </span>
        <div className="flex-1" />
        <span className="text-[11.5px] font-medium text-muted-600">{tasks.length} shown</span>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <input
          defaultValue={q}
          onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value || null }); }}
          onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value || null }); }}
          placeholder="Search task no., title, assigned to…"
          className="w-[280px] rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
        />

        <span className="text-[11px] font-semibold text-muted-400">Priority</span>
        <select
          value={picked.priority}
          onChange={(e) => go({ priority: e.target.value || null })}
          className="cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
        >
          <option value="">Any priority</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <span className="text-[11px] font-semibold text-muted-400">Team Leader</span>
        <select
          value={picked.assignee}
          onChange={(e) => go({ assignee: e.target.value || null })}
          className="max-w-[170px] cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
        >
          <option value="">Anyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <span className="text-[11px] font-semibold text-muted-400">Due</span>
        <input
          type="date"
          value={picked.from}
          onChange={(e) => go({ from: e.target.value || null })}
          className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
        />
        <span className="text-[11px] font-medium text-muted-400">to</span>
        <input
          type="date"
          value={picked.to}
          onChange={(e) => go({ to: e.target.value || null })}
          className="rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
        />

        {filtered && (
          <button
            type="button"
            onClick={() => go({ status: null, priority: null, assignee: null, from: null, to: null, q: null })}
            className="cursor-pointer text-[11.5px] font-semibold text-brand-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {sel.length > 0 && can.delete && (
        <div className="mb-3 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-[#BFD9F2] bg-[#EFF3FB] px-[15px] py-[11px]">
          <span className="text-[12.5px] font-bold text-[#2F308C]">{sel.length} selected</span>
          <div className="flex-1" />
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => deleteTasksAction(sel), "Deleted.")}
            className="cursor-pointer rounded-[8px] border border-[#F2CBCB] bg-[#FCEDED] px-[13px] py-2 text-[11.5px] font-bold text-[#B23334] transition-colors hover:bg-[#F8DBDB] disabled:opacity-60"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSel([])}
            className="cursor-pointer px-2 py-1.5 text-[11.5px] font-semibold text-muted-500 hover:text-brand-700"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              {can.delete && (
                <Th className="w-[40px] pr-0">
                  <Box
                    checked={sel.length > 0 && sel.length === tasks.length}
                    onChange={() => setSel(sel.length === tasks.length ? [] : tasks.map((t) => t.id))}
                    label="Select all"
                  />
                </Th>
              )}
              <Th>Task</Th>
              <Th>Assigned to</Th>
              <Th>Due</Th>
              <Th>Priority</Th>
              <Th>Files</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const over = isOverdue(t, nowMs);
              const mine = t.assigneeIds.includes(viewerId);
              return (
                <tr key={t.id} className={cn("hover:bg-surface-tint", over && "bg-bad-025")}>
                  {can.delete && (
                    <Td className="pr-0">
                      <Box
                        checked={sel.includes(t.id)}
                        onChange={() => setSel((s) => s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id])}
                        label={`Select ${t.taskNo}`}
                      />
                    </Td>
                  )}
                  <Td>
                    <Link href={`/tasks/${t.id}`} className="block">
                      <span className="text-[13px] font-semibold text-navy-800 hover:text-brand-700">{t.title}</span>
                      <span className="num mt-0.5 block text-[11px] font-medium text-muted-400">{t.taskNo}</span>
                    </Link>
                  </Td>
                  <Td className="text-[12.5px] font-semibold text-navy-700">{t.assignees || "—"}</Td>
                  <Td>
                    <span className={cn("text-[12px] font-semibold", over ? "text-bad-600" : "text-navy-700")}>
                      {formatDateTime(t.dueAt)}
                    </span>
                  </Td>
                  <Td>
                    <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-bold", PRIORITY_PILL[t.priority])}>
                      {t.priority[0] + t.priority.slice(1).toLowerCase()}
                    </span>
                  </Td>
                  <Td className="text-[12px] font-medium text-muted-600">
                    {t.attachments > 0 ? `${t.attachments} file(s)` : "—"}
                  </Td>
                  <Td>
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold", STATUS_PILL[t.status])}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {mine && can.start && t.status === "OPEN" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => startTaskAction(t.id), "Work started.")}
                          className="cursor-pointer rounded-[7px] bg-brand-500 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-brand-600 disabled:opacity-60"
                        >
                          Start
                        </button>
                      )}
                      <Link
                        href={`/tasks/${t.id}`}
                        className="rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-muted-600 transition-colors hover:border-brand-500 hover:text-brand-700"
                      >
                        Open
                      </Link>
                    </div>
                  </Td>
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  {filtered ? TASK_EMPTY_FILTERED.title : TASK_EMPTY_NONE.title}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] font-medium text-muted-400">
        Status flow: Open → In progress → Done. A Team Leader moves it; Admin can reopen a finished task.
      </p>
    </div>
  );
}

function Chip({
  children, picked, onClick,
}: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-[11px] py-[6px] text-[11px] font-semibold transition-colors",
        picked
          ? "border-brand-500 bg-brand-100 text-brand-700"
          : "border-line-400 bg-white text-muted-600 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      "border-b border-line-150 bg-surface-sunken px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400",
      className,
    )}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-line-100 px-4 py-[13px]", className)}>{children}</td>;
}

function Box({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={label}
      className={cn(
        "flex h-[17px] w-[17px] cursor-pointer items-center justify-center rounded-[5px] border text-[10px] font-bold",
        checked ? "border-brand-500 bg-brand-500 text-white" : "border-line-500 bg-white text-transparent",
      )}
    >
      ✓
    </button>
  );
}
