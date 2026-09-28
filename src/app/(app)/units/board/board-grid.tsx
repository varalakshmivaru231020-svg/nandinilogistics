"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockOpen, TimerReset } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Field, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, moneyShort, phone, qty } from "@/lib/utils";
import { extendHoldAction, releaseHoldAction } from "../../sales/cost-sheets/actions";
import { cancelBookingAction } from "../../sales/bookings/actions";
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
  booking: Booking | null;
}

/** The booking a flat went out on, so the panel can name who holds it. */
interface Booking {
  id: string; bookingNo: string; bookedOn: string; status: string; total: number;
  customerName: string; customerPhone: string; soldByName: string | null;
}

interface Block { id: string; name: string; units: Unit[] }

/** A row of what has gone out on this project. */
export interface BookingRow {
  id: string; bookingNo: string; bookedOn: string; status: string; total: number;
  unitNumber: string; unitTypeName: string | null;
  customerName: string; customerPhone: string; soldByName: string | null;
}

/**
 * The board paints three states, as the design does: a flat is free, someone is
 * holding it, or it is gone. Everything after a booking — agreement, registry —
 * is still gone, and a blocked flat is held back.
 */
const BOARD_STATE: Record<string, "AVAILABLE" | "HELD" | "BOOKED"> = {
  AVAILABLE: "AVAILABLE",
  HELD: "HELD",
  BLOCKED: "HELD",
  BOOKED: "BOOKED",
  AGREEMENT: "BOOKED",
  REGISTERED: "BOOKED",
};

const boardState = (status: string) => BOARD_STATE[status] ?? "AVAILABLE";

/** One state, one colour, everywhere. */
const STATUS_STYLE: Record<string, { cell: string; dot: string; label: string }> = {
  // Each tint is drawn with its own edge, as the design draws it — the border
  // is not the fill colour repeated.
  AVAILABLE: { cell: "border-good-400 bg-good-050 text-good-700 hover:border-good-600",     dot: "bg-good-600",  label: "Available" },
  HELD:      { cell: "border-warn-400 bg-warn-050 text-warn-800 hover:border-warn-700",     dot: "bg-warn-700",  label: "On hold" },
  // Booked is drawn in red at the client's request. The reference design draws
  // it blue (#E3F2FC on #6FB6DE); red is this app's colour for a problem
  // everywhere else, so the two now differ here on purpose.
  BOOKED:    { cell: "border-bad-300 bg-bad-050 text-bad-700 hover:border-bad-600", dot: "bg-bad-600", label: "Booked" },
};

/** The design's legend swatches: a tint with a stronger border. */
const LEGEND: Record<string, string> = {
  AVAILABLE: "border-good-400 bg-good-050",
  HELD: "border-warn-400 bg-warn-050",
  BOOKED: "border-bad-300 bg-bad-050",
};

export function BoardGrid({
  projects, activeProjectId, blocks, customers, can, nowMs, projectType, priceList, bookingHistory = [],
}: {
  nowMs: number;
  projects: Array<{ id: string; name: string; code: string }>;
  activeProjectId: string;
  blocks: Block[];
  /** Villa and plotted projects have clusters, not towers, as the design names them. */
  projectType: string | null;
  /** What has been booked on this project, newest first. */
  bookingHistory?: BookingRow[];
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
  // The design keeps every flat on the board and fades the ones a filter
  // excludes, so a tower does not change shape as the filters are used.
  const dimmed = (u: Unit) =>
    !((status === "all" || boardState(u.status) === status) && (type === "all" || u.unitTypeName === type));

  const floors = new Map<number, Unit[]>();
  for (const u of units) floors.set(u.floorNumber, [...(floors.get(u.floorNumber) ?? []), u]);
  const rows = [...floors.entries()].sort((a, b) => b[0] - a[0]);

  const count = (s: string) => units.filter((u) => boardState(u.status) === s).length;

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
                <ProjectChip
                  key={p.id}
                  picked={p.id === activeProjectId}
                  onClick={() => router.push(`/units/board?project=${p.id}`)}
                >
                  {p.name}
                </ProjectChip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted-600">
              {([["AVAILABLE", "Available"], ["HELD", "Held"], ["BOOKED", "Booked"]] as const).map(([key, label]) => (
                <span key={key} className="flex items-center gap-[5px]">
                  <span className={cn("inline-block h-[11px] w-[11px] rounded-[4px] border", LEGEND[key])} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Towers, status and type */}
          <div className="mb-3 flex flex-wrap items-center gap-[7px]">
            {blocks.map((b) => (
              <TowerChip key={b.id} picked={b.id === block?.id} onClick={() => { setBlockId(b.id); setSelected(null); }}>
                {blockName(b)}
              </TowerChip>
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
                  const style = STATUS_STYLE[boardState(u.status)];
                  const faded = dimmed(u);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={faded}
                      onClick={() => setSelected(u)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-[9px] border px-1 py-2 text-center transition-transform hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(25,26,92,.13)]",
                        faded && "pointer-events-none opacity-[.18]",
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
                No units in this tower yet
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
            <div className="rounded-[13px] border border-dashed border-muted-200 px-5 py-7 text-center text-[12px] font-medium text-muted-500">
              Select a unit on the board to view details, hold or book it
            </div>
          )}
        </div>
      </div>

      {bookingHistory.length > 0 && (
        <div className="mt-3.5 overflow-hidden rounded-[13px] border border-line-400 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-200 px-[18px] py-3.5">
            <span className="font-display text-[13.5px] font-bold text-navy-950">Booking history</span>
            <span className="text-[11.5px] font-medium text-muted-600">
              Every flat that has gone out on this project, newest first
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="bg-surface-sunken">
                  {["Flat", "Customer", "Booked on", "Value", "Status", "Sold by"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                        h === "Value" ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookingHistory.map((b) => (
                  <tr key={b.id} className="border-b border-line-150 last:border-0 hover:bg-surface-tint">
                    <td className="px-4 py-3.5">
                      <div className="text-[12.5px] font-bold text-navy-950">{b.unitNumber}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                        {b.unitTypeName ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[12.5px] font-semibold text-navy-900">{b.customerName}</div>
                      <div className="num mt-0.5 text-[11px] font-medium text-muted-400">
                        {phone(b.customerPhone)}
                      </div>
                    </td>
                    <td className="num px-4 py-3.5 text-[12px] font-semibold text-navy-600">
                      {formatDate(b.bookedOn)}
                    </td>
                    <td className="num px-4 py-3.5 text-right text-[12.5px] font-bold text-navy-950">
                      {moneyShort(b.total)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={b.status === "CANCELLED" ? "bad" : "good"}>
                        {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-[12px] font-medium text-navy-500">
                      {b.soldByName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
        "cursor-pointer rounded-full border px-[11px] py-[6px] text-[11px] font-semibold transition-colors",
        picked
          ? "border-brand-500 bg-brand-100 text-brand-700"
          : "border-line-400 bg-white text-muted-600 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A tower is picked with the design's larger chip — 9px/16px at 12px bold,
 * the size of a project chip rather than of a status filter beside it.
 */
function TowerChip({
  children, picked, onClick,
}: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-4 py-[9px] text-[12px] font-bold transition-colors",
        picked
          ? "border-brand-500 bg-brand-100 text-brand-700"
          : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}

/** The project the board is showing is the design's one solid chip. */
function ProjectChip({
  children, picked, onClick,
}: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-4 py-[9px] text-[12px] font-bold transition-colors",
        picked
          ? "border-brand-500 bg-[linear-gradient(140deg,#0089C9,#2F308C)] text-white shadow-[0_5px_14px_rgba(0,137,201,.25)]"
          : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
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

  const style = STATUS_STYLE[boardState(unit.status)];
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

        {unit.booking && (
          <div className="rounded-[11px] border border-line-300 bg-surface-tint px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-400">
              Booked to
            </p>
            <p className="mt-[3px] text-[13px] font-bold text-navy-950">{unit.booking.customerName}</p>
            <p className="num mt-0.5 text-[11.5px] font-semibold text-brand-700">
              {phone(unit.booking.customerPhone)}
            </p>
            <p className="mt-2 text-[11px] font-medium text-muted-500">
              <span className="num">{unit.booking.bookingNo}</span> · {formatDate(unit.booking.bookedOn)}
              {unit.booking.soldByName && ` · sold by ${unit.booking.soldByName}`}
            </p>
            <p className="num mt-0.5 text-[12px] font-bold text-navy-900">
              {moneyShort(unit.booking.total)}
            </p>
          </div>
        )}

        {unit.booking && can.cancelBooking && (
          <div className="space-y-3 border-t border-line-200 pt-3">
            <Field label="Why is it being released?" required>
              <Textarea
                value={releaseNote}
                onChange={(e) => setReleaseNote(e.target.value)}
                rows={2}
                placeholder="e.g. customer withdrew, cheque bounced"
              />
            </Field>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              loading={busy}
              disabled={!releaseNote.trim()}
              onClick={() => run(
                () => cancelBookingAction(unit.booking!.id, releaseNote),
                `Unit ${unit.unitNumber} released — back to available.`,
              )}
            >
              <LockOpen className="h-3.5 w-3.5" />
              Release the booking
            </Button>
          </div>
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
