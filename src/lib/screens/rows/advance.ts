import "server-only";

import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import {
  ADVANCE_PRIORITY_LABEL, ADVANCE_PRIORITY_TONE, ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE,
} from "@/lib/advances/list-display";
import { formatDate, money } from "@/lib/utils";

export { ADVANCE_EMPTY_FILTERED, ADVANCE_EMPTY_NONE } from "@/lib/advances/list-display";

/**
 * An advance request, as `advances-screen.tsx` draws one. The Approve /
 * Reject / Delete buttons are decided by `advanceDecisions`, which the record
 * asks too.
 */
export interface AdvanceRowInput {
  id: string;
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
  requestedAt: Date | string;
  decidedBy: string | null;
  decisionRemarks: string | null;
}

export function advanceDecisions(
  a: { id: string; status: string; amount: number },
  can: { approve: boolean; remove: boolean },
): RecordAction[] {
  const actions: RecordAction[] = [];
  if (a.status !== "PENDING") return actions;
  if (can.approve) {
    actions.push({
      key: "approve",
      label: "Approve",
      emphasis: "approve",
      action: "advances/decideAdvance",
      args: [a.id, "APPROVED", "$remarks", "$recoveryPerPeriod"],
      remark: "none",
      fields: [
        {
          name: "recoveryPerPeriod",
          label: "Recover per payout (₹)",
          kind: "money",
          required: true,
          initial: a.amount,
          hint: "Deducted from each payout until the advance is recovered.",
        },
        { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
      ],
      confirm: "The rider is told, and the deduction starts with the next payout.",
    });
    actions.push({
      key: "reject",
      label: "Reject",
      emphasis: "reject",
      action: "advances/decideAdvance",
      args: [a.id, "REJECTED", "$remarks"],
      remark: "none",
      fields: [{ name: "remarks", label: "Reason", kind: "textarea", required: true, wide: true }],
      confirm: "The rider is told, with this reason.",
    });
  }
  if (can.remove) {
    actions.push({
      key: "delete",
      label: "Delete request",
      emphasis: "outline",
      action: "advances/deleteAdvance",
      args: [a.id],
      remark: "none",
      confirm: "Only a request nobody has decided on can be deleted.",
    });
  }
  return actions;
}

export function advanceScreenRow(a: AdvanceRowInput, actions: RecordAction[] = []): ScreenRow {
  const outstanding = Math.max(0, a.amount - a.recoveredAmount);
  return {
    id: a.id,
    title: a.riderName,
    meta: `${a.riderCode} · ${a.companies || "—"}`,
    chips: [{ text: ADVANCE_PRIORITY_LABEL[a.priority] ?? a.priority, tone: ADVANCE_PRIORITY_TONE[a.priority] ?? "draft" }],
    lines: [
      { label: "Reason", value: [a.reason, a.remarks].filter(Boolean).join(" · ") || "—" },
      { label: "Requested", value: formatDate(a.requestedAt) },
      ...(a.status === "APPROVED"
        ? [{ label: "Recovered", value: `${money(a.recoveredAmount)} of ${money(a.amount)} · ${money(a.recoveryPerPeriod ?? 0)} per payout` }]
        : []),
      ...(a.decidedBy ? [{ label: "Decided by", value: `${a.decidedBy}${a.decisionRemarks ? ` — ${a.decisionRemarks}` : ""}` }] : []),
    ],
    trailing: { value: money(a.status === "APPROVED" ? outstanding : a.amount), label: a.status === "APPROVED" ? "Outstanding" : "Amount" },
    status: { label: ADVANCE_STATUS_LABEL[a.status] ?? a.status, tone: ADVANCE_STATUS_TONE[a.status] ?? "draft" },
    actions,
  };
}
