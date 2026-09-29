"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/primitives";
import {
  DetailAction, DetailActionLink, DetailScreen, Fact, PanelCard, SoftPill,
  SummaryCard, TD, TH,
} from "@/components/shell/detail-screen";
import { cn } from "@/lib/utils";
import {
  chainStage, INDENT_CHAIN, INDENT_STATUS_LABEL, INDENT_STATUS_TONE,
  indentFulfilment, q, type FulfilLine,
} from "@/lib/material/indent-fulfilment";
import { approveIndentAction, deleteIndentAction, rejectIndentAction } from "../actions";

interface Indent {
  id: string; indentNo: string; status: string; updatedAt: string;
  title: string; project: string; activity: string; requiredBy: string;
  raisedBy: string; remarks: string;
}

interface Line extends FulfilLine {
  code: string;
  name: string;
}

interface Movement {
  id: string;
  kind: "ISSUE" | "RETURN";
  item: string;
  qty: string;
  at: string;
  by: string;
  to: string;
  note: string;
}

const FULFIL_TONE = {
  good: "bg-good-600",
  brand: "bg-brand-500",
  amber: "bg-amber-500",
} as const;

const MOVEMENT_TONE = {
  ISSUE: "bg-bad-050 text-bad-700",
  RETURN: "bg-brand-100 text-brand-700",
} as const;

export function IndentDetail({
  indent, lines, movements, can,
}: {
  indent: Indent;
  lines: Line[];
  movements: Movement[];
  can: {
    issue: boolean; raisePo: boolean; update: boolean; delete: boolean;
    approvePm: boolean; approveAdmin: boolean;
  };
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [deciding, setDeciding] = React.useState<"approve" | "reject" | null>(null);
  const [remark, setRemark] = React.useState("");

  /** Which step this indent is sitting at, if any. */
  const waitingOn =
    indent.status === "SUBMITTED" ? "PM" : indent.status === "PM_APPROVED" ? "ADMIN" : null;

  async function decide() {
    setBusy(true);
    setError(null);
    const res =
      deciding === "approve"
        ? await approveIndentAction(indent.id, waitingOn === "ADMIN" ? "ADMIN" : "PM", remark)
        : await rejectIndentAction(indent.id, remark);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDeciding(null);
    setRemark("");
    router.refresh();
  }

  const fulfil = indentFulfilment(lines);
  const stage = chainStage(indent.status);
  const stopped = indent.status === "REJECTED" || indent.status === "CANCELLED";
  const canIssueNow = fulfil.issuable > 0;

  async function remove() {
    setBusy(true);
    const res = await deleteIndentAction(indent.id, indent.updatedAt);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/material/indents");
  }

  return (
    <DetailScreen
      backHref="/material/indents"
      title={indent.indentNo}
      pills={
        <>
          <SoftPill tone={INDENT_STATUS_TONE[indent.status] ?? "muted"}>
            {INDENT_STATUS_LABEL[indent.status] ?? indent.status}
          </SoftPill>
          <span
            className={cn(
              "inline-flex rounded-full px-[9px] py-[4px] text-[8.5px] font-extrabold uppercase tracking-[.07em] text-white",
              FULFIL_TONE[fulfil.tone],
            )}
          >
            {fulfil.label}
          </span>
        </>
      }
      subtitle={`${indent.title} · ${indent.project} · required by ${indent.requiredBy}`}
      actions={
        <>
          {/*
           * An indent is decided from the record as well as from the approvals
           * queue — this is where someone looks when they have the paper in
           * front of them.
           */}
          {waitingOn === "PM" && can.approvePm && (
            <>
              <DetailAction tone="danger" onClick={() => setDeciding("reject")}>
                Reject
              </DetailAction>
              <DetailAction tone="success" onClick={() => setDeciding("approve")}>
                Approve — PM level
              </DetailAction>
            </>
          )}
          {waitingOn === "ADMIN" && can.approveAdmin && (
            <>
              <DetailAction tone="danger" onClick={() => setDeciding("reject")}>
                Reject
              </DetailAction>
              <DetailAction tone="success" onClick={() => setDeciding("approve")}>
                Approve — Admin level
              </DetailAction>
            </>
          )}
          {waitingOn === "PM" && !can.approvePm && (
            <span className="rounded-[9px] bg-warn-050 px-3.5 py-[9px] text-[12px] font-semibold text-warn-700">
              Waiting on Project Manager approval
            </span>
          )}
          {waitingOn === "ADMIN" && !can.approveAdmin && (
            <span className="rounded-[9px] bg-warn-050 px-3.5 py-[9px] text-[12px] font-semibold text-warn-700">
              Waiting on Owner / Admin approval
            </span>
          )}
          {canIssueNow && can.issue && (
            <DetailActionLink tone="success" href={`/material/issues/new?indent=${indent.id}`}>
              ↗ Issue from stock
            </DetailActionLink>
          )}
          {can.raisePo && (
            <DetailActionLink tone="soft" href={`/material/purchase-orders/new?indent=${indent.id}`}>
              → Raise PO for shortfall
            </DetailActionLink>
          )}
          {can.delete && (
            <DetailAction tone="danger" onClick={() => setConfirming(true)}>
              🗑 Delete
            </DetailAction>
          )}
          {can.update && (
            <DetailActionLink tone="primary" href={`/material/indents/${indent.id}/edit`}>
              ✎ Edit
            </DetailActionLink>
          )}
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
        <SummaryCard label="Requirement">
          <div className="grid grid-cols-2 gap-3.5">
            <Fact label="Project">{indent.project}</Fact>
            <Fact label="Required by">{indent.requiredBy}</Fact>
            <Fact label="Activity">{indent.activity}</Fact>
            <Fact label="Raised by">{indent.raisedBy}</Fact>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Remarks</div>
              <div className="mt-[3px] text-[12.5px] font-medium text-navy-900">{indent.remarks}</div>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard label="Approval chain">
          <div className="flex flex-wrap items-center gap-[5px]">
            {INDENT_CHAIN.map((step, i) => {
              const done = !stopped && i < stage;
              const now = !stopped && i === stage;
              return (
                <React.Fragment key={step.short}>
                  <span
                    title={step.name}
                    className={cn(
                      "inline-block rounded-md px-1.5 py-1 text-[9px] font-extrabold",
                      done && "bg-good-600 text-white",
                      now && "bg-amber-500 text-white",
                      !done && !now && "bg-line-200 text-muted-400",
                    )}
                  >
                    {step.short}
                  </span>
                  {i < INDENT_CHAIN.length - 1 && <span className="inline-block h-0.5 w-3.5 bg-line-500" />}
                </React.Fragment>
              );
            })}
          </div>
          <div className="mt-3 text-[11.5px] font-medium text-muted-600">
            Raised → Project Manager → Store stock check → Issue or PO. Hover a step for its name.
          </div>
        </SummaryCard>

        <SummaryCard label="Store fulfilment">
          <span
            className={cn(
              "inline-flex rounded-full px-[9px] py-[4px] text-[8.5px] font-extrabold uppercase tracking-[.07em] text-white",
              FULFIL_TONE[fulfil.tone],
            )}
          >
            {fulfil.label}
          </span>
          <div className="mt-[9px] text-[12.5px] font-semibold text-navy-600">{fulfil.text}</div>
          <div className="mt-2 text-[11.5px] font-medium text-muted-400">
            Available quantity is issued from the store immediately; only the shortfall becomes a
            purchase order.
          </div>
        </SummaryCard>
      </div>

      <PanelCard
        title="Requested items"
        right={<span className="text-[11.5px] font-semibold text-muted-600">{lines.length} {lines.length === 1 ? "item" : "items"}</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Sl</th>
                <th className={cn(TH, "text-left")}>Item</th>
                <th className={cn(TH, "text-right")}>Required</th>
                <th className={cn(TH, "text-right")}>In stock</th>
                <th className={cn(TH, "text-right")}>Issued</th>
                <th className={cn(TH, "text-right")}>Pending</th>
                <th className={cn(TH, "text-left")}>Fulfilment</th>
              </tr>
            </thead>
            <tbody>
              {fulfil.lines.map((l, i) => {
                const src = lines[i];
                return (
                  <tr key={src.code + i} className="hover:bg-surface-tint">
                    <td className={cn(TD, "text-[11.5px] font-semibold text-muted-400")}>{i + 1}</td>
                    <td className={TD}>
                      <div className="text-[12.5px] font-semibold text-navy-900">{src.name}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-muted-400">{src.code}</div>
                    </td>
                    <td className={cn(TD, "text-right text-[12.5px] font-bold text-navy-950")}>
                      {q(l.required)} {l.uom}
                    </td>
                    <td className={cn(TD, "text-right text-[12px] font-semibold text-navy-600")}>
                      {q(l.onHand)} {l.uom}
                    </td>
                    <td className={cn(TD, "text-right text-[12.5px] font-bold text-good-700")}>
                      {q(l.issued)} {l.uom}
                    </td>
                    <td className={cn(TD, "text-right text-[12.5px] font-bold text-warn-700")}>
                      {q(l.pending)} {l.uom}
                    </td>
                    <td className={TD}>
                      <SoftPill tone={l.verdictTone}>{l.verdict}</SoftPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard
        title="Issued to project"
        subtitle={fulfil.summary}
        right={
          <>
            <span className="text-[11.5px] font-semibold text-muted-600">
              {movements.length} {movements.length === 1 ? "movement" : "movements"}
            </span>
            {canIssueNow && can.issue && (
              <DetailActionLink tone="success" href={`/material/issues/new?indent=${indent.id}`} className="px-4 py-2.5 text-[12px]">
                ↗ Issue from stock
              </DetailActionLink>
            )}
            {fulfil.complete && (
              <span className="rounded-full border border-[#9AD4B4] bg-good-050 px-3 py-1.5 text-[11px] font-bold text-good-700">
                Fully issued
              </span>
            )}
          </>
        }
      >
        {movements.length === 0 && (
          <div className="px-7 py-7 text-center text-[12.5px] font-medium text-muted-400">
            Nothing issued yet. Use “Issue from stock” to hand over available quantity to the site —
            the shortfall goes to a PO.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Movement</th>
                <th className={cn(TH, "text-left")}>Item</th>
                <th className={cn(TH, "text-right")}>Qty</th>
                <th className={cn(TH, "text-left")}>Date &amp; time</th>
                <th className={cn(TH, "text-left")}>Issued by</th>
                <th className={cn(TH, "text-left")}>Issued to</th>
                <th className={cn(TH, "text-left")}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-surface-tint">
                  <td className={TD}>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-[10px] py-[5px] text-[9px] font-bold tracking-[.07em]",
                        MOVEMENT_TONE[m.kind],
                      )}
                    >
                      {m.kind === "RETURN" ? "↩ RETURNED" : "▲ ISSUED"}
                    </span>
                  </td>
                  <td className={cn(TD, "text-[12.5px] font-semibold text-navy-900")}>{m.item}</td>
                  <td className={cn(TD, "text-right font-display text-[13px] font-extrabold text-navy-950")}>{m.qty}</td>
                  <td className={cn(TD, "whitespace-nowrap text-[12px] font-semibold text-navy-900")}>{m.at}</td>
                  <td className={cn(TD, "text-[12px] font-semibold text-navy-600")}>{m.by}</td>
                  <td className={cn(TD, "text-[12px] font-medium text-navy-500")}>{m.to}</td>
                  <td className={cn(TD, "text-[11.5px] font-medium text-muted-400")}>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={`${deciding === "approve" ? "Approve" : "Reject"} ${indent.indentNo}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeciding(null)}>Cancel</Button>
            <Button
              variant={deciding === "approve" ? "success" : "danger"}
              loading={busy}
              disabled={deciding === "reject" && !remark.trim()}
              onClick={decide}
            >
              {deciding === "approve" ? "Approve" : "Reject"}
            </Button>
          </>
        }
      >
        <Field
          label="Remarks"
          required={deciding === "reject"}
          hint={
            deciding === "approve"
              ? "Optional — it goes on the approval trail."
              : "A reason is required, and whoever raised it will see it."
          }
        >
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} />
        </Field>
      </Modal>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${indent.indentNo}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes the indent and its lines. It cannot be undone.
        </p>
      </Modal>
    </DetailScreen>
  );
}
