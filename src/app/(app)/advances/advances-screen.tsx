"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ModuleStats } from "@/components/list/module-stats";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import {
  ADVANCE_EMPTY_FILTERED, ADVANCE_EMPTY_NONE, ADVANCE_PRIORITY_LABEL, ADVANCE_PRIORITY_TONE,
  ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE, advanceBandFigures, type AdvanceFigures,
} from "@/lib/advances/list-display";
import { cn, formatDate, money } from "@/lib/utils";
import { createAdvanceAction, decideAdvanceAction, deleteAdvanceAction } from "./actions";
import { FilterBar, Pill, Td, Th } from "../payouts/_shared/filter-bar";

interface Advance {
  id: string;
  riderId: string;
  riderCode: string;
  riderName: string;
  companies: string;
  amount: number;
  priority: string;
  reason: string | null;
  remarks: string | null;
  status: string;
  recoveredAmount: number;
  recoveryPerPeriod: number | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionRemarks: string | null;
}

type Decision = { advance: Advance; decision: "APPROVED" | "REJECTED" };

export function AdvancesScreen({
  advances, summary, companies, reasons, riders, picked, q, scopeWords, can,
}: {
  advances: Advance[];
  summary: AdvanceFigures;
  companies: Array<{ id: string; name: string }>;
  reasons: Array<{ id: string; name: string }>;
  riders: Array<{ id: string; label: string }>;
  picked: { status: string; priority: string; company: string };
  q: string;
  scopeWords: string | null;
  can: { create: boolean; approve: boolean; delete: boolean; export: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deciding, setDeciding] = React.useState<Decision | null>(null);
  const [remarks, setRemarks] = React.useState("");
  const [recovery, setRecovery] = React.useState("");
  const [deleting, setDeleting] = React.useState<Advance | null>(null);

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, ...picked })) if (v) query.set(k, v);
  const filtered = Boolean(q || picked.status || picked.priority || picked.company);

  async function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setError(null);
    const res = await work();
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "That did not work."); toast(res.error ?? "That did not work.", "bad"); return; }
    toast(done);
    setCreating(false);
    setDeciding(null);
    setDeleting(null);
    setRemarks("");
    setRecovery("");
    router.refresh();
  }

  function openDecision(advance: Advance, decision: "APPROVED" | "REJECTED") {
    setDeciding({ advance, decision });
    setRemarks("");
    setRecovery(String(advance.amount));
    setError(null);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Advances"
        description={scopeWords ? `${scopeWords} — requests, decisions and what is still being recovered.` : "Every advance request: approve with a recovery schedule, or reject with a reason."}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/advances/bike-rent"><Button size="sm" variant="secondary">Bike rent</Button></Link>
            {can.export && <ExportMenu href={(f) => exportHref("/api/advances/export", f, query)} />}
            {can.create && <Button size="sm" onClick={() => { setCreating(true); setError(null); }}>+ Advance request</Button>}
          </div>
        }
      />

      <ModuleStats figures={advanceBandFigures(summary)} />

      <FilterBar
        basePath="/advances"
        q={q}
        searchPlaceholder="Search rider, Rider ID or remarks…"
        filters={[
          { name: "status", label: "Status", value: picked.status, allLabel: "All statuses", options: [{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }] },
          { name: "priority", label: "Priority", value: picked.priority, allLabel: "Any priority", options: [{ value: "EMERGENCY", label: "Emergency" }, { value: "LOW", label: "Low priority" }] },
          { name: "company", label: "Company", value: picked.company, allLabel: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      >
        <span className="text-[11.5px] font-medium text-muted-600">{advances.length} request{advances.length === 1 ? "" : "s"}</span>
      </FilterBar>

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <Th>Rider</Th>
              <Th className="text-right">Amount</Th>
              <Th>Priority</Th>
              <Th>Reason</Th>
              <Th>Requested</Th>
              <Th>Recovery</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {advances.map((a) => {
              const outstanding = Math.max(0, a.amount - a.recoveredAmount);
              return (
                <tr key={a.id} className={cn("hover:bg-surface-tint", a.status === "PENDING" && a.priority === "EMERGENCY" && "bg-bad-025")}>
                  <Td>
                    <span className="block text-[13px] font-semibold text-navy-800">{a.riderName}</span>
                    <span className="num block text-[11px] font-medium text-muted-400">{a.riderCode}{a.companies ? ` · ${a.companies}` : ""}</span>
                  </Td>
                  <Td className="num text-right text-[13px] font-bold text-navy-950">{money(a.amount)}</Td>
                  <Td><Pill tone={ADVANCE_PRIORITY_TONE[a.priority] ?? "draft"}>{ADVANCE_PRIORITY_LABEL[a.priority] ?? a.priority}</Pill></Td>
                  <Td>
                    <span className="block text-[12px] font-medium text-navy-700">{a.reason ?? "—"}</span>
                    {a.remarks && <span className="block max-w-[220px] text-[11px] font-medium text-muted-400">{a.remarks}</span>}
                  </Td>
                  <Td className="text-[12px] font-medium text-navy-700">{formatDate(a.requestedAt)}</Td>
                  <Td className="text-[12px] font-medium text-navy-700">
                    {a.status === "APPROVED" ? (
                      <>
                        <span className="num block">{money(a.recoveredAmount)} of {money(a.amount)}</span>
                        <span className="num block text-[11px] text-muted-400">{money(a.recoveryPerPeriod ?? 0)} per payout · {money(outstanding)} to go</span>
                      </>
                    ) : "—"}
                  </Td>
                  <Td>
                    <Pill tone={ADVANCE_STATUS_TONE[a.status] ?? "draft"}>{ADVANCE_STATUS_LABEL[a.status] ?? a.status}</Pill>
                    {a.decidedBy && <span className="mt-1 block max-w-[200px] text-[11px] font-medium text-muted-400">{a.decidedBy}{a.decisionRemarks ? ` — ${a.decisionRemarks}` : ""}</span>}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {a.status === "PENDING" && can.approve && (
                        <>
                          <button type="button" disabled={busy} onClick={() => openDecision(a, "APPROVED")} className="cursor-pointer rounded-[7px] bg-good-600 px-[11px] py-[5px] text-[10.5px] font-bold text-white hover:bg-good-700 disabled:opacity-60">Approve</button>
                          <button type="button" disabled={busy} onClick={() => openDecision(a, "REJECTED")} className="cursor-pointer rounded-[7px] border border-[#F2CBCB] bg-[#FCEDED] px-[11px] py-[5px] text-[10.5px] font-bold text-[#B23334] hover:bg-[#F8DBDB] disabled:opacity-60">Reject</button>
                        </>
                      )}
                      {a.status === "PENDING" && can.delete && (
                        <button type="button" disabled={busy} onClick={() => setDeleting(a)} className="cursor-pointer rounded-[7px] border border-line-400 bg-white px-[11px] py-[5px] text-[10.5px] font-semibold text-muted-600 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">Delete</button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
            {advances.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-[38px] text-center text-[12.5px] font-medium text-muted-400">
                  {filtered ? ADVANCE_EMPTY_FILTERED.title : ADVANCE_EMPTY_NONE.title}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] font-medium text-muted-400">
        An approved advance is recovered from each payout at the amount set on approval, until it is cleared.
      </p>

      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title="New advance request"
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" form="new-advance" loading={busy}>Submit request</Button>
            </>
          }
        >
          <form
            id="new-advance"
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); void run(() => createAdvanceAction(new FormData(e.currentTarget)), "Advance requested."); }}
          >
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Rider" required>
              <Select name="employeeId" required defaultValue={riders.length === 1 ? riders[0].id : ""}>
                <option value="" disabled>Select…</option>
                {riders.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Amount (₹)" required>
              <Input name="amount" type="number" min={1} step={1} required />
            </Field>
            <Field label="Priority" required>
              <Select name="priority" defaultValue="LOW" required>
                <option value="EMERGENCY">Emergency</option>
                <option value="LOW">Low priority</option>
              </Select>
            </Field>
            <Field label="Reason">
              <Select name="reasonId" defaultValue="">
                <option value="">Select…</option>
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Remarks">
              <Textarea name="remarks" rows={2} />
            </Field>
          </form>
        </Modal>
      )}

      {deciding && (
        <Modal
          open
          onClose={() => setDeciding(null)}
          title={`${deciding.decision === "APPROVED" ? "Approve" : "Reject"} — ${deciding.advance.riderName} · ${money(deciding.advance.amount)}`}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setDeciding(null)}>Cancel</Button>
              <Button
                variant={deciding.decision === "APPROVED" ? "success" : "danger"}
                type="button"
                loading={busy}
                onClick={() => run(
                  () => decideAdvanceAction(deciding.advance.id, deciding.decision, remarks, deciding.decision === "APPROVED" ? Number(recovery) : null),
                  deciding.decision === "APPROVED" ? "Advance approved." : "Advance rejected.",
                )}
              >
                {deciding.decision === "APPROVED" ? "Approve" : "Reject"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            {deciding.decision === "APPROVED" && (
              <Field label="Recover per payout (₹)" required hint="Deducted from each payout until the advance is recovered.">
                <Input type="number" min={1} max={deciding.advance.amount} step={1} value={recovery} onChange={(e) => setRecovery(e.target.value)} autoFocus />
              </Field>
            )}
            <Field label={deciding.decision === "APPROVED" ? "Remarks" : "Reason"} required={deciding.decision === "REJECTED"}>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} />
            </Field>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteAdvanceAction(deleting.id), "Request deleted.")}
        title="Delete this request?"
        message={deleting ? `${deleting.riderName}'s request for ${money(deleting.amount)} is removed. Only a request nobody has decided on can be deleted.` : ""}
        loading={busy}
      />
    </div>
  );
}
