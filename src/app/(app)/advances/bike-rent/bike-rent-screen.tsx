"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ModuleStats } from "@/components/list/module-stats";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { BIKE_RENT_EMPTY, bikeRentBandFigures, bikeRentRunning, type BikeRentFigures } from "@/lib/advances/list-display";
import { formatDate, money } from "@/lib/utils";
import { createBikeRentAction, deleteBikeRentAction, endBikeRentAction, updateBikeRentAction } from "../actions";
import { FilterBar, Pill, Td, Th } from "../../payouts/_shared/filter-bar";

interface Rent {
  id: string;
  riderId: string;
  riderCode: string;
  riderName: string;
  bikeNumber: string;
  rentPerWeek: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

export function BikeRentScreen({
  rents, summary, today, companies, riders, picked, q, scopeWords, can,
}: {
  rents: Rent[];
  summary: BikeRentFigures;
  today: string;
  companies: Array<{ id: string; name: string }>;
  riders: Array<{ id: string; label: string }>;
  picked: { state: string; company: string };
  q: string;
  scopeWords: string | null;
  can: { create: boolean; update: boolean; delete: boolean; export: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Rent | "new" | null>(null);
  const [ending, setEnding] = React.useState<Rent | null>(null);
  const [endDate, setEndDate] = React.useState(today);
  const [deleting, setDeleting] = React.useState<Rent | null>(null);

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, ...picked })) if (v) query.set(k, v);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setError(null);
    const res = await work();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "That did not work."); toast(res.error ?? "That did not work.", "bad"); return; }
    toast(done);
    setEditing(null);
    setEnding(null);
    setDeleting(null);
    router.refresh();
  }

  const current = editing && editing !== "new" ? editing : null;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Bike rent"
        description={scopeWords ? `${scopeWords} — bikes on rent and what comes off each payout.` : "Assign a bike to a rider at a weekly rent; it is deducted from each payout while the assignment runs."}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/advances" className="hover:text-brand-600">Advances</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Bike rent</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {can.export && <ExportMenu href={(f) => exportHref("/api/advances/bike-rent/export", f, query)} />}
            {can.create && <Button size="sm" onClick={() => { setEditing("new"); setError(null); }}>+ Assign a bike</Button>}
          </div>
        }
      />

      <ModuleStats figures={bikeRentBandFigures(summary)} />

      <FilterBar
        basePath="/advances/bike-rent"
        q={q}
        searchPlaceholder="Search bike number, rider or Rider ID…"
        filters={[
          { name: "state", label: "State", value: picked.state, allLabel: "Running and ended", options: [{ value: "active", label: "Running" }, { value: "ended", label: "Ended" }] },
          { name: "company", label: "Company", value: picked.company, allLabel: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      >
        <span className="text-[11.5px] font-medium text-muted-600">{rents.length} bike{rents.length === 1 ? "" : "s"}</span>
      </FilterBar>

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <Th>Bike</Th>
              <Th>Rider</Th>
              <Th className="text-right">Rent per week</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th>State</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rents.map((r) => {
              const running = bikeRentRunning(r.endDate, today);
              return (
                <tr key={r.id} className="hover:bg-surface-tint">
                  <Td>
                    <span className="num block text-[13px] font-semibold text-navy-800">{r.bikeNumber}</span>
                    {r.notes && <span className="block max-w-[220px] text-[11px] font-medium text-muted-400">{r.notes}</span>}
                  </Td>
                  <Td>
                    <span className="block text-[12.5px] font-semibold text-navy-700">{r.riderName}</span>
                    <span className="num block text-[11px] font-medium text-muted-400">{r.riderCode}</span>
                  </Td>
                  <Td className="num text-right text-[13px] font-bold text-navy-950">{money(r.rentPerWeek)}</Td>
                  <Td className="text-[12px] font-medium text-navy-700">{formatDate(r.startDate)}</Td>
                  <Td className="text-[12px] font-medium text-navy-700">{r.endDate ? formatDate(r.endDate) : "—"}</Td>
                  <Td><Pill tone={running ? "info" : "draft"}>{running ? "Running" : "Ended"}</Pill></Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {can.update && <button type="button" disabled={busy} onClick={() => { setEditing(r); setError(null); }} className="cursor-pointer rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-muted-600 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">Edit</button>}
                      {can.update && running && <button type="button" disabled={busy} onClick={() => { setEnding(r); setEndDate(today); setError(null); }} className="cursor-pointer rounded-[7px] border border-[#F2CBCB] bg-[#FCEDED] px-[11px] py-[5px] text-[10.5px] font-bold text-[#B23334] hover:bg-[#F8DBDB] disabled:opacity-60">End</button>}
                      {can.delete && <button type="button" disabled={busy} onClick={() => setDeleting(r)} className="cursor-pointer rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-muted-600 hover:border-bad-600 hover:text-bad-700 disabled:opacity-60">Delete</button>}
                    </div>
                  </Td>
                </tr>
              );
            })}
            {rents.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">{BIKE_RENT_EMPTY.title}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={current ? `Edit bike ${current.bikeNumber}` : "Assign a bike"}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" form="bike-rent-form" loading={busy}>{current ? "Save changes" : "Assign bike"}</Button>
            </>
          }
        >
          <form
            id="bike-rent-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void run(
                () => (current ? updateBikeRentAction(current.id, fd) : createBikeRentAction(fd)),
                current ? "Bike assignment changed." : "Bike assigned.",
              );
            }}
          >
            {error && <Alert tone="error">{error}</Alert>}
            {!current && (
              <Field label="Rider" required>
                <Select name="employeeId" required defaultValue="">
                  <option value="" disabled>Select…</option>
                  {riders.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Bike number" required>
              <Input name="bikeNumber" defaultValue={current?.bikeNumber ?? ""} placeholder="KA 01 AB 1234" required className="uppercase" />
            </Field>
            <Field label="Rent per week (₹)" required>
              <Input name="rentPerWeek" type="number" min={1} step={1} defaultValue={current?.rentPerWeek ?? ""} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" required>
                <Input name="startDate" type="date" defaultValue={current?.startDate ?? today} required />
              </Field>
              <Field label="End date" hint="Blank while it runs">
                <Input name="endDate" type="date" defaultValue={current?.endDate ?? ""} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" rows={2} defaultValue={current?.notes ?? ""} />
            </Field>
          </form>
        </Modal>
      )}

      {ending && (
        <Modal
          open
          onClose={() => setEnding(null)}
          title={`End bike ${ending.bikeNumber}`}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setEnding(null)}>Cancel</Button>
              <Button variant="danger" type="button" loading={busy} onClick={() => run(() => endBikeRentAction(ending.id, endDate), "Assignment ended.")}>End assignment</Button>
            </>
          }
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Last day" required hint="Rent stops being deducted after this day.">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteBikeRentAction(deleting.id), "Bike assignment removed.")}
        title="Remove this bike assignment?"
        message={deleting ? `${deleting.bikeNumber} for ${deleting.riderName}. Payouts already posted keep the rent they deducted.` : ""}
        loading={busy}
      />
    </div>
  );
}
