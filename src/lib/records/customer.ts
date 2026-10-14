import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One customer: their units, what they have paid, and whether KYC is done.
 *
 * KYC is the gate — the web's own description says "PAN is required before KYC
 * can be verified" — so the record shows whether the PAN is even on file
 * before it offers to verify, and the contact number is masked for anybody
 * without the KYC permission, as every other screen masks it.
 */
export async function customerRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { bookingDate: "desc" },
        include: {
          unit: { select: { unitNumber: true, unitType: { select: { name: true } } } },
          project: { select: { code: true } },
        },
      },
    },
  });
  if (!customer) return null;

  const canKyc = ctx.has(PERM.sales.customer.viewKyc);
  const live = customer.bookings.filter((b) => b.status !== "CANCELLED");
  const booked = live.reduce((s, b) => s + Number(b.totalAmount), 0);
  const received = live.reduce((s, b) => s + Number(b.receivedAmount), 0);

  const actions: RecordAction[] = [];
  if (!customer.kycVerifiedAt && ctx.has(PERM.sales.customer.verifyKyc)) {
    actions.push({
      key: "verifyKyc",
      label: "Verify KYC",
      emphasis: "approve",
      action: "sales/bookings/verifyKyc",
      args: [id],
      remark: "none",
      confirm: customer.panNumber
        ? "Recorded against your name, with today's date."
        : "The PAN has to be recorded first — the action will refuse without it.",
    });
  }

  return {
    key: "sales/customers",
    id: customer.id,
    title: customer.name,
    subtitle: [
      customer.customerNo,
      live.length ? `${live.length} ${live.length === 1 ? "unit" : "units"}` : "no units",
      booked > 0 ? money(booked) : null,
    ].filter(Boolean).join(" · "),
    pills: [
      customer.kycVerifiedAt
        ? { label: "KYC verified", tone: "good" }
        : { label: "KYC pending", tone: "warn" },
    ],
    sections: [
      {
        label: "The customer",
        fields: [
          { label: "Customer no.", value: customer.customerNo },
          { label: "Name", value: customer.name },
          // Masked without the KYC permission, as the list masks it.
          { label: "Phone", value: canKyc ? customer.phone : "••••••" },
          { label: "Email", value: canKyc ? customer.email : null },
          { label: "PAN", value: canKyc ? customer.panNumber : null },
          { label: "Aadhaar", value: canKyc ? customer.aadhaarNumber : null },
          {
            label: "KYC verified",
            value: customer.kycVerifiedAt?.toISOString() ?? null,
            format: "date",
          },
          { label: "Address", value: customer.addressLine, wide: true },
        ],
      },
      {
        label: "Money",
        fields: [
          { label: "Booked value", value: booked, format: "money" },
          { label: "Collected", value: received, format: "money" },
          { label: "Outstanding", value: booked - received, format: "money" },
        ],
      },
    ],
    collections: [
      {
        key: `bookings:${id}`,
        label: `Units · ${customer.bookings.length}`,
        rows: customer.bookings.map((b) => ({
          id: b.id,
          title: `${b.unit.unitNumber}${b.unit.unitType ? ` · ${b.unit.unitType.name}` : ""}`,
          subtitle: `${b.bookingNo} · ${b.project.code} · booked ${b.bookingDate.toISOString().slice(0, 10)}`,
          trailing: money(Number(b.totalAmount)),
          pills: [{ label: words(b.status), tone: toneOf(b.status) }],
        })),
        emptyMessage: "No units booked yet.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
