"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, moneyShort } from "@/lib/utils";
import {
  APPROVAL_KINDS, KIND_LABEL, countByKind, filterApprovals, needsDelayClassification, waitingFor,
  type ApprovalKind, type ApprovalRow,
} from "@/lib/approvals/queue";
import { approveIndentAction, rejectIndentAction } from "../material/indents/actions";
import { approvePoAdminAction, approvePoPmAction } from "../material/purchase-orders/actions";
import { approveReturnAction, rejectReturnAction } from "../material/returns/actions";
import { approveTransferAction } from "../material/transfers/actions";
import { approveInvoiceAction } from "../material/invoices/actions";
import { decideExtensionPmAction } from "../schedule/extension-actions";
import {
  closeTaskAction, decideExtensionAction as decideTaskExtensionAction, decideLevelAction,
  sendBackTaskAction,
} from "../tasks/actions";

type Decision = { row: ApprovalRow; approve: boolean };

/**
 * The approvals queue: one list, filtered by kind and searched by the number on
 * the paper or the name of whoever raised it.
 *
 * A row can only be decided here when the viewer holds the permission for that
 * decision; everything else offers the record instead. The decisions that need
 * more than a remark — revising quantities on an indent, setting a revised date
 * on an extension — send you to the screen that can do it properly.
 */
export function ApprovalsScreen({ rows, nowMs }: { rows: ApprovalRow[]; nowMs: number }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = React.useState<ApprovalKind | "all">("all");
  const [q, setQ] = React.useState("");
  const [deciding, setDeciding] = React.useState<Decision | null>(null);
  const [remark, setRemark] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [control, setControl] = React.useState<"CONTROLLABLE" | "UNCONTROLLABLE">("UNCONTROLLABLE");

  const counts = countByKind(rows);
  const shown = filterApprovals(rows, { kind, q });

  async function decide() {
    if (!deciding) return;
    const { row, approve } = deciding;
    setBusy(true);
    setError(null);

    const atAdmin = row.waitingOn === "Owner / Admin";
    const res = await (async () => {
      switch (row.kind) {
        case "INDENT":
          return approve
            ? approveIndentAction(row.id, atAdmin ? "ADMIN" : "PM", remark)
            : rejectIndentAction(row.id, remark);
        case "PO":
          if (!approve) return { ok: false as const, error: "Rejecting an order is done on the order itself." };
          return atAdmin ? approvePoAdminAction(row.id, remark) : approvePoPmAction(row.id, remark);
        case "EXTENSION":
          // Only the PM step is a yes or no. The Admin step also decides whether
          // the delay was genuine or avoidable, and that judgement is not one to
          // default from a queue — those rows link to the schedule instead.
          return decideExtensionPmAction(row.id, approve, remark);
        case "RETURN":
          return approve ? approveReturnAction(row.id, remark) : rejectReturnAction(row.id, remark);
        case "TRANSFER":
          if (!approve) return { ok: false as const, error: "A transfer is cancelled on the transfer itself." };
          return approveTransferAction(row.id);
        case "INVOICE":
          if (!approve) return { ok: false as const, error: "Rejecting an invoice is done on the invoice itself." };
          return approveInvoiceAction(row.id, remark);

        // A completed task waiting on whoever raised it: approve closes it,
        // reject sends it back to be done again.
        case "TASK_CLOSURE":
          return approve ? closeTaskAction(row.id, remark) : sendBackTaskAction(row.id, remark);

        case "TASK_EXTENSION":
          return decideTaskExtensionAction(row.id, approve, remark, approve ? control : undefined);

        case "TASK_REVIEW":
          return decideLevelAction(row.id, approve ? "PASS" : "FAIL", remark);

        case "TASK_APPROVAL":
          return decideLevelAction(row.id, approve ? "APPROVE" : "REJECT", remark);
      }
    })();

    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Something went wrong."); return; }
    setDeciding(null);
    setRemark("");
    toast(`${row.reference} ${approve ? "approved" : "rejected"}.`);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by number, item, vendor or who raised it…"
          className="w-[300px] py-[9px]"
        />
        <span className="text-[11px] font-semibold text-muted-400">Type</span>
        <Chip picked={kind === "all"} onClick={() => setKind("all")}>
          All <span className="num opacity-70">{counts.all}</span>
        </Chip>
        {APPROVAL_KINDS.filter((k) => counts[k] > 0).map((k) => (
          <Chip key={k} picked={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]} <span className="num opacity-70">{counts[k]}</span>
          </Chip>
        ))}
        <div className="flex-1" />
        <span className="text-[11.5px] font-medium text-muted-600">
          {shown.length} of {rows.length} waiting
        </span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing is waiting on you"
            description="Indents, purchase orders, extensions, invoices, returns and transfers appear here the moment they need a decision."
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState title="Nothing matches" description="No approval matches that filter or search." />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
          {shown.map((r) => (
            <div
              key={`${r.kind}:${r.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-150 px-[18px] py-[13px] last:border-0 hover:bg-surface-tint"
            >
              <span className="w-[104px] shrink-0">
                <span className="rounded-full bg-surface-field px-2.5 py-[5px] text-[9.5px] font-bold uppercase tracking-[.07em] text-navy-500">
                  {KIND_LABEL[r.kind]}
                </span>
              </span>

              <span className="min-w-[200px] flex-[2_1_220px]">
                <Link href={r.href} className="num block text-[12.5px] font-bold text-navy-950 hover:text-brand-500">
                  {r.reference}
                </Link>
                <span className="mt-0.5 block truncate text-[11.5px] font-medium text-muted-500">{r.title}</span>
              </span>

              <span className="min-w-[130px] flex-1">
                <span className="block text-[11.5px] font-semibold text-navy-600">{r.raisedBy}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-muted-400">
                  {r.projectName ?? "—"}
                </span>
              </span>

              <span className="w-[92px] shrink-0 text-right">
                {r.value === null ? (
                  <span className="text-[11.5px] font-medium text-muted-300">—</span>
                ) : (
                  <span className="num text-[12.5px] font-bold text-navy-950">{moneyShort(r.value)}</span>
                )}
              </span>

              <span className="w-[120px] shrink-0">
                <span className="block text-[11px] font-semibold text-warn-700">{r.waitingOn}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-muted-400">
                  waiting {waitingFor(r.raisedAt, nowMs)}
                </span>
              </span>

              <span className="ml-auto flex shrink-0 gap-2">
                {r.canDecide ? (
                  <>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => { setDeciding({ row: r, approve: false }); setRemark(""); setError(null); }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="xs"
                      variant="success"
                      onClick={() => { setDeciding({ row: r, approve: true }); setRemark(""); setError(null); }}
                    >
                      Approve
                    </Button>
                  </>
                ) : (
                  <Link
                    href={r.href}
                    className="rounded-[7px] border border-line-400 bg-white px-[11px] py-1.5 text-[10.5px] font-bold text-brand-700 transition-colors hover:border-brand-500"
                  >
                    Open
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {deciding && (
        <Modal
          open
          onClose={() => setDeciding(null)}
          title={`${deciding.approve ? "Approve" : "Reject"} ${deciding.row.reference}`}
          description={`${KIND_LABEL[deciding.row.kind]} · ${deciding.row.title}`}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setDeciding(null)}>Cancel</Button>
              <Button
                variant={deciding.approve ? "success" : "danger"}
                loading={busy}
                disabled={!deciding.approve && !remark.trim()}
                onClick={decide}
              >
                {deciding.approve ? "Approve" : "Reject"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            {deciding.approve && needsDelayClassification(deciding.row.kind) && (
              <Field
                label="Was the delay in the assignee's control?"
                required
                hint="Only an uncontrollable delay moves the date their performance is measured against."
              >
                <Select value={control} onChange={(e) => setControl(e.target.value as never)}>
                  <option value="UNCONTROLLABLE">Uncontrollable</option>
                  <option value="CONTROLLABLE">Controllable</option>
                </Select>
              </Field>
            )}
            <Field
              label="Remarks"
              required={!deciding.approve}
              hint={
                deciding.approve
                  ? "Optional — it goes on the approval trail."
                  : "A reason is required, and whoever raised it will see it."
              }
            >
              <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} />
            </Field>
            {deciding.row.kind === "INDENT" && deciding.approve && (
              <p className="text-[11.5px] font-medium text-muted-500">
                To change quantities before approving, open the indent instead.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The design's filter chip. */
function Chip({
  children, picked, onClick,
}: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
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
