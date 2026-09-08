"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { createProjectAction } from "./actions";

type Lookup = Array<{ id: string; name: string }>;

export function NewProjectButton({
  types, companies, cities, managers,
}: { types: Lookup; companies: Lookup; cities: Lookup; managers: Lookup }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createProjectAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else { setOpen(false); router.push(`/projects/${res.data.id}`); }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        New project
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="New project"
          description="Every task, checklist, indent, purchase order and unit in the system belongs to a project created here."
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" form="project-form" loading={busy}>Create project</Button>
            </>
          }
        >
          <form id="project-form" onSubmit={onSubmit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project code" required hint="Short, used in every document number.">
                <Input name="code" required className="uppercase" placeholder="NNS" />
              </Field>
              <Field label="Project name" required>
                <Input name="name" required placeholder="NN Skyline" />
              </Field>

              <Field label="Project type" required>
                <Select name="projectTypeId" required defaultValue="">
                  <option value="">Select…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Company">
                <Select name="companyId" defaultValue="">
                  <option value="">— None —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>

              <Field label="City">
                <Select name="cityId" defaultValue="">
                  <option value="">— None —</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Project manager">
                <Select name="projectManagerId" defaultValue="">
                  <option value="">— Unassigned —</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Field>

              <Field label="Site address" className="sm:col-span-2">
                <Textarea name="addressLine" rows={2} />
              </Field>

              <Field label="RERA number" className="sm:col-span-2">
                <Input name="reraNumber" placeholder="PRM/KA/RERA/…" />
              </Field>

              <Field label="Land area (sq.ft)">
                <Input name="landArea" type="number" step="any" min={0} />
              </Field>
              <Field label="Sanctioned budget (₹)">
                <Input name="budgetAmount" type="number" step="any" min={0} />
              </Field>

              <Field label="Towers">
                <Input name="totalTowers" type="number" min={0} defaultValue={0} />
              </Field>
              <Field label="Floors per tower">
                <Input name="totalFloors" type="number" min={0} defaultValue={0} />
              </Field>

              <Field label="Start date">
                <Input name="startDate" type="date" />
              </Field>
              <Field label="Target completion">
                <Input name="targetDate" type="date" />
              </Field>

              <Field label="Description" className="sm:col-span-2">
                <Textarea name="description" rows={2} />
              </Field>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
