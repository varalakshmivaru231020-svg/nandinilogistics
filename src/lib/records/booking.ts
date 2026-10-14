import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";
import { RECEIPT_MODES } from "@/lib/sales/receipt-list";
import { receiptStatus, RECEIPT_STATUS_LABEL } from "@/lib/sales/receipt-status";

import { money, toneOf, webTone, words, type RecordAction, type RecordView, type Tone } from "./shared";

/**
 * One booking: the unit, the customer, and every rupee due against it.
 *
 * The payment schedule is the working part, and it works milestone by
 * milestone — raise this demand, collect against that one — so those two sit
 * on the **row**, not on the booking. A phone in front of a customer needs the
 * one line they are paying against, not a form asking which.
 */

/** The booking list's own tone for each state. */
const STATUS_TONE: Record<string, string> = {
  DRAFT: "slate",
  CONFIRMED: "good",
  AGREEMENT: "brand",
  REGISTERED: "navy",
  CANCELLED: "bad",
};

/** The web's own tone for a demand's state. */
const DEMAND_TONE: Record<string, Tone> = {
  PENDING: "draft",
  RAISED: "warn",
  PARTIALLY_PAID: "info",
  PAID: "good",
  CANCELLED: "bad",
  OVERDUE: "bad",
};

export async function bookingRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const [booking, banks] = await Promise.all([
    prisma.booking.findUnique({
      where: { id },
      include: {
        unit: { select: { unitNumber: true, floorNumber: true, superBuiltUpArea: true } },
        customer: {
          select: {
            id: true, name: true, customerNo: true, phone: true, email: true, kycVerifiedAt: true,
          },
        },
        project: { select: { code: true, name: true } },
        soldBy: { select: { name: true } },
        costSheet: { select: { id: true, costSheetNo: true } },
        demands: { orderBy: { sortOrder: "asc" } },
        receipts: { orderBy: { receiptDate: "desc" }, include: { bank: { select: { name: true } } } },
      },
    }),
    prisma.bank.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
  ]);
  if (!booking) return null;
  assertProjectAccess(ctx, booking.projectId);

  const nowMs = Date.now();
  const total = Number(booking.totalAmount);
  const received = Number(booking.receivedAmount);
  const outstanding = total - received;
  const cancelled = booking.status === "CANCELLED";
  const canKyc = ctx.has(PERM.sales.customer.viewKyc);

  const bankOptions = [...banks.map((b) => ({ value: b.id, label: b.name }))];

  /** Collecting against one demand — the web's own four fields. */
  function collect(demandId: string, pending: number): RecordAction {
    return {
      key: `collect:${demandId}`,
      label: "Collect",
      emphasis: "primary",
      action: "sales/bookings/createReceipt",
      args: [id, demandId, "$amount", "$mode", "$referenceNo", "$bankId"],
      remark: "none",
      fields: [
        {
          name: "amount",
          label: "Amount (₹)",
          kind: "money",
          required: true,
          initial: Math.round(pending * 100) / 100,
        },
        {
          name: "mode",
          label: "Mode",
          kind: "select",
          required: true,
          initial: "NEFT",
          options: RECEIPT_MODES.map((m) => ({ value: m, label: m })),
        },
        { name: "referenceNo", label: "Reference number", kind: "text" },
        {
          name: "bankId",
          label: "Deposited into",
          kind: "select",
          emptyLabel: "— Not specified —",
          options: bankOptions,
        },
      ],
      confirm: `${money(pending)} is pending on this milestone.`,
    };
  }

  /* --------------------------------------------------- the booking's own */

  const actions: RecordAction[] = [];

  if (booking.status === "CONFIRMED" && ctx.has(PERM.sales.booking.agreement)) {
    actions.push({
      key: "agreement",
      label: "Move to agreement",
      emphasis: "approve",
      action: "sales/bookings/advanceBooking",
      args: [id, "AGREEMENT"],
      remark: "none",
      confirm: "The booking moves to Agreement, dated today.",
    });
  }
  if (booking.status === "AGREEMENT" && ctx.has(PERM.sales.booking.register)) {
    actions.push({
      key: "register",
      label: "Mark registered",
      emphasis: "approve",
      action: "sales/bookings/advanceBooking",
      args: [id, "REGISTERED"],
      remark: "none",
      confirm: "Registration is the last step — the booking is complete.",
    });
  }
  if (!booking.customer.kycVerifiedAt && ctx.has(PERM.sales.customer.verifyKyc)) {
    actions.push({
      key: "verifyKyc",
      label: "Verify KYC",
      emphasis: "outline",
      action: "sales/bookings/verifyKyc",
      args: [booking.customer.id],
      remark: "none",
      confirm: "The PAN has to be on the customer before KYC can be verified.",
    });
  }
  if (!cancelled && booking.status !== "REGISTERED" && ctx.has(PERM.sales.booking.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel booking",
      emphasis: "reject",
      action: "sales/bookings/cancelBooking",
      args: [id, "$remarks"],
      remark: "none",
      fields: [{ name: "remarks", label: "Why", kind: "textarea", required: true, wide: true }],
      confirm: "The unit goes back on the board. Say why — it stays on the record.",
    });
  }

  return {
    key: "sales/bookings",
    id: booking.id,
    title: booking.bookingNo,
    subtitle: `${booking.project.code} · unit ${booking.unit.unitNumber} · ${booking.customer.name}`,
    pills: [
      { label: words(booking.status), tone: webTone(STATUS_TONE[booking.status] ?? "slate") },
      booking.customer.kycVerifiedAt
        ? { label: "KYC verified", tone: "good" }
        : { label: "KYC pending", tone: "warn" },
      ...(outstanding > 0.01 && !cancelled
        ? [{ label: `${money(outstanding)} outstanding`, tone: "warn" as const }]
        : []),
    ],
    chain: [
      { initials: "BK", state: "done" },
      {
        initials: "AG",
        state: booking.agreementDate
          ? "done"
          : booking.status === "CONFIRMED"
            ? "current"
            : "pending",
      },
      {
        initials: "RG",
        state: booking.registrationDate
          ? "done"
          : booking.status === "AGREEMENT"
            ? "current"
            : "pending",
      },
    ],
    sections: [
      {
        label: "Booking",
        fields: [
          { label: "Project", value: `${booking.project.code} — ${booking.project.name}` },
          { label: "Unit", value: `${booking.unit.unitNumber} · floor ${booking.unit.floorNumber}` },
          { label: "Area", value: `${qty(Number(booking.unit.superBuiltUpArea), 0)} sq.ft` },
          {
            label: "Customer",
            value: `${booking.customer.name} (${booking.customer.customerNo})`,
          },
          // Masked without the KYC permission, exactly as the web masks it.
          { label: "Phone", value: canKyc ? booking.customer.phone : "••••••" },
          { label: "Sold by", value: booking.soldBy?.name ?? null },
          { label: "Booked on", value: booking.bookingDate.toISOString(), format: "date" },
          { label: "Agreement", value: booking.agreementDate?.toISOString() ?? null, format: "date" },
          {
            label: "Registered",
            value: booking.registrationDate?.toISOString() ?? null,
            format: "date",
          },
          { label: "Cost sheet", value: booking.costSheet?.costSheetNo ?? null },
          { label: "Remarks", value: booking.remarks, wide: true },
        ],
      },
      {
        label: "Collections",
        fields: [
          { label: "Total consideration", value: total, format: "money" },
          { label: "Collected", value: received, format: "money" },
          { label: "Outstanding", value: outstanding, format: "money" },
        ],
      },
    ],
    collections: [
      // Both are tabs on the web, shown only to whoever may see them.
      ...(ctx.has(PERM.sales.booking.tabDemands)
        ? [
            {
              key: `demands:${id}`,
              label: `Payment schedule (${booking.demands.length}) · construction-linked milestones`,
              rows: booking.demands.map((d) => {
                const demandTotal = Number(d.totalAmount);
                const got = Number(d.receivedAmount);
                const pending = demandTotal - got;
                const overdue =
                  ["RAISED", "PARTIALLY_PAID"].includes(d.status) && d.dueDate.getTime() < nowMs;

                const rowActions: RecordAction[] = [];
                if (d.status === "PENDING" && !cancelled && ctx.has(PERM.sales.demand.raise)) {
                  rowActions.push({
                    key: `raise:${d.id}`,
                    label: "Raise",
                    emphasis: "approve",
                    action: "sales/bookings/raiseDemand",
                    args: [d.id],
                    remark: "none",
                    confirm: "The demand letter goes to the customer, dated today.",
                  });
                }
                if (
                  ["RAISED", "PARTIALLY_PAID"].includes(d.status) &&
                  !cancelled &&
                  pending > 0 &&
                  ctx.has(PERM.sales.receipt.create)
                ) {
                  rowActions.push(collect(d.id, pending));
                }

                return {
                  id: d.id,
                  title: d.milestone,
                  subtitle: `${d.demandNo} · due ${d.dueDate.toISOString().slice(0, 10)}${overdue ? " · overdue" : ""}${got > 0 ? ` · ${money(got)} received` : ""}`,
                  trailing: money(demandTotal),
                  pills: [
                    { label: words(d.status), tone: DEMAND_TONE[d.status] ?? "draft" },
                    ...(overdue ? [{ label: "Overdue", tone: "bad" as const }] : []),
                  ],
                  actions: rowActions,
                };
              }),
              emptyMessage: "No schedule has been raised against this booking.",
            },
          ]
        : []),
      ...(ctx.has(PERM.sales.booking.tabReceipts)
        ? [
            {
              key: `receipts:${id}`,
              label: `Receipts (${booking.receipts.length})`,
              rows: booking.receipts.map((r) => ({
                id: r.id,
                title: r.receiptNo,
                subtitle: [
                  r.receiptDate.toISOString().slice(0, 10),
                  r.mode,
                  r.referenceNo,
                  r.bank?.name,
                ].filter(Boolean).join(" · "),
                trailing: money(Number(r.amount)),
                // A receipt has no status column: it is derived from the mode
                // and what the bank has done, by the one function that knows.
                pills: (() => {
                  const state = receiptStatus(r);
                  return [{ label: RECEIPT_STATUS_LABEL[state], tone: toneOf(state) }];
                })(),
              })),
              emptyMessage: "Nothing collected yet.",
            },
          ]
        : []),
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
