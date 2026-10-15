import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * The three things the web's unit row offers — Edit, Block or Unblock, and
 * Delete — decided once, so the row and the record agree about which of them a
 * flat with a hold or a booking on it still allows.
 */
export function unitDecisions(
  u: { id: string; status: string; holds: number; bookings: number },
  can: { update: boolean; remove: boolean; changeStatus: boolean },
): RecordAction[] {
  const blocked = u.status === "BLOCKED";
  const actions: RecordAction[] = [];

  if (can.update) {
    actions.push({
      key: "edit",
      label: "Edit unit",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "units:edit",
      confirm: "A unit cannot move to another project or block.",
    });
  }

  // Only a flat nothing has happened to.
  if (u.status === "AVAILABLE" && u.bookings === 0 && u.holds === 0 && can.remove) {
    actions.push({
      key: "delete",
      label: "Delete unit",
      emphasis: "reject",
      action: "units/deleteUnit",
      args: [u.id],
      remark: "none",
      confirm: "Only a flat with no hold, booking or cost sheet on it can go.",
    });
  }

  if (can.changeStatus && (u.status === "AVAILABLE" || blocked)) {
    // The web's own two words, and the reason it insists on when blocking.
    actions.push(
      blocked
        ? {
            key: "unblock",
            label: "Unblock unit",
            emphasis: "primary",
            action: "units/changeUnitStatus",
            args: [u.id, u.status, "AVAILABLE", "$reason"],
            remark: "none",
            fields: [
              { name: "reason", label: "Note", kind: "textarea", placeholder: "Optional", wide: true },
            ],
            confirm: "The unit goes back on sale as Available.",
          }
        : {
            key: "block",
            label: "Block unit",
            emphasis: "reject",
            action: "units/changeUnitStatus",
            args: [u.id, u.status, "BLOCKED", "$reason"],
            remark: "none",
            fields: [
              {
                name: "reason",
                label: "Reason",
                kind: "textarea",
                required: true,
                placeholder: "e.g. Reserved for the landowner's share",
                wide: true,
              },
            ],
            confirm:
              "A blocked unit is held back from sale: it cannot be held or booked until it is unblocked.",
          },
    );
  }

  return actions;
}

/**
 * One flat: where it is, what it is, and whether it can be sold.
 *
 * Blocking is the action that belongs on a phone — a unit held back from sale
 * needs a reason, and the reason is the record of why it is off the board.
 * Holding and booking are the sales desk's, through a cost sheet, so they are
 * not offered here.
 *
 * The areas are behind their own permission, as they are on the board.
 */
export async function unitRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      block: { select: { name: true } },
      unitType: { select: { name: true } },
      holds: {
        orderBy: { heldAt: "desc" },
        take: 5,
        include: {
          lead: { select: { leadNo: true, name: true } },
          customer: { select: { name: true } },
        },
      },
      bookings: {
        orderBy: { bookingDate: "desc" },
        include: { customer: { select: { name: true } } },
      },
      costSheets: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, costSheetNo: true, totalAmount: true, createdAt: true },
      },
    },
  });
  if (!unit) return null;
  assertProjectAccess(ctx, unit.projectId);

  // The areas and the price sit behind the same permission the board uses.
  const canArea = ctx.has(PERM.unit.unit.viewPrice);
  const activeHold = unit.holds.find((h) => h.isActive);

  const actions = unitDecisions(
    {
      id,
      status: unit.status,
      holds: unit.holds.length,
      bookings: unit.bookings.length,
    },
    {
      update: ctx.has(PERM.unit.unit.update),
      remove: ctx.has(PERM.unit.unit.delete),
      changeStatus: ctx.has(PERM.unit.unit.changeStatus),
    },
  );

  /*
   * Quoting the flat. Every line comes from a charge head in the master and a
   * rate from the active price list, so the only decisions here are the lead
   * it is for, which optional heads apply, and the discount — and the discount
   * is only offered to somebody who may ask for one.
   */
  if (unit.status === "AVAILABLE" && ctx.has(PERM.sales.costSheet.create)) {
    const [leads, heads] = await Promise.all([
      prisma.lead.findMany({
        where: {
          state: { notIn: ["BOOKED", "LOST"] },
          ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
        },
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true, leadNo: true },
      }),
      prisma.chargeHead.findMany({
        where: {
          status: "ACTIVE",
          isMandatory: false,
          // The heads the engine decides for itself are not choices.
          code: { notIn: ["BASE", "FLOORRISE", "PLC", "PARKING"] },
        },
        orderBy: { sortOrder: "asc" },
        select: { code: true, name: true },
      }),
    ]);
    // The web asks for the create permission here too: whoever may quote may
    // ask for a discount. Approving one is a different permission and a
    // personal ceiling.
    const canDiscount = ctx.has(PERM.sales.costSheet.create);

    actions.push({
      key: "costSheet",
      label: "Generate a cost sheet",
      emphasis: "primary",
      action: "sales/cost-sheets/createCostSheet",
      args: [id, "$leadId", "$includeOptional", canDiscount ? "$discountAmount" : 0],
      remark: "none",
      fields: [
        {
          name: "leadId",
          label: "Lead",
          kind: "lookup",
          hint: "Links the quote to the enquiry it came from.",
          placeholder: "Search leads…",
          emptyLabel: "— None —",
          options: leads.map((l) => ({ value: l.id, label: l.name, hint: l.leadNo })),
        },
        {
          name: "includeOptional",
          label: "Optional charges",
          note: "mandatory heads are always applied",
          kind: "multi",
          placeholder: "Add a charge",
          options: heads.map((h) => ({ value: h.code, label: h.name })),
          wide: true,
        },
        ...(canDiscount
          ? [
              {
                name: "discountAmount",
                label: "Discount",
                kind: "money" as const,
                hint: "A discount holds the sheet up until somebody with the ceiling approves it.",
              },
            ]
          : []),
      ],
      confirm:
        "Every line comes from a charge head in the master and a rate from the active price list.",
    });
  }

  /*
   * Holding it from the board, which is what the web's Reserve drawer does:
   * for a lead, for a number of days, with what was promised written down.
   */
  if (unit.status === "AVAILABLE" && ctx.has(PERM.unit.hold.create)) {
    const leads = await prisma.lead.findMany({
      where: {
        state: { notIn: ["BOOKED", "LOST"] },
        ...(ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id }),
      },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true, leadNo: true },
    });
    actions.push({
      key: "hold",
      label: "Hold this flat",
      emphasis: "outline",
      action: "sales/cost-sheets/holdUnit",
      args: [id, "$leadId", null, "$remarks", "$days"],
      remark: "none",
      fields: [
        {
          name: "leadId",
          label: "For which lead",
          kind: "lookup",
          placeholder: "Search leads…",
          emptyLabel: "— None —",
          options: leads.map((l) => ({ value: l.id, label: l.name, hint: l.leadNo })),
        },
        {
          name: "days",
          label: "For how many days",
          kind: "number",
          hint: "The hold lapses on its own when the days run out.",
        },
        {
          name: "remarks",
          label: "What was promised",
          kind: "textarea",
          wide: true,
        },
      ],
      confirm: "It leaves the availability board until the hold is released or lapses.",
    });
  }

  if (activeHold && ctx.has(PERM.unit.hold.release)) {
    actions.push({
      key: "releaseHold",
      label: "Release the hold",
      emphasis: "outline",
      action: "sales/cost-sheets/releaseHold",
      args: [activeHold.id, "$note"],
      remark: "none",
      fields: [{ name: "note", label: "Note", kind: "textarea", wide: true }],
      confirm: "The flat goes back on the board as Available.",
    });
  }

  return {
    key: "units",
    id: unit.id,
    title: unit.unitNumber,
    subtitle: [
      unit.project.code,
      unit.block?.name,
      `floor ${unit.floorNumber}`,
      unit.unitType?.name,
    ].filter(Boolean).join(" · "),
    pills: [
      { label: words(unit.status), tone: toneOf(unit.status) },
      ...(unit.plcTag ? [{ label: unit.plcTag, tone: "warn" as const }] : []),
    ],
    sections: [
      {
        label: "The flat",
        fields: [
          { label: "Unit", value: unit.unitNumber },
          { label: "Project", value: `${unit.project.code} — ${unit.project.name}` },
          { label: "Block", value: unit.block?.name ?? null },
          { label: "Floor", value: String(unit.floorNumber) },
          { label: "Type", value: unit.unitType?.name ?? null },
          { label: "Facing", value: unit.facing },
          { label: "PLC", value: unit.plcTag },
          { label: "Parking", value: String(unit.parkingSlots) },
          // Behind the same permission the board hides them behind.
          ...(canArea
            ? [
                { label: "Carpet", value: `${qty(Number(unit.carpetArea), 0)} sq.ft` },
                { label: "Built-up", value: `${qty(Number(unit.builtUpArea), 0)} sq.ft` },
                {
                  label: "Super built-up",
                  value: `${qty(Number(unit.superBuiltUpArea), 0)} sq.ft`,
                },
              ]
            : []),
          { label: "Status", value: words(unit.status) },
        ],
      },
    ],
    collections: [
      {
        key: `holds:${id}`,
        label: `Holds · ${unit.holds.length}`,
        rows: unit.holds.map((h) => ({
          id: h.id,
          title: h.customer?.name ?? h.lead?.name ?? "Held",
          subtitle: [
            h.lead?.leadNo,
            h.isActive ? "active" : "released",
            `until ${h.expiresAt.toISOString().slice(0, 10)}`,
            h.remarks,
          ].filter(Boolean).join(" · "),
          pills: h.isActive
            ? [{ label: "On hold", tone: "warn" as const }]
            : [{ label: "Released", tone: "draft" as const }],
        })),
        emptyMessage: "This flat has never been held.",
      },
      {
        key: `bookings:${id}`,
        label: `Bookings · ${unit.bookings.length}`,
        rows: unit.bookings.map((b) => ({
          id: b.id,
          title: b.bookingNo,
          subtitle: `${b.customer.name} · ${b.bookingDate.toISOString().slice(0, 10)}`,
          trailing: money(Number(b.totalAmount)),
          pills: [{ label: words(b.status), tone: toneOf(b.status) }],
        })),
        emptyMessage: "Not booked.",
      },
      {
        key: `sheets:${id}`,
        label: `Cost sheets · ${unit.costSheets.length}`,
        rows: unit.costSheets.map((s) => ({
          id: s.id,
          title: s.costSheetNo,
          subtitle: s.createdAt.toISOString().slice(0, 10),
          trailing: money(Number(s.totalAmount)),
        })),
        emptyMessage: "No sheet has been quoted on this flat.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
