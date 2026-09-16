"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createMasterAction, deleteMasterAction } from "./actions";
import { createUserAction, upsertApprovalLimitAction } from "@/app/(app)/admin/actions";
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
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
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
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
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

export function NewApprovalLimit({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await upsertApprovalLimitAction(fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setOpen(false);
    toast("Limit saved.");
    router.refresh();
  }

  return (
    <>
      <AddButton label="+ New limit" onClick={() => setOpen(true)} />
      {open && (
        <Modal
          open onClose={() => setOpen(false)} title="New approval limit" size="sm"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" form="new-limit" loading={busy}>Save</Button>
            </>
          }
        >
          <form id="new-limit" action={submit} className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Document" required>
              <Select name="scope" required defaultValue="">
                <option value="" disabled>Select…</option>
                <option value="material.indent">Indent</option>
                <option value="material.po">Purchase order</option>
              </Select>
            </Field>
            <Field label="Role" required>
              <Select name="roleId" required defaultValue="">
                <option value="" disabled>Select…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Approves up to" required>
              <Input name="maxValue" type="number" min={1} required />
            </Field>
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
  chips: Array<{ id: string; label: string; count?: number; canDelete: boolean }>;
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
            className="inline-flex items-center gap-[7px] rounded-full border border-line-400 bg-surface-field py-1.5 pl-3 pr-[7px] text-[11.5px] font-semibold text-navy-600"
          >
            {c.label}
            {c.count !== undefined && <span className="num opacity-60">{c.count}</span>}
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
          <Button onClick={add} loading={busy} disabled={!value.trim()}>{addLabel}</Button>
        </div>
      )}
    </>
  );
}
