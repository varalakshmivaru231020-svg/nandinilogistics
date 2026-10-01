"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "@/components/shell/detail-screen";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createTaskAction } from "../actions";

interface Person { id: string; name: string; hint: string; keywords: string }

/**
 * Raising a task, on a page of its own.
 *
 * It was a modal, which is the wrong shape for a form that grows a checklist
 * and a column of review levels underneath it — the same reason an indent is
 * raised on its own screen.
 */
export function NewTaskForm({
  projects, people, checklists,
}: {
  projects: Array<{ id: string; code: string; name: string }>;
  people: Person[];
  checklists: Array<{ id: string; name: string; category: string; points: number }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [assigneeId, setAssigneeId] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  // Levels 2 and up. Level 1 is always the assignee, so it is derived rather
  // than stored — storing it would mean keeping two copies of one fact in step.
  const [extraReviewers, setExtraReviewers] = React.useState<string[]>([]);
  const [approvers, setApprovers] = React.useState<string[]>([]);
  const form = React.useRef<HTMLFormElement>(null);

  const options: SearchOption[] = people.map((p) => ({
    id: p.id, label: p.name, hint: p.hint, keywords: p.keywords,
  }));

  /**
   * The person doing the work reviews it first.
   *
   * Review level 1 is the assignee — they are the one who knows what was done —
   * and the levels above them are for whoever checks it. It follows whoever is
   * assigned, so it is read from that rather than kept alongside it.
   */
  const reviewers = assigneeId ? [assigneeId, ...extraReviewers] : extraReviewers;

  /** Nobody sits on two levels: a second look by the same person is not one. */
  const taken = new Set([...reviewers, ...approvers].filter(Boolean));
  const freeFor = (current: string) =>
    options.filter((o) => o.id === current || !taken.has(o.id));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set("assigneeId", assigneeId);
    for (const id of picked) fd.append("checklistIds", id);
    for (const id of reviewers) if (id) fd.append("reviewerIds", id);
    for (const id of approvers) if (id) fd.append("approverIds", id);

    const res = await createTaskAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast("Task raised.");
    router.push(`/tasks/${res.data.id}`);
  }

  return (
    <DetailScreen
      backHref="/tasks"
      title="New task"
      subtitle="Assigned to one person, who accepts it and owns it until it closes."
      actions={
        <Button loading={busy} onClick={() => form.current?.requestSubmit()}>
          Assign task
        </Button>
      }
    >
      <form ref={form} onSubmit={submit} className="mx-auto max-w-[900px] space-y-3.5 p-[26px]">
        {error && <Alert tone="error">{error}</Alert>}

        <Card>
          <CardHeader><CardTitle>The task</CardTitle></CardHeader>
          <CardBody className="space-y-3.5">
            <Field label="Title" required>
              <Input name="title" required maxLength={160} placeholder="Snag the 8th floor handover" />
            </Field>

            <Field label="Description">
              <Textarea name="description" rows={3} placeholder="Details and instructions" />
            </Field>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Assign to" required hint="Type a name, an employee code or a mobile number.">
                <SearchSelect
                  options={options}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  placeholder="Search people…"
                  required
                />
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
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              </Field>
              <Field label="Location" className="sm:col-span-2">
                <Input name="location" placeholder="Tower B · Fl 8" />
              </Field>
            </div>

            <Field label="Attachments">
              <input type="file" name="files" multiple className="text-[12px]" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
            <span className="text-xs text-muted-500">Optional — it adds review and approval levels</span>
          </CardHeader>
          <CardBody className="space-y-3.5">
            {checklists.length === 0 ? (
              <p className="text-[12.5px] font-medium text-muted-400">
                No active checklist in the master yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {checklists.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))
                    }
                    className={cn(
                      "cursor-pointer rounded-[10px] border px-3.5 py-2.5 text-left transition-colors",
                      picked.includes(c.id)
                        ? "border-brand-500 bg-brand-100"
                        : "border-line-400 bg-white hover:border-brand-500",
                    )}
                  >
                    <span className={cn(
                      "block text-[12.5px]",
                      picked.includes(c.id) ? "font-bold text-brand-700" : "font-semibold text-navy-900",
                    )}>
                      {c.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-muted-400">
                      {c.category} · {c.points} point{c.points === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {picked.length > 0 && (
              <div className="grid gap-5 border-t border-line-200 pt-4 sm:grid-cols-2">
                <Levels
                  label="Reviewers"
                  note="They check the work, in order. Level 1 is the person doing it."
                  value={reviewers}
                  lockedFirst={!!assigneeId}
                  onChange={(next) => setExtraReviewers(assigneeId ? next.slice(1) : next)}
                  optionsFor={freeFor}
                />
                <Levels
                  label="Approvers"
                  note="They sign it off after the reviews, in order. The last approval closes the task."
                  value={approvers}
                  onChange={setApprovers}
                  optionsFor={freeFor}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </form>
    </DetailScreen>
  );
}

/** One person per level, in order, and nobody twice. */
function Levels({
  label, note, value, onChange, optionsFor, lockedFirst = false,
}: {
  label: string;
  note: string;
  value: string[];
  onChange: (next: string[]) => void;
  optionsFor: (current: string) => SearchOption[];
  /** Review level 1 follows the assignee, so it is shown but not editable. */
  lockedFirst?: boolean;
}) {
  return (
    <div>
      <p className="text-[11.5px] font-bold text-navy-900">{label}</p>
      <p className="mb-2.5 text-[11px] font-medium text-muted-400">{note}</p>

      {value.map((v, i) => (
        <div key={i} className="mb-2 flex items-start gap-2">
          <span className="mt-2.5 w-[46px] shrink-0 text-[11px] font-semibold text-muted-500">
            Level {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            {lockedFirst && i === 0 ? (
              <div className="rounded-[9px] border border-line-400 bg-surface-field px-3 py-2.5 text-[12.5px] font-semibold text-navy-700">
                {optionsFor(v).find((o) => o.id === v)?.label ?? "The assignee"}
                <span className="ml-1.5 text-[11px] font-medium text-muted-400">· the assignee</span>
              </div>
            ) : (
              <SearchSelect
                options={optionsFor(v)}
                value={v}
                onChange={(id) => onChange(value.map((x, xi) => (xi === i ? id : x)))}
                placeholder="Search people…"
              />
            )}
          </div>
          {!(lockedFirst && i === 0) && (
            <button
              type="button"
              onClick={() => onChange(value.filter((_, xi) => xi !== i))}
              className="mt-1.5 shrink-0 cursor-pointer rounded-[7px] border border-line-400 px-2 py-1.5 text-[10.5px] font-semibold text-muted-600 hover:border-bad-600 hover:text-bad-600"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="mt-1 cursor-pointer rounded-[8px] border border-dashed border-line-400 px-3 py-2 text-[11.5px] font-bold text-brand-700 hover:border-brand-500"
      >
        + Add level {value.length + 1}
      </button>
    </div>
  );
}
