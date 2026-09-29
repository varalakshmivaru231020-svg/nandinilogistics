"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskKind, TaskPriority, TaskStatus } from "@prisma/client";

import { Alert, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";
import { STATUS_LABEL, isOverdue } from "@/lib/tasks/lifecycle";
import { createTaskAction } from "./actions";

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
  tasks, projects, people, checklists, filter, mine, nowMs, viewerId, can,
}: {
  tasks: Task[];
  projects: Array<{ id: string; code: string }>;
  people: Array<{ id: string; name: string }>;
  checklists: Array<{ id: string; name: string; category: string }>;
  filter: string;
  mine: "to" | "by" | null;
  nowMs: number;
  viewerId: string;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  function go(next: { filter?: string; mine?: string | null }) {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    const m = next.mine === undefined ? mine : next.mine;
    if (f && f !== "All") params.set("filter", f);
    if (m) params.set("mine", m);
    router.push(`/tasks${params.toString() ? `?${params}` : ""}`);
  }

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

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title={tasks.length === 0 ? "No tasks yet" : "Nothing matches"}
            description={
              tasks.length === 0
                ? "A task is raised against a person, with a due date and a priority."
                : "No task matches that filter."
            }
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
          {shown.map((t) => {
            const over = isOverdue(t, nowMs);
            return (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-150 px-[18px] py-[13px] last:border-0 hover:bg-surface-tint",
                  over && "bg-bad-025",
                )}
              >
                <span className="num w-[74px] shrink-0 text-[12px] font-bold text-navy-950">{t.taskNo}</span>

                <span className="min-w-[200px] flex-[2_1_240px]">
                  <span className="block truncate text-[12.5px] font-bold text-navy-950">{t.title}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] font-medium text-muted-500">
                    {t.projectCode ? `${t.projectCode} · ` : ""}
                    {t.location ?? "—"}
                    {t.kind === "CHECKLIST" && " · checklist"}
                  </span>
                </span>

                <span className="min-w-[130px] flex-1">
                  <span className="block text-[11.5px] font-semibold text-navy-600">{t.assignee}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-muted-400">by {t.assigner}</span>
                </span>

                <span className="w-[120px] shrink-0">
                  <span className={cn("block text-[11.5px] font-semibold", over ? "text-bad-600" : "text-navy-600")}>
                    {formatDateTime(t.dueAt)}
                  </span>
                  {over && <span className="mt-0.5 block text-[10.5px] font-bold text-bad-600">OVERDUE</span>}
                </span>

                <span className="w-[72px] shrink-0">
                  <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-bold", PRIORITY_PILL[t.priority])}>
                    {t.priority[0] + t.priority.slice(1).toLowerCase()}
                  </span>
                </span>

                <span className="w-[112px] shrink-0 text-right">
                  <span className={cn("rounded-full px-2.5 py-1 text-[10.5px] font-bold", STATUS_PILL[t.status])}>
                    {STATUS_LABEL[t.status]}
                  </span>
                  {t.extensionWaiting && (
                    <span className="mt-1 block text-[10px] font-bold text-warn-700">extension waiting</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}

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
