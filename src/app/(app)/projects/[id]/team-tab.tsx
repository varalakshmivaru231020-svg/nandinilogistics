"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Badge, Card, CardBody, CardHeader, CardTitle, Field, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { mapUserToProjectAction, removeUserFromProjectAction } from "../actions";

interface Member {
  id: string; userId: string; name: string; email: string;
  designation: string | null; status: string; isProjectManager: boolean;
}

export function TeamTab({
  projectId, members, assignable, can,
}: {
  projectId: string;
  members: Member[];
  assignable: Array<{ id: string; name: string; email: string; designation: string | null }>;
  can: { assign: boolean; remove: boolean };
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<Member | null>(null);
  const [userId, setUserId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function add() {
    setBusy(true);
    const res = await mapUserToProjectAction(projectId, userId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setAdding(false); setUserId(""); setError(null); router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const res = await removeUserFromProjectAction(projectId, removing.userId);
    setBusy(false);
    if (!res.ok) { setError(res.error); setRemoving(null); return; }
    setRemoving(null); setError(null); router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Project team ({members.length})</CardTitle>
          <span className="text-xs text-muted-500">Access follows this mapping.</span>
        </div>
        {can.assign && assignable.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => { setAdding(true); setError(null); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Map user
          </Button>
        )}
      </CardHeader>

      <CardBody className="p-0">
        {error && !adding && (
          <p className="border-b border-bad-050 bg-bad-050 px-4 py-2.5 text-[12px] font-bold text-bad-600">{error}</p>
        )}

        {members.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-muted-500">Nobody mapped yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] font-medium text-muted-400">
              Until someone is mapped, only users who can access every project will see this one.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line-200">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-navy-900">
                    {m.name}
                    {m.isProjectManager && <Badge tone="brand">Project manager</Badge>}
                  </p>
                  <p className="text-xs text-muted-500">
                    {m.designation ?? "—"} · {m.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={m.status === "ACTIVE" ? "good" : "slate"}>{m.status}</Badge>
                  {can.remove && !m.isProjectManager && (
                    <button
                      type="button"
                      title="Remove from project"
                      onClick={() => setRemoving(m)}
                      className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-bad-050 hover:text-bad-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Map a user to this project"
        description="Mapping grants access — the user will see this project's data."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={add} loading={busy} disabled={!userId}>Map user</Button>
          </>
        }
      >
        {error && (
          <p className="mb-3 rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-bold text-bad-600">{error}</p>
        )}
        <Field label="User" required>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select a user…</option>
            {assignable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}{u.designation ? ` · ${u.designation}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove from project?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Remove</Button>
          </>
        }
      >
        <p className="text-[12.5px] font-medium text-muted-600">
          {removing?.name} will lose access to this project and everything under it,
          unless their role lets them access every project.
        </p>
      </Modal>
    </Card>
  );
}
