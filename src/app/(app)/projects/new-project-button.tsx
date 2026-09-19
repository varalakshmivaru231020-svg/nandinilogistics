"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerStep } from "@/components/ui/drawer";
import { Alert, Input } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/date-field";
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
  required?: boolean; type?: string; date?: boolean;
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
  { name: "startDate", label: "Planned start", placeholder: "01 Apr 2027", span: 1, date: true },
  { name: "targetDate", label: "Target completion", placeholder: "31 Dec 2029", span: 1, date: true },
];

export function NewProjectButton({ types }: { types: Lookup }) {
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
      <Button onClick={() => setOpen(true)}>
+ New project
      </Button>

      {open && (
        <Drawer
          open
          onClose={reset}
          title="Create project"
          description="Level 1 · Project master, then Level 2 · Work breakdown"
          footer={
            <>
              <Button variant="outline" type="button" onClick={reset}>Cancel</Button>
              <Button type="submit" form="project-form" loading={busy}>Create project</Button>
            </>
          }
        >
          <form id="project-form" onSubmit={onSubmit}>
            {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

            <DrawerStep n={1} className="mb-3.5">Project master</DrawerStep>

            {/* The design's two-column field grid */}
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label
                  key={f.name}
                  className={cn("block min-w-0", f.span === 2 && "col-span-2")}
                >
                  <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">
                    {f.label}
                  </span>
                  {f.date ? (
                    <DateField name={f.name} placeholder={f.placeholder} required={f.required} />
                  ) : (
                    <Input
                      name={f.name}
                      type={f.type ?? "text"}
                      placeholder={f.placeholder}
                      required={f.required}
                      className={f.name === "code" ? "uppercase" : undefined}
                    />
                  )}
                </label>
              ))}
            </div>

            {/* Project type — the design's pill chips, not a dropdown */}
            <div className="mt-3.5">
              <p className="mb-[7px] text-[11px] font-semibold text-muted-600">Project type</p>
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

            {/* Level 2, exactly as the design drafts it */}
            <DrawerStep n={2} className="mb-3 mt-[22px]">Work breakdown · Phase → Work Package</DrawerStep>

            {wbs.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "mb-1.5 flex items-center gap-2.5 rounded-[10px] border border-line-300 px-3 py-[9px]",
                  row.kind === "PHASE" ? "bg-surface-hover" : "ml-[22px] bg-surface-tint",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-[5px] text-[9px] font-bold uppercase tracking-[.07em]",
                    row.kind === "PHASE" ? "bg-plum-050 text-navy-800" : "bg-brand-100 text-brand-700",
                  )}
                >
                  {row.kind === "PHASE" ? "PHASE" : "WP"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-navy-900">
                  {row.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAdding({ kind: row.kind, index: i })}
                  className="shrink-0 cursor-pointer rounded-[7px] border border-line-400 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => setWbs((r) => r.filter((_, x) => x !== i))}
                  className="shrink-0 cursor-pointer px-1 py-0.5 text-[13px] font-semibold text-muted-250 transition-colors hover:text-bad-600"
                >
                  ✕
                </button>
              </div>
            ))}

            {wbs.length === 0 && (
              <div className="mb-1.5 rounded-[10px] border border-dashed border-line-400 bg-surface-sunken p-4 text-center text-[12px] font-medium text-muted-400">
                No breakdown yet — add a phase, then work packages under it. Leave it
                empty and a first phase is created for you.
              </div>
            )}

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setAdding({ kind: "PHASE", index: null })}
                className="cursor-pointer rounded-[9px] border border-dashed border-muted-200 bg-surface-tint px-[13px] py-2 text-[11.5px] font-semibold text-navy-800 transition-colors hover:border-brand-500"
              >
                + Add phase
              </button>
              <button
                type="button"
                onClick={() => setAdding({ kind: "WP", index: null })}
                className="cursor-pointer rounded-[9px] border border-dashed border-muted-200 bg-surface-tint px-[13px] py-2 text-[11.5px] font-semibold text-brand-700 transition-colors hover:border-brand-500"
              >
                + Add work package
              </button>
            </div>
          </form>
        </Drawer>
      )}

      {adding && (
        <WbsRowForm
          kind={adding.kind}
          initial={adding.index === null ? null : wbs[adding.index]}
          onCancel={() => setAdding(null)}
          onSave={(row) => {
            setWbs((rows) =>
              adding.index === null ? [...rows, row] : rows.map((r, i) => (i === adding.index ? row : r)),
            );
            setAdding(null);
          }}
        />
      )}
    </>
  );
}

/**
 * The design edits a breakdown row in a small centred dialog: which level it
 * is, its name, and how far along it is. The code each row carries in the
 * database is derived from the name — the design never asks for one.
 */
function WbsRowForm({
  kind, initial, onCancel, onSave,
}: {
  kind: "PHASE" | "WP";
  initial: DraftWbsRow | null;
  onCancel: () => void;
  onSave: (row: DraftWbsRow) => void;
}) {
  const [level, setLevel] = React.useState<"PHASE" | "WP">(initial?.kind ?? kind);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [pct, setPct] = React.useState(String(initial?.progressPct ?? 0));
  const [missing, setMissing] = React.useState(false);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[96] bg-[rgba(25,26,92,.38)]" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit breakdown row" : "Add breakdown row"}
        className="animate-fade-up fixed left-1/2 top-1/2 z-[97] w-[440px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-[15px] bg-white px-6 py-[22px] shadow-[0_26px_70px_rgba(25,26,92,.26)]"
      >
        <p className="mb-3.5 font-display text-[15.5px] font-bold text-navy-950">
          {initial ? "Edit " : "Add "}{level === "PHASE" ? "phase" : "work package"}
        </p>

        <div className="mb-[13px]">
          <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Level</p>
          <div className="flex gap-[7px]">
            {([["PHASE", "Phase"], ["WP", "Work package"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLevel(key)}
                className={cn(
                  "cursor-pointer rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold transition-colors",
                  level === key
                    ? "border-brand-500 bg-brand-100 text-brand-700"
                    : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="mb-[13px] block">
          <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">
            Name <span className="text-bad-600">*</span>
          </span>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); if (missing) setMissing(false); }}
            placeholder="e.g. Tower A — Finishing"
            className={cn(missing && "border-bad-600 bg-bad-050")}
            autoFocus
          />
          {missing && <span className="mt-1 block text-[11px] font-semibold text-bad-600">Name is required</span>}
        </label>

        <label className="block">
          <span className="mb-[5px] block text-[11px] font-semibold text-muted-600">Progress %</span>
          <Input value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0" />
        </label>

        <div className="mt-[18px] flex justify-end gap-[9px]">
          <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
          <Button
            type="button"
            className="px-[18px]"
            onClick={() => {
              if (!name.trim()) { setMissing(true); return; }
              onSave({
                kind: level,
                code: codeFrom(name),
                name: name.trim(),
                progressPct: Math.min(100, Math.max(0, Math.round(Number(pct.replace(/[^\d.]/g, "")) || 0))),
              });
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** A row's code, from its name — "Tower A — Finishing" becomes TOWER-A-FINISHING. */
function codeFrom(name: string) {
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return code || "WBS";
}
