"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerStep } from "@/components/ui/drawer";
import { Alert, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { createProjectAction, type DraftWbsRow } from "./actions";

type Lookup = Array<{ id: string; name: string }>;

/**
 * The design's Create project panel, field for field. The grid is TWO columns
 * and each field declares its span; CSS grid auto-placement then produces the
 * design's exact shape — a span-2 field cannot sit beside a span-1, so name,
 * location and RERA each take a row of their own, code and land area sit alone
 * beside the gap, and the last six pair up.
 */
const FIELDS: Array<{
  name: string; label: string; placeholder: string; span: 1 | 2;
  required?: boolean; type?: string;
}> = [
  { name: "name", label: "Project name", placeholder: "e.g. NN Lakefront", span: 2, required: true },
  { name: "code", label: "Project code", placeholder: "PRJ-005", span: 1, required: true },
  { name: "addressLine", label: "Location", placeholder: "Area, city", span: 2 },
  { name: "landArea", label: "Land area", placeholder: "4.2 acres", span: 1 },
  { name: "reraNumber", label: "RERA registration no.", placeholder: "PRM/KA/RERA/…", span: 2 },
  { name: "approvalDetails", label: "Approval details", placeholder: "plan sanction ref.", span: 1 },
  { name: "totalTowers", label: "Towers / blocks", placeholder: "2", span: 1, type: "number" },
  { name: "totalFloors", label: "Floors per tower", placeholder: "18", span: 1, type: "number" },
  { name: "totalUnits", label: "Total units", placeholder: "456", span: 1, type: "number" },
  { name: "startDate", label: "Planned start", placeholder: "01 Apr 2027", span: 1, type: "date" },
  { name: "targetDate", label: "Target completion", placeholder: "31 Dec 2029", span: 1, type: "date" },
];

export function NewProjectButton({
  types, companies, cities, managers,
}: { types: Lookup; companies: Lookup; cities: Lookup; managers: Lookup }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");
  const [wbs, setWbs] = React.useState<DraftWbsRow[]>([]);
  const [adding, setAdding] = React.useState<{ kind: "PHASE" | "WP"; index: number | null } | null>(null);

  function reset() {
    setOpen(false);
    setError(null);
    setWbs([]);
    setAdding(null);
    setTypeId(types[0]?.id ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("projectTypeId", typeId);
    const res = await createProjectAction(fd, wbs);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    reset();
    router.push(`/projects/${res.data.id}`);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        New project
      </Button>

      {open && (
        <Drawer
          open
          onClose={reset}
          title="Create project"
          description="Level 1 · Project master, then Level 2 · Work breakdown"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={reset}>Cancel</Button>
              <Button type="submit" form="project-form" loading={busy}>Create project</Button>
            </>
          }
        >
          <form id="project-form" onSubmit={onSubmit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}

            <DrawerStep n={1}>Project master</DrawerStep>

            {/* The design's two-column field grid */}
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label
                  key={f.name}
                  className={cn("block min-w-0", f.span === 2 && "col-span-2")}
                >
                  <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">
                    {f.label} {f.required && <span className="text-bad-600">*</span>}
                  </span>
                  <Input
                    name={f.name}
                    type={f.type ?? "text"}
                    placeholder={f.placeholder}
                    required={f.required}
                    className={f.name === "code" ? "uppercase" : undefined}
                  />
                </label>
              ))}
            </div>

            {/* Project type — the design's pill chips, not a dropdown */}
            <div>
              <p className="mb-[7px] text-[11px] font-semibold text-muted-600">
                Project type <span className="text-bad-600">*</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-[12px] font-semibold transition-colors",
                      typeId === t.id
                        ? "border-brand-500 bg-brand-100 text-brand-700"
                        : "border-line-400 bg-white text-navy-500 hover:bg-surface-hover",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Secondary assignment the design keeps out of the grid */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">Company</span>
                <Select name="companyId" defaultValue="">
                  <option value="">— None —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </label>
              <label className="block min-w-0">
                <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">City</span>
                <Select name="cityId" defaultValue="">
                  <option value="">— None —</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </label>
              <label className="block min-w-0">
                <span className="col-span-2 mb-[5px] block text-[11px] font-semibold text-muted-600">Project manager</span>
                <Select name="projectManagerId" defaultValue="">
                  <option value="">— Unassigned —</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </label>
            </div>

            {/* Level 2, exactly as the design drafts it */}
            <DrawerStep n={2} className="pt-2">Work breakdown · Phase → Work Package</DrawerStep>
            <div className="rounded-[12px] border border-line-400 bg-surface-sunken px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAdding({ kind: "PHASE", index: null })}
                    className="rounded-[8px] border border-line-400 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-brand-700 transition-colors hover:bg-surface-hover"
                  >
                    + Add phase
                  </button>
                  <button
                    type="button"
                    disabled={!wbs.some((r) => r.kind === "PHASE")}
                    onClick={() => setAdding({ kind: "WP", index: null })}
                    className="rounded-[8px] border border-line-400 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-brand-700 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                    title={wbs.some((r) => r.kind === "PHASE") ? undefined : "Add a phase first"}
                  >
                    + Add work package
                  </button>
                </span>
              </div>

              {wbs.length === 0 ? (
                <p className="mt-2 text-[11.5px] font-medium text-muted-500">
                  Optional — Project → Phase → Work Package is the spine the schedule,
                  tasks and indents all hang from. It can be built later too.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {wbs.map((row, i) => (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[10px] border border-line-300 px-3 py-2",
                        row.kind === "PHASE" ? "bg-surface-hover" : "ml-[22px] bg-white",
                      )}
                    >
                      <span
                        className={cn(
                          "rounded-[5px] px-1.5 py-[3px] text-[9px] font-extrabold uppercase tracking-[.07em] text-white",
                          row.kind === "PHASE" ? "bg-navy-800" : "bg-brand-500",
                        )}
                      >
                        {row.kind}
                      </span>
                      <span className="num shrink-0 text-[11px] font-bold text-muted-500">{row.code}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-navy-900">{row.name}</span>
                      <button
                        type="button" title="Edit"
                        onClick={() => setAdding({ kind: row.kind, index: i })}
                        className="grid h-[24px] w-[24px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-white hover:text-navy-900"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button" title="Remove"
                        onClick={() => setWbs((r) => r.filter((_, x) => x !== i))}
                        className="grid h-[24px] w-[24px] place-items-center rounded-[7px] text-muted-400 transition-colors hover:bg-bad-050 hover:text-bad-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {adding && (
                <WbsRowForm
                  kind={adding.kind}
                  initial={adding.index === null ? null : wbs[adding.index]}
                  onCancel={() => setAdding(null)}
                  onSave={(row) => {
                    setWbs((rows) =>
                      adding.index === null
                        ? [...rows, row]
                        : rows.map((r, i) => (i === adding.index ? row : r)),
                    );
                    setAdding(null);
                  }}
                />
              )}
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}

/** Inline row editor — nested dialogs are avoided, as the design does. */
function WbsRowForm({
  kind, initial, onCancel, onSave,
}: {
  kind: "PHASE" | "WP";
  initial: DraftWbsRow | null;
  onCancel: () => void;
  onSave: (row: DraftWbsRow) => void;
}) {
  const [code, setCode] = React.useState(initial?.code ?? "");
  const [name, setName] = React.useState(initial?.name ?? "");

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-[10px] border border-brand-300 bg-white px-3 py-2.5">
      <label className="min-w-[110px]">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.08em] text-muted-500">Code</span>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={kind === "PHASE" ? "TWR-B-STR" : "WP-SLAB"}
          className="h-8 uppercase"
          autoFocus
        />
      </label>
      <label className="min-w-[170px] flex-1">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[.08em] text-muted-500">
          {kind === "PHASE" ? "Phase name" : "Work package name"}
        </span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tower A — Finishing"
          className="h-8"
        />
      </label>
      <Button
        size="sm"
        type="button"
        disabled={!code.trim() || !name.trim()}
        onClick={() => onSave({ kind, code: code.trim(), name: name.trim() })}
      >
        Save
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}
