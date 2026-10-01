"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskKind, TaskPriority, TaskStatus } from "@prisma/client";

import { Alert, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";
import {
  acceptTaskAction, createTaskAction, deleteTasksAction, reassignTasksAction,
  setPriorityAction, startTaskAction,
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
}

const STATUS_PILL: Record<TaskStatus, string> = {
  PENDING: "bg-surface-field text-navy-600",
  ACCEPTED: "bg-brand-100 text-brand-700",
  STARTED: "bg-brand-100 text-brand-700",
  HOLD: "bg-warn-050 text-warn-800",
  COMPLETED: "bg-good-050 text-good-700",
  UNDER_REVIEW: "bg-warn-050 text-warn-800",
  REWORK: "bg-bad-050 text-bad-700",
  UNDER_APPROVAL: "bg-warn-050 text-warn-800",
  CLOSED: "bg-surface-field text-muted-600",
};

const PRIORITY_PILL: Record<TaskPriority, string> = {
  HIGH: "bg-bad-050 text-bad-700",
  MEDIUM: "bg-warn-050 text-warn-800",
  LOW: "bg-surface-field text-muted-600",
};

const FILTERS = ["All", "Overdue", ...Object.values(STATUS_LABEL)];

export function TasksScreen({
  tasks, projects, people, checklists, filter, mine, picked, summary, myScore, nowMs, viewerId, can,
}: {
  tasks: Task[];
  projects: Array<{ id: string; code: string }>;
  people: Array<{ id: string; name: string }>;
  checklists: Array<{ id: string; name: string; category: string }>;
  filter: string;
  mine: "to" | "by" | null;
  picked: { priority: string; assignee: string; assigner: string; from: string; to: string };
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
  const [creating, setCreating] = React.useState(false);
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

  function go(next: Partial<Record<"filter" | "mine" | "priority" | "assignee" | "assigner" | "from" | "to", string | null>>) {
    const params = new URLSearchParams();
    const now: Record<string, string | null> = {
      filter, mine, ...picked, ...next,
    };
    for (const [k, v] of Object.entries(now)) {
      if (!v) continue;
      if (k === "filter" && v === "All") continue;
      params.set(k, v);
    }
    router.push(`/tasks${params.toString() ? `?${params}` : ""}`);
  }

  const filtered =
    picked.priority || picked.assignee || picked.assigner || picked.from || picked.to;

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
        actions={can.create ? <Button onClick={() => setCreating(true)}>+ New task</Button> : undefined}
      />

      {/* The scope's §4.1 widgets. */}
      <div className="mb-3.5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat value={String(countFor("Overdue"))} label="Overdue" tone={countFor("Overdue") > 0 ? "bad" : undefined} />
        <Stat value={String(summary.dueToday)} label="Due today" />
        <Stat value={String(summary.dueThisWeek)} label="Due this week" />
        <Stat value={String(summary.pendingApprovals)} label="Waiting on you" tone={summary.pendingApprovals > 0 ? "warn" : undefined} />
        <Stat
          value={`${summary.high}/${summary.medium}/${summary.low}`}
          label="High / Med / Low"
        />
        {myScore && (
          <Stat
            value={myScore.score === null ? "—" : `${myScore.score}%`}
            label="Your score"
            hint={`${myScore.onTime} on time · ${myScore.late} late`}
            tone={myScore.score !== null && myScore.score < 70 ? "bad" : "good"}
          />
        )}
      </div>

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
            onClick={() => go({ priority: null, assignee: null, assigner: null, from: null, to: null })}
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
                <tr key={t.id} className={cn("hover:bg-surface-tint", over && "bg-bad-025")}>
                  <Td className="pr-0">
                    <Box
                      checked={sel.includes(t.id)}
                      onChange={() => setSel((s) => s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id])}
                      label={`Select ${t.taskNo}`}
                    />
                  </Td>
                  <Td>
                    <Link href={`/tasks/${t.id}`} className="block">
                      <span className="block text-[13px] font-semibold text-navy-800 hover:text-brand-700">{t.title}</span>
                      <span className="num mt-0.5 block text-[11px] font-medium text-muted-400">
                        {t.taskNo}{t.kind === "CHECKLIST" && " · checklist"}
                      </span>
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
                    <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-bold", STATUS_PILL[t.status])}>
                      {STATUS_LABEL[t.status]}
                    </span>
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
                  {tasks.length === 0
                    ? "No tasks yet — raise one against a person, with a due date and a priority."
                    : "No task matches that filter."}
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

      {creating && (
        <NewTaskModal
          projects={projects}
          people={people}
          checklists={checklists}
          viewerId={viewerId}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/** Raising a task, with the checklist and levels the scope adds for Module 2. */
function NewTaskModal({
  projects, people, checklists, viewerId, onClose,
}: {
  projects: Array<{ id: string; code: string }>;
  people: Array<{ id: string; name: string }>;
  checklists: Array<{ id: string; name: string; category: string }>;
  viewerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [reviewers, setReviewers] = React.useState<string[]>([]);
  const [approvers, setApprovers] = React.useState<string[]>([]);
  const form = React.useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    for (const id of picked) fd.append("checklistIds", id);
    for (const id of reviewers) if (id) fd.append("reviewerIds", id);
    for (const id of approvers) if (id) fd.append("approverIds", id);
    const res = await createTaskAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast("Task raised.");
    onClose();
    router.push(`/tasks/${res.data.id}`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New task"
      description="Assigned to one person, who accepts it and owns it until you close it."
      size="lg"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => form.current?.requestSubmit()}>Assign task</Button>
        </>
      }
    >
      <form ref={form} onSubmit={submit} className="space-y-3.5">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Title" required>
          <Input name="title" required maxLength={160} placeholder="Snag the 8th floor handover" />
        </Field>

        <Field label="Description">
          <Textarea name="description" rows={3} placeholder="Details and instructions" />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Assign to" required>
            <Select name="assigneeId" required defaultValue="">
              <option value="" disabled>Choose a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.id === viewerId ? `${p.name} (you)` : p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" required>
            <Select name="priority" defaultValue="MEDIUM">
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
          </Field>
          <Field label="Due date and time" required hint="Must be in the future.">
            <Input type="datetime-local" name="dueAt" required />
          </Field>
          <Field label="Project">
            <Select name="projectId" defaultValue="">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </Select>
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <Input name="location" placeholder="Tower B · Fl 8" />
          </Field>
        </div>

        <Field label="Attachments">
          <input type="file" name="files" multiple className="text-[12px]" />
        </Field>

        <div className="rounded-[11px] border border-line-300 bg-surface-sunken p-3.5">
          <p className="mb-2 text-[11.5px] font-bold text-navy-900">
            Checklist <span className="font-medium text-muted-500">· optional</span>
          </p>
          <p className="mb-2.5 text-[11px] font-medium text-muted-500">
            Pick one or more and the task passes through reviewers and approvers before it closes.
          </p>
          {checklists.length === 0 ? (
            <p className="text-[11.5px] font-medium text-muted-400">No active checklist in the master yet.</p>
          ) : (
            <div className="flex flex-wrap gap-[7px]">
              {checklists.map((c) => (
                <Chip
                  key={c.id}
                  picked={picked.includes(c.id)}
                  onClick={() => setPicked((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])}
                >
                  {c.name} <span className="opacity-60">· {c.category}</span>
                </Chip>
              ))}
            </div>
          )}

          {picked.length > 0 && (
            <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
              <LevelPicker label="Reviewers" people={people} value={reviewers} onChange={setReviewers} />
              <LevelPicker label="Approvers" people={people} value={approvers} onChange={setApprovers} />
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** One person per level, in order; the number of levels is chosen per task. */
function LevelPicker({
  label, people, value, onChange,
}: {
  label: string;
  people: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <p className="mb-[5px] text-[11px] font-semibold text-muted-600">{label}</p>
      {value.map((v, i) => (
        <div key={i} className="mb-1.5 flex items-center gap-2">
          <span className="w-[54px] shrink-0 text-[11px] font-semibold text-muted-500">Level {i + 1}</span>
          <Select
            value={v}
            onChange={(e) => onChange(value.map((x, xi) => (xi === i ? e.target.value : x)))}
            className="flex-1"
          >
            <option value="">Choose…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, xi) => xi !== i))}
            className="shrink-0 cursor-pointer rounded-[7px] border border-line-400 px-2 py-1 text-[10.5px] font-semibold text-muted-600"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="mt-1 cursor-pointer rounded-[8px] border border-dashed border-line-400 px-2.5 py-1.5 text-[11px] font-bold text-brand-700"
      >
        + Add level
      </button>
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

/** One of the design's stat tiles. */
function Stat({
  value, label, hint, tone,
}: { value: string; label: string; hint?: string; tone?: "bad" | "warn" | "good" }) {
  return (
    <div className={cn(
      "rounded-[12px] border px-3.5 py-3",
      tone === "bad" ? "border-bad-300 bg-bad-025"
        : tone === "warn" ? "border-warn-400 bg-warn-050"
          : tone === "good" ? "border-good-400 bg-good-050"
            : "border-line-400 bg-white",
    )}>
      <div className="num font-display text-[21px] font-extrabold text-navy-950">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-muted-500">{label}</div>
      {hint && <div className="mt-0.5 text-[10.5px] font-medium text-muted-400">{hint}</div>}
    </div>
  );
}
