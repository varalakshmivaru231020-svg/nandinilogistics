import "server-only";

import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { IMPORT_STATUS_LABEL, IMPORT_STATUS_TONE, PAYOUT_STATUS_LABEL, PAYOUT_STATUS_TONE } from "@/lib/payouts/list-display";
import { money } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

export { IMPORT_EMPTY, PAYOUT_EMPTY_FILTERED, PAYOUT_EMPTY_NONE } from "@/lib/payouts/list-display";

/**
 * A payout line, as the table in `payouts-screen.tsx` draws one: the rider,
 * the company and period, the four figures and the status pill. The
 * Hold / Release button is the web row's own, decided by `payoutDecisions`.
 */
export interface PayoutRowInput {
  id: string;
  riderCode: string;
  riderName: string | null;
  company: string;
  periodFrom: Date | string;
  periodTo: Date | string;
  totalPayout: number;
  advance: number;
  bikeRental: number;
  tds: number;
  finalPayout: number;
  status: string;
  holdReason: string | null;
}

export function payoutDecisions(line: { id: string; status: string }, can: { hold: boolean }): RecordAction[] {
  if (!can.hold) return [];
  if (line.status === "HOLD") {
    return [{
      key: "release",
      label: "Release",
      emphasis: "approve",
      action: "payouts/releasePayoutLine",
      args: [line.id],
      remark: "none",
      confirm: "The payout goes back to Paid.",
    }];
  }
  return [{
    key: "hold",
    label: "Hold",
    emphasis: "reject",
    action: "payouts/holdPayoutLine",
    args: [line.id, "$reason"],
    remark: "none",
    fields: [{ name: "reason", label: "Reason for the hold", kind: "textarea", required: true, wide: true }],
    confirm: "The rider and the Team Leader see it as held, with this reason.",
  }];
}

export function payoutScreenRow(l: PayoutRowInput, actions: RecordAction[] = []): ScreenRow {
  return {
    id: l.id,
    title: l.riderName ?? l.riderCode,
    meta: `${l.riderCode} · ${l.company}`,
    lines: [
      { label: "Period", value: `${formatDate(l.periodFrom)} – ${formatDate(l.periodTo)}` },
      { label: "Total", value: money(l.totalPayout) },
      { label: "Advance · Bike · TDS", value: `${money(l.advance)} · ${money(l.bikeRental)} · ${money(l.tds)}` },
      ...(l.holdReason ? [{ label: "Hold reason", value: l.holdReason }] : []),
    ],
    trailing: { value: money(l.finalPayout), label: "Final payout" },
    status: { label: PAYOUT_STATUS_LABEL[l.status] ?? l.status, tone: PAYOUT_STATUS_TONE[l.status] ?? "draft" },
    actions,
  };
}

export interface ImportRowInput {
  id: string;
  company: string;
  periodFrom: Date | string;
  periodTo: Date | string;
  fileName: string;
  status: string;
  lines: number;
  unmatched: number;
  uploadedBy: string;
}

export function importScreenRow(i: ImportRowInput): ScreenRow {
  return {
    id: i.id,
    title: `${i.company} · ${formatDate(i.periodFrom)} – ${formatDate(i.periodTo)}`,
    meta: i.fileName,
    chips: i.unmatched > 0 ? [{ text: `${i.unmatched} unmatched`, tone: "bad" }] : [],
    lines: [
      { label: "Rows", value: String(i.lines) },
      { label: "Uploaded by", value: i.uploadedBy },
    ],
    status: { label: IMPORT_STATUS_LABEL[i.status] ?? i.status, tone: IMPORT_STATUS_TONE[i.status] ?? "draft" },
  };
}
