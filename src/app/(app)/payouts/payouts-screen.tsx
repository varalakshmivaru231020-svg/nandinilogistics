"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ModuleStats } from "@/components/list/module-stats";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, PageHeader, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  PAYOUT_EMPTY_FILTERED, PAYOUT_EMPTY_NONE, PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE, payoutBandFigures,
  type PayoutLineFigures,
} from "@/lib/payouts/list-display";
import { cn, formatDate, money } from "@/lib/utils";
import { holdPayoutLineAction, releasePayoutLineAction } from "./actions";
import { FilterBar, Pill, Td, Th } from "./_shared/filter-bar";

interface Line {
  id: string;
  riderCode: string;
  riderName: string | null;
  company: string;
  importId: string;
  importStatus: string;
  periodFrom: string;
  periodTo: string;
  totalPayout: number;
  advance: number;
  bikeRental: number;
  tds: number;
  finalPayout: number;
  status: string;
  holdReason: string | null;
}

export function PayoutsScreen({
  lines, summary, companies, picked, q, scopeWords, can,
}: {
  lines: Line[];
  summary: PayoutLineFigures;
  companies: Array<{ id: string; name: string }>;
  picked: { company: string; status: string; from: string; to: string };
  q: string;
  scopeWords: string | null;
  can: { hold: boolean; export: boolean; imports: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [holding, setHolding] = React.useState<Line | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, ...picked })) if (v) query.set(k, v);
  const filtered = Boolean(q || picked.company || picked.status || picked.from || picked.to);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", "bad"); return; }
    toast(done);
    setHolding(null);
    setReason("");
    router.refresh();
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Payouts"
        description={scopeWords ? `${scopeWords} — period-wise total, deductions and final payout.` : "Every rider's payout, period by period, as posted from the company sheets."}
        actions={
          <div className="flex items-center gap-2">
            {can.imports && (
              <Link href="/payouts/imports">
                <Button size="sm" variant="secondary">Payout sheets</Button>
              </Link>
            )}
            {can.export && <ExportMenu href={(f) => exportHref("/api/payouts/export", f, query)} />}
          </div>
        }
      />

      <ModuleStats figures={payoutBandFigures(summary)} />

      <FilterBar
        basePath="/payouts"
        q={q}
        searchPlaceholder="Search Rider ID or name…"
        filters={[
          { name: "company", label: "Company", value: picked.company, allLabel: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
          { name: "status", label: "Status", value: picked.status, allLabel: "Paid and held", options: [{ value: "PAID", label: "Paid" }, { value: "HOLD", label: "On hold" }] },
        ]}
        dateRange={{ label: "Period", from: picked.from, to: picked.to }}
      >
        <span className="text-[11.5px] font-medium text-muted-600">{lines.length} line{lines.length === 1 ? "" : "s"}</span>
      </FilterBar>

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <Th>Rider</Th>
              <Th>Company · period</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Advance</Th>
              <Th className="text-right">Bike rent</Th>
              <Th className="text-right">TDS</Th>
              <Th className="text-right">Final</Th>
              <Th>Status</Th>
              {can.hold && <Th className="text-right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={cn("hover:bg-surface-tint", l.status === "HOLD" && "bg-warn-050")}>
                <Td>
                  <span className="block text-[13px] font-semibold text-navy-800">{l.riderName ?? l.riderCode}</span>
                  <span className="num block text-[11px] font-medium text-muted-400">{l.riderCode}</span>
                </Td>
                <Td>
                  <span className="block text-[12.5px] font-semibold text-navy-700">{l.company}</span>
                  <span className="block text-[11px] font-medium text-muted-400">
                    {formatDate(l.periodFrom)} – {formatDate(l.periodTo)}
                    {l.importStatus === "DRAFT" && <span className="ml-1.5 rounded-full bg-surface-field px-1.5 py-0.5 text-[9.5px] font-bold text-navy-600">DRAFT</span>}
                  </span>
                </Td>
                <Td className="num text-right text-[12.5px] font-semibold text-navy-800">{money(l.totalPayout)}</Td>
                <Td className="num text-right text-[12px] text-muted-600">{money(l.advance)}</Td>
                <Td className="num text-right text-[12px] text-muted-600">{money(l.bikeRental)}</Td>
                <Td className="num text-right text-[12px] text-muted-600">{money(l.tds)}</Td>
                <Td className="num text-right text-[13px] font-bold text-navy-950">{money(l.finalPayout)}</Td>
                <Td>
                  <Pill tone={PAYOUT_STATUS_TONE[l.status] ?? "draft"}>{PAYOUT_STATUS_LABEL[l.status] ?? l.status}</Pill>
                  {l.holdReason && <span className="mt-1 block max-w-[200px] text-[11px] font-medium text-warn-800">{l.holdReason}</span>}
                </Td>
                {can.hold && (
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {l.importStatus === "POSTED" && l.status === "PAID" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setHolding(l)}
                          className="cursor-pointer rounded-[7px] border border-[#F2CBCB] bg-[#FCEDED] px-[11px] py-[5px] text-[10.5px] font-bold text-[#B23334] hover:bg-[#F8DBDB] disabled:opacity-60"
                        >
                          Hold
                        </button>
                      )}
                      {l.importStatus === "POSTED" && l.status === "HOLD" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => releasePayoutLineAction(l.id), "Payout released.")}
                          className="cursor-pointer rounded-[7px] bg-good-600 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-good-700 disabled:opacity-60"
                        >
                          Release
                        </button>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  {filtered ? PAYOUT_EMPTY_FILTERED.title : PAYOUT_EMPTY_NONE.title}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] font-medium text-muted-400">
        Final payout = Total − Advance − Bike rental − TDS, as the formula in Masters says. A held payout carries its reason.
      </p>

      {holding && (
        <Modal
          open
          onClose={() => setHolding(null)}
          title={`Hold payout — ${holding.riderName ?? holding.riderCode}`}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setHolding(null)}>Cancel</Button>
              <Button
                variant="danger"
                type="button"
                loading={busy}
                onClick={() => run(() => holdPayoutLineAction(holding.id, reason), "Payout held.")}
              >
                Hold payout
              </Button>
            </>
          }
        >
          <Field label="Reason for the hold" required hint="The rider and the Team Leader see this.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
