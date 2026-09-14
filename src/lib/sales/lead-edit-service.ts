import "server-only";

import type { Prisma } from "@prisma/client";

import { diff } from "@/lib/audit";

import {
  editSummary, LeadEditError, maskChanges, MIN_PHONE_KEY, planDuplicateRelink, planLeadEdit,
  STALE_MESSAGE,
  type LeadEditActor, type PhoneCandidate,
} from "./lead-edit";
import { phoneKey } from "./lead-schema";

/**
 * The database side of editing a lead. The rules are pure, in ./lead-edit.ts;
 * this loads the lead, applies them, and writes — inside the caller's
 * transaction, so the edit and any re-pointed duplicate links land together.
 */

export interface LeadEditOutcome {
  leadNo: string;
  /** False when the form matched what was stored: nothing written, nothing to audit. */
  updated: boolean;
  /** Field-level diff with contact values masked, ready for the audit row. */
  changes: Record<string, { from: unknown; to: unknown }> | null;
  summary: string;
  /** Other leads whose duplicate link moved because this lead's number changed. */
  repointed: Array<{ id: string; leadNo: string; duplicateOfId: string | null }>;
}

/** Every lead whose number reduces to `key`, matched loosely across +91, leading zero and spacing. */
async function leadsWithPhoneKey(tx: Prisma.TransactionClient, key: string): Promise<PhoneCandidate[]> {
  if (key.length < MIN_PHONE_KEY) return [];
  // Narrowed in SQL by the trailing digits, then matched exactly by phoneKey.
  const rows = await tx.$queryRaw<PhoneCandidate[]>`
    SELECT id, phone, "createdAt", "duplicateOfId"
    FROM leads
    WHERE right(regexp_replace(phone, '\\D', '', 'g'), ${key.length}::int) = ${key}
  `;
  return rows.filter((r) => phoneKey(r.phone) === key);
}

export async function applyLeadEdit(
  tx: Prisma.TransactionClient,
  leadId: string,
  actor: LeadEditActor,
  form: Record<string, unknown>,
  loadedUpdatedAt: string | null | undefined,
): Promise<LeadEditOutcome> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    include: { _count: { select: { bookings: true } } },
  });
  if (!lead) throw new LeadEditError("not-found", "Lead not found.");

  // Optimistic check, before anything else: an edit made against an older
  // copy of the lead must not overwrite what someone saved in between.
  const loaded = loadedUpdatedAt ? new Date(loadedUpdatedAt) : null;
  if (!loaded || Number.isNaN(loaded.getTime()) || loaded.getTime() !== lead.updatedAt.getTime()) {
    throw new LeadEditError("stale", STALE_MESSAGE);
  }

  const { before, after, changed } = planLeadEdit(
    {
      ...lead,
      hasBooking: lead._count.bookings > 0,
      budgetMin: lead.budgetMin === null ? null : Number(lead.budgetMin),
      budgetMax: lead.budgetMax === null ? null : Number(lead.budgetMax),
    },
    actor,
    form,
  );

  if (changed.length === 0) {
    return { leadNo: lead.leadNo, updated: false, changes: null, summary: "", repointed: [] };
  }

  // References must exist — a clear message rather than a foreign-key failure.
  const [source, project, unitType] = await Promise.all([
    changed.includes("sourceId") ? tx.leadSource.findUnique({ where: { id: after.sourceId }, select: { id: true } }) : true,
    changed.includes("projectId") && after.projectId
      ? tx.project.findUnique({ where: { id: after.projectId }, select: { id: true } }) : true,
    changed.includes("unitTypeId") && after.unitTypeId
      ? tx.unitType.findUnique({ where: { id: after.unitTypeId }, select: { id: true } }) : true,
  ]);
  if (!source) throw new LeadEditError("invalid", "That lead source no longer exists.");
  if (!project) throw new LeadEditError("invalid", "That project no longer exists.");
  if (!unitType) throw new LeadEditError("invalid", "That unit type no longer exists.");

  // A changed number is a different person to match. Formatting alone
  // ("+91 98450 12345" for "9845012345") keeps the links as they are.
  let duplicateOfId = lead.duplicateOfId;
  let repoint: Array<{ id: string; duplicateOfId: string | null }> = [];
  if (phoneKey(before.phone) !== phoneKey(after.phone)) {
    const dependents = await tx.lead.findMany({
      where: { duplicateOfId: leadId },
      select: { id: true, phone: true, createdAt: true, duplicateOfId: true },
    });
    const keys = new Set([phoneKey(after.phone), ...dependents.map((d) => phoneKey(d.phone))]);
    const found = (await Promise.all([...keys].map((k) => leadsWithPhoneKey(tx, k)))).flat();
    const candidates = [...new Map([...dependents, ...found].map((c) => [c.id, c])).values()];

    const plan = planDuplicateRelink(leadId, after.phone, candidates);
    duplicateOfId = plan.duplicateOfId;
    repoint = plan.repoint;
  }

  const data = {
    ...after,
    duplicateOfId,
    // A new next action is a new lapse: clearing escalatedAt lets it escalate
    // again if this one is missed too — as logging a follow-up does.
    ...(changed.includes("nextActionAt") ? { escalatedAt: null } : {}),
  };

  // Guarded on the version the form loaded: if a write slipped in since the
  // read above, nothing is written.
  const { count } = await tx.lead.updateMany({ where: { id: leadId, updatedAt: lead.updatedAt }, data });
  if (count === 0) throw new LeadEditError("stale", STALE_MESSAGE);

  const repointed: LeadEditOutcome["repointed"] = [];
  for (const r of repoint) {
    const row = await tx.lead.update({
      where: { id: r.id },
      data: { duplicateOfId: r.duplicateOfId },
      select: { id: true, leadNo: true, duplicateOfId: true },
    });
    repointed.push(row);
  }

  const auditBefore: Record<string, unknown> = { ...before, nextActionAt: before.nextActionAt?.toISOString() ?? null };
  const auditAfter: Record<string, unknown> = { ...after, nextActionAt: after.nextActionAt?.toISOString() ?? null };
  if (duplicateOfId !== lead.duplicateOfId) {
    auditBefore.duplicateOfId = lead.duplicateOfId;
    auditAfter.duplicateOfId = duplicateOfId;
  }

  return {
    leadNo: lead.leadNo,
    updated: true,
    changes: maskChanges(diff(auditBefore, auditAfter)),
    summary: editSummary(lead.leadNo, changed, repointed.length),
    repointed,
  };
}
