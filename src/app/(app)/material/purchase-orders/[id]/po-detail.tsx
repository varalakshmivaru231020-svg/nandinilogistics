"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import {
  DetailAction, DetailActionLink, DetailScreen, Fact, PanelCard, SoftPill,
  SummaryCard, TD, TH,
} from "@/components/shell/detail-screen";
import { cn, qty } from "@/lib/utils";
import { PO_STATUS_LABEL, PO_STATUS_TONE, pendingApproval } from "@/lib/material/po-display";
import {
  approvePoAdminAction, approvePoPmAction, deletePurchaseOrderAction,
} from "../actions";

interface TrailStep {
  label: string;
  who: string;
  when: string;
  done: boolean;
}

interface Po {
  id: string; poNo: string; status: string; updatedAt: string; revision: number;
  vendor: string; project: string; delivery: string; terms: string; remarks: string;
  subTotal: string; taxLabel: string; taxAmount: string; totalAmount: string;
  indentRefs: string[];
  trail: TrailStep[];
}

interface Line {
  id: string; code: string; name: string;
  qty: string; rate: string; amount: string;
  ordered: string; received: string; pending: string;
  pct: number; state: "Fulfilled" | "Part received" | "Not received";
}

interface Receipt {
  id: string; grnNo: string; at: string; by: string;
  accepted: string; rejected: string; short: string; photo: string;
  invoice: string; invoiced: boolean; match: string;
  matchTone: "good" | "warn" | "bad" | "muted";
  lines: string[];
}

interface Revision {
  id: string; what: string; meta: string;
}

const STATE_TONE = {
  Fulfilled: "good",
  "Part received": "warn",
  "Not received": "muted",
} as const;

export function PoDetail({
  po, lines, receipts, revisions, can,
}: {
  po: Po;
  lines: Line[];
  receipts: Receipt[];
  revisions: Revision[];
  can: { approvePm: boolean; approveAdmin: boolean; print: boolean; delete: boolean; update: boolean; createGrn: boolean };
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const waiting = pendingApproval(po.status);
  const mayApprove = waiting === "PM" ? can.approvePm : waiting === "ADMIN" ? can.approveAdmin : false;
  const pendingQty = lines.reduce((s, l) => s + Number(l.pending.split(" ")[0] || 0), 0);
  const pendingLines = lines.filter((l) => l.state !== "Fulfilled").length;
  const complete = lines.length > 0 && pendingLines === 0;

  async function approve() {
    setBusy(true);
    setError(null);
    const res = waiting === "PM"
      ? await approvePoPmAction(po.id, "", po.updatedAt)
      : await approvePoAdminAction(po.id, "", po.updatedAt);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    else router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await deletePurchaseOrderAction(po.id, po.updatedAt);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/material/purchase-orders");
  }

  return (
    <DetailScreen
      backHref="/material/purchase-orders"
      title={po.poNo}
      pills={
        <>
          <SoftPill tone={PO_STATUS_TONE[po.status] ?? "muted"}>
            {PO_STATUS_LABEL[po.status] ?? po.status}
          </SoftPill>
          <span className="rounded-full bg-warn-050 px-[9px] py-[3px] text-[10px] font-bold tracking-[.05em] text-warn-700">
            {po.revision ? `Revision ${po.revision}` : "Original"}
          </span>
        </>
      }
      subtitle={`${po.vendor} · ${po.project} · ${po.delivery}`}
      actions={
        <>
          {waiting && mayApprove && (
            <DetailAction
              tone="primary"
              disabled={busy}
              onClick={approve}
              className={cn(
                "border-transparent text-white",
                waiting === "PM" ? "bg-amber-500 hover:bg-warn-700" : "bg-plum-600 hover:bg-plum-700",
              )}
            >
              {waiting === "PM" ? "✓ PM approve" : "✓ Admin approve"}
            </DetailAction>
          )}
          {can.print && (
            <DetailActionLink tone="plain" href={`/print/purchase-orders/${po.id}`} target="_blank" rel="noopener">
              ⎙ Print
            </DetailActionLink>
          )}
          {can.delete && (
            <DetailAction tone="danger" onClick={() => setConfirming(true)}>🗑 Delete</DetailAction>
          )}
          {can.update && (
            <DetailActionLink tone="primary" href={`/material/purchase-orders/${po.id}/edit`}>
              ✎ Edit
            </DetailActionLink>
          )}
        </>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
        <SummaryCard label="Order">
          <div className="grid grid-cols-2 gap-3.5">
            <Fact label="Vendor">{po.vendor}</Fact>
            <Fact label="Project">{po.project}</Fact>
            <Fact label="Delivery">{po.delivery}</Fact>
            <Fact label="Terms">{po.terms}</Fact>
            <div className="col-span-2">
              <div className="mb-[5px] text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">
                Linked indents
              </div>
              <div className="flex flex-wrap gap-1.5">
                {po.indentRefs.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-line-350 bg-surface-hover px-[11px] py-[5px] text-[11px] font-bold text-navy-800"
                  >
                    {r}
                  </span>
                ))}
                {po.indentRefs.length === 0 && (
                  <span className="text-[12px] font-medium text-muted-400">
                    Not linked to an indent — direct purchase
                  </span>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Remarks</div>
              <div className="mt-[3px] text-[12.5px] font-medium text-navy-900">{po.remarks}</div>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard label="Approval trail">
          {po.trail.map((step) => (
            <div key={step.label} className="flex items-start gap-[11px] border-b border-line-100 py-[9px] last:border-0">
              <span
                className={cn(
                  "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                  step.done ? "bg-good-600 text-white" : "bg-line-300 text-muted-400",
                )}
              >
                {step.done ? "✓" : "•"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-navy-900">{step.label}</div>
                <div className="mt-0.5 text-[11.5px] font-semibold text-navy-500">{step.who}</div>
                <div className="mt-px text-[10.5px] font-medium text-muted-300">{step.when}</div>
              </div>
            </div>
          ))}
        </SummaryCard>

        <SummaryCard label="Revision history">
          {revisions.map((r) => (
            <div key={r.id} className="border-b border-line-100 py-[9px] last:border-0">
              <div className="text-[12.5px] font-semibold text-navy-900">{r.what}</div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-400">{r.meta}</div>
            </div>
          ))}
          {revisions.length === 0 && (
            <div className="text-[12px] font-medium text-muted-600">
              No revisions — this is the original order. Any edit after approval creates a new
              revision and restarts approval at Project Manager.
            </div>
          )}
        </SummaryCard>
      </div>

      <PanelCard
        title="Order lines"
        right={<span className="text-[11.5px] font-semibold text-muted-600">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Sl</th>
                <th className={cn(TH, "text-left")}>Item</th>
                <th className={cn(TH, "text-right")}>Qty</th>
                <th className={cn(TH, "text-right")}>Rate</th>
                <th className={cn(TH, "text-right")}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id} className="hover:bg-surface-tint">
                  <td className={cn(TD, "text-[11.5px] font-semibold text-muted-400")}>{i + 1}</td>
                  <td className={TD}>
                    <div className="text-[12.5px] font-semibold text-navy-900">{l.name}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-muted-400">{l.code}</div>
                  </td>
                  <td className={cn(TD, "text-right text-[12px] font-semibold text-navy-600")}>{l.qty}</td>
                  <td className={cn(TD, "text-right text-[12px] font-semibold text-navy-600")}>{l.rate}</td>
                  <td className={cn(TD, "text-right text-[12.5px] font-bold text-navy-950")}>{l.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-end gap-[34px] bg-surface-sunken px-5 py-4">
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-muted-400">Subtotal</div>
            <div className="mt-[3px] text-[14px] font-bold text-navy-600">{po.subTotal}</div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-muted-400">{po.taxLabel}</div>
            <div className="mt-[3px] text-[14px] font-bold text-navy-600">{po.taxAmount}</div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-navy-800">PO value</div>
            <div className="mt-[3px] font-display text-[20px] font-extrabold text-navy-950">{po.totalAmount}</div>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Fulfilment against this PO"
        subtitle={
          complete
            ? "All ordered quantities received"
            : `${qty(pendingQty, 2)} units still pending across ${pendingLines} line(s)`
        }
        right={
          <>
            {complete && (
              <span className="rounded-full border border-[#9AD4B4] bg-good-050 px-3 py-1.5 text-[11px] font-bold text-good-700">
                Fully received
              </span>
            )}
            {!complete && can.createGrn && (
              <DetailActionLink tone="primary" href={`/material/grn/new?po=${po.id}`} className="px-4 py-2.5 text-[12px]">
                + Receive balance · new GRN
              </DetailActionLink>
            )}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, "text-left")}>Item</th>
                <th className={cn(TH, "text-right")}>Ordered</th>
                <th className={cn(TH, "text-right")}>Received</th>
                <th className={cn(TH, "text-right")}>Pending</th>
                <th className={cn(TH, "text-left")}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-surface-tint">
                  <td className={TD}>
                    <div className="text-[12.5px] font-semibold text-navy-900">{l.name}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-muted-400">{l.code}</div>
                  </td>
                  <td className={cn(TD, "text-right text-[12px] font-semibold text-navy-600")}>{l.ordered}</td>
                  <td className={cn(TD, "text-right text-[12.5px] font-bold text-good-700")}>{l.received}</td>
                  <td className={cn(TD, "text-right text-[12.5px] font-bold text-warn-700")}>{l.pending}</td>
                  <td className={cn(TD, "min-w-[180px]")}>
                    <div className="flex items-center gap-2">
                      <SoftPill tone={STATE_TONE[l.state]}>{l.state}</SoftPill>
                      <span className="text-[11px] font-semibold text-muted-600">{l.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-line-200">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          l.state === "Fulfilled"
                            ? "bg-[linear-gradient(90deg,#1F9D66,#5BC8A2)]"
                            : "bg-[linear-gradient(90deg,#E8A13A,#F2C063)]",
                        )}
                        style={{ width: `${l.pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard
        title="Goods receipts"
        right={<span className="text-[11.5px] font-semibold text-muted-600">{receipts.length} {receipts.length === 1 ? "goods receipt" : "goods receipts"}</span>}
      >
        {receipts.length === 0 && (
          <div className="px-7 py-7 text-center text-[12.5px] font-medium text-muted-400">
            Nothing received yet against this PO. Each delivery is booked as its own GRN — partial
            deliveries simply create more than one.
          </div>
        )}
        {receipts.map((r) => (
          <div key={r.id} className="border-b border-line-100 px-5 py-3.5 last:border-0">
            <div className="flex flex-wrap items-center gap-[9px]">
              <a
                href={`/material/grn/${r.id}`}
                className="text-[13px] font-extrabold text-brand-700 underline hover:text-brand-500"
              >
                {r.grnNo}
              </a>
              <SoftPill tone={r.matchTone} className="text-[9.5px]">{r.match}</SoftPill>
              <SoftPill tone={r.invoiced ? "good" : "warn"}>{r.invoice}</SoftPill>
              <div className="flex-1" />
              <span className="text-[11.5px] font-medium text-muted-400">{r.at} · {r.by}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-good-050 px-2.5 py-[5px] text-[11px] font-bold text-good-700">Accepted {r.accepted}</span>
              <span className="rounded-full bg-bad-050 px-2.5 py-[5px] text-[11px] font-bold text-bad-700">Rejected {r.rejected}</span>
              <span className="rounded-full bg-warn-050 px-2.5 py-[5px] text-[11px] font-bold text-warn-800">Short {r.short}</span>
              <span className="rounded-full bg-surface-field px-2.5 py-[5px] text-[11px] font-semibold text-navy-500">⎙ {r.photo}</span>
            </div>
            {r.lines.map((t, i) => (
              <div key={i} className="mt-[5px] text-[11.5px] font-medium text-navy-500">• {t}</div>
            ))}
          </div>
        ))}
      </PanelCard>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${po.poNo}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This removes the order and its lines. It cannot be undone.
        </p>
      </Modal>
    </DetailScreen>
  );
}
