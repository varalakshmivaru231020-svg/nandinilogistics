"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "@/components/shell/detail-screen";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { useToast } from "@/components/ui/toast";
import { createTaskAction } from "../actions";

interface Person { id: string; name: string; hint: string; keywords: string }

/**
 * Raising a task, on a page of its own: a title, a description, one or more
 * Team Leaders, a priority, a due date and any attachments.
 */
export function NewTaskForm({ people }: { people: Person[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [assignees, setAssignees] = React.useState<string[]>([""]);
  const form = React.useRef<HTMLFormElement>(null);

  const options: SearchOption[] = people.map((p) => ({
    id: p.id, label: p.name, hint: p.hint, keywords: p.keywords,
  }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    for (const id of assignees) if (id) fd.append("assigneeIds", id);

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
      subtitle="Assigned to one or more Team Leaders, who move it to In progress and Done."
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
              <Input name="title" required maxLength={160} placeholder="Collect pending KYC from Peeko riders" />
            </Field>

            <Field label="Description">
              <Textarea name="description" rows={3} placeholder="Details and instructions" />
            </Field>

            <AssigneePicker options={options} value={assignees} onChange={setAssignees} />

            <div className="grid gap-3.5 sm:grid-cols-2">
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
            </div>

            <Field label="Attachments">
              <input type="file" name="files" multiple className="text-[12px]" />
            </Field>
          </CardBody>
        </Card>
      </form>
    </DetailScreen>
  );
}

/** One Team Leader a line, and nobody twice. */
export function AssigneePicker({
  options, value, onChange,
}: {
  options: SearchOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const taken = new Set(value.filter(Boolean));
  const freeFor = (current: string) => options.filter((o) => o.id === current || !taken.has(o.id));

  return (
    <div>
      <p className="text-[11.5px] font-bold text-navy-900">
        Assign to <span className="text-bad-600">*</span>
      </p>
      <p className="mb-2.5 text-[11px] font-medium text-muted-400">One or more Team Leaders.</p>

      {value.map((v, i) => (
        <div key={i} className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <SearchSelect
              options={freeFor(v)}
              value={v}
              onChange={(id) => onChange(value.map((x, xi) => (xi === i ? id : x)))}
              placeholder="Search people…"
              required={i === 0}
            />
          </div>
          {value.length > 1 && (
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
        + Add another Team Leader
      </button>
    </div>
  );
}
