import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { getSetting } from "@/lib/settings";

import {
  assignmentRuleFor, isEscalationDue, OPEN_STAGE_KINDS, pickAssignee, responseMinutes,
  type AssignmentActor,
} from "./assignment";
import type { LeadInput } from "./lead-schema";

/**
 * The database side of lead assignment, response time and escalation. The
 * rules themselves are pure, in ./assignment.ts.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The stage a new lead opens on — the one master row whose kind is NEW. */
export async function newStage(db: Db): Promise<{ id: string; name: string }> {
  const stage = await db.leadStage.findFirst({
    where: { kind: "NEW", status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  if (!stage) throw new Error("No active lead stage is marked as New. Add one under Masters → Lead Stages.");
  return stage;
}

/**
 * Who a new lead goes to, by the SOW's rule for whoever is capturing it.
 *
 * Admin and a Team Leader must name a tele-caller; a tele-caller keeps what
 * they capture; anyone else — a rider referring a friend — has the lead
 * handed round-robin to the tele-callers. If no tele-caller exists at all the
 * lead stays with its captor rather than being left unowned.
 */
export async function chooseLeadOwner(
  db: Db,
  actor: AssignmentActor & { id: string },
  chosenOwnerId: string | null,
): Promise<{ ownerId: string; auto: boolean }> {
  const rule = assignmentRuleFor(actor);
  const pool = await usersHolding(db, PERM.sales.lead.receiveAssignment);

  if (rule.kind === "must-choose") {
    if (!chosenOwnerId) throw new Error("Choose the tele-caller this lead is assigned to.");
    if (!pool.includes(chosenOwnerId)) throw new Error("That person cannot be handed leads — assign it to a tele-caller.");
    return { ownerId: chosenOwnerId, auto: false };
  }
  if (rule.kind === "self") return { ownerId: actor.id, auto: false };

  if (pool.length === 0) return { ownerId: actor.id, auto: false };

  const latest = await db.lead.groupBy({
    by: ["ownerId"],
    where: { ownerId: { in: pool }, assignedAt: { not: null } },
    _max: { assignedAt: true },
  });
  const lastAssigned = new Map(
    latest.map((r) => [r.ownerId, r._max.assignedAt?.getTime() ?? null] as const),
  );
  const pick = pickAssignee(
    "ROUND_ROBIN",
    pool.map((userId) => ({ userId, lastAssignedAt: lastAssigned.get(userId) ?? null })),
  );
  return pick ? { ownerId: pick, auto: true } : { ownerId: actor.id, auto: false };
}

export interface CaptureLeadInput extends LeadInput {
  /** The client companies the lead is tagged for. */
  companyIds: string[];
  /** Answers to the custom fields Lead Settings adds to the form, by field id. */
  customFields?: Record<string, string> | null;
  /** The tele-caller chosen by someone allowed to assign. */
  ownerId?: string | null;
}

/**
 * Captures one lead: duplicate check, owner, number, record — the single path
 * for every way a lead arrives, so they cannot drift apart.
 *
 * Runs inside the caller's transaction. `assignedAt` is passed in rather than
 * read from the clock so round-robin sees every lead it has just given out.
 */
export async function captureLead(
  tx: Prisma.TransactionClient,
  input: CaptureLeadInput,
  actor: AssignmentActor & { id: string },
  assignedAt: Date,
) {
  const duplicateOf = await tx.lead.findFirst({
    where: { phone: input.phone },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const owner = await chooseLeadOwner(tx, actor, input.ownerId ?? null);
  const stage = await newStage(tx);
  const leadNo = await nextDocumentNumber(tx, "LEAD");

  const lead = await tx.lead.create({
    data: {
      leadNo,
      name: input.name,
      phone: input.phone,
      altPhone: input.altPhone || null,
      email: input.email || null,
      location: input.location || null,
      stageId: stage.id,
      ownerId: owner.ownerId,
      assignedAt,
      requirement: input.requirement || null,
      nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
      customFields: input.customFields && Object.keys(input.customFields).length
        ? input.customFields
        : undefined,
      duplicateOfId: duplicateOf?.id ?? null,
      companies: input.companyIds.length
        ? { create: input.companyIds.map((companyId) => ({ companyId })) }
        : undefined,
    },
    select: { id: true, leadNo: true, name: true },
  });

  return { lead, auto: owner.auto, duplicateOf };
}

/**
 * Record how long a lead waited for its first response, the first time anyone
 * responds. Timed from the latest assignment, so a lead reassigned before
 * anyone answered is measured against the person who actually had it. Never
 * overwritten once set.
 *
 * The write is guarded on the field still being empty: if two responses land
 * together, the first one counts and the second finds nothing to do.
 */
export async function recordFirstResponse(db: Db, leadId: string, respondedAt: Date): Promise<number | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { assignedAt: true, firstResponseMins: true },
  });
  if (!lead || lead.firstResponseMins !== null || !lead.assignedAt) return null;

  const minutes = responseMinutes(lead.assignedAt.getTime(), respondedAt.getTime());
  const { count } = await db.lead.updateMany({
    where: { id: leadId, firstResponseMins: null },
    data: { firstResponseMins: minutes },
  });
  return count ? minutes : null;
}

/**
 * Escalate every open lead whose follow-up has stayed overdue past the grace
 * period, notifying everyone who holds the escalation duty.
 *
 * Safe to run on every request. Each lapse is claimed with a guarded write
 * before anyone is notified, so two sweeps running at once cannot notify
 * twice. If nobody holds the duty, nothing is claimed — the lapse escalates as
 * soon as someone does, rather than being marked done with no one told.
 */
export async function escalateOverdueFollowUps(db: Db, now: Date): Promise<number> {
  const recipients = await usersHolding(db, PERM.sales.followUp.receiveEscalation);
  if (recipients.length === 0) return 0;

  const { afterHours } = await getSetting(db, "sales.followUpEscalation");
  const cutoff = new Date(now.getTime() - afterHours * 3_600_000);

  const candidates = await db.lead.findMany({
    where: {
      escalatedAt: null,
      nextActionAt: { lt: cutoff },
      stage: { kind: { in: [...OPEN_STAGE_KINDS] } },
    },
    select: {
      id: true, leadNo: true, name: true, nextActionAt: true,
      stage: { select: { kind: true } },
      owner: { select: { name: true } },
    },
    take: 200,
  });

  let escalated = 0;
  for (const lead of candidates) {
    // Re-checked against the pure rule, so the query and the rule cannot drift.
    const due = isEscalationDue(
      { stageKind: lead.stage.kind, nextActionAt: lead.nextActionAt?.getTime() ?? null, escalatedAt: null },
      now.getTime(),
      afterHours,
    );
    if (!due) continue;

    const { count } = await db.lead.updateMany({
      where: { id: lead.id, escalatedAt: null },
      data: { escalatedAt: now },
    });
    if (count === 0) continue; // another sweep claimed this lapse first
    escalated += 1;

    const overdueHours = Math.floor((now.getTime() - lead.nextActionAt!.getTime()) / 3_600_000);
    await db.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        kind: "FOLLOW_UP_ESCALATED",
        title: `Follow-up overdue: ${lead.name} (${lead.leadNo})`,
        body: `${lead.owner?.name ?? "Nobody"} has not followed up for ${overdueHours} hours.`,
        href: `/sales/leads/${lead.id}`,
        entity: "Lead",
        entityId: lead.id,
      })),
    });
  }
  return escalated;
}
