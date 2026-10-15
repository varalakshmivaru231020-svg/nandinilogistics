import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { isClearableMode, receiptStatus, RECEIPT_STATUS_LABEL } from "@/lib/sales/receipt-status";

import { money, toneOf, type RecordAction, type RecordView } from "./shared";

/**
 * What may be done to a receipt, decided once.
 *
 * The record screen and the **list row** both offer Clear and Bounce — the web
 * puts them on its receipt row as well — so the decision, the arguments and the
 * fields live here and both callers read them. Only the wording differs: the
 * row says "Clear", the record says "Mark cleared".
 */
export function receiptDecisions(
  r: { id: string; mode: string; receiptDate: Date | string; amount: number; clearedAt: Date | null; bouncedAt: Date | null },
  can: { clear: boolean },
): RecordAction[] {
  const state = receiptStatus({
    mode: r.mode,
    clearedAt: r.clearedAt,
    bouncedAt: r.bouncedAt,
  });
  // Only an instrument the bank still has to realise, and only while it has
  // done neither.
  if (state !== "PENDING_CLEARANCE" || !isClearableMode(r.mode) || !can.clear) return [];

  const day = new Date(r.receiptDate).toISOString().slice(0, 10);
  return [
    {
      key: "clear",
      label: "Mark cleared",
      emphasis: "approve",
      action: "sales/receipts/clearReceipt",
      args: [r.id, "$clearedOn"],
      remark: "none",
      fields: [
        {
          name: "clearedOn",
          label: "Cleared on",
          kind: "date",
          required: true,
          hint: `Not before ${day}, and not in the future.`,
        },
      ],
      confirm: `${money(r.amount)} counts towards the booking from the day it cleared.`,
    },
    {
      key: "bounce",
      label: "Record bounce",
      emphasis: "reject",
      action: "sales/receipts/bounceReceipt",
      args: [r.id, "$reason"],
      remark: "none",
      fields: [
        {
          name: "reason",
          label: "Reason",
          kind: "textarea",
          required: true,
          placeholder: "e.g. Insufficient funds",
          wide: true,
        },
      ],
      confirm: `${money(r.amount)} comes off the booking's collected amount and its demand. The receipt stays on record, marked bounced. This cannot be undone.`,
    },
  ];
}

/**
 * One receipt, and whether the money is really in.
 *
 * A receipt has no status column: `receiptStatus()` derives it from the mode
 * and what the bank has done since, and that same function decides whether
 * clearing is even a question — an NEFT is realised the moment it is recorded,
 * a cheque is not. So Clear and Bounce appear only on an instrument that can
 * still do either.
 *
 * Bouncing cannot be undone, and the sheet says so in the web's own words
 * because somebody is about to take money off a booking.
 */
export async function receiptRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      bank: { select: { name: true } },
      demand: { select: { demandNo: true, milestone: true, dueDate: true } },
      booking: {
        select: {
          id: true, bookingNo: true, projectId: true,
          project: { select: { code: true, name: true } },
          unit: { select: { unitNumber: true } },
          customer: { select: { name: true, customerNo: true } },
        },
      },
    },
  });
  if (!receipt) return null;
  assertProjectAccess(ctx, receipt.booking.projectId);

  const state = receiptStatus(receipt);
  const amount = Number(receipt.amount);

  const actions = receiptDecisions(
    {
      id,
      mode: receipt.mode,
      receiptDate: receipt.receiptDate,
      amount,
      clearedAt: receipt.clearedAt,
      bouncedAt: receipt.bouncedAt,
    },
    { clear: ctx.has(PERM.sales.receipt.clear) },
  );

  return {
    key: "sales/receipts",
    id: receipt.id,
    title: receipt.receiptNo,
    subtitle: `${receipt.booking.customer.name} · ${receipt.booking.bookingNo} · unit ${receipt.booking.unit.unitNumber}`,
    pills: [
      { label: RECEIPT_STATUS_LABEL[state], tone: toneOf(state) },
      { label: receipt.mode, tone: "draft" },
    ],
    sections: [
      {
        label: "The receipt",
        fields: [
          { label: "Receipt no.", value: receipt.receiptNo },
          { label: "Amount", value: amount, format: "money" },
          { label: "Received on", value: receipt.receiptDate.toISOString(), format: "date" },
          { label: "Mode", value: receipt.mode },
          { label: "Reference number", value: receipt.referenceNo },
          { label: "Deposited into", value: receipt.bank?.name ?? null },
          { label: "Cleared on", value: receipt.clearedAt?.toISOString() ?? null, format: "date" },
          { label: "Bounced on", value: receipt.bouncedAt?.toISOString() ?? null, format: "date" },
          { label: "Bounce reason", value: receipt.bounceReason, wide: true },
          { label: "Remarks", value: receipt.remarks, wide: true },
        ],
      },
      {
        label: "Against",
        fields: [
          { label: "Booking", value: receipt.booking.bookingNo },
          {
            label: "Project",
            value: `${receipt.booking.project.code} — ${receipt.booking.project.name}`,
          },
          { label: "Unit", value: receipt.booking.unit.unitNumber },
          {
            label: "Customer",
            value: `${receipt.booking.customer.name} (${receipt.booking.customer.customerNo})`,
          },
          { label: "Milestone", value: receipt.demand?.milestone ?? "Not against a milestone" },
          { label: "Demand", value: receipt.demand?.demandNo ?? null },
          {
            label: "Milestone due",
            value: receipt.demand?.dueDate.toISOString() ?? null,
            format: "date",
          },
        ],
      },
    ],
    collections: [],
    actions,
    serverTime: new Date().toISOString(),
  };
}
