"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockOpen, TimerReset } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Field, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, qty } from "@/lib/utils";
import { extendHoldAction, releaseHoldAction } from "../../sales/cost-sheets/actions";
import { ReserveDrawer } from "./reserve-drawer";

interface Hold {
  id: string; expiresAt: string; heldByName: string;
  leadName: string | null; extensionCount: number;
}

interface Unit {
  id: string; unitNumber: string; floorNumber: number; status: string;
  unitTypeCode: string | null; unitTypeName: string | null;
  superBuiltUpArea: number; carpetArea: number;
  facing: string | null; plcTag: string | null; parkingSlots: number;
  hold: Hold | null;
}

interface Block { id: string; name: string; units: Unit[] }

/** One status, one colour, everywhere. */
const STATUS_STYLE: Record<string, { cell: string; dot: string; label: string }> = {
  AVAILABLE:  { cell: "border-good-050 bg-good-050 text-good-700 hover:border-good-600",    dot: "bg-good-600",  label: "Available" },
  HELD:       { cell: "border-warn-050 bg-warn-050 text-warn-700 hover:border-warn-700",    dot: "bg-warn-700",  label: "On hold" },
  BOOKED:     { cell: "border-brand-100 bg-brand-100 text-brand-700 hover:border-brand-500", dot: "bg-brand-500", label: "Booked" },
  AGREEMENT:  { cell: "border-line-400 bg-surface-field text-navy-800 hover:border-navy-800", dot: "bg-navy-800",  label: "Agreement" },
  REGISTERED: { cell: "border-line-500 bg-line-400 text-navy-600 hover:border-navy-600",     dot: "bg-navy-500",  label: "Registered" },
  BLOCKED:    { cell: "border-bad-050 bg-bad-050 text-bad-600 hover:border-bad-600",         dot: "bg-bad-600",   label: "Blocked" },
};

/** The design's legend swatches: a tint with a stronger border. */
const LEGEND: Record<string, string> = {
  AVAILABLE: "border-[#77C39A] bg-good-050",
  HELD: "border-[#E0B26A] bg-warn-050",
  BOOKED: "border-[#6FB6DE] bg-brand-100",
};

export function BoardGrid({
  projects, activeProjectId, blocks, customers, can, nowMs, projectType, priceList,
}: {
  nowMs: number;
  projects: Array<{ id: string; name: string; code: string }>;
  activeProjectId: string;
  blocks: Block[];
  /** Villa and plotted projects have clusters, not towers, as the design names them. */
  projectType: string | null;
  /** Who a unit can be held or booked for, as the design's drawer lists them. */
  customers: Array<{ id: string; name: string; phone: string }>;
  /** The line the design prints under the tower's figures. */
  priceList: { version: string; effectiveFrom: string } | null;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [blockId, setBlockId] = React.useState(blocks[0]?.id ?? "");
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [selected, setSelected] = React.useState<Unit | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const block = blocks.find((b) => b.id === blockId) ?? blocks[0] ?? null;
  const project = projects.find((p) => p.id === activeProjectId);
  // The design writes "Cluster A" for a villa project and "Tower A" otherwise.
  const blockWord = /villa|plot/i.test(projectType ?? "") ? "Cluster" : "Tower";
  const blockName = (b: Block) =>
    /^(tower|cluster|block)\b/i.test(b.name) ? b.name : `${blockWord} ${b.name}`;

  const types = [...new Set(blocks.flatMap((b) => b.units.map((u) => u.unitTypeName).filter(Boolean)))] as string[];

  const units = block?.units ?? [];
  const shown = units.filter(
    (u) =>
      (status === "all" || u.status === status) &&
      (type === "all" || u.unitTypeName === type),
  );

  const floors = new Map<number, Unit[]>();
  for (const u of shown) floors.set(u.floorNumber, [...(floors.get(u.floorNumber) ?? []), u]);
  const rows = [...floors.entries()].sort((a, b) => b[0] - a[0]);

  const count = (s: string) => units.filter((u) => u.status === s).length;

  return (
    <div>
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {notice && !error && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}

      <div className="grid items-start gap-3.5 [grid-template-columns:1fr_320px] max-xl:[grid-template-columns:1fr]">
        <div>
          {/* Projects, and the design's three-colour legend */}
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-[7px]">
              {projects.map((p) => (
                <Chip
                  key={p.id}
                  picked={p.id === activeProjectId}
                  onClick={() => router.push(`/units/board?project=${p.id}`)}
                >
                  {p.name}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-600">
              {(["AVAILABLE", "HELD", "BOOKED"] as const).map((s) => (
                <span key={s} className="flex items-center gap-[5px]">
                  <span className={cn("inline-block h-[11px] w-[11px] rounded-[4px] border", LEGEND[s])} />
                  {STATUS_STYLE[s].label}
                </span>
              ))}
            </div>
          </div>

          {/* Towers, status and type */}
          <div className="mb-3 flex flex-wrap items-center gap-[7px]">
            {blocks.map((b) => (
              <Chip key={b.id} picked={b.id === block?.id} onClick={() => { setBlockId(b.id); setSelected(null); }}>
                {blockName(b)}
              </Chip>
            ))}

            <span className="mx-1.5 h-[22px] w-px bg-line-400" />
            <span className="text-[11px] font-semibold text-muted-400">Status</span>
            {[["all", "All"], ["AVAILABLE", "Available"], ["HELD", "Held"], ["BOOKED", "Booked"]].map(([key, label]) => (
              <Chip key={key} picked={status === key} onClick={() => setStatus(key)}>{label}</Chip>
            ))}

            {types.length > 0 && (
              <>
                <span className="mx-1.5 h-[22px] w-px bg-line-400" />
                <span className="text-[11px] font-semibold text-muted-400">Type</span>
                <Chip picked={type === "all"} onClick={() => setType("all")}>All</Chip>
                {types.map((t) => (
                  <Chip key={t} picked={type === t} onClick={() => setType(t)}>{t}</Chip>
                ))}
              </>
            )}
          </div>

          <div className="rounded-[13px] border border-line-400 bg-white p-4">
            {rows.map(([floor, floorUnits]) => (
              <div
                key={floor}
                className="mb-2 grid items-center gap-2 [grid-template-columns:44px_repeat(4,1fr)]"
              >
                <div className="text-center text-[11px] font-bold text-muted-400">Fl {floor}</div>
                {floorUnits.map((u) => {
                  const style = STATUS_STYLE[u.status] ?? STATUS_STYLE.AVAILABLE;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelected(u)}
                      className={cn(
                        "flex flex-col items-start rounded-[9px] border px-3 py-2 text-left transition-transform hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(25,26,92,.13)]",
                        style.cell,
                      )}
                    >
                      <span className="text-[11.5px] font-bold">{u.unitNumber}</span>
                      <span className="text-[9.5px] font-medium opacity-75">{u.unitTypeName ?? "—"}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {rows.length === 0 && (
              <p className="py-10 text-center text-[12.5px] font-medium text-muted-400">
                No units match these filters
              </p>
            )}
          </div>
        </div>

        {/* The design's right rail */}
        <div className="flex flex-col gap-3.5">
          <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
            <p className="mb-3 font-display text-[13px] font-bold text-navy-950">
              {project?.name}{block ? ` · ${blockName(block)}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-[9px]">
              <Stat value={count("AVAILABLE")} label="Available" className="bg-good-050 text-good-700" />
              <Stat value={count("HELD")} label="On hold" className="bg-warn-050 text-warn-700" />
              <Stat value={count("BOOKED")} label="Booked" className="bg-brand-100 text-brand-700" />
            </div>
            {priceList && (
              <p className="mt-3 text-[11.5px] font-medium text-muted-400">
                Price list {priceList.version} · effective {formatDate(priceList.effectiveFrom)} · holds released manually
              </p>
            )}
          </div>

          {selected ? (
            <UnitPanel
              unit={selected}
              customers={customers}
              can={can}
              onClose={() => setSelected(null)}
              nowMs={nowMs}
              onDone={(m) => { setSelected(null); setNotice(m); setError(null); router.refresh(); }}
              onError={(e) => { setError(e); setNotice(null); }}
            />
          ) : (
            <div className="rounded-[13px] border border-dashed border-[#C6CFE8] px-5 py-7 text-center text-[12px] font-medium text-muted-500">
              Select a unit on the board to view details, hold or book it
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The design's filter chip. */
function Chip({ children, picked, onClick }: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-[13px] py-[7px] text-[11.5px] font-semibold transition-colors",
        picked
          ? "border-brand-500 bg-brand-100 text-brand-700"
          : "border-line-400 bg-white text-navy-600 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={cn("rounded-[11px] px-3 py-2.5", className)}>
      <div className="num font-display text-[18px] font-extrabold">{value}</div>
      <div className="mt-0.5 text-[10.5px] font-semibold opacity-75">{label}</div>
    </div>
  );
}

function UnitPanel({
  unit, customers, can, nowMs, onClose, onDone, onError,
}: {
  unit: Unit;
  nowMs: number;
  customers: Array<{ id: string; name: string; phone: string }>;
  can: Record<string, boolean>;
  onClose: () => void;
  onDone: (m: string) => void;
  onError: (e: string) => void;
}) {
  const [releaseNote, setReleaseNote] = React.useState("");
  const [reserving, setReserving] = React.useState<"hold" | "book" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const style = STATUS_STYLE[unit.status] ?? STATUS_STYLE.AVAILABLE;
  const holdExpired = unit.hold ? new Date(unit.hold.expiresAt).getTime() < nowMs : false;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Something went wrong."); onError(res.error ?? ""); }
    else onDone(msg);
  }

  return (
    <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
      {/* The design's navy header on the selected unit */}
      <div
        className="flex items-center justify-between gap-2 px-[18px] py-[15px]"
        style={{ background: "linear-gradient(150deg,#191A5C,#2F308C)" }}
      >
        <div className="min-w-0">
          <p className="font-display text-[15px] font-bold text-white">Unit {unit.unitNumber}</p>
          <p className="mt-0.5 text-[11px] font-medium text-[#9AA0D6]">
            {unit.unitTypeName ?? "—"} · {qty(unit.superBuiltUpArea, 0)} sq ft · {style.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-[7px] bg-white/15 px-2 py-1 text-[12px] font-semibold text-white hover:bg-white/25"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 px-[18px] py-3.5">
        {error && <Alert tone="error">{error}</Alert>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[
            ["Super built-up", `${qty(unit.superBuiltUpArea, 0)} sq.ft`],
            ["Carpet", `${qty(unit.carpetArea, 0)} sq.ft`],
            ["Facing", unit.facing ?? "—"],
            ["Parking", String(unit.parkingSlots)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-500">{label}</dt>
              <dd className="text-navy-900">{value}</dd>
            </div>
          ))}
        </dl>

        {unit.plcTag && <Badge tone="warn">{unit.plcTag}</Badge>}

        {unit.hold && (
          <Alert tone={holdExpired ? "warn" : "info"} title={holdExpired ? "Hold has expired" : "On hold"}>
            Held by {unit.hold.heldByName}
            {unit.hold.leadName && ` for ${unit.hold.leadName}`} until{" "}
            {formatDate(unit.hold.expiresAt)}.
            {unit.hold.extensionCount > 0 && ` Extended ${unit.hold.extensionCount} time(s).`}
          </Alert>
        )}

        {unit.status === "AVAILABLE" && (can.hold || can.book) && (
          <div className="flex gap-2 border-t border-line-200 pt-3">
            {can.hold && (
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setReserving("hold")}>
                Hold unit
              </Button>
            )}
            {can.book && (
              <Button size="sm" className="flex-1" onClick={() => setReserving("book")}>
                Book unit
              </Button>
            )}
          </div>
        )}

        {unit.hold && (
          <div className="space-y-3 border-t border-line-200 pt-3">
            {can.extend && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                loading={busy}
                onClick={() => run(
                  () => extendHoldAction(unit.hold!.id, 7),
                  "Hold extended by 7 days.",
                )}
              >
                <TimerReset className="h-3.5 w-3.5" />
                Approve a 7-day extension
              </Button>
            )}

            {can.release && (
              <>
                <Field label="Release note">
                  <Textarea value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} rows={2} />
                </Field>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  loading={busy}
                  onClick={() => run(
                    () => releaseHoldAction(unit.hold!.id, releaseNote),
                    `Unit ${unit.unitNumber} released.`,
                  )}
                >
                  <LockOpen className="h-3.5 w-3.5" />
                  Release the hold
                </Button>
              </>
            )}
          </div>
        )}

        {reserving && (
          <ReserveDrawer
            mode={reserving}
            unitId={unit.id}
            unitNumber={unit.unitNumber}
            unitPlan={unit.unitTypeName ?? "Unit"}
            area={unit.superBuiltUpArea}
            customers={customers}
            onClose={() => setReserving(null)}
          />
        )}
      </div>
    </div>
  );
}
