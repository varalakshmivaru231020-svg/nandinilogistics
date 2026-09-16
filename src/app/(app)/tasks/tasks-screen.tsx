"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ListNote } from "@/components/list/list-note";
import { cn } from "@/lib/utils";
import { advanceLabel, STATUS_LABEL } from "@/lib/tasks/flow";
import {
  advanceTaskAction, advanceTasksAction, assignTaskAction, createTaskAction,
  deleteTasksAction, setTaskPriorityAction, updateTaskAction,
} from "./actions";

interface Task {
  id: string;
  taskNo: string;
  title: string;
  projectId: string | null;
  projectCode: string | null;
  location: string | null;
  assigneeId: string;
  assignee: string;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  evidence: string | null;
}

type Lookup = Array<{ id: string; name?: string; code?: string }>;

const FILTERS = ["All", "Open", "In Progress", "Submitted", "Overdue"];

const STATUS_PILL: Record<TaskStatus, string> = {
  OPEN: "bg-[#EEF1F9] text-[#4A5077]",
  IN_PROGRESS: "bg-brand-100 text-brand-700",
  SUBMITTED: "bg-[#EFE9FC] text-[#6A46C8]",
  APPROVED: "bg-good-050 text-good-700",
  REOPENED: "bg-[#FDEEE7] text-[#C05621]",
};

const PRIORITY_PILL: Record<TaskPriority, string> = {
  HIGH: "bg-bad-050 text-bad-700",
  MEDIUM: "bg-warn-050 text-warn-700",
  LOW: "bg-surface-hover text-navy-500",
};

const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
const PRIORITY_LABEL: Record<TaskPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

const COLUMNS = ["Task", "Location", "Assignee", "Due", "Priority", "Evidence", "Status", "Actions"];

/** The design's short due date: "04 Sep". */
function dueLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function isOverdue(task: Task, nowMs: number) {
  if (!task.dueDate || task.status === "APPROVED") return false;
  return new Date(task.dueDate).getTime() < nowMs;
}

export function TasksScreen({
  tasks, projects, people, filter, nowMs, can,
}: {
  tasks: Task[];
  projects: Lookup;
  people: Lookup;
  filter: string;
  nowMs: number;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<Task | "new" | null>(null);
  const [reassigning, setReassigning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const active = FILTERS.includes(filter) ? filter : "All";

  function pickFilter(f: string) {
    const sp = new URLSearchParams(params.toString());
    if (f === "All") sp.delete("filter");
    else sp.set("filter", f);
    setSelected([]);
    router.push(sp.toString() ? `/tasks?${sp.toString()}` : "/tasks");
  }

  function countFor(f: string) {
    if (f === "All") return tasks.length;
    if (f === "Overdue") return tasks.filter((t) => isOverdue(t, nowMs)).length;
    return tasks.filter((t) => STATUS_LABEL[t.status] === f).length;
  }

  const rows = tasks.filter((t) =>
    active === "All" ? true
    : active === "Overdue" ? isOverdue(t, nowMs)
    : STATUS_LABEL[t.status] === active);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", "bad"); return; }
    setSelected([]);
    setReassigning(false);
    toast(done);
    router.refresh();
  }

  const allPicked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  return (
    <div className="animate-fade-up">
      <div className="mb-[15px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-[7px]">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => pickFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition-colors",
                active === f
                  ? "border-brand-500 bg-brand-100 text-brand-700"
                  : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
              )}
            >
              {f} <span className="num font-semibold opacity-65">{countFor(f)}</span>
            </button>
          ))}
        </div>
        {can.create && (
          <Button size="md" onClick={() => setEditing("new")}>+ New task</Button>
        )}
      </div>

      {selected.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-[#BFD9F2] bg-surface-hover px-[15px] py-[11px]">
            <span className="text-[12.5px] font-bold text-navy-800">
              {selected.length} selected
            </span>
            <div className="flex-1" />
            {can.update && (
              <BulkButton onClick={() => run(() => advanceTasksAction(selected), "Tasks advanced")} busy={busy}>
                Advance stage
              </BulkButton>
            )}
            {can.update && (
              <BulkButton onClick={() => run(() => setTaskPriorityAction(selected, "HIGH"), "Priority set to high")} busy={busy}>
                Set priority High
              </BulkButton>
            )}
            {can.assign && (
              <BulkButton onClick={() => setReassigning((r) => !r)} busy={busy}>Reassign…</BulkButton>
            )}
            {can.delete && (
              <BulkButton onClick={() => run(() => deleteTasksAction(selected), "Tasks deleted")} busy={busy}>
                Delete
              </BulkButton>
            )}
            <button
              type="button"
              onClick={() => { setSelected([]); setReassigning(false); }}
              className="px-2 py-1.5 text-[11.5px] font-semibold text-muted-600 hover:text-brand-700"
            >
              Clear
            </button>
          </div>

          {reassigning && (
            <div className="mb-3 rounded-[12px] border border-[#BFD9F2] bg-white px-[15px] py-[13px]">
              <p className="mb-[9px] text-[12px] font-bold text-navy-950">
                Reassign {selected.length} selected to
              </p>
              <div className="flex flex-wrap items-center gap-[7px]">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => run(() => assignTaskAction(selected, p.id), `Reassigned to ${p.name}`)}
                    className="rounded-full border border-line-400 bg-white px-[13px] py-[7px] text-[11.5px] font-semibold text-navy-600 hover:border-brand-500 hover:bg-brand-100 hover:text-brand-700"
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setReassigning(false)}
                  className="px-2 py-1.5 text-[11.5px] font-semibold text-muted-600 hover:text-brand-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              <th className="w-10 border-b border-line-300 py-3 pl-4 text-left">
                <CheckBox
                  checked={allPicked}
                  onChange={() => setSelected(allPicked ? [] : rows.map((r) => r.id))}
                  label="Select all"
                />
              </th>
              {COLUMNS.map((h) => (
                <th
                  key={h}
                  className={cn(
                    "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                    h === "Actions" ? "text-right" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const overdue = isOverdue(t, nowMs);
              return (
                <tr
                  key={t.id}
                  className={cn("border-b border-[#F0F3FA] last:border-0 hover:bg-surface-tint", overdue && "bg-[#FEF7F7]")}
                >
                  <td className="py-[13px] pl-4">
                    <CheckBox
                      checked={selected.includes(t.id)}
                      onChange={() =>
                        setSelected((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))
                      }
                      label={`Select ${t.taskNo}`}
                    />
                  </td>
                  <td className="px-4 py-[13px]">
                    <div className="text-[13px] font-semibold text-navy-900">{t.title}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-muted-400">{t.taskNo}</div>
                  </td>
                  <td className="px-4 py-[13px] text-[12.5px] font-medium text-navy-500">
                    {[t.projectCode, t.location].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-[13px] text-[12.5px] font-semibold text-navy-600">{t.assignee}</td>
                  <td className="px-4 py-[13px]">
                    <span
                      className={cn(
                        "text-[12px] font-semibold",
                        overdue ? "rounded-[7px] bg-bad-050 px-[9px] py-1 text-bad-600" : "text-navy-600",
                      )}
                    >
                      {t.dueDate ? dueLabel(t.dueDate) : "—"}
                      {overdue && " · overdue"}
                    </span>
                  </td>
                  <td className="px-4 py-[13px]">
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", PRIORITY_PILL[t.priority])}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-[13px] text-[12px] font-medium text-navy-500">{t.evidence ?? "—"}</td>
                  <td className="px-4 py-[13px]">
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", STATUS_PILL[t.status])}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-[13px]">
                    <div className="flex justify-end gap-1.5">
                      {can.update && (
                        <button
                          type="button"
                          onClick={() => run(() => advanceTaskAction(t.id), `${t.taskNo} moved on`)}
                          className="whitespace-nowrap rounded-[7px] bg-brand-500 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-brand-600"
                        >
                          {advanceLabel(t.status)}
                        </button>
                      )}
                      {can.update && (
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          className="rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-navy-500 hover:border-brand-500 hover:text-brand-700"
                        >
                          Edit
                        </button>
                      )}
                      {can.delete && (
                        <button
                          type="button"
                          onClick={() => run(() => deleteTasksAction([t.id]), `${t.taskNo} deleted`)}
                          aria-label={`Delete ${t.taskNo}`}
                          className="px-1 text-[13px] font-semibold text-muted-300 hover:text-bad-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  No tasks here
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <ListNote>
        Status flow: Open → In Progress → Submitted for Review → Approved / Reopened. Overdue tasks
        escalate to PM and Owner after 2 days.
      </ListNote>

      {editing && (
        <TaskDrawer
          task={editing === "new" ? null : editing}
          projects={projects}
          people={people}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); toast(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function BulkButton({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-[8px] border border-line-400 bg-white px-3 py-[7px] text-[11.5px] font-semibold text-navy-600 hover:border-brand-500 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={label}
      aria-pressed={checked}
      className={cn(
        "grid h-[17px] w-[17px] place-items-center rounded-[5px] border text-[11px] font-bold",
        checked ? "border-brand-500 bg-brand-500 text-white" : "border-line-400 bg-white text-transparent",
      )}
    >
      ✓
    </button>
  );
}

/* -------------------------------- Drawer ---------------------------------- */

function TaskDrawer({
  task, projects, people, onClose, onSaved,
}: {
  task: Task | null;
  projects: Lookup;
  people: Lookup;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [projectId, setProjectId] = React.useState(task?.projectId ?? "");
  const [assigneeId, setAssigneeId] = React.useState(task?.assigneeId ?? "");
  const [priority, setPriority] = React.useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(fd: FormData) {
    fd.set("projectId", projectId);
    fd.set("assigneeId", assigneeId);
    fd.set("priority", priority);
    setBusy(true);
    setError(null);
    const res = task ? await updateTaskAction(task.id, fd) : await createTaskAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved(task ? "Task updated." : "Task created.");
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[96] bg-[rgba(25,26,92,.38)]" />
      <div className="fixed inset-y-0 right-0 z-[97] flex w-[470px] max-w-[94vw] flex-col bg-white shadow-[-24px_0_60px_rgba(25,26,92,.2)]">
        <div className="shrink-0 border-b border-line-200 px-[22px] py-[18px]">
          <p className="font-display text-[16px] font-bold text-navy-950">
            {task ? `Edit ${task.taskNo}` : "New task"}
          </p>
          <p className="mt-[3px] text-[11.5px] font-medium text-muted-600">
            New tasks start as Open and move Open → In Progress → Submitted → Approved
          </p>
        </div>

        <form id="task-form" action={submit} className="flex-1 overflow-y-auto px-[22px] py-5">
          {error && (
            <p className="mb-3 rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-semibold text-bad-700">{error}</p>
          )}

          <FieldLabel required>Task title</FieldLabel>
          <Input name="title" defaultValue={task?.title} placeholder="Slab shuttering — 8th floor" required autoFocus />

          <div className="mt-3.5">
            <FieldLabel optional>Project</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => (
                <Chip key={p.id} picked={projectId === p.id} onClick={() => setProjectId(projectId === p.id ? "" : p.id)}>
                  {p.code}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-3.5">
            <FieldLabel optional>Location</FieldLabel>
            <Input name="location" defaultValue={task?.location ?? ""} placeholder="Tower B · Fl 8" />
          </div>

          <div className="mt-3.5">
            <FieldLabel required>Assignee</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <Chip key={p.id} picked={assigneeId === p.id} onClick={() => setAssigneeId(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-3.5">
            <FieldLabel>Due</FieldLabel>
            <Input type="date" name="dueDate" defaultValue={task?.dueDate ? task.dueDate.slice(0, 10) : ""} />
          </div>

          <div className="mt-3.5">
            <FieldLabel>Priority</FieldLabel>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <Chip key={p} picked={priority === p} onClick={() => setPriority(p)}>
                  {PRIORITY_LABEL[p]}
                </Chip>
              ))}
            </div>
          </div>
        </form>

        <div className="flex shrink-0 justify-end gap-[9px] border-t border-line-200 bg-surface-sunken px-[22px] py-4">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="task-form" loading={busy} disabled={!assigneeId}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </div>
    </>
  );
}

function FieldLabel({ children, required, optional }: { children: React.ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <p className="mb-[5px] text-[11px] font-semibold text-muted-600">
      {children}
      {required && <span className="text-bad-600"> *</span>}
      {optional && <span className="font-medium text-muted-300"> · optional</span>}
    </p>
  );
}

function Chip({ children, picked, onClick }: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold transition-colors",
        picked
          ? "border-brand-500 bg-brand-100 text-brand-700"
          : "border-line-400 bg-white text-navy-600 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}
