"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { decideAdvance, notifyAdvance, teamLeadersOf } from "@/lib/advances/service";
import { employeeScopeWhere, resolveViewerScope } from "@/lib/payouts/scope";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * Advances and bike rent — SOW §3.5. A rider asks; a Team Leader or Admin
 * decides and sets the recovery; the payout posting takes it from there. A
 * bike is assigned at a weekly rent and deducted the same way.
 */

const REFRESH = ["/advances", "/advances/bike-rent", "/payouts", "/dashboard"];
function refresh() {
  for (const p of REFRESH) revalidatePath(p);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayText = (v: unknown, label: string): Date => {
  const raw = String(v ?? "").trim();
  if (!ISO_DAY.test(raw)) throw new Error(`${label} must be a date.`);
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) throw new Error(`${label} is not a real date.`);
  return d;
};

/** The rider an action is about must be in the actor's view; a rider may only act for themselves. */
async function riderInScope(ctx: AuthContext, employeeId: string, viewAllCode: string) {
  const scope = await resolveViewerScope(prisma, ctx, viewAllCode);
  const rider = await prisma.employee.findFirst({
    where: { id: employeeId, onboardingStatus: "ACCEPTED", ...employeeScopeWhere(scope) },
    select: { id: true, name: true, employeeCode: true, userId: true },
  });
  if (!rider) throw new Error("That rider is not in your view.");
  return { rider, scope };
}

/* --------------------------------- advances -------------------------------- */

const AdvanceSchema = z.object({
  employeeId: z.string().min(1, "Choose the rider."),
  amount: z.coerce.number().positive("Enter the amount."),
  priority: z.enum(["EMERGENCY", "LOW"]),
  reasonId: z.string().optional(),
  remarks: z.string().trim().optional(),
});

export async function createAdvanceAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.advance.create);
    const parsed = AdvanceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    const { rider } = await riderInScope(ctx, v.employeeId, PERM.advance.advance.viewAll);

    if (v.reasonId) {
      const reason = await prisma.advanceReason.findFirst({ where: { id: v.reasonId, status: "ACTIVE" } });
      if (!reason) throw new Error("Pick a reason from the list.");
    }

    const advance = await prisma.$transaction(async (tx) => {
      const created = await tx.advance.create({
        data: {
          employeeId: rider.id,
          amount: v.amount,
          priority: v.priority,
          reasonId: v.reasonId || null,
          remarks: v.remarks || null,
        },
        select: { id: true },
      });
      await notifyAdvance(tx, {
        kind: "ADVANCE_REQUESTED",
        advanceId: created.id,
        title: `Advance requested — ${rider.name}`,
        body: `₹${v.amount.toLocaleString("en-IN")} · ${v.priority === "EMERGENCY" ? "Emergency" : "Low priority"}`,
        to: await teamLeadersOf(tx, rider.id),
        actorId: ctx.id,
      });
      return created;
    });

    await recordAudit({
      action: "CREATE", entity: "Advance", entityId: advance.id, userId: ctx.id,
      summary: `Advance of ₹${v.amount.toLocaleString("en-IN")} requested for ${rider.name}`,
    });
    refresh();
    return { id: advance.id };
  });
}

export async function decideAdvanceAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
  remarks: string,
  recoveryPerPeriod?: number | null,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.advance.approve);
    if (decision !== "APPROVED" && decision !== "REJECTED") throw new Error("Approve or reject.");
    const existing = await prisma.advance.findUnique({ where: { id }, select: { employeeId: true } });
    if (!existing) throw new Error("That advance request does not exist.");
    const { rider } = await riderInScope(ctx, existing.employeeId, PERM.advance.advance.viewAll);

    const per = recoveryPerPeriod === undefined || recoveryPerPeriod === null || recoveryPerPeriod === ("" as unknown)
      ? null
      : Number(recoveryPerPeriod);

    const { amount } = await prisma.$transaction(async (tx) => {
      const result = await decideAdvance(tx, id, decision, remarks ?? "", per, ctx.id);
      if (rider.userId) {
        await notifyAdvance(tx, {
          kind: "ADVANCE_DECIDED",
          advanceId: id,
          title: decision === "APPROVED" ? "Advance approved" : "Advance rejected",
          body: decision === "APPROVED"
            ? `₹${result.amount.toLocaleString("en-IN")} — ₹${(per ?? 0).toLocaleString("en-IN")} recovered from each payout.`
            : remarks?.trim() || undefined,
          to: [rider.userId],
          actorId: ctx.id,
        });
      }
      return result;
    });

    await recordAudit({
      action: decision === "APPROVED" ? "APPROVE" : "REJECT", entity: "Advance", entityId: id, userId: ctx.id,
      summary: `${decision === "APPROVED" ? "Approved" : "Rejected"} advance of ₹${amount.toLocaleString("en-IN")} for ${rider.name}${remarks?.trim() ? ` — ${remarks.trim()}` : ""}`,
    });
    refresh();
    return null;
  });
}

export async function deleteAdvanceAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.advance.delete);
    const advance = await prisma.advance.findUnique({ where: { id }, select: { status: true, employeeId: true, amount: true } });
    if (!advance) throw new Error("That advance request does not exist.");
    if (advance.status !== "PENDING") throw new Error("Only a pending request can be deleted.");
    const { rider } = await riderInScope(ctx, advance.employeeId, PERM.advance.advance.viewAll);
    await prisma.advance.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "Advance", entityId: id, userId: ctx.id,
      summary: `Deleted pending advance request of ₹${Number(advance.amount).toLocaleString("en-IN")} for ${rider.name}`,
    });
    refresh();
    return null;
  });
}

/* --------------------------------- bike rent ------------------------------- */

const BikeRentSchema = z.object({
  employeeId: z.string().min(1, "Choose the rider."),
  bikeNumber: z.string().trim().min(2, "Enter the bike number."),
  rentPerWeek: z.coerce.number().positive("Enter the rent per week."),
  startDate: z.string().min(1, "Enter the start date."),
  endDate: z.string().optional(),
  notes: z.string().trim().optional(),
});

function bikeRentData(v: z.infer<typeof BikeRentSchema>) {
  const startDate = dayText(v.startDate, "Start date");
  const endDate = v.endDate?.trim() ? dayText(v.endDate, "End date") : null;
  if (endDate && endDate.getTime() < startDate.getTime()) throw new Error("The end date is before the start.");
  return {
    bikeNumber: v.bikeNumber.toUpperCase(),
    rentPerWeek: v.rentPerWeek,
    startDate,
    endDate,
    notes: v.notes || null,
  };
}

export async function createBikeRentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.bikeRent.create);
    const parsed = BikeRentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    const { rider } = await riderInScope(ctx, v.employeeId, PERM.advance.advance.viewAll);
    const data = bikeRentData(v);

    const rent = await prisma.bikeRent.create({ data: { employeeId: rider.id, ...data }, select: { id: true } });
    await recordAudit({
      action: "CREATE", entity: "BikeRent", entityId: rent.id, userId: ctx.id,
      summary: `Assigned bike ${data.bikeNumber} to ${rider.name} at ₹${data.rentPerWeek.toLocaleString("en-IN")} a week`,
    });
    refresh();
    return { id: rent.id };
  });
}

export async function updateBikeRentAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.bikeRent.update);
    const existing = await prisma.bikeRent.findUnique({ where: { id }, select: { employeeId: true } });
    if (!existing) throw new Error("That bike assignment does not exist.");
    const parsed = BikeRentSchema.safeParse({ employeeId: existing.employeeId, ...Object.fromEntries(formData) });
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    const { rider } = await riderInScope(ctx, v.employeeId, PERM.advance.advance.viewAll);
    const data = bikeRentData(v);

    await prisma.bikeRent.update({ where: { id }, data: { employeeId: rider.id, ...data } });
    await recordAudit({
      action: "UPDATE", entity: "BikeRent", entityId: id, userId: ctx.id,
      summary: `Changed bike ${data.bikeNumber} for ${rider.name}`,
    });
    refresh();
    return null;
  });
}

export async function endBikeRentAction(id: string, endDate: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.bikeRent.update);
    const rent = await prisma.bikeRent.findUnique({ where: { id }, select: { startDate: true, bikeNumber: true, employeeId: true } });
    if (!rent) throw new Error("That bike assignment does not exist.");
    await riderInScope(ctx, rent.employeeId, PERM.advance.advance.viewAll);
    const end = dayText(endDate, "Last day");
    if (end.getTime() < rent.startDate.getTime()) throw new Error("The last day is before the start.");
    await prisma.bikeRent.update({ where: { id }, data: { endDate: end } });
    await recordAudit({
      action: "UPDATE", entity: "BikeRent", entityId: id, userId: ctx.id,
      summary: `Ended bike ${rent.bikeNumber} on ${endDate}`,
    });
    refresh();
    return null;
  });
}

export async function deleteBikeRentAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.advance.bikeRent.delete);
    const rent = await prisma.bikeRent.findUnique({ where: { id }, select: { bikeNumber: true, employeeId: true } });
    if (!rent) throw new Error("That bike assignment does not exist.");
    await riderInScope(ctx, rent.employeeId, PERM.advance.advance.viewAll);
    await prisma.bikeRent.delete({ where: { id } });
    await recordAudit({
      action: "DELETE", entity: "BikeRent", entityId: id, userId: ctx.id,
      summary: `Removed bike ${rent.bikeNumber}`,
    });
    refresh();
    return null;
  });
}
