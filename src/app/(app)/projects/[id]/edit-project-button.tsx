"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { updateProjectAction } from "../actions";

export interface ProjectEditValues {
  code: string; name: string; projectTypeId: string; cityId: string; addressLine: string;
  reraNumber: string; landArea: string; totalTowers: string; totalFloors: string;
  totalUnits: string; approvalDetails: string; startDate: string; targetDate: string;
  status: string;
}

const STATUSES = [
  ["PLANNING", "Planned"],
  ["ACTIVE", "Ongoing"],
  ["ON_HOLD", "On hold"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
] as const;

/** The design's "✎ Edit project", opening the project master for correction. */
export function EditProjectButton({
  projectId, values, types, cities,
}: {
  projectId: string;
  values: ProjectEditValues;
  types: Array<{ id: string; name: string }>;
  cities: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updateProjectAction(projectId, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else { setOpen(false); router.refresh(); }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-[7px] rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
      >
        ✎ Edit project
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit project"
        description="The project master — what every other screen reads from."
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="edit-project" loading={busy}>Save</Button>
          </>
        }
      >
        <form id="edit-project" onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}

          <Field label="Project name" required className="sm:col-span-2">
            <Input name="name" defaultValue={values.name} required />
          </Field>
          <Field label="Project code" required>
            <Input name="code" defaultValue={values.code} required />
          </Field>
          <Field label="Project type" required>
            <Select name="projectTypeId" defaultValue={values.projectTypeId}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <Input name="addressLine" defaultValue={values.addressLine} placeholder="Area, city" />
          </Field>
          <Field label="City">
            <Select name="cityId" defaultValue={values.cityId}>
              <option value="">—</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Land area">
            <Input name="landAreaText" defaultValue={values.landArea} placeholder="4.2 acres" />
          </Field>
          <Field label="RERA registration no." className="sm:col-span-2">
            <Input name="reraNumber" defaultValue={values.reraNumber} placeholder="PRM/KA/RERA/…" />
          </Field>
          <Field label="Approval details" className="sm:col-span-2">
            <Input name="approvalDetails" defaultValue={values.approvalDetails} placeholder="plan sanction ref." />
          </Field>
          <Field label="Towers / blocks">
            <Input name="totalTowers" type="number" defaultValue={values.totalTowers} />
          </Field>
          <Field label="Floors per tower">
            <Input name="totalFloors" type="number" defaultValue={values.totalFloors} />
          </Field>
          <Field label="Total units">
            <Input name="totalUnits" type="number" defaultValue={values.totalUnits} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={values.status}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Planned start">
            <Input name="startDate" type="date" defaultValue={values.startDate} />
          </Field>
          <Field label="Target completion">
            <Input name="targetDate" type="date" defaultValue={values.targetDate} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
