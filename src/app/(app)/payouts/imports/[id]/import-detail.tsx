"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Field, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE } from "@/lib/payouts/list-display";
import { cn, money } from "@/lib/utils";
import {
  correctPayoutLineAction, deletePayoutImportAction, holdPayoutLineAction, postPayoutImportAction,
  releasePayoutLineAction,
} from "../../actions";
import { Pill, Td, Th } from "../../_shared/filter-bar";

interface Line {
  id: string;
  riderCode: string;
  employeeId: string | null;
  employeeName: string | null;
  totalPayout: number;
  advance: number;
  bikeRental: number;
  tds: number;
  finalPayout: number;
  status: string;
  holdReason: string | null;
}

export function ImportDetail({
  importId, status, lines, candidates, can,
}: {
  importId: string;
  status: string;
  lines: Line[];
  candidates: Array<{ id: string; label: string }>;
  can: { post: boolean; correct: boolean; delete: boolean; hold: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirmPost, setConfirmPost] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [holding, setHolding] = React.useState<Line | null>(null);
  const [reason, setReason] = React.useState("");

  const unmatched = lines.filter((l) => !l.employeeId).length;
  const total = lines.reduce((s, l) => s + l.finalPayout, 0);
  const draft = status === "DRAFT";

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", "bad"); return; }
    toast(done);
    setConfirmPost(false);
    setConfirmDelete(false);
    setHolding(null);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-3 rounded-[13px] border border-line-400 bg-white px-5 py-3.5">
        <Pill tone={draft ? "draft" : "good"}>{draft ? "Draft" : "Posted"}</Pill>
        <span className="text-[12.5px] font-semibold text-navy-800">{lines.length} rows</span>
        {unmatched > 0 && <span className="rounded-full bg-bad-050 px-2.5 py-1 text-[10.5px] font-bold text-bad-700">{unmatched} unmatched</span>}
        <span className="num text-[12.5px] font-bold text-navy-950">{money(total)} final payout</span>
        <div className="flex-1" />
        {draft && can.delete && (
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete draft</Button>
        )}
        {draft && can.post && (
          <Button size="sm" onClick={() => setConfirmPost(true)} disabled={busy || unmatched > 0} title={unmatched > 0 ? "Match every row first" : undefined}>
            Post payout
          </Button>
        )}
      </div>

      {draft && unmatched > 0 && (
        <Alert tone="warn" title={`${unmatched} row${unmatched === 1 ? "" : "s"} could not be matched to a rider`}>
          The Rider ID on the sheet is not one deployed to this company. Pick the right person on each row, then post.
        </Alert>
      )}

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <Th>Rider ID on sheet</Th>
              <Th>Rider</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Advance</Th>
              <Th className="text-right">Bike rent</Th>
              <Th className="text-right">TDS</Th>
              <Th className="text-right">Final</Th>
              <Th>Status</Th>
              {!draft && can.hold && <Th className="text-right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={cn(!l.employeeId && "bg-warn-050", l.status === "HOLD" && "bg-warn-050")}>
                <Td className="num text-[12.5px] font-semibold text-navy-800">{l.riderCode}</Td>
                <Td>
                  {l.employeeName ? (
                    <span className="text-[12.5px] font-medium text-navy-700">{l.employeeName}</span>
                  ) : draft && can.correct ? (
                    <select
                      defaultValue=""
                      disabled={busy}
                      onChange={(e) => { if (e.target.value) void run(() => correctPayoutLineAction(l.id, e.target.value), "Row matched."); }}
                      className="cursor-pointer rounded-[8px] border border-warn-400 bg-warn-050 px-2.5 py-1.5 text-[11.5px] font-semibold text-warn-800"
                    >
                      <option value="">Match to a rider…</option>
                      {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-[12px] font-semibold text-warn-800">Not matched</span>
                  )}
                </Td>
                <Td className="num text-right text-[12.5px] font-semibold">{money(l.totalPayout)}</Td>
                <Td className="num text-right text-[12px] text-muted-600">{money(l.advance)}</Td>
                <Td className="num text-right text-[12px] text-muted-600">{money(l.bikeRental)}</Td>
                <Td className="num text-right text-[12px] text-muted-600">{money(l.tds)}</Td>
                <Td className="num text-right text-[13px] font-bold text-navy-950">{money(l.finalPayout)}</Td>
                <Td>
                  <Pill tone={PAYOUT_STATUS_TONE[l.status] ?? "draft"}>{PAYOUT_STATUS_LABEL[l.status] ?? l.status}</Pill>
                  {l.holdReason && <span className="mt-1 block text-[11px] font-medium text-warn-800">{l.holdReason}</span>}
                </Td>
                {!draft && can.hold && (
                  <Td>
                    <div className="flex justify-end">
                      {l.status === "PAID" ? (
                        <button type="button" disabled={busy} onClick={() => setHolding(l)} className="cursor-pointer rounded-[7px] border border-[#F2CBCB] bg-[#FCEDED] px-[11px] py-[5px] text-[10.5px] font-bold text-[#B23334] hover:bg-[#F8DBDB] disabled:opacity-60">Hold</button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => run(() => releasePayoutLineAction(l.id), "Payout released.")} className="cursor-pointer rounded-[7px] bg-good-600 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-good-700 disabled:opacity-60">Release</button>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] font-medium text-muted-400">
        {draft
          ? "On posting, the final payout is recomputed from the formula in Masters: where the sheet carries no advance or bike rent, the system's approved advances and running bike rent are deducted instead."
          : "Posted. Riders and Team Leaders see these lines under Payouts; a held line carries its reason."}
      </p>

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() => run(() => postPayoutImportAction(importId), "Payout posted.")}
        title="Post this payout?"
        message={`${lines.length} riders are told their payout for the period is ready. Advances approved in the system are marked recovered by what this payout deducts.`}
        confirmLabel="Post payout"
        loading={busy}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => run(async () => {
          const res = await deletePayoutImportAction(importId);
          if (res.ok) router.push("/payouts/imports");
          return res;
        }, "Draft deleted.")}
        title="Delete this draft sheet?"
        message="Its rows are removed. Nothing has been posted from it."
        loading={busy}
      />
      {holding && (
        <Modal
          open
          onClose={() => setHolding(null)}
          title={`Hold payout — ${holding.employeeName ?? holding.riderCode}`}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setHolding(null)}>Cancel</Button>
              <Button variant="danger" type="button" loading={busy} onClick={() => run(() => holdPayoutLineAction(holding.id, reason), "Payout held.")}>Hold payout</Button>
            </>
          }
        >
          <Field label="Reason for the hold" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  );
}
