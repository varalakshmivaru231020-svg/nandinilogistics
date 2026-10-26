"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  addLeadFieldAction, createMasterAction, deleteLeadFieldAction, deleteMasterAction,
  updateLeadFieldAction,
} from "./actions";
import { createUserAction } from "@/app/(app)/admin/actions";
import { createEmploymentTypeAction, deleteEmploymentTypeAction } from "@/app/(app)/hr/actions";

/** The design's blue button at the head of a masters section. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
    >
      {label}
    </button>
  );
}

/* --------------------------- Record forms -------------------------------- */

/** A master with a code and a name — store, unit of measure, designation, lost reason. */
export function NewMasterRecord({
  masterKey, label, title, extra,
}: {
  masterKey: string;
  label: string;
  title: string;
  /** Extra fields the master requires, rendered under code and name. */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await createMasterAction(masterKey, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setOpen(false);
    toast(`${title} added.`);
    router.refresh();
  }

  return (
    <>
      <AddButton label={label} onClick={() => setOpen(true)} />
      {open && (
        <Modal
          open onClose={() => setOpen(false)} title={title} size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" form="master-record" loading={busy}>Save</Button>
            </>
          }
        >
          <form id="master-record" action={submit} className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Code" required><Input name="code" required autoFocus /></Field>
            <Field label="Name" required><Input name="name" required /></Field>
            {extra}
          </form>
        </Modal>
      )}
    </>
  );
}

export function NewUser({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await createUserAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setOpen(false);
    toast("User created.");
    router.refresh();
  }

  return (
    <>
      <AddButton label="+ New user" onClick={() => setOpen(true)} />
      {open && (
        <Modal
          open onClose={() => setOpen(false)} title="New user" size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" form="new-user" loading={busy}>Save</Button>
            </>
          }
        >
          <form id="new-user" action={submit} className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Name" required><Input name="name" required autoFocus /></Field>
            <Field label="Email" required><Input name="email" type="email" required /></Field>
            <Field label="Employee code" required><Input name="employeeCode" required /></Field>
            <Field label="Role" required>
              <Select name="roleId" required defaultValue="">
                <option value="" disabled>Select…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Password" required><Input name="password" type="password" required /></Field>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------- Chip rows -------------------------------- */

/**
 * The design's chip row with its own add field — lost reasons, designations and
 * employment types are all edited this way.
 */
export function ChipEditor({
  chips, placeholder, addLabel, kind, canAdd, canDelete,
}: {
  chips: Array<{ id: string; label: string; count?: number; canDelete: boolean; tone?: string }>;
  placeholder: string;
  addLabel: string;
  /** Employment types have their own table; everything else is a master. */
  kind: { master: string } | { employmentType: true };
  canAdd: boolean;
  canDelete: boolean;
}) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  async function add() {
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    let res;
    if ("employmentType" in kind) {
      res = await createEmploymentTypeAction(name);
    } else {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("code", name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 20));
      res = await createMasterAction(kind.master, fd);
    }
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    setValue("");
    router.refresh();
  }

  async function remove(id: string) {
    const res = "employmentType" in kind
      ? await deleteEmploymentTypeAction(id)
      : await deleteMasterAction(kind.master, id);
    if (!res.ok) { toast(res.error, "bad"); return; }
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-[7px]">
        {chips.map((c) => (
          <span
            key={c.id}
            className={cn(
              "inline-flex items-center gap-[7px] rounded-full border py-1.5 pl-3 pr-[7px] text-[11.5px] font-semibold",
              c.tone ?? "border-line-400 bg-surface-field text-navy-600",
            )}
          >
            {c.label}
            {c.count !== undefined && <span className="num opacity-60">· {c.count}</span>}
            {canDelete && c.canDelete && (
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label={`Remove ${c.label}`}
                className="grid h-4 w-4 place-items-center rounded-full bg-line-300 text-[10px] font-semibold text-muted-600 hover:bg-bad-050 hover:text-bad-600"
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>
      {canAdd && (
        <div className="mt-3 flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-[210px]"
          />
          <Button onClick={add} loading={busy}>{addLabel}</Button>
        </div>
      )}
    </>
  );
}

/* --------------------------- Lead form fields ------------------------------ */

export interface LeadFieldRow {
  id: string;
  label: string;
  type: string;
  required: boolean;
  isSystem: boolean;
  /** What a dropdown offers, when the field is one — shown as the design shows it. */
  options: string | null;
}

const LEAD_FIELD_TYPES = [
  ["TEXT", "Text"], ["PHONE", "Phone"], ["EMAIL", "Email"], ["NUMBER", "Number"],
  ["DROPDOWN", "Dropdown"], ["DESCRIPTION", "Description"], ["CHECKBOX", "Checkbox"], ["DATE", "Date"],
] as const;

const FIELD_SELECT =
  "rounded-[8px] border border-line-400 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-600 outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-surface-field disabled:text-muted-400";

/**
 * The design's Lead Settings: click a field's type or its mandatory pill to
 * change it, remove one that is not a system field, and add your own at the
 * bottom. What this list says is what the Capture-lead form asks.
 */
export function LeadFieldEditor({
  fields, canEdit, canAdd, canDelete,
}: {
  fields: LeadFieldRow[];
  canEdit: boolean;
  canAdd: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState("TEXT");
  const [required, setRequired] = React.useState(false);

  async function patch(id: string, next: { type?: string; required?: boolean }) {
    setBusy(id);
    const res = await updateLeadFieldAction(id, next);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await deleteLeadFieldAction(id);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    router.refresh();
  }

  async function add() {
    const name = label.trim();
    if (!name) return;
    setBusy("new");
    const res = await addLeadFieldAction(name, type, required);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    setLabel("");
    setType("TEXT");
    setRequired(false);
    router.refresh();
  }

  return (
    <>
      {fields.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-[9px] border-b border-line-200 py-[9px] last:border-0">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-navy-900">
            {f.label}
            {f.isSystem && (
              <span className="rounded-full bg-surface-hover px-2 py-[3px] text-[8.5px] font-bold tracking-[.07em] text-navy-800">
                SYSTEM
              </span>
            )}
          </span>
          <span className="flex-1" />
          {f.options && (
            <span className="max-w-[240px] truncate text-[11px] font-medium text-muted-400" title={f.options}>
              {f.options}
            </span>
          )}
          <select
            value={f.type}
            disabled={!canEdit || f.isSystem || busy === f.id}
            onChange={(e) => patch(f.id, { type: e.target.value })}
            className={FIELD_SELECT}
          >
            {LEAD_FIELD_TYPES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <button
            type="button"
            disabled={!canEdit || busy === f.id}
            onClick={() => patch(f.id, { required: !f.required })}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-colors",
              canEdit ? "cursor-pointer" : "cursor-default",
              f.required ? "bg-bad-050 text-bad-700" : "bg-surface-field text-muted-600",
            )}
          >
            {f.required ? "Mandatory" : "Optional"}
          </button>
          {canDelete && !f.isSystem && (
            <button
              type="button"
              disabled={busy === f.id}
              onClick={() => remove(f.id)}
              aria-label={`Remove ${f.label}`}
              className="cursor-pointer px-1 text-[13px] font-bold text-muted-400 transition-colors hover:text-bad-600"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {canAdd && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New field label"
            className="min-w-[180px] flex-1 rounded-[9px] border border-line-400 bg-white px-3 py-2 text-[12.5px] font-medium text-navy-900 outline-none focus:border-brand-500"
          />
          <select value={type} onChange={(e) => setType(e.target.value)} className={cn(FIELD_SELECT, "py-2")}>
            {LEAD_FIELD_TYPES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setRequired((r) => !r)}
            className={cn(
              "cursor-pointer rounded-full px-2.5 py-1 text-[10.5px] font-bold",
              required ? "bg-bad-050 text-bad-700" : "bg-surface-field text-muted-600",
            )}
          >
            {required ? "Mandatory" : "Optional"}
          </button>
          <button
            type="button"
            disabled={busy === "new"}
            onClick={add}
            className="cursor-pointer rounded-[9px] bg-brand-500 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            + Add field
          </button>
        </div>
      )}
    </>
  );
}
