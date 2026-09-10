"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";

import { Badge, Card, CardBody, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  createPhaseAction, createWorkPackageAction, deletePhaseAction,
  deleteWorkPackageAction, updatePhaseAction, updateWorkPackageAction,
} from "../actions";

interface WorkPackage { id: string; code: string; name: string }
interface Phase { id: string; code: string; name: string; sequence: number; workPackages: WorkPackage[] }

/** What the WBS form is currently editing — the design's single wbsOpen dialog. */
type Editing =
  | { kind: "phase"; phase?: Phase }
  | { kind: "package"; phaseId: string; pkg?: WorkPackage }
  | null;

export function WbsTab({
  projectId, phases, can,
}: {
  projectId: string;
  phases: Phase[];
  can: { createPhase: boolean; updatePhase: boolean; deletePhase: boolean;
         createPackage: boolean; updatePackage: boolean; deletePackage: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Editing>(null);
  const [confirm, setConfirm] = React.useState<{ label: string; run: () => Promise<{ ok: boolean; error?: string }> } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    const res = await confirm.run();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "That did not work."); setConfirm(null); return; }
    setConfirm(null); setError(null); router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Project → Phase → Work Package</CardTitle>
          <span className="text-xs text-muted-500">
            The spine the schedule, tasks and indents all hang from.
          </span>
        </div>
        {can.createPhase && (
          <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "phase" })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add phase
          </Button>
        )}
      </CardHeader>

      <CardBody className="p-0">
        {error && (
          <p className="border-b border-bad-050 bg-bad-050 px-4 py-2.5 text-[12px] font-bold text-bad-600">{error}</p>
        )}

        {phases.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-500">
            No phases defined yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-200">
            {phases.map((phase) => (
              <li key={phase.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{phase.code}</Badge>
                  <span className="text-sm font-medium text-navy-900">{phase.name}</span>
                  <span className="text-xs text-muted-400">
                    {phase.workPackages.length} work package(s)
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {can.updatePhase && (
                      <IconButton title="Edit" onClick={() => setEditing({ kind: "phase", phase })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                    {can.deletePhase && (
                      <IconButton
                        title="Delete"
                        tone="bad"
                        onClick={() => setConfirm({
                          label: `phase ${phase.code} — ${phase.name}`,
                          run: () => deletePhaseAction(projectId, phase.id),
                        })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </span>
                </div>

                <ul className="mt-2 space-y-1 border-l-2 border-line-400 pl-4">
                  {phase.workPackages.map((wp) => (
                    <li key={wp.id} className="flex items-center gap-2 text-sm">
                      <code className="text-xs text-muted-400">{wp.code}</code>
                      <span className="text-navy-600">{wp.name}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {can.updatePackage && (
                          <IconButton title="Edit" onClick={() => setEditing({ kind: "package", phaseId: phase.id, pkg: wp })}>
                            <Pencil className="h-3 w-3" />
                          </IconButton>
                        )}
                        {can.deletePackage && (
                          <IconButton
                            title="Delete"
                            tone="bad"
                            onClick={() => setConfirm({
                              label: `work package ${wp.code} — ${wp.name}`,
                              run: () => deleteWorkPackageAction(projectId, wp.id),
                            })}
                          >
                            <X className="h-3 w-3" />
                          </IconButton>
                        )}
                      </span>
                    </li>
                  ))}
                  {can.createPackage && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: "package", phaseId: phase.id })}
                        className="mt-1 text-[11.5px] font-bold text-brand-700 transition-colors hover:text-navy-800"
                      >
                        + Add work package
                      </button>
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      {editing && (
        <WbsForm
          projectId={projectId}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setError(null); router.refresh(); }}
        />
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Delete this?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Delete</Button>
          </>
        }
      >
        <p className="text-[12.5px] font-medium text-muted-600">
          This deletes the {confirm?.label}. Work packages under a phase go with it.
          Anything the schedule is already pointing at will block the delete.
        </p>
      </Modal>
    </Card>
  );
}

function IconButton({
  title, tone = "muted", onClick, children,
}: {
  title: string; tone?: "muted" | "bad"; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={
        tone === "bad"
          ? "grid h-[26px] w-[26px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-bad-050 hover:text-bad-600"
          : "grid h-[26px] w-[26px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-surface-hover hover:text-navy-900"
      }
    >
      {children}
    </button>
  );
}

/** One dialog for all four cases, as the design has one wbsOpen. */
function WbsForm({
  projectId, editing, onClose, onSaved,
}: {
  projectId: string;
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isPhase = editing.kind === "phase";
  const existing = isPhase ? editing.phase : editing.pkg;
  const title = `${existing ? "Edit" : "Add"} ${isPhase ? "phase" : "work package"}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = isPhase
      ? editing.phase
        ? await updatePhaseAction(projectId, editing.phase.id, fd)
        : await createPhaseAction(projectId, fd)
      : editing.pkg
        ? await updateWorkPackageAction(projectId, editing.pkg.id, fd)
        : await createWorkPackageAction(projectId, editing.phaseId, fd);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <p className="rounded-[9px] bg-bad-050 px-3 py-2 text-[12px] font-bold text-bad-600">{error}</p>
        )}
        <Field label="Code" required>
          <Input name="code" defaultValue={existing?.code} placeholder={isPhase ? "TWR-B-STR" : "WP-SLAB"} required autoFocus />
        </Field>
        <Field label="Name" required>
          <Input name="name" defaultValue={existing?.name} placeholder="e.g. Tower A — Finishing" required />
        </Field>
        {isPhase && (
          <Field label="Order" hint="Lower numbers come first.">
            <Input name="sequence" type="number" min={0} defaultValue={editing.phase?.sequence ?? 0} placeholder="0" />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
