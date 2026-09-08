"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Pencil, Plus, Power, Search, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Field, Input, Select } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import {
  createUserAction, resetPasswordAction, toggleUserStatusAction, updateUserAction,
} from "../actions";

interface UserRow {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  department: string | null;
  designation: string | null;
  departmentId: string | null;
  designationId: string | null;
  roles: Array<{ id: string; name: string }>;
  projectCount: number;
  overrideCount: number;
}

type Lookup = Array<{ id: string; name: string }>;

export function UsersScreen({
  users, roles, departments, designations, can, query, currentUserId,
}: {
  users: UserRow[];
  roles: Lookup;
  departments: Lookup;
  designations: Lookup;
  can: Record<string, boolean>;
  query: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [resetting, setResetting] = React.useState<UserRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onToggle(row: UserRow) {
    setBusy(true);
    setError(null);
    const res = await toggleUserStatusAction(row.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "User",
      render: (u) => (
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/users/${u.id}`} className="font-medium text-navy-950 hover:text-brand-600">
              {u.name}
            </Link>
            {u.isSuperAdmin && <Badge tone="navy">Super admin</Badge>}
            {u.id === currentUserId && <Badge tone="brand">You</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-500">
            {u.employeeCode} · {u.email}
          </p>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (u) =>
        u.roles.length === 0 ? (
          <span className="text-xs text-warn-700">No role assigned</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.roles.map((r) => (
              <Badge key={r.id} tone="slate">{r.name}</Badge>
            ))}
          </div>
        ),
    },
    {
      key: "dept",
      header: "Department",
      render: (u) => (
        <div className="text-xs">
          <p className="text-navy-600">{u.designation ?? "—"}</p>
          <p className="text-muted-400">{u.department ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Access",
      align: "center",
      render: (u) => (
        <div className="num text-xs text-muted-600">
          <p>{u.projectCount} project(s)</p>
          {u.overrideCount > 0 && <p className="text-warn-700">{u.overrideCount} override(s)</p>}
        </div>
      ),
    },
    {
      key: "lastLogin",
      header: "Last sign-in",
      render: (u) => <span className="text-xs text-muted-500">{formatDateTime(u.lastLoginAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (u) =>
        u.status === "ACTIVE" ? <Badge tone="good">Active</Badge> : <Badge tone="slate">{u.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (u) => (
        <div className="flex items-center justify-end gap-0.5">
          <Link href={`/admin/users/${u.id}`} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600" title="Roles, permissions & projects">
            <ShieldCheck className="h-3.5 w-3.5" />
          </Link>
          {can.update && (
            <button type="button" onClick={() => setEditing(u)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {can.resetPassword && (
            <button type="button" onClick={() => setResetting(u)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-warn-700" title="Reset password">
              <KeyRound className="h-3.5 w-3.5" />
            </button>
          )}
          {can.toggleStatus && u.id !== currentUserId && (
            <button type="button" onClick={() => onToggle(u)} disabled={busy} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-bad-600" title="Activate / deactivate">
              <Power className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
          <Input
            defaultValue={query}
            placeholder="Search by name, email or employee code…"
            className="pl-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const sp = new URLSearchParams(params.toString());
                const v = (e.target as HTMLInputElement).value;
                if (v) sp.set("q", v); else sp.delete("q");
                router.push(`?${sp.toString()}`);
              }
            }}
          />
        </div>
        <div className="flex-1" />
        {can.create && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New user
          </Button>
        )}
      </div>

      <DataTable columns={columns} rows={users} rowKey={(u) => u.id} />

      {(creating || editing) && (
        <UserForm
          user={editing}
          roles={roles}
          departments={departments}
          designations={designations}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(msg) => { setCreating(false); setEditing(null); setNotice(msg); router.refresh(); }}
        />
      )}

      {resetting && (
        <ResetPasswordForm
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={(msg) => { setResetting(null); setNotice(msg); }}
        />
      )}
    </div>
  );
}

function UserForm({
  user, roles, departments, designations, onClose, onSaved,
}: {
  user: UserRow | null;
  roles: Lookup;
  departments: Lookup;
  designations: Lookup;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const isEdit = Boolean(user);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = isEdit ? await updateUserAction(user!.id, fd) : await createUserAction(fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved(isEdit ? "User updated." : "User created.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${user!.name}` : "New user"}
      description={isEdit ? undefined : "The user is asked to change this password at first sign-in."}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="user-form" loading={busy}>{isEdit ? "Save changes" : "Create user"}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee code" required>
            <Input name="employeeCode" required defaultValue={user?.employeeCode ?? ""} placeholder="NN-0007" />
          </Field>
          <Field label="Full name" required>
            <Input name="name" required defaultValue={user?.name ?? ""} />
          </Field>
          <Field label="Work email" required className="sm:col-span-2">
            <Input name="email" type="email" required defaultValue={user?.email ?? ""} />
          </Field>
          <Field label="Phone">
            <Input name="phone" type="tel" defaultValue={user?.phone ?? ""} />
          </Field>
          <Field label="Department">
            <Select name="departmentId" defaultValue={user?.departmentId ?? ""}>
              <option value="">— None —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Designation">
            <Select name="designationId" defaultValue={user?.designationId ?? ""}>
              <option value="">— None —</option>
              {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>

          {!isEdit && (
            <>
              <Field label="Initial role" hint="More roles can be added afterwards.">
                <Select name="roleId" defaultValue="">
                  <option value="">— None —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
              <Field
                label="Temporary password"
                required
                className="sm:col-span-2"
                hint="At least 10 characters with upper case, lower case, a digit and a symbol."
              >
                <Input name="password" type="text" required autoComplete="new-password" />
              </Field>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordForm({
  user, onClose, onSaved,
}: { user: UserRow; onClose: () => void; onSaved: (message: string) => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await resetPasswordAction(user.id, String(fd.get("password")));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved(`Password reset for ${user.name}. All their devices were signed out.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password — ${user.name}`}
      description="Every active session for this user is revoked immediately."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="reset-form" variant="warning" loading={busy}>Reset password</Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New temporary password" required hint="At least 10 characters with upper case, lower case, a digit and a symbol.">
          <Input name="password" type="text" required autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  );
}
