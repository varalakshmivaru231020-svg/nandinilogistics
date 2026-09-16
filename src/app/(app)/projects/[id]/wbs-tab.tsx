"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  createPhaseAction, createWorkPackageAction, deletePhaseAction,
  deleteWorkPackageAction, updatePhaseAction, updateWorkPackageAction,
} from "../actions";

export interface WbsRow {
  id: string;
  kind: "PHASE" | "WP";
  code: string;
  name: string;
  pct: number;
  /** For a work package: the phase it hangs off. */
  phaseId: string | null;
}

interface FormState {
  mode: "new" | "edit";
  kind: "PHASE" | "WP";
  id: string | null;
  code: string;
  name: string;
  pct: string;
  phaseId: string;
}

/**
 * The design's work breakdown: phases and the packages under them, each with
 * its progress, edited in place. Adding either opens the same small form with
 * the level already picked.
 */
export function WbsTab({
  projectId, rows, phases, can,
}: {
  projectId: string;
  rows: WbsRow[];
  phases: Array<{ id: string; name: string }>;
  can: {
    createPhase: boolean; updatePhase: boolean; deletePhase: boolean;
    createPackage: boolean; updatePackage: boolean; deletePackage: boolean;
  };
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [confirming, setConfirming] = React.useState<WbsRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function open(kind: "PHASE" | "WP", row?: WbsRow) {
    setError(null);
    setForm({
      mode: row ? "edit" : "new",
      kind,
      id: row?.id ?? null,
      code: row?.code ?? "",
      name: row?.name ?? "",
      pct: String(row?.pct ?? 0),
      phaseId: row?.phaseId ?? phases[0]?.id ?? "",
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    const data = new FormData();
    data.set("code", form.code);
    data.set("name", form.name);
    data.set("progressPct", form.pct);

    const res =
      form.kind === "PHASE"
        ? form.mode === "new"
          ? await createPhaseAction(projectId, data)
          : await updatePhaseAction(projectId, form.id!, data)
        : form.mode === "new"
          ? await createWorkPackageAction(projectId, form.phaseId, data)
          : await updateWorkPackageAction(projectId, form.id!, data);

    setBusy(false);
    if (!res.ok) setError(res.error);
    else { setForm(null); router.refresh(); }
  }

  async function remove() {
    if (!confirming) return;
    setBusy(true);
    const res =
      confirming.kind === "PHASE"
        ? await deletePhaseAction(projectId, confirming.id)
        : await deleteWorkPackageAction(projectId, confirming.id);
    setBusy(false);
    setConfirming(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  const mayEdit = (r: WbsRow) => (r.kind === "PHASE" ? can.updatePhase : can.updatePackage);
  const mayDelete = (r: WbsRow) => (r.kind === "PHASE" ? can.deletePhase : can.deletePackage);

  return (
    <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
        Work breakdown · Phase → Work Package
      </div>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}

      {rows.map((r) => (
        <div
          key={r.id}
          className={cn(
            "mb-1.5 flex items-center gap-2.5 rounded-[10px] border border-line-300 px-3 py-2.5",
            r.kind === "PHASE" ? "bg-surface-hover" : "ml-[22px] bg-surface-tint",
          )}
        >
          <span
            className={cn(
              "rounded-full px-[10px] py-[5px] text-[9px] font-bold tracking-[.07em]",
              r.kind === "PHASE" ? "bg-[#EFE9FC] text-navy-800" : "bg-brand-100 text-brand-700",
            )}
          >
            {r.kind}
          </span>
          <span className="flex-1 text-[12.5px] font-semibold text-navy-900">{r.name}</span>
          <span className="text-[12px] font-bold text-brand-500">{r.pct}%</span>
          {mayEdit(r) && (
            <button
              type="button"
              onClick={() => open(r.kind, r)}
              className="cursor-pointer rounded-[7px] border border-line-400 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
            >
              Edit
            </button>
          )}
          {mayDelete(r) && (
            <button
              type="button"
              onClick={() => setConfirming(r)}
              className="cursor-pointer px-1 py-0.5 text-[13px] font-semibold text-[#C0C5DC] transition-colors hover:text-bad-600"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {rows.length === 0 && (
        <div className="rounded-[10px] border border-line-300 bg-surface-tint px-3 py-3 text-[12px] font-medium text-muted-400">
          No breakdown yet — add a phase, then work packages under it.
        </div>
      )}

      <div className="mt-2 flex gap-2">
        {can.createPhase && (
          <button
            type="button"
            onClick={() => open("PHASE")}
            className="cursor-pointer rounded-[9px] border border-dashed border-[#C6CFE8] bg-surface-tint px-[13px] py-2 text-[11.5px] font-semibold text-navy-800 transition-colors hover:border-brand-500"
          >
            + Add phase
          </button>
        )}
        {can.createPackage && phases.length > 0 && (
          <button
            type="button"
            onClick={() => open("WP")}
            className="cursor-pointer rounded-[9px] border border-dashed border-[#C6CFE8] bg-surface-tint px-[13px] py-2 text-[11.5px] font-semibold text-brand-700 transition-colors hover:border-brand-500"
          >
            + Add work package
          </button>
        )}
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={
          form
            ? `${form.mode === "new" ? "Add" : "Edit"} ${form.kind === "PHASE" ? "phase" : "work package"}`
            : ""
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button loading={busy} onClick={save}>Save</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            {form.kind === "WP" && form.mode === "new" && (
              <Field label="Under phase">
                <select
                  value={form.phaseId}
                  onChange={(e) => setForm({ ...form, phaseId: e.target.value })}
                  className="w-full rounded-[9px] border border-line-400 bg-surface-field px-3 py-2 text-[12.5px] text-navy-900"
                >
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. PH-01"
              />
            </Field>
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Tower A — Finishing"
              />
            </Field>
            <Field label="Progress %">
              <Input
                value={form.pct}
                onChange={(e) => setForm({ ...form, pct: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Remove ${confirming.name}?` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          {confirming?.kind === "PHASE"
            ? "The work packages under this phase go with it."
            : "This removes the work package from the breakdown."}
        </p>
      </Modal>
    </div>
  );
}
