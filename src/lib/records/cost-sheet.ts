import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, words, type RecordAction, type RecordView } from "./shared";

/**
 * One cost sheet: the quote, and whether it can be turned into a booking.
 *
 * A discount is the thing that holds a sheet up, and the ceiling is personal —
 * `ctx.approvalLimitFor("sales.discount")` — so the record says whose decision
 * it is rather than offering a button that will be refused. Booking it needs a
 * customer, which is the one field the web's dialog asks for.
 */
export async function costSheetRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const sheet = await prisma.costSheet.findUnique({
    where: { id },
    include: {
      unit: {
        select: {
          id: true, unitNumber: true, status: true, floorNumber: true,
          superBuiltUpArea: true, carpetArea: true, parkingSlots: true, plcTag: true,
          projectId: true,
          project: { select: { code: true, name: true } },
          unitType: { select: { name: true } },
        },
      },
      lead: { select: { id: true, name: true, leadNo: true } },
      lines: { include: { chargeHead: { select: { code: true } } } },
      bookings: { select: { id: true, bookingNo: true } },
    },
  });
  if (!sheet) return null;
  assertProjectAccess(ctx, sheet.unit.projectId);

  const discount = Number(sheet.discountAmount);
  const hasDiscount = discount > 0;
  const approved = Boolean(sheet.discountApprovedAt);
  const blocked = hasDiscount && !approved;
  const ceiling = ctx.approvalLimitFor("sales.discount");
  const aboveCeiling = ceiling > 0 && discount > ceiling;
  const booking = sheet.bookings[0] ?? null;
  const expired = sheet.validUntil ? sheet.validUntil.getTime() < Date.now() : false;

  const actions: RecordAction[] = [];

  if (blocked && !booking && ctx.has(PERM.sales.costSheet.approveDiscount) && !aboveCeiling) {
    actions.push({
      key: "approveDiscount",
      label: "Approve the discount",
      emphasis: "approve",
      action: "sales/cost-sheets/approveDiscount",
      args: [id, "$remarks"],
      remark: "none",
      fields: [{ name: "remarks", label: "Remarks", kind: "textarea", wide: true }],
      confirm: `${money(discount)} off. The sheet can be booked once it is approved.`,
    });
  }

  if (!booking && !blocked && ctx.has(PERM.sales.booking.create)) {
    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, customerNo: true, kycVerifiedAt: true },
    });
    actions.push({
      key: "book",
      label: "Confirm booking",
      emphasis: "primary",
      action: "sales/bookings/createBooking",
      args: [id, "$customerId", sheet.lead?.id ?? null, "$remarks"],
      remark: "none",
      fields: [
        {
          name: "customerId",
          label: "Customer",
          kind: "lookup",
          required: true,
          placeholder: "Search customers…",
          options: customers.map((c) => ({
            value: c.id,
            label: c.name,
            hint: `${c.customerNo}${c.kycVerifiedAt ? " · KYC verified" : " · KYC pending"}`,
          })),
        },
        { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
      ],
      confirm:
        "The unit leaves the availability board and the construction-linked payment schedule is raised from this sheet.",
    });
  }

  return {
    key: "sales/cost-sheets",
    id: sheet.id,
    title: sheet.costSheetNo,
    subtitle: `${sheet.unit.project.code} · unit ${sheet.unit.unitNumber}${sheet.unit.unitType ? ` · ${sheet.unit.unitType.name}` : ""}`,
    pills: [
      booking ? { label: "Booked", tone: "good" } : { label: "Quoted", tone: "draft" },
      ...(blocked ? [{ label: "Discount awaiting approval", tone: "warn" as const }] : []),
      ...(expired && !booking ? [{ label: "Quote expired", tone: "bad" as const }] : []),
    ],
    sections: [
      {
        label: "Unit",
        fields: [
          { label: "Project", value: `${sheet.unit.project.code} — ${sheet.unit.project.name}` },
          { label: "Unit", value: sheet.unit.unitNumber },
          { label: "Floor", value: String(sheet.unit.floorNumber) },
          {
            label: "Super built-up",
            value: `${qty(Number(sheet.unit.superBuiltUpArea), 0)} sq.ft`,
          },
          { label: "Carpet", value: `${qty(Number(sheet.unit.carpetArea), 0)} sq.ft` },
          { label: "Parking", value: String(sheet.unit.parkingSlots) },
          { label: "Base rate", value: `${money(Number(sheet.baseRate))} / sq.ft` },
          { label: "Unit status", value: words(sheet.unit.status) },
          { label: "PLC", value: sheet.unit.plcTag },
          { label: "Lead", value: sheet.lead ? `${sheet.lead.name} (${sheet.lead.leadNo})` : null },
          { label: "Generated", value: sheet.createdAt.toISOString(), format: "date" },
          { label: "Valid until", value: sheet.validUntil?.toISOString() ?? null, format: "date" },
        ],
      },
      {
        label: "Consideration",
        fields: [
          { label: "Sub-total", value: Number(sheet.subTotal), format: "money" },
          { label: "Tax", value: Number(sheet.taxAmount), format: "money" },
          { label: "Discount", value: hasDiscount ? -discount : null, format: "money" },
          { label: "Total", value: Number(sheet.totalAmount), format: "money" },
          {
            label: "Discount approved",
            value: sheet.discountApprovedAt?.toISOString() ?? null,
            format: "date",
          },
          // Why the approve button is not there, where it is not.
          ...(blocked && aboveCeiling
            ? [
                {
                  label: "Above your ceiling",
                  value: `${money(discount)} is above your ceiling of ${money(ceiling)}.`,
                  wide: true as const,
                },
              ]
            : []),
          ...(booking
            ? [{ label: "Booked on", value: booking.bookingNo, wide: true as const }]
            : []),
        ],
      },
    ],
    collections: [
      {
        key: `charges:${id}`,
        label: `Charges · ${sheet.lines.length}`,
        rows: sheet.lines.map((l) => ({
          id: l.id,
          title: l.label,
          subtitle: [
            l.chargeHead.code,
            Number(l.quantity) !== 1 ? `${qty(Number(l.quantity), 2)} × ${money(Number(l.rate))}` : null,
            Number(l.taxPct) > 0 ? `GST ${Number(l.taxPct)}%` : null,
          ].filter(Boolean).join(" · "),
          trailing: money(Number(l.amount)),
        })),
        emptyMessage: "This sheet has no charges.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
