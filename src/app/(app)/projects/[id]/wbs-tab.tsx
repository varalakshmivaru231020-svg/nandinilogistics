"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  createPhaseAction, createWorkPackageAction, deletePhaseAction,
  deleteWorkPackageAction, updatePhaseAction, updateWorkPackageAction,
} from "../actions";

/** The lifecycle in the words the task screens use. */
const STATUS_WORD: Record<string, string> = {
  PENDING: "Pending", ACCEPTED: "Accepted", STARTED: "Started", HOLD: "Hold",
  COMPLETED: "Completed", UNDER_REVIEW: "Under Review", REWORK: "Rework",
  UNDER_APPROVAL: "Under Approval", CLOSED: "Closed",
};

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
export interface ProjectTask {
  id: string; taskNo: string; title: string; status: string; priority: string;
  kind: string; dueAt: string; location: string | null;
  assignee: string; assigner: string;
}

export function WbsTab({
  projectId, rows, phases, tasks, canCreateTask, nowMs, can,
}: {
  projectId: string;
  rows: WbsRow[];
  phases: Array<{ id: string; name: string }>;
  /** The work assigned against this project. */
  tasks: ProjectTask[];
  canCreateTask: boolean;
  nowMs: number;
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
    <div className="space-y-3.5">
      {/*
        The tasks raised against this project, newest first. Raising one from
        here fills the project in, which is the point of doing it from here.
      */}
      <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-300 bg-surface-sunken px-[18px] py-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Tasks on this project
          </span>
          <span className="num rounded-full bg-surface-field px-2.5 py-1 text-[10.5px] font-bold text-navy-600">
            {tasks.length}
          </span>
          <div className="flex-1" />
          <Link
            href="/tasks"
            className="text-[11.5px] font-semibold text-brand-700 hover:underline"
          >
            All tasks →
          </Link>
          {canCreateTask && (
            <Link
              href={`/tasks/new?project=${projectId}`}
              className="rounded-[8px] bg-brand-500 px-3 py-[7px] text-[11.5px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              + New task
            </Link>
          )}
        </div>

        {tasks.length === 0 ? (
          <p className="px-[18px] py-8 text-center text-[12.5px] font-medium text-muted-400">
            No task has been raised against this project yet.
          </p>
        ) : (
          <div className="divide-y divide-line-150">
            {tasks.map((t) => {
              const over =
                !["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status) &&
                new Date(t.dueAt).getTime() < nowMs;
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-[18px] py-3 hover:bg-surface-tint",
                    t.kind === "CHECKLIST" && "bg-[#FAF8FE]",
                    over && "bg-bad-025",
                  )}
                >
                  <span className="num w-[70px] shrink-0 text-[11.5px] font-bold text-navy-950">{t.taskNo}</span>
                  <span className="min-w-[180px] flex-[2_1_220px]">
                    <span className="block truncate text-[12.5px] font-semibold text-navy-900">{t.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-400">
                      {t.location ?? "—"} · {t.assignee}
                    </span>
                  </span>
                  <span className={cn("w-[120px] shrink-0 text-[11.5px] font-semibold", over ? "text-bad-600" : "text-navy-600")}>
                    {new Date(t.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-field px-2.5 py-1 text-[10.5px] font-bold text-navy-600">
                    {STATUS_WORD[t.status] ?? t.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

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
              r.kind === "PHASE" ? "bg-plum-050 text-navy-800" : "bg-brand-100 text-brand-700",
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
            className="cursor-pointer rounded-[9px] border border-dashed border-muted-200 bg-surface-tint px-[13px] py-2 text-[11.5px] font-semibold text-navy-800 transition-colors hover:border-brand-500"
          >
            + Add phase
          </button>
        )}
        {can.createPackage && phases.length > 0 && (
          <button
            type="button"
            onClick={() => open("WP")}
            className="cursor-pointer rounded-[9px] border border-dashed border-muted-200 bg-surface-tint px-[13px] py-2 text-[11.5px] font-semibold text-brand-700 transition-colors hover:border-brand-500"
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
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
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
            <Button variant="outline" onClick={() => setConfirming(null)}>Keep it</Button>
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
    </div>
  );
}
