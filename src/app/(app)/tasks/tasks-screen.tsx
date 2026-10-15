"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskKind, TaskPriority, TaskStatus } from "@prisma/client";

import { PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import { ModuleStats } from "@/components/list/module-stats";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";
import { TASK_EMPTY_FILTERED, TASK_EMPTY_NONE, taskBandFigures } from "@/lib/tasks/list-display";
import {
  acceptTaskAction, deleteTasksAction, reassignTasksAction, setPriorityAction, startTaskAction,
} from "./actions";

interface Task {
  id: string;
  taskNo: string;
  title: string;
  kind: TaskKind;
  projectId: string | null;
  projectCode: string | null;
  location: string | null;
  assigneeId: string;
  assignee: string;
  assignerId: string;
  assigner: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  comments: number;
  attachments: number;
  extensionWaiting: boolean;
  /** For a checklist task, the level it is waiting at, and who holds it. */
  stage: string | null;
  stageWho: string | null;
}

const STATUS_PILL: Record<TaskStatus, string> = {
  PENDING: "bg-surface-field text-navy-600",
  ACCEPTED: "bg-brand-100 text-brand-700",
  STARTED: "bg-brand-100 text-brand-700",
  HOLD: "bg-warn-050 text-warn-800",
  COMPLETED: "bg-good-050 text-good-700",
  UNDER_REVIEW: "bg-[#EDE7FB] text-[#5B3FA8]",
  REWORK: "bg-bad-050 text-bad-700",
  UNDER_APPROVAL: "bg-[#DCD2F5] text-[#4A2F94]",
  // Signed off and waiting for the assignee to close it.
  APPROVED: "bg-good-050 text-good-700",
  CLOSED: "bg-surface-field text-muted-600",
};

const PRIORITY_PILL: Record<TaskPriority, string> = {
  HIGH: "bg-bad-050 text-bad-700",
  MEDIUM: "bg-warn-050 text-warn-800",
  LOW: "bg-surface-field text-muted-600",
};

const FILTERS = ["All", "Overdue", ...Object.values(STATUS_LABEL)];

export function TasksScreen({
  tasks, people, filter, mine, picked, q, has, summary, myScore, nowMs, viewerId, can,
}: {
  tasks: Task[];
  people: Array<{ id: string; name: string }>;
  filter: string;
  mine: "to" | "by" | null;
  picked: { priority: string; assignee: string; assigner: string; from: string; to: string };
  q: string;
  has: "" | "checklist" | "plain";
  summary: {
    dueToday: number; dueThisWeek: number; pendingApprovals: number;
    high: number; medium: number; low: number;
  };
  myScore: { score: number | null; onTime: number; late: number } | null;
  nowMs: number;
  viewerId: string;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = React.useState<string[]>([]);
  const [reassigning, setReassigning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function bulk(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work."); return; }
    toast(done);
    setSel([]);
    router.refresh();
  }

  async function rowRun(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work."); return; }
    toast(done);
    router.refresh();
  }

  function go(next: Partial<Record<"filter" | "mine" | "priority" | "assignee" | "assigner" | "from" | "to" | "q" | "has", string | null>>) {
    const params = new URLSearchParams();
    const now: Record<string, string | null> = {
      filter, mine, q, has, ...picked, ...next,
    };
    for (const [k, v] of Object.entries(now)) {
      if (!v) continue;
      if (k === "filter" && v === "All") continue;
      params.set(k, v);
    }
    router.push(`/tasks${params.toString() ? `?${params}` : ""}`);
  }

  const filtered =
    picked.priority || picked.assignee || picked.assigner || picked.from || picked.to || has;

  const shown = tasks.filter((t) => {
    if (filter === "All") return true;
    if (filter === "Overdue") return isOverdue(t, nowMs);
    return STATUS_LABEL[t.status] === filter;
  });

  function countFor(f: string) {
    if (f === "All") return tasks.length;
    if (f === "Overdue") return tasks.filter((t) => isOverdue(t, nowMs)).length;
    return tasks.filter((t) => STATUS_LABEL[t.status] === f).length;
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Task Management"
        description="Work one person assigns to another, from Pending through to Closed."
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

      {/* The scope's §4.1 widgets, on the strip every module uses. */}
      <ModuleStats figures={taskBandFigures(countFor("Overdue"), summary, myScore)} />

      <div className="mb-3.5 flex flex-wrap items-center gap-[7px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        {FILTERS.filter((f) => f === "All" || countFor(f) > 0).map((f) => (
          <Chip key={f} picked={filter === f} onClick={() => go({ filter: f })}>
            {f} <span className="num opacity-70">{countFor(f)}</span>
          </Chip>
        ))}
        <span className="mx-1.5 h-[22px] w-px bg-line-400" />
        <Chip picked={mine === "to"} onClick={() => go({ mine: mine === "to" ? null : "to" })}>
          Assigned to me
        </Chip>
        <Chip picked={mine === "by"} onClick={() => go({ mine: mine === "by" ? null : "by" })}>
          Assigned by me
        </Chip>
        <div className="flex-1" />
        <span className="text-[11.5px] font-medium text-muted-600">
          {shown.length} of {tasks.length}
        </span>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <input
          defaultValue={q}
          onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value || null }); }}
          onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value || null }); }}
          placeholder="Search by task number, title or person…"
          className="w-[280px] rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
        />

        <span className="text-[11px] font-semibold text-muted-400">Type</span>
        {([["", "All"], ["checklist", "With checklist"], ["plain", "Without"]] as const).map(([v, label]) => (
          <Chip key={v || "all"} picked={has === v} onClick={() => go({ has: v || null })}>
            {label}
          </Chip>
        ))}

        <span className="text-[11px] font-semibold text-muted-400">Priority</span>
        <select
          value={picked.priority}
          onChange={(e) => go({ priority: e.target.value || null })}
          className="cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
        >
          <option value="">Any</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <span className="text-[11px] font-semibold text-muted-400">Assignee</span>
        <select
          value={picked.assignee}
          onChange={(e) => go({ assignee: e.target.value || null })}
          className="max-w-[150px] cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
        >
          <option value="">Anyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <span className="text-[11px] font-semibold text-muted-400">Assigner</span>
        <select
          value={picked.assigner}
          onChange={(e) => go({ assigner: e.target.value || null })}
          className="max-w-[150px] cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900"
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
            onClick={() => go({ priority: null, assignee: null, assigner: null, from: null, to: null, has: null })}
            className="cursor-pointer text-[11.5px] font-semibold text-brand-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {sel.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-[#BFD9F2] bg-[#EFF3FB] px-[15px] py-[11px]">
          <span className="text-[12.5px] font-bold text-[#2F308C]">
            {sel.length} selected
          </span>
          <div className="flex-1" />
          <BulkButton onClick={() => bulk(() => setPriorityAction(sel, "HIGH"), "Priority set to high.")}>
            Set priority High
          </BulkButton>
          {can.reassign && (
            <BulkButton onClick={() => setReassigning(true)}>Reassign…</BulkButton>
          )}
          {can.delete && (
            <BulkButton danger onClick={() => bulk(() => deleteTasksAction(sel), "Deleted.")}>
              Delete
            </BulkButton>
          )}
          <button
            type="button"
            onClick={() => setSel([])}
            className="cursor-pointer px-2 py-1.5 text-[11.5px] font-semibold text-muted-500 hover:text-brand-700"
          >
            Clear
          </button>
        </div>
      )}

      {reassigning && (
        <div className="mb-3 rounded-[12px] border border-[#BFD9F2] bg-white px-[15px] py-[13px]">
          <p className="mb-2.5 text-[12px] font-bold text-navy-950">Reassign {sel.length} to</p>
          <div className="flex flex-wrap items-center gap-[7px]">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { void bulk(() => reassignTasksAction(sel, p.id), `Reassigned to ${p.name}.`); setReassigning(false); }}
                className="cursor-pointer rounded-full border border-line-400 bg-white px-[13px] py-[7px] text-[11.5px] font-semibold text-navy-700 hover:border-brand-500 hover:bg-brand-100 hover:text-brand-700"
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReassigning(false)}
              className="cursor-pointer px-2 py-1.5 text-[11.5px] font-semibold text-muted-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <Th className="w-[40px] pr-0">
                <Box
                  checked={sel.length > 0 && sel.length === shown.length}
                  onChange={() => setSel(sel.length === shown.length ? [] : shown.map((t) => t.id))}
                  label="Select all"
                />
              </Th>
              <Th>Task</Th>
              <Th>Location</Th>
              <Th>Assignee</Th>
              <Th>Due</Th>
              <Th>Priority</Th>
              <Th>Evidence</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const over = isOverdue(t, nowMs);
              return (
                <tr
                  key={t.id}
                  className={cn(
                    "hover:bg-surface-tint",
                    // A checklist task is a different animal, and reads like one.
                    t.kind === "CHECKLIST" && "bg-[#FAF8FE]",
                    over && "bg-bad-025",
                  )}
                >
                  <Td className="pr-0">
                    <Box
                      checked={sel.includes(t.id)}
                      onChange={() => setSel((s) => s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id])}
                      label={`Select ${t.taskNo}`}
                    />
                  </Td>
                  <Td>
                    <Link href={`/tasks/${t.id}`} className="block">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-navy-800 hover:text-brand-700">{t.title}</span>
                        {t.kind === "CHECKLIST" && (
                          <span className="rounded-full bg-[#EDE7FB] px-2 py-[2px] text-[9px] font-extrabold uppercase tracking-[.07em] text-[#5B3FA8]">
                            Checklist
                          </span>
                        )}
                      </span>
                      <span className="num mt-0.5 block text-[11px] font-medium text-muted-400">{t.taskNo}</span>
                    </Link>
                  </Td>
                  <Td className="text-[12.5px] font-medium text-muted-600">{t.location ?? "—"}</Td>
                  <Td className="text-[12.5px] font-semibold text-navy-700">{t.assignee}</Td>
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
                      {t.stage ?? STATUS_LABEL[t.status]}
                    </span>
                    {t.stageWho && (
                      <span className="mt-1 block text-[10.5px] font-medium text-muted-500">
                        with {t.stageWho}
                      </span>
                    )}
                    {t.extensionWaiting && (
                      <span className="mt-1 block text-[10px] font-bold text-warn-700">extension waiting</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <RowAction task={t} viewerId={viewerId} busy={busy} onRun={rowRun} />
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  {tasks.length === 0 ? TASK_EMPTY_NONE.title : TASK_EMPTY_FILTERED.title}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] font-medium text-muted-400">
        Status flow: Pending → Accepted → Started → Completed → Closed. A checklist task passes
        through Under Review and Under Approval first, and any fail sends it back for Rework.
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

/** The design's column head. */
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

/** The design's square select box. */
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

function BulkButton({
  children, onClick, danger,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-[8px] border px-[13px] py-2 text-[11.5px] font-bold transition-colors",
        danger
          ? "border-[#F2CBCB] bg-[#FCEDED] text-[#B23334] hover:bg-[#F8DBDB]"
          : "border-[#BFD9F2] bg-white text-[#0672A6] hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The design puts the next step on the row itself.
 *
 * Accepting and starting need nothing but a click, so they happen here; every
 * other step in the scope's lifecycle needs a remark, which belongs on the task
 * rather than in a list, so the row sends you there instead.
 */
function RowAction({
  task, viewerId, busy, onRun,
}: {
  task: Task;
  viewerId: string;
  busy: boolean;
  onRun: (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => void;
}) {
  const mine = task.assigneeId === viewerId;
  if (mine && task.status === "PENDING") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onRun(() => acceptTaskAction(task.id), "Task accepted.")}
        className="cursor-pointer rounded-[7px] bg-brand-500 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        Accept
      </button>
    );
  }
  if (mine && (task.status === "ACCEPTED" || task.status === "HOLD")) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onRun(() => startTaskAction(task.id), "Work started.")}
        className="cursor-pointer rounded-[7px] bg-brand-500 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        Start
      </button>
    );
  }
  return null;
}

