"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, Lock, LockOpen, TimerReset } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, qty } from "@/lib/utils";
import { extendHoldAction, holdUnitAction, releaseHoldAction } from "../../sales/cost-sheets/actions";

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
  HELD:       { cell: "border-warn-050 bg-warn-050 text-warn-700 hover:border-warn-700",    dot: "bg-warn-700",  label: "Held" },
  BOOKED:     { cell: "border-brand-100 bg-brand-100 text-brand-700 hover:border-brand-500", dot: "bg-brand-500", label: "Booked" },
  AGREEMENT:  { cell: "border-line-400 bg-surface-field text-navy-800 hover:border-navy-800", dot: "bg-navy-800",  label: "Agreement" },
  REGISTERED: { cell: "border-line-500 bg-line-400 text-navy-600 hover:border-navy-600",     dot: "bg-navy-500",  label: "Registered" },
  BLOCKED:    { cell: "border-bad-050 bg-bad-050 text-bad-600 hover:border-bad-600",         dot: "bg-bad-600",   label: "Blocked" },
};

export function BoardGrid({
  projects, activeProjectId, blocks, statusCounts, leads, can, nowMs,
}: {
  nowMs: number;
  projects: Array<{ id: string; name: string; code: string }>;
  activeProjectId: string;
  blocks: Block[];
  statusCounts: Array<{ status: string; count: number }>;
  leads: Array<{ id: string; name: string; leadNo: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Unit | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const total = statusCounts.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          {Object.entries(STATUS_STYLE).map(([status, style]) => {
            const count = statusCounts.find((s) => s.status === status)?.count ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", style.dot)} />
                <span className="text-xs text-muted-600">{style.label}</span>
                <span className="num text-xs font-semibold text-navy-950">{count}</span>
                <span className="text-[11px] text-muted-400">({pct}%)</span>
              </div>
            );
          })}

          <div className="ml-auto flex items-center gap-3">
            {projects.length > 1 && (
              <Select
                value={activeProjectId}
                onChange={(e) => router.push(`/units/board?project=${e.target.value}`)}
                className="w-52"
              >
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
            <span className="text-xs text-muted-500">
              <span className="num font-semibold text-navy-950">{total}</span> units
            </span>
          </div>
        </CardBody>
      </Card>

      {blocks.map((block) => {
        const floors = new Map<number, Unit[]>();
        for (const u of block.units) floors.set(u.floorNumber, [...(floors.get(u.floorNumber) ?? []), u]);
        const sorted = [...floors.entries()].sort((a, b) => b[0] - a[0]);

        return (
          <Card key={block.id}>
            <CardHeader>
              <CardTitle>{block.name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge tone="slate">{block.units.length} units</Badge>
                <Badge tone="good">
                  {block.units.filter((u) => u.status === "AVAILABLE").length} available
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="scroll-thin overflow-x-auto">
              <div className="min-w-max space-y-1.5">
                {sorted.map(([floor, units]) => (
                  <div key={floor} className="flex items-center gap-2">
                    <div className="w-16 shrink-0 text-right text-xs font-medium text-muted-400">
                      Floor {floor}
                    </div>
                    <div className="flex gap-1.5">
                      {units.map((u) => {
                        const style = STATUS_STYLE[u.status] ?? STATUS_STYLE.AVAILABLE;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelected(u)}
                            title={`${u.unitNumber} · ${u.unitTypeName ?? ""} · ${style.label}`}
                            className={cn(
                              "flex w-24 flex-col rounded border px-2 py-1.5 text-left transition",
                              style.cell,
                            )}
                          >
                            <span className="text-xs font-semibold leading-tight">{u.unitNumber}</span>
                            <span className="text-[10px] leading-tight opacity-75">
                              {u.unitTypeCode ?? "—"}
                              {can.viewPrice && ` · ${qty(u.superBuiltUpArea, 0)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        );
      })}

      {selected && (
        <UnitPanel
          unit={selected}
          leads={leads}
          can={can}
          onClose={() => setSelected(null)}
          nowMs={nowMs}
          onDone={(m) => { setSelected(null); setNotice(m); setError(null); router.refresh(); }}
          onError={(e) => { setError(e); setNotice(null); }}
        />
      )}
    </div>
  );
}

function UnitPanel({
  unit, leads, can, nowMs, onClose, onDone, onError,
}: {
  unit: Unit;
  nowMs: number;
  leads: Array<{ id: string; name: string; leadNo: string }>;
  can: Record<string, boolean>;
  onClose: () => void;
  onDone: (m: string) => void;
  onError: (e: string) => void;
}) {
  const [leadId, setLeadId] = React.useState("");
  const [days, setDays] = React.useState("7");
  const [releaseNote, setReleaseNote] = React.useState("");
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
    <Modal
      open
      onClose={onClose}
      title={`Unit ${unit.unitNumber}`}
      description={`${unit.unitTypeName ?? "—"} · floor ${unit.floorNumber} · ${style.label}`}
      size="sm"
    >
      <div className="space-y-4">
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

        {unit.status === "AVAILABLE" && can.hold && (
          <div className="space-y-3 border-t border-line-200 pt-3">
            <Field label="Hold for lead">
              <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">— Not linked —</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.leadNo})</option>)}
              </Select>
            </Field>
            <Field label="Hold for (days)" hint="The hold releases itself when it expires.">
              <Input type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Button
              size="sm"
              className="w-full"
              loading={busy}
              onClick={() => run(
                () => holdUnitAction(unit.id, leadId || null, Number(days) || 7),
                `Unit ${unit.unitNumber} held for ${days} day(s).`,
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              Hold this unit
            </Button>
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

        {["AVAILABLE", "HELD"].includes(unit.status) && can.quote && (
          <div className="border-t border-line-200 pt-3">
            <Link href={`/sales/cost-sheets/new?unit=${unit.id}${leadId ? `&lead=${leadId}` : ""}`}>
              <Button size="sm" variant="secondary" className="w-full">
                <Calculator className="h-3.5 w-3.5" />
                Generate a cost sheet
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Modal>
  );
}
