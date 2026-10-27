"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Card, Field, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { InboxRow } from "@/lib/approvals/inbox";
import { APPROVAL_KIND_LABEL, waitingLabel } from "@/lib/approvals/rule";
import { formatDateTime } from "@/lib/utils";
import { decideApprovalAction } from "./actions";

export function ApprovalsList({ rows, nowMs, canDecide }: { rows: InboxRow[]; nowMs: number; canDecide: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<InboxRow | null>(null);
  const [reason, setReason] = React.useState("");

  async function decide(row: InboxRow, decision: "APPROVED" | "REJECTED", note?: string) {
    setBusy(`${row.kind}:${row.id}`);
    const res = await decideApprovalAction(row.kind, row.id, decision, note);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    setRejecting(null);
    toast(decision === "APPROVED" ? "Approved" : "Rejected");
    router.refresh();
  }

  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {["Type", "What", "Raised by", "When", "Waiting", ""].map((h, i) => (
                <th key={h || i} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-14 text-center text-[12px] font-medium text-muted-500">Nothing is waiting for approval.</td></tr>
            ) : rows.map((r) => (
              <tr key={`${r.kind}:${r.id}`} className="border-b border-line-200 last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-3"><Badge tone="warn">{APPROVAL_KIND_LABEL[r.kind]}</Badge></td>
                <td className="px-4 py-3 text-[12.5px]">
                  <Link href={r.href} className="font-bold text-navy-950 hover:text-brand-700">{r.what}</Link>
                  {r.detail && <p className="mt-0.5 text-[11.5px] font-medium text-muted-500">{r.detail}</p>}
                </td>
                <td className="px-4 py-3 text-[12px] font-medium text-navy-500">{r.raisedBy}</td>
                <td className="num px-4 py-3 text-[12px] font-medium text-navy-500">{formatDateTime(new Date(r.raisedAtMs))}</td>
                <td className="num px-4 py-3 text-[12px] font-semibold text-warn-700">{waitingLabel(r.raisedAtMs, nowMs)}</td>
                <td className="px-4 py-3">
                  {canDecide && (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" loading={busy === `${r.kind}:${r.id}`} onClick={() => decide(r, "APPROVED")}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => { setReason(""); setRejecting(r); }}>Reject</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={Boolean(rejecting && busy === `${rejecting.kind}:${rejecting.id}`)}
              onClick={() => rejecting && decide(rejecting, "REJECTED", reason)}
            >
              Reject
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12.5px] font-medium text-muted-600">{rejecting?.what}</p>
          <Field label="Reason" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why it is rejected" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
