"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert, Badge, Field, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { cn, formatDate, moneyShort, phone, qty } from "@/lib/utils";
import { releaseHoldAction } from "../../sales/cost-sheets/actions";
import { cancelBookingAction } from "../../sales/bookings/actions";
import { boardState, blockName } from "@/lib/units/board";
import { ReserveDrawer } from "./reserve-drawer";

interface Hold {
  id: string; expiresAt: string; heldByName: string;
  leadName: string | null; extensionCount: number;
  /** Who it is being held for — what the design's panel names. */
  customerId: string | null; customerName: string | null; customerPhone: string | null;
  remarks: string | null;
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



/** One state, one colour, everywhere. */
const STATUS_STYLE: Record<string, { cell: string; dot: string; label: string }> = {
  // Each tint is drawn with its own edge, as the design draws it — the border
  // is not the fill colour repeated.
  AVAILABLE: { cell: "border-good-400 bg-good-050 text-good-700 hover:border-good-600",     dot: "bg-good-600",  label: "Available" },
  HELD:      { cell: "border-warn-400 bg-warn-050 text-warn-800 hover:border-warn-700",     dot: "bg-warn-700",  label: "Held" },
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
  projects, activeProjectId, blocks, customers, can, projectType, priceList, bookingHistory = [],
}: {
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
  // "Cluster A" for a villa project, "Tower A" otherwise — shared with the
  // board the phone is sent.
  const blockLabel = (b: Block) => blockName(b.name, projectType);

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
                {blockLabel(b)}
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
              {project?.name}{block ? ` · ${blockLabel(block)}` : ""}
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
  unit, customers, can, onDone, onError,
}: {
  unit: Unit;
  customers: Array<{ id: string; name: string; phone: string }>;
  can: Record<string, boolean>;
  onDone: (m: string) => void;
  onError: (e: string) => void;
}) {
  const [releaseNote, setReleaseNote] = React.useState("");
  const [reserving, setReserving] = React.useState<"hold" | "book" | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const style = STATUS_STYLE[boardState(unit.status)];

  // The design names one person against a flat: who it is held for, or who
  // bought it. A hold taken from a lead has no customer yet, so the lead's name
  // stands in rather than leaving the card blank.
  const held = unit.status === "HELD";
  const holder = unit.booking
    ? unit.booking.customerName
    : unit.hold
      ? unit.hold.customerName ?? unit.hold.leadName
      : null;
  const holderLabel = held ? "Held for" : "Booked for";
  const releaseLabel = held ? "Release hold" : "Remove booking";
  // A registered flat is not released from a board — that takes a deed
  // cancellation, and the action refuses it — so the button is not offered.
  const canRelease = held
    ? can.release && !!unit.hold
    : !!unit.booking && can.cancelBooking && unit.status !== "REGISTERED";
  const canReserve = unit.status === "AVAILABLE" || held;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Something went wrong."); onError(res.error ?? ""); }
    else onDone(msg);
  }

  /** One button, two things behind it: a hold just goes, a booking is asked about. */
  function release() {
    if (held) {
      void run(
        () => releaseHoldAction(unit.hold!.id, ""),
        `Unit ${unit.unitNumber} released — back to available.`,
      );
      return;
    }
    setReleaseNote("");
    setConfirming(true);
  }

  async function removeBooking() {
    await run(
      () => cancelBookingAction(unit.booking!.id, releaseNote),
      `Unit ${unit.unitNumber} released — back to available.`,
    );
    setConfirming(false);
  }

  return (
    <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
      {/* The design's navy header on the selected unit. */}
      <div
        className="flex items-center justify-between gap-2 px-[18px] py-[15px]"
        style={{ background: "linear-gradient(150deg,#191A5C,#2F308C)" }}
      >
        <div className="min-w-0">
          <p className="font-display text-[15px] font-bold text-white">Unit {unit.unitNumber}</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-[#9AA0D6]">
            {unit.unitTypeName ?? "—"} · {qty(unit.superBuiltUpArea, 0)} sq ft · {style.label}
          </p>
        </div>
        <span className="inline-block shrink-0 whitespace-nowrap rounded-full bg-[#5BC8F2] px-2.5 py-[5px] text-[10.5px] font-bold text-navy-950">
          {style.label}
        </span>
      </div>

      <div className="px-[18px] py-3.5">
        {error && <div className="mb-2.5"><Alert tone="error">{error}</Alert></div>}

        {holder && (
          <>
            <HolderCard label={holderLabel} name={holder} />
            {canRelease && (
              <button
                type="button"
                disabled={busy}
                onClick={release}
                className="mt-[9px] w-full cursor-pointer rounded-[9px] border border-[#F2CBCB] bg-[#FCEDED] px-3 py-2.5 text-[12px] font-bold text-[#B23334] transition-colors hover:bg-[#F8DBDB] disabled:opacity-60"
              >
                {releaseLabel} — back to Available
              </button>
            )}
          </>
        )}

        {canReserve && (
          <div className="mt-[11px] flex gap-2">
            {can.hold && (
              <button
                type="button"
                onClick={() => setReserving("hold")}
                className="flex-1 cursor-pointer rounded-[9px] border border-[#E0B26A] bg-[#FDF3E7] px-3 py-[11px] text-[12.5px] font-bold text-[#8A5A12] transition-colors hover:bg-[#FAE8CF]"
              >
                Hold unit
              </button>
            )}
            {can.book && (
              <button
                type="button"
                onClick={() => setReserving("book")}
                className="flex-1 cursor-pointer rounded-[9px] bg-[#1F9D66] px-3 py-[11px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#178555]"
              >
                Book unit
              </button>
            )}
          </div>
        )}
      </div>

      {/*
        Removing a booking takes money off the books, so the reason the action
        insists on is asked here rather than invented. The design's panel is one
        button; what the click opens is not something it describes.
      */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove the booking on ${unit.unitNumber}?`}
        description="The flat goes back to Available and every unpaid demand on it is cancelled."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!releaseNote.trim()}
              onClick={removeBooking}
            >
              Remove booking
            </Button>
          </>
        }
      >
        <Field label="Why is it being released?" required>
          <Textarea
            value={releaseNote}
            onChange={(e) => setReleaseNote(e.target.value)}
            rows={3}
            placeholder="e.g. customer withdrew, cheque bounced"
          />
        </Field>
      </Modal>

      {reserving && (
        <ReserveDrawer
          mode={reserving}
          unitId={unit.id}
          unitNumber={unit.unitNumber}
          unitPlan={unit.unitTypeName ?? "Unit"}
          area={unit.superBuiltUpArea}
          customers={customers}
          heldForId={unit.hold?.customerId ?? null}
          onClose={() => setReserving(null)}
        />
      )}
    </div>
  );
}

/**
 * The design's holder card: an avatar, the relationship in small caps, and the
 * name. The design uses the same card for a hold and for a booking, with only
 * the label changing.
 */
function HolderCard({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-line-200 bg-surface-tint px-[13px] py-[11px]">
      {/* The design's own glyph, not a drawn icon — a lucide outline reads thinner. */}
      <span
        aria-hidden
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,#0089C9,#2F308C)] text-[13px] text-white"
      >
        👤
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[.05em] text-muted-400">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-bold text-navy-950">{name}</span>
      </span>
    </div>
  );
}
