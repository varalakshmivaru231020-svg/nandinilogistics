"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, PermissionError, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { isChannel } from "@/lib/sales/follow-up-display";
import { LeadSchema, readIdList } from "@/lib/sales/lead-schema";
import { captureLead, recordFirstResponse } from "@/lib/sales/lead-service";
import { LeadEditError } from "@/lib/sales/lead-edit";
import { applyLeadEdit } from "@/lib/sales/lead-edit-service";
import { initialApproval, leadWorkBlock } from "@/lib/approvals/rule";
import { notifyApprovalRequested } from "@/lib/approvals/inbox";

/** Refuses work on a lead still waiting for approval, or rejected. */
function assertWorkable(lead: { approval: string }) {
  const block = leadWorkBlock(lead.approval);
  if (block) throw new Error(block);
}

/**
 * Captures a lead — the SOW's New stage: name, mobile, company tags and
 * location, plus whatever Masters → Lead Settings adds. Who owns it is the
 * assignment rule in lib/sales/assignment.ts: Admin and a Team Leader must
 * name a tele-caller, a tele-caller keeps it, a rider's referral is handed
 * round-robin.
 */
export async function createLeadAction(formData: FormData): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.create);
    // The design asks for the country code beside the number; the lead keeps
    // the two together, which is how every screen reads it back.
    const raw = Object.fromEntries(formData);
    const dialCode = String(formData.get("phoneCode") ?? "").split(" ")[0];
    const typed = String(formData.get("phone") ?? "").trim();
    if (dialCode && typed && !typed.startsWith("+")) raw.phone = `${dialCode} ${typed}`;
    const parsed = LeadSchema.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const companyIds = readIdList(formData, "companyIds");
    if (companyIds.length) {
      const found = await prisma.company.count({ where: { id: { in: companyIds }, status: "ACTIVE" } });
      if (found !== companyIds.length) throw new Error("One of those companies is not available.");
    }

    // Whatever Lead Settings added to the form comes back under "custom:<id>",
    // and a field marked mandatory there is mandatory here.
    const configured = await prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } });
    const customFields: Record<string, string> = {};
    for (const field of configured.filter((f) => !f.isSystem)) {
      const value = field.type === "CHECKBOX"
        ? (formData.get(`custom:${field.id}`) === "on" ? "Yes" : "")
        : String(formData.get(`custom:${field.id}`) ?? "").trim();
      if (!value) {
        if (field.required) throw new Error(`${field.label} is required.`);
        continue;
      }
      customFields[field.id] = value;
    }
    // A system field the settings made mandatory is checked the same way. The
    // owner is the assignment rule's to demand, not the master's.
    for (const field of configured.filter((f) => f.isSystem && f.required && f.fieldKey !== "ownerId")) {
      const given = field.fieldKey === "companyIds"
        ? companyIds.length > 0
        : String(formData.get(field.fieldKey) ?? "").trim().length > 0;
      if (!given) throw new Error(`${field.label} is required.`);
    }

    const actor = {
      id: ctx.id,
      canAssign: ctx.has(PERM.sales.lead.assign),
      receivesLeads: ctx.has(PERM.sales.lead.receiveAssignment),
    };
    // The fixed approval rule: a tele-caller's lead waits for a Team Leader.
    const approval = initialApproval({
      receivesLeads: ctx.has(PERM.sales.lead.receiveAssignment),
      canDecide: ctx.has(PERM.approvals.queue.decide),
    });
    const { lead, auto, duplicateOf } = await prisma.$transaction(async (tx) => {
      const captured = await captureLead(
        tx,
        {
          ...parsed.data,
          companyIds,
          customFields,
          ownerId: String(formData.get("ownerId") ?? "") || null,
          approval: approval === "PENDING" ? "PENDING" : "APPROVED",
        },
        actor,
        new Date(),
      );
      if (captured.lead.approval === "PENDING") {
        await notifyApprovalRequested(tx, {
          companyIds,
          actorId: ctx.id,
          title: `Lead ${captured.lead.leadNo} — ${captured.lead.name} waits for approval`,
          body: `Captured by ${ctx.name}`,
          entity: "Lead",
          entityId: captured.lead.id,
        });
      }
      return captured;
    });

    await recordAudit({
      action: "CREATE", entity: "Lead", entityId: lead.id, userId: ctx.id,
      summary:
        `Captured lead ${lead.leadNo} — ${lead.name}${duplicateOf ? ` (possible duplicate of ${duplicateOf.name})` : ""}` +
        (auto ? " — assigned round-robin" : "") +
        (lead.approval === "PENDING" ? " — pending approval" : ""),
    });

    revalidatePath("/sales/leads");
    return { id: lead.id, duplicate: Boolean(duplicateOf) };
  });
}

/**
 * Edits a captured lead's details. The rules — ownership, contact fields,
 * duplicate relinking, the optimistic check on updatedAt — are in
 * lib/sales/lead-edit.ts; this checks the permission and records what happened.
 *
 * Stage, owner, lost reason and follow-ups are not editable here: each has its
 * own action and its own history.
 */
export async function updateLeadAction(id: string, formData: FormData): Promise<ActionResult<{ changed: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.update);
    const current = await prisma.lead.findUnique({ where: { id }, select: { approval: true } });
    if (current?.approval === "REJECTED") throw new Error("This lead was rejected and is read-only.");
    const { updatedAt, ...fields } = Object.fromEntries(formData);
    const form: Record<string, unknown> = { ...fields };
    // A multi-select posts several values under one name; Object.fromEntries kept one.
    if (formData.has("companyIds")) form.companyIds = readIdList(formData, "companyIds");

    let outcome;
    try {
      outcome = await prisma.$transaction((tx) =>
        applyLeadEdit(
          tx,
          id,
          {
            id: ctx.id,
            canViewAll: ctx.has(PERM.sales.lead.viewAll),
            canViewContact: ctx.has(PERM.sales.lead.viewContact),
          },
          form,
          typeof updatedAt === "string" ? updatedAt : null,
        ),
      );
    } catch (err) {
      if (err instanceof LeadEditError && err.kind === "forbidden") {
        throw new PermissionError(
          err.needs === "viewContact" ? PERM.sales.lead.viewContact : PERM.sales.lead.viewAll,
          err.message,
        );
      }
      throw err;
    }
    if (!outcome.updated) return { changed: false };

    await recordAudit({
      action: "UPDATE", entity: "Lead", entityId: id, userId: ctx.id,
      summary: outcome.summary,
      changes: outcome.changes,
    });
    for (const r of outcome.repointed) {
      await recordAudit({
        action: "UPDATE", entity: "Lead", entityId: r.id, userId: ctx.id,
        summary: r.duplicateOfId
          ? `Duplicate link on ${r.leadNo} moved — ${outcome.leadNo} changed its phone number`
          : `${r.leadNo} is no longer marked a duplicate — ${outcome.leadNo} changed its phone number`,
        changes: { duplicateOfId: { from: id, to: r.duplicateOfId } },
      });
    }

    revalidatePath("/sales/leads");
    revalidatePath(`/sales/leads/${id}`);
    return { changed: true };
  });
}

/**
 * Moves a lead to another stage. Stages are the master's rows; what the
 * system does depends on the stage's kind — a Lost stage needs the
 * `markLost` permission and a reason, and the move is written to the
 * timeline with the stage's name at the time.
 */
export async function changeLeadStageAction(
  id: string,
  stageId: string,
  lostReasonId?: string,
  notes?: string,
): Promise<ActionResult<{ kind: string }>> {
  return runAction(async () => {
    const target = await prisma.leadStage.findUnique({ where: { id: stageId } });
    if (!target || target.status !== "ACTIVE") throw new Error("That stage is not available.");
    const losing = target.kind === "LOST";

    const ctx = await authorize(losing ? PERM.sales.lead.markLost : PERM.sales.lead.changeStage);

    const lead = await prisma.lead.findUnique({ where: { id }, include: { stage: true } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.ownerId !== ctx.id && !ctx.has(PERM.sales.lead.viewAll)) {
      throw new PermissionError(PERM.sales.lead.viewAll, "You can only work leads assigned to you.");
    }
    assertWorkable(lead);
    if (lead.stageId === stageId) throw new Error(`The lead is already in ${target.name}.`);
    if (losing && !lostReasonId) throw new Error("A lost reason is mandatory.");

    await prisma.lead.update({
      where: { id },
      data: {
        stageId,
        lostReasonId: losing ? lostReasonId : null,
        lostNotes: losing ? (notes || null) : null,
      },
    });
    // Touching the lead at all is a response; only the first one is timed.
    await recordFirstResponse(prisma, id, new Date());

    await recordAudit({
      action: "UPDATE", entity: "Lead", entityId: id, userId: ctx.id,
      summary: `Moved lead ${lead.leadNo} from ${lead.stage.name} to ${target.name}${notes ? ` — ${notes}` : ""}`,
      changes: { stage: { from: lead.stage.name, to: target.name } },
    });

    revalidatePath("/sales/leads");
    revalidatePath(`/sales/leads/${id}`);
    return { kind: target.kind };
  });
}

/** Admin or a Team Leader hands a lead to a tele-caller — or a tele-caller to a colleague. */
export async function assignLeadAction(id: string, ownerId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.assign);
    const [lead, owner] = await Promise.all([
      prisma.lead.findUnique({ where: { id }, include: { owner: { select: { name: true } } } }),
      prisma.user.findUnique({ where: { id: ownerId }, select: { name: true, status: true } }),
    ]);
    if (!lead) throw new Error("Lead not found.");
    if (!owner || owner.status !== "ACTIVE") throw new Error("That user is not available.");
    if (lead.ownerId === ownerId) throw new Error(`${owner.name} already owns this lead.`);
    // A tele-caller may pass a lead on, but only one of their own.
    if (!ctx.has(PERM.sales.lead.viewAll) && lead.ownerId !== ctx.id) {
      throw new PermissionError(PERM.sales.lead.viewAll, "You can only re-assign leads assigned to you.");
    }

    await prisma.lead.update({
      where: { id },
      data: { ownerId, assignedAt: new Date() },
    });

    // The timeline is built from these rows, so it names both ends of the move
    // rather than only where it landed.
    await recordAudit({
      action: "ASSIGN", entity: "Lead", entityId: id, userId: ctx.id,
      summary: lead.owner
        ? `Reassigned lead ${lead.leadNo} from ${lead.owner.name} to ${owner.name}`
        : `Assigned lead ${lead.leadNo} to ${owner.name}`,
      changes: { ownerId: { from: lead.ownerId, to: ownerId } },
    });
    revalidatePath("/sales/leads");
    revalidatePath(`/sales/leads/${id}`);
    return null;
  });
}

/**
 * Logs a follow-up: date, stage, remarks and the next follow-up date, as the
 * SOW's log reads. The stage the lead stands in is written on the row, so the
 * log says where the conversation was when it happened.
 */
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
    if (!isChannel(channel)) throw new Error("Choose how the lead was reached.");

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.ownerId !== ctx.id && !ctx.has(PERM.sales.lead.viewAll)) {
      throw new PermissionError(PERM.sales.lead.viewAll, "You can only follow up leads assigned to you.");
    }
    assertWorkable(lead);
    const next = nextActionAt ? new Date(nextActionAt) : null;
    if (next && Number.isNaN(next.getTime())) throw new Error("Next follow-up on must be a date.");

    await prisma.$transaction([
      prisma.leadFollowUp.create({
        data: {
          leadId,
          userId: ctx.id,
          channel,
          stageId: lead.stageId,
          notes,
          outcome: outcome || null,
          nextActionAt: next,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        // A new next action is a new lapse: clearing escalatedAt lets it escalate
        // again if this one is missed too.
        data: { nextActionAt: next, escalatedAt: null },
      }),
    ]);
    await recordFirstResponse(prisma, leadId, new Date());

    await recordAudit({
      action: "CREATE", entity: "LeadFollowUp", entityId: leadId, userId: ctx.id,
      summary: `Logged a ${channel.toLowerCase()} follow-up on lead ${lead.leadNo}`,
    });

    revalidatePath("/sales/leads");
    revalidatePath("/sales/follow-ups");
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

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { leadNo: true, ownerId: true, approval: true } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.approval === "REJECTED") throw new Error("This lead was rejected and is read-only.");
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
