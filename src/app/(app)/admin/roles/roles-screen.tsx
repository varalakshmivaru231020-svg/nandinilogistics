"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Pencil, Plus, Power, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import {
  cloneRoleAction, createRoleAction, deleteRoleAction,
  toggleRoleStatusAction, updateRoleAction,
} from "../actions";

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: number;
  isSystem: boolean;
  status: string;
  userCount: number;
  permissionCount: number;
}

export function RolesScreen({
  roles,
  totalPermissions,
  can,
}: {
  roles: RoleRow[];
  totalPermissions: number;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<RoleRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [cloning, setCloning] = React.useState<RoleRow | null>(null);
  const [deleting, setDeleting] = React.useState<RoleRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onToggle(row: RoleRow) {
    setBusy(true);
    const res = await toggleRoleStatusAction(row.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await deleteRoleAction(deleting.id);
    setBusy(false);
    setDeleting(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  const columns: Column<RoleRow>[] = [
    {
      key: "name",
      header: "Role",
      render: (r) => (
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/roles/${r.id}`} className="font-medium text-navy-950 hover:text-brand-600">
              {r.name}
            </Link>
            {r.isSystem && <Badge tone="brand">System</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-500">{r.description ?? r.code}</p>
        </div>
      ),
    },
    { key: "code", header: "Code", render: (r) => <code className="text-xs text-muted-600">{r.code}</code> },
    {
      key: "level",
      header: "Authority",
      align: "center",
      render: (r) => <span className="num text-xs text-muted-600">{r.level}</span>,
    },
    {
      key: "permissions",
      header: "Permissions",
      align: "right",
      render: (r) => (
        <Link href={`/admin/roles/${r.id}`} className="num inline-flex items-center gap-1.5 text-sm hover:text-brand-600">
          <span className="font-medium">{r.permissionCount}</span>
          <span className="text-xs text-muted-400">/ {totalPermissions}</span>
        </Link>
      ),
    },
    {
      key: "users",
      header: "Users",
      align: "right",
      render: (r) => (
        <span className="num inline-flex items-center gap-1 text-sm text-muted-600">
          <Users className="h-3.5 w-3.5 text-muted-400" />
          {r.userCount}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (r) =>
        r.status === "ACTIVE" ? <Badge tone="good">Active</Badge> : <Badge tone="slate">Inactive</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          {can.managePermissions && (
            <Link
              href={`/admin/roles/${r.id}`}
              className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600"
              title="Edit permissions"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Link>
          )}
          {can.update && (
            <button type="button" onClick={() => setEditing(r)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600" title="Edit role">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {can.clone && (
            <button type="button" onClick={() => setCloning(r)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600" title="Clone role">
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {can.toggleStatus && (
            <button type="button" onClick={() => onToggle(r)} disabled={busy} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-warn-700" title="Activate / deactivate">
              <Power className="h-3.5 w-3.5" />
            </button>
          )}
          {can.delete && !r.isSystem && (
            <button type="button" onClick={() => setDeleting(r)} className="rounded p-1.5 text-muted-400 hover:bg-bad-050 hover:text-bad-600" title="Delete role">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}

      {can.create && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New role
          </Button>
        </div>
      )}

      <DataTable columns={columns} rows={roles} rowKey={(r) => r.id} />

      {(creating || editing) && (
        <RoleForm
          role={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh(); }}
        />
      )}

      {cloning && (
        <CloneForm
          role={cloning}
          onClose={() => setCloning(null)}
          onSaved={() => { setCloning(null); router.refresh(); }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={busy}
        title="Delete role?"
        message={`"${deleting?.name}" will be removed permanently. This is blocked while any user still holds the role.`}
      />
    </div>
  );
}

function RoleForm({
  role, onClose, onSaved,
}: { role: RoleRow | null; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const isEdit = Boolean(role);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = isEdit ? await updateRoleAction(role!.id, fd) : await createRoleAction(fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${role!.name}` : "New role"}
      description="A role is a named permission set. Assign the permissions themselves on the role's own screen."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="role-form" loading={busy}>{isEdit ? "Save changes" : "Create role"}</Button>
        </>
      }
    >
      <form id="role-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Role code" required hint={role?.isSystem ? "System role codes cannot be changed." : "Uppercase letters, digits and underscores."}>
          <Input name="code" required defaultValue={role?.code ?? ""} disabled={role?.isSystem} className="uppercase" placeholder="SITE_ENGINEER" />
        </Field>

        <Field label="Display name" required>
          <Input name="name" required defaultValue={role?.name ?? ""} placeholder="Site Engineer" />
        </Field>

        <Field label="Description">
          <Textarea name="description" rows={2} defaultValue={role?.description ?? ""} />
        </Field>

        <Field label="Authority level" required hint="Lower number means higher authority. Owner is 10.">
          <Input name="level" type="number" min={1} max={999} required defaultValue={role?.level ?? 100} />
        </Field>
      </form>
    </Modal>
  );
}

function CloneForm({
  role, onClose, onSaved,
}: { role: RoleRow; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await cloneRoleAction(role.id, String(fd.get("name")), String(fd.get("code")));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Clone ${role.name}`}
      description={`Creates a new role carrying the same ${role.permissionCount} permissions, which you can then adjust.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="clone-form" loading={busy}>Create clone</Button>
        </>
      }
    >
      <form id="clone-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New role code" required>
          <Input name="code" required className="uppercase" defaultValue={`${role.code}_COPY`} />
        </Field>
        <Field label="New display name" required>
          <Input name="name" required defaultValue={`${role.name} (copy)`} />
        </Field>
      </form>
    </Modal>
  );
}
