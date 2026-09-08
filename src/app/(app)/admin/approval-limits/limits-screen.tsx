"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Field, Input, Select } from "@/components/ui/primitives";
import { money } from "@/lib/utils";
import { deleteApprovalLimitAction, upsertApprovalLimitAction } from "../actions";

interface LimitRow {
  id: string;
  scope: string;
  maxValue: number;
  roleName: string | null;
  userName: string | null;
}

export function ApprovalLimitsScreen({
  scopes, limits, roles, users, can,
}: {
  scopes: Array<{ value: string; label: string }>;
  limits: LimitRow[];
  roles: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const scopeLabel = new Map(scopes.map((s) => [s.value, s.label]));

  async function onDelete(id: string) {
    setBusy(true);
    const res = await deleteApprovalLimitAction(id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await upsertApprovalLimitAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else { setOpen(false); router.refresh(); }
  }

  const columns: Column<LimitRow>[] = [
    {
      key: "scope",
      header: "Approval chain",
      render: (l) => <span className="text-sm text-navy-900">{scopeLabel.get(l.scope) ?? l.scope}</span>,
    },
    {
      key: "who",
      header: "Applies to",
      render: (l) =>
        l.userName ? (
          <span className="flex items-center gap-1.5 text-sm">
            <Badge tone="navy">User</Badge> {l.userName}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm">
            <Badge tone="brand">Role</Badge> {l.roleName}
          </span>
        ),
    },
    {
      key: "value",
      header: "Ceiling",
      align: "right",
      className: "num",
      render: (l) => <span className="font-medium text-navy-950">{money(l.maxValue)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      visible: can.delete,
      render: (l) => (
        <button type="button" onClick={() => onDelete(l.id)} disabled={busy} className="rounded p-1.5 text-muted-400 hover:bg-bad-050 hover:text-bad-600" title="Remove limit">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}

      <Alert tone="info" title="How routing works">
        A user&rsquo;s ceiling is the highest of their roles&rsquo; ceilings, unless a personal limit is
        set for them — a personal limit replaces the role ceiling entirely.
      </Alert>

      {can.create && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Set a limit
          </Button>
        </div>
      )}

      <DataTable columns={columns} rows={limits} rowKey={(l) => l.id} />

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Set an approval limit"
          description="Choose a role for a broad rule, or a single user to override their role ceiling."
          size="sm"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" form="limit-form" loading={busy}>Save limit</Button>
            </>
          }
        >
          <form id="limit-form" onSubmit={onSubmit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="Approval chain" required>
              <Select name="scope" required defaultValue="">
                <option value="">Select…</option>
                {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>

            <Field label="Role" hint="Leave blank if you are setting a personal limit.">
              <Select name="roleId" defaultValue="">
                <option value="">— None —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>

            <Field label="Or specific user">
              <Select name="userId" defaultValue="">
                <option value="">— None —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>

            <Field label="Ceiling (₹)" required>
              <Input name="maxValue" type="number" min={1} step="1" required placeholder="500000" />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
