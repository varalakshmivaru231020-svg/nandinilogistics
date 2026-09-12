"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, PermissionError, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";

const LeadSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().min(8, "A valid phone number is required"),
  altPhone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  sourceId: z.string().min(1, "Lead source is required"),
  projectId: z.string().optional(),
  requirement: z.string().trim().optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  nextActionAt: z.string().optional(),
});

export async function createLeadAction(formData: FormData): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.create);
    const parsed = LeadSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    // Duplicate detection on phone — the lead is still captured, but linked.
    const existing = await prisma.lead.findFirst({
      where: { phone: v.phone },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });

    const lead = await prisma.$transaction(async (tx) => {
      const leadNo = await nextDocumentNumber(tx, "LEAD", v.projectId || null);
      return tx.lead.create({
        data: {
          leadNo,
          name: v.name,
          phone: v.phone,
          altPhone: v.altPhone || null,
          email: v.email || null,
          sourceId: v.sourceId,
          projectId: v.projectId || null,
          ownerId: ctx.id,
          assignedAt: new Date(),
          requirement: v.requirement || null,
          budgetMin: v.budgetMin ?? null,
          budgetMax: v.budgetMax ?? null,
          nextActionAt: v.nextActionAt ? new Date(v.nextActionAt) : null,
          unitTypeId: String(formData.get("unitTypeId") ?? "") || null,
          duplicateOfId: existing?.id ?? null,
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "Lead", entityId: lead.id, userId: ctx.id,
      summary: `Captured lead ${lead.leadNo} — ${lead.name}${existing ? ` (possible duplicate of ${existing.name})` : ""}`,
    });

    revalidatePath("/sales/leads");
    return { id: lead.id, duplicate: Boolean(existing) };
  });
}

type Stage = "NEW" | "CONTACTED" | "SITE_VISIT_SCHEDULED" | "VISIT_DONE" | "NEGOTIATION" | "BOOKED" | "LOST";

export async function changeLeadStageAction(
  id: string,
  state: Stage,
  lostReasonId?: string,
  notes?: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(
      state === "LOST" ? PERM.sales.lead.markLost : PERM.sales.lead.changeStage,
    );

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.ownerId !== ctx.id && !ctx.has(PERM.sales.lead.viewAll)) {
      throw new PermissionError(PERM.sales.lead.viewAll, "You can only work leads assigned to you.");
    }
    if (state === "LOST" && !lostReasonId) {
      throw new Error("A lost reason is mandatory.");
    }

    await prisma.lead.update({
      where: { id },
      data: {
        state,
        lostReasonId: state === "LOST" ? lostReasonId : null,
        lostNotes: state === "LOST" ? (notes || null) : null,
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "Lead", entityId: id, userId: ctx.id,
      summary: `Moved lead ${lead.leadNo} from ${lead.state.replace(/_/g, " ")} to ${state.replace(/_/g, " ")}`,
      changes: { state: { from: lead.state, to: state } },
    });

    revalidatePath("/sales/leads");
    return null;
  });
}

export async function assignLeadAction(id: string, ownerId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.assign);
    const [lead, owner] = await Promise.all([
      prisma.lead.findUnique({ where: { id } }),
      prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }),
    ]);
    if (!lead) throw new Error("Lead not found.");
    if (!owner) throw new Error("That user no longer exists.");

    await prisma.lead.update({
      where: { id },
      data: { ownerId, assignedAt: new Date() },
    });

    await recordAudit({
      action: "ASSIGN", entity: "Lead", entityId: id, userId: ctx.id,
      summary: `Assigned lead ${lead.leadNo} to ${owner.name}`,
    });
    revalidatePath("/sales/leads");
    return null;
  });
}

export async function logFollowUpAction(
  leadId: string,
  channel: string,
  notes: string,
  outcome: string,
  nextActionAt: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.followUp.create);
    if (!notes.trim()) throw new Error("Write what happened on the follow-up.");

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.ownerId !== ctx.id && !ctx.has(PERM.sales.lead.viewAll)) {
      throw new PermissionError(PERM.sales.lead.viewAll, "You can only follow up leads assigned to you.");
    }

    await prisma.$transaction([
      prisma.leadFollowUp.create({
        data: {
          leadId,
          userId: ctx.id,
          channel,
          notes,
          outcome: outcome || null,
          nextActionAt: nextActionAt ? new Date(nextActionAt) : null,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: { nextActionAt: nextActionAt ? new Date(nextActionAt) : null },
      }),
    ]);

    await recordAudit({
      action: "CREATE", entity: "LeadFollowUp", entityId: leadId, userId: ctx.id,
      summary: `Logged a ${channel.toLowerCase()} follow-up on lead ${lead.leadNo}`,
    });

    revalidatePath("/sales/leads");
    return null;
  });
}

/* ------------------------------ Lead detail ------------------------------ */

/** Notes tab. A note is a remark; a follow-up is a scheduled interaction. */
export async function addLeadNoteAction(leadId: string, body: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.note);
    const text = body.trim();
    if (!text) throw new Error("A note cannot be empty.");

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { leadNo: true, ownerId: true } });
    if (!lead) throw new Error("Lead not found.");
    if (!ctx.has(PERM.sales.lead.viewAll) && lead.ownerId !== ctx.id) {
      throw new PermissionError(PERM.sales.lead.viewAll);
    }

    await prisma.leadNote.create({ data: { leadId, userId: ctx.id, body: text } });
    await recordAudit({
      action: "UPDATE", entity: "Lead", entityId: leadId, userId: ctx.id,
      summary: `Noted on ${lead.leadNo}: ${text.slice(0, 80)}`,
    });
    revalidatePath(`/sales/leads/${leadId}`);
    return null;
  });
}

/**
 * Flats tab. Blocking here is the same hold the Available Flats board uses, so
 * the board reflects it immediately — the design says as much on the screen.
 */
export async function blockUnitForLeadAction(leadId: string, unitId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.hold.create);

    await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { unitNumber: true, status: true } });
      if (!unit) throw new Error("Unit not found.");
      if (unit.status !== "AVAILABLE") throw new Error(`Unit ${unit.unitNumber} is not available.`);

      const days = 2;
      await tx.unitHold.create({
        data: {
          unitId,
          leadId,
          heldById: ctx.id,
          expiresAt: new Date(Date.now() + days * 86_400_000),
          isActive: true,
        },
      });
      await tx.unit.update({ where: { id: unitId }, data: { status: "HELD" } });
      await recordAudit({
        action: "UPDATE", entity: "Unit", entityId: unitId, userId: ctx.id,
        summary: `Blocked unit ${unit.unitNumber} for a lead`,
      });
    });

    revalidatePath(`/sales/leads/${leadId}`);
    revalidatePath("/units/board");
    return null;
  });
}

/** Releases a hold taken from the lead screen. */
export async function releaseUnitForLeadAction(leadId: string, holdId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.hold.release);

    await prisma.$transaction(async (tx) => {
      const hold = await tx.unitHold.findUnique({
        where: { id: holdId },
        select: { unitId: true, isActive: true, unit: { select: { unitNumber: true } } },
      });
      if (!hold?.isActive) throw new Error("That hold is no longer active.");

      await tx.unitHold.update({
        where: { id: holdId },
        data: { isActive: false, releasedAt: new Date(), releaseNote: "Released from the lead screen" },
      });
      await tx.unit.update({ where: { id: hold.unitId }, data: { status: "AVAILABLE" } });
      await recordAudit({
        action: "UPDATE", entity: "Unit", entityId: hold.unitId, userId: ctx.id,
        summary: `Released unit ${hold.unit.unitNumber}`,
      });
    });

    revalidatePath(`/sales/leads/${leadId}`);
    revalidatePath("/units/board");
    return null;
  });
}
