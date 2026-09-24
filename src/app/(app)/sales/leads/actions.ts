"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { assertProjectAccess, authorize, runAction, PermissionError, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { getSetting } from "@/lib/settings";
import type { ImportPlan, ImportSummary } from "@/lib/import/columns";
import { ImportFileError, parseUploadFrom } from "@/lib/import/parse";
import { planLeadImport } from "@/lib/sales/lead-import";
import { LeadSchema, phoneKey } from "@/lib/sales/lead-schema";
import { captureLead, recordFirstResponse } from "@/lib/sales/lead-service";
import { LeadEditError } from "@/lib/sales/lead-edit";
import { applyLeadEdit } from "@/lib/sales/lead-edit-service";

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

    // Whatever Lead Settings added to the form comes back under "custom:<id>",
    // and a field marked mandatory there is mandatory here.
    const configured = await prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } });
    const customFields: Record<string, string> = {};
    for (const field of configured.filter((f) => !f.isSystem)) {
      const raw = formData.get(`custom:${field.id}`);
      const value = field.type === "CHECKBOX" ? (raw === "on" ? "Yes" : "") : String(raw ?? "").trim();
      if (!value) {
        if (field.required) throw new Error(`${field.label} is required.`);
        continue;
      }
      customFields[field.id] = value;
    }
    // A system field the settings made mandatory is checked the same way.
    for (const field of configured.filter((f) => f.isSystem && f.required)) {
      const raw = formData.get(field.fieldKey);
      const given = field.type === "CHECKBOX" ? raw === "on" : String(raw ?? "").trim().length > 0;
      if (!given) throw new Error(`${field.label} is required.`);
    }

    // The organisation's assignment rule decides who owns the lead: manual keeps
    // it with whoever captured it; round-robin and project-wise hand it on.
    const { mode } = await getSetting(prisma, "sales.leadAssignment");
    const { lead, auto, duplicateOf } = await prisma.$transaction((tx) =>
      captureLead(
        tx,
        {
          ...parsed.data,
          unitTypeId: String(formData.get("unitTypeId") ?? "") || null,
          customFields,
        },
        ctx.id,
        mode,
        new Date(),
      ),
    );

    await recordAudit({
      action: "CREATE", entity: "Lead", entityId: lead.id, userId: ctx.id,
      summary:
        `Captured lead ${lead.leadNo} — ${lead.name}${duplicateOf ? ` (possible duplicate of ${duplicateOf.name})` : ""}` +
        (auto ? ` — assigned automatically (${mode.toLowerCase().replace("_", "-")})` : ""),
    });

    revalidatePath("/sales/leads");
    return { id: lead.id, duplicate: Boolean(duplicateOf) };
  });
}

/**
 * Edits a captured lead's details. The rules — ownership, contact fields, a
 * booked lead's identity, duplicate relinking, the optimistic check on
 * updatedAt — are in lib/sales/lead-edit.ts; this checks the permission and
 * records what happened.
 *
 * Stage, owner, lost reason and follow-ups are not editable here: each has its
 * own action and its own history.
 */
export async function updateLeadAction(id: string, formData: FormData): Promise<ActionResult<{ changed: boolean }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.update);
    const { updatedAt, ...fields } = Object.fromEntries(formData);

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
          fields,
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
    // Touching the lead at all is a response; only the first one is timed.
    await recordFirstResponse(prisma, id, new Date());

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
      prisma.lead.findUnique({ where: { id }, include: { owner: { select: { name: true } } } }),
      prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }),
    ]);
    if (!lead) throw new Error("Lead not found.");
    if (!owner) throw new Error("That user no longer exists.");
    if (lead.ownerId === ownerId) throw new Error(`${owner.name} already owns this lead.`);

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
        // A new next action is a new lapse: clearing escalatedAt lets it escalate
        // again if this one is missed too.
        data: { nextActionAt: nextActionAt ? new Date(nextActionAt) : null, escalatedAt: null },
      }),
    ]);
    await recordFirstResponse(prisma, leadId, new Date());

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
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
        select: { unitNumber: true, status: true, projectId: true },
      });
      if (!unit) throw new Error("Unit not found.");
      assertProjectAccess(ctx, unit.projectId);
      if (unit.status !== "AVAILABLE") throw new Error(`Unit ${unit.unitNumber} is not available.`);

      // Claim it only if still available: a concurrent hold, block or booking wins.
      const claimed = await tx.unit.updateMany({ where: { id: unitId, status: "AVAILABLE" }, data: { status: "HELD" } });
      if (claimed.count === 0) throw new Error(`Unit ${unit.unitNumber} was just taken. Reload and pick another unit.`);

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
      await recordAudit({
        action: "UPDATE", entity: "Unit", entityId: unitId, userId: ctx.id, projectId: unit.projectId,
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

/* -------------------------------- import --------------------------------- */

async function planLeadUpload(canAssign: boolean, formData: FormData) {
  let sheet;
  try {
    sheet = await parseUploadFrom(formData);
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw new Error("The file could not be read. Save it again as .csv or .xlsx and retry.");
  }

  const [sources, projects, unitTypes, owners, existing] = await Promise.all([
    prisma.leadSource.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true } }),
    prisma.unitType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    canAssign
      ? prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, email: true, employeeCode: true, name: true },
        })
      : Promise.resolve([]),
    prisma.lead.findMany({ select: { id: true, name: true, phone: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // The earliest lead for each number, matched loosely (+91, leading zero, spacing).
  const existingPhones = new Map<string, { id: string; name: string }>();
  for (const l of existing) {
    const key = phoneKey(l.phone);
    if (key.length >= 8 && !existingPhones.has(key)) existingPhones.set(key, { id: l.id, name: l.name });
  }

  return planLeadImport(sheet, { sources, projects, unitTypes, owners, existingPhones, canAssign });
}

/** Checks every row of a lead upload and reports what an import would do. Writes nothing. */
export async function previewLeadImportAction(formData: FormData): Promise<ActionResult<ImportPlan>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.import);
    const plan = await planLeadUpload(ctx.has(PERM.sales.lead.assign), formData);
    return { ...plan, rows: plan.rows.map(({ row, label, errors, notes }) => ({ row, label, errors, notes })) };
  });
}

/**
 * Imports every valid row of a lead upload, through captureLead — the same
 * duplicate check, assignment rule and numbering as the New Lead form.
 *
 * The file is planned again rather than trusting the preview. All rows go in
 * one transaction: the import lands whole or not at all.
 */
export async function importLeadsAction(formData: FormData): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.sales.lead.import);
    const plan = await planLeadUpload(ctx.has(PERM.sales.lead.assign), formData);
    if (plan.missing.length > 0) throw new Error(`The file is missing: ${plan.missing.join(", ")}.`);

    const inputs = plan.rows.flatMap((r) => (r.input ? [r.input] : []));
    if (inputs.length === 0) {
      throw new Error("No row in the file can be imported. Fix the rows marked in the preview and try again.");
    }

    const { mode } = await getSetting(prisma, "sales.leadAssignment");
    const start = Date.now();

    const { auto, duplicates } = await prisma.$transaction(
      async (tx) => {
        let auto = 0;
        let duplicates = 0;
        for (const [i, input] of inputs.entries()) {
          // A later instant per row, so round-robin counts each lead it has just handed out.
          const result = await captureLead(tx, input, ctx.id, mode, new Date(start + i));
          if (result.auto) auto += 1;
          if (result.duplicateOf) duplicates += 1;
        }
        return { auto, duplicates };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    const file = formData.get("file");
    const fileName = file && typeof file !== "string" ? file.name : "a file";
    const created = inputs.length;
    const skipped = plan.invalid;
    const details = [
      duplicates ? `${duplicates} flagged as possible duplicates` : null,
      auto ? `${auto} assigned automatically (${mode.toLowerCase().replace("_", "-")})` : null,
      skipped ? `${skipped} row(s) skipped` : null,
    ].filter(Boolean);

    await recordAudit({
      action: "CREATE",
      entity: "Lead",
      userId: ctx.id,
      summary: `Imported ${created} leads from ${fileName}${details.length ? ` — ${details.join(", ")}` : ""}`,
    });

    revalidatePath("/sales/leads");
    return {
      created,
      skipped,
      message: `Imported ${created} lead${created === 1 ? "" : "s"}${details.length ? `: ${details.join(", ")}` : ""}.`,
    };
  });
}
