"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { generateUnitsAction, type PlannedUnit } from "./setup-actions";

interface Project { id: string; code: string; name: string }
interface UnitType { id: string; name: string }

/** A flat as planned on screen, before anything is written. */
interface Planned { key: string; floor: number; number: string; unitTypeId: string | null }

/**
 * The design's Create-units view: the project and tower, the structure, and
 * every floor laid out so any flat can be renumbered or reconfigured before
 * the tower is generated.
 */
export function UnitSetup({
  projects, unitTypes, initialProjectId,
}: {
  projects: Project[];
  unitTypes: UnitType[];
  initialProjectId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [projectId, setProjectId] = React.useState(initialProjectId);
  const [tower, setTower] = React.useState("");
  const [floors, setFloors] = React.useState(8);
  const [perFloor, setPerFloor] = React.useState<Record<number, number>>({});
  const [overrides, setOverrides] = React.useState<Record<string, { number?: string; unitTypeId?: string | null }>>({});
  const [editing, setEditing] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const defaultPerFloor = 4;
  const defaultTypeId = unitTypes[0]?.id ?? null;

  const planned: Planned[] = [];
  for (let floor = 1; floor <= floors; floor++) {
    const count = perFloor[floor] ?? defaultPerFloor;
    for (let i = 1; i <= count; i++) {
      const key = `${floor}-${i}`;
      const over = overrides[key];
      planned.push({
        key,
        floor,
        number: over?.number ?? `${floor}${String(i).padStart(2, "0")}`,
        unitTypeId: over?.unitTypeId === undefined ? defaultTypeId : over.unitTypeId,
      });
    }
  }

  const summary = new Map<string, number>();
  for (const p of planned) {
    const label = unitTypes.find((t) => t.id === p.unitTypeId)?.name ?? "Unassigned";
    summary.set(label, (summary.get(label) ?? 0) + 1);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    const units: PlannedUnit[] = planned.map((p) => ({
      floorNumber: p.floor, unitNumber: p.number, unitTypeId: p.unitTypeId,
    }));
    const res = await generateUnitsAction(projectId, tower, units);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(`${res.data.created} units created.`);
    router.push(`/units/board?project=${projectId}`);
    router.refresh();
  }

  const editingUnit = planned.find((p) => p.key === editing) ?? null;

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          onClick={() => router.push(`/units/board?project=${projectId}`)}
          className="rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 hover:border-brand-500 hover:text-brand-700"
        >
          ← Back to board
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[19px] font-bold text-navy-950">Create units</p>
          <p className="mt-0.5 text-[12px] font-medium text-muted-500">
            Tap any flat to edit its number &amp; configuration · use the − / + on a row for floor-wise changes
          </p>
        </div>
        <Button
          size="lg"
          onClick={generate}
          loading={busy}
          disabled={!tower.trim() || planned.length === 0}
          className="bg-good-600 hover:bg-good-700"
        >
          Generate {planned.length} units
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-[9px] border border-bad-100 bg-bad-050 px-3.5 py-2.5 text-[12px] font-semibold text-bad-700">
          {error}
        </p>
      )}

      <div className="grid items-start gap-3.5 [grid-template-columns:320px_1fr] max-lg:[grid-template-columns:1fr]">
        <div className="flex flex-col gap-3.5">
          <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">1 · Project</p>
            <div className="flex flex-wrap gap-[7px]">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(p.id)}
                  className={cn(
                    "rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold",
                    projectId === p.id
                      ? "border-brand-500 bg-brand-100 text-brand-700"
                      : "border-line-400 bg-white text-navy-600 hover:border-brand-500",
                  )}
                >
                  {p.code}
                </button>
              ))}
            </div>
            <div className="mt-[13px]">
              <p className="mb-[5px] text-[11px] font-semibold text-muted-600">
                Tower / block name <span className="text-bad-600">*</span>
              </p>
              <Input value={tower} onChange={(e) => setTower(e.target.value)} placeholder="e.g. Tower D" />
            </div>
          </div>

          <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">2 · Structure</p>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[12.5px] font-semibold text-navy-600">Floors</span>
              <Stepper value={floors} onChange={(n) => setFloors(Math.max(1, Math.min(60, n)))} />
            </div>
            <p className="mt-2 text-[11px] font-medium text-muted-400">
              Set each floor&apos;s flat count with the − / + on its row. Numbering: floor + position → 802, 1203
            </p>
          </div>

          <div
            className="rounded-[13px] px-[18px] py-4"
            style={{ background: "linear-gradient(150deg,#191A5C,#2F308C)" }}
          >
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.1em] text-[#9AA0D6]">Summary</p>
            {[...summary.entries()].map(([label, count]) => (
              <div key={label} className="flex items-center gap-[9px] py-[5px]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-300" />
                <span className="flex-1 text-[12.5px] font-semibold text-[#DDE1F5]">{label}</span>
                <span className="num font-display text-[14px] font-extrabold text-brand-300">{count}</span>
              </div>
            ))}
            <div className="mt-[9px] flex justify-between border-t border-white/15 pt-2.5">
              <span className="text-[12.5px] font-bold text-white">Total units</span>
              <span className="num font-display text-[17px] font-extrabold text-white">{planned.length}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
          <p className="mb-[11px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            All floors — tap any flat to edit its number &amp; configuration
          </p>

          {editingUnit && (
            <div className="mb-3 rounded-[12px] border-[1.5px] border-brand-500 bg-surface-tint px-4 py-3.5">
              <div className="mb-[11px] flex items-center justify-between">
                <p className="font-display text-[13px] font-bold text-navy-950">
                  Floor {editingUnit.floor} · flat {editingUnit.number}
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  aria-label="Close"
                  className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-line-300 text-[12px] font-semibold text-muted-600 hover:brightness-95"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-3.5">
                <div>
                  <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Flat number</p>
                  <Input
                    value={editingUnit.number}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [editingUnit.key]: { ...o[editingUnit.key], number: e.target.value } }))
                    }
                    className="w-[140px]"
                  />
                </div>
                <div>
                  <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Configuration</p>
                  <Select
                    value={editingUnit.unitTypeId ?? ""}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [editingUnit.key]: { ...o[editingUnit.key], unitTypeId: e.target.value || null },
                      }))
                    }
                    className="w-[180px]"
                  >
                    <option value="">Unassigned</option>
                    {unitTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {Array.from({ length: floors }, (_, i) => floors - i).map((floor) => {
              const count = perFloor[floor] ?? defaultPerFloor;
              const flats = planned.filter((p) => p.floor === floor);
              return (
                <div key={floor} className="flex items-center gap-2.5">
                  <span className="num w-10 shrink-0 text-[11px] font-bold text-muted-400">Fl {floor}</span>
                  <div className="grid flex-1 gap-2 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
                    {flats.map((f) => {
                      const type = unitTypes.find((t) => t.id === f.unitTypeId)?.name ?? "Unassigned";
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setEditing(f.key === editing ? null : f.key)}
                          className={cn(
                            "rounded-[9px] border px-2.5 py-2 text-center text-[11.5px] font-bold transition-colors",
                            f.key === editing
                              ? "border-brand-500 bg-brand-100 text-brand-700"
                              : cn(TYPE_TONE(type), "hover:border-brand-500"),
                          )}
                        >
                          <span className="num">{f.number}</span> · {type}
                        </button>
                      );
                    })}
                  </div>
                  <Stepper
                    small
                    value={count}
                    onChange={(n) => setPerFloor((p) => ({ ...p, [floor]: Math.max(0, Math.min(12, n)) }))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The design colours a planned flat by its configuration, so a floor's mix can
 * be read at a glance.
 */
function TYPE_TONE(type: string): string {
  const key = type.toLowerCase();
  if (key.includes("1 bhk")) return "border-[#BFE0F2] bg-brand-100 text-brand-700";
  if (key.includes("2 bhk")) return "border-[#C4E8D4] bg-good-050 text-good-700";
  if (key.includes("3 bhk")) return "border-[#D7CDF3] bg-[#EFE9FC] text-[#6A46C8]";
  if (key.includes("4 bhk") || key.includes("villa")) return "border-[#F3DDBB] bg-warn-050 text-warn-700";
  return "border-line-400 bg-surface-sunken text-navy-600";
}

function Stepper({
  value, onChange, small,
}: { value: number; onChange: (n: number) => void; small?: boolean }) {
  const button =
    "grid place-items-center rounded-[8px] border border-line-400 bg-white font-bold text-navy-600 hover:border-brand-500 hover:text-brand-700";
  const size = small ? "h-6 w-6 text-[12px]" : "h-8 w-8 text-[14px]";
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <button type="button" aria-label="One fewer" onClick={() => onChange(value - 1)} className={cn(button, size)}>−</button>
      <span className={cn("num text-center font-display font-extrabold text-navy-950", small ? "min-w-[18px] text-[13px]" : "min-w-[26px] text-[16px]")}>
        {value}
      </span>
      <button type="button" aria-label="One more" onClick={() => onChange(value + 1)} className={cn(button, size)}>+</button>
    </div>
  );
}
