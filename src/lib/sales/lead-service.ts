import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { getSetting } from "@/lib/settings";

import {
  isEscalationDue, OPEN_LEAD_STATES, pickAssignee, responseMinutes,
  type AssignmentMode,
} from "./assignment";
import type { LeadInput } from "./lead-schema";

/**
 * The database side of lead assignment, response time and escalation. The
 * rules themselves are pure, in ./assignment.ts.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Who a new lead goes to. The mode is passed in rather than read here, so the
 * rule can be exercised without changing the organisation's setting — which
 * every other part of the system is reading at the same time.
 *
 * Falls back to whoever captured the lead when the mode is manual, or when
 * nobody holds the duty to receive leads.
 */
export async function chooseLeadOwner(
  db: Db,
  mode: AssignmentMode,
  projectId: string | null,
  capturedBy: string,
): Promise<{ ownerId: string; auto: boolean }> {
  if (mode === "MANUAL") return { ownerId: capturedBy, auto: false };

  const pool = await usersHolding(db, PERM.sales.lead.receiveAssignment);
  if (pool.length === 0) return { ownerId: capturedBy, auto: false };

  const latest = await db.lead.groupBy({
    by: ["ownerId"],
    where: { ownerId: { in: pool }, assignedAt: { not: null } },
    _max: { assignedAt: true },
  });
  const lastAssigned = new Map(
    latest.map((r) => [r.ownerId, r._max.assignedAt?.getTime() ?? null] as const),
  );

  let members: Set<string> | null = null;
  if (mode === "PROJECT" && projectId) {
    const mapped = await db.userProject.findMany({
      where: { projectId, userId: { in: pool } },
      select: { userId: true },
    });
    members = new Set(mapped.map((m) => m.userId));
  }

  const pick = pickAssignee(
    mode,
    pool.map((userId) => ({ userId, lastAssignedAt: lastAssigned.get(userId) ?? null })),
    members,
  );
  return pick ? { ownerId: pick, auto: true } : { ownerId: capturedBy, auto: false };
}

export interface CaptureLeadInput extends LeadInput {
  unitTypeId: string | null;
  /** Answers to the custom fields Lead Settings adds to the form, by field id. */
  customFields?: Record<string, string> | null;
  /** An owner chosen by someone allowed to assign; when absent the assignment rule decides. */
  ownerId?: string | null;
  /**
   * The lead this one duplicates, when the caller has already matched it (the
   * import matches phones loosely, across +91 and leading zeros). Undefined
   * looks it up by exact phone, as the New Lead form always has.
   */
  duplicateOfId?: string | null;
}

/**
 * Captures one lead: duplicate check, owner, number, record — the single path
 * for the New Lead form and the import alike, so the two cannot drift apart.
 *
 * Runs inside the caller's transaction. `assignedAt` is passed in rather than
 * read from the clock: an import hands each row a later instant, so
 * round-robin sees every lead it has just given out when it chooses the next
 * owner, instead of a tie it would break the same way every time.
 */
export async function captureLead(
  tx: Prisma.TransactionClient,
  input: CaptureLeadInput,
  capturedBy: string,
  mode: AssignmentMode,
  assignedAt: Date,
) {
  let duplicateOf: { id: string; name: string } | null = null;
  if (input.duplicateOfId === undefined) {
    duplicateOf = await tx.lead.findFirst({
      where: { phone: input.phone },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  } else if (input.duplicateOfId) {
    duplicateOf = await tx.lead.findUnique({ where: { id: input.duplicateOfId }, select: { id: true, name: true } });
  }

  const owner = input.ownerId
    ? { ownerId: input.ownerId, auto: false }
    : await chooseLeadOwner(tx, mode, input.projectId || null, capturedBy);

  const leadNo = await nextDocumentNumber(tx, "LEAD", input.projectId || null);
  const lead = await tx.lead.create({
    data: {
      leadNo,
      name: input.name,
      phone: input.phone,
      altPhone: input.altPhone || null,
      email: input.email || null,
      sourceId: input.sourceId,
      projectId: input.projectId || null,
      ownerId: owner.ownerId,
      assignedAt,
      requirement: input.requirement || null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
      unitTypeId: input.unitTypeId,
      customFields: input.customFields && Object.keys(input.customFields).length
        ? input.customFields
        : undefined,
      // Captured with a visit already planned: the lead opens on that stage.
      ...(input.siteVisitPlanned ? { state: "SITE_VISIT_SCHEDULED" as const } : {}),
      duplicateOfId: duplicateOf?.id ?? null,
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
      state: { in: [...OPEN_LEAD_STATES] as never },
    },
    select: {
      id: true, leadNo: true, name: true, state: true, nextActionAt: true,
      owner: { select: { name: true } },
    },
    take: 200,
  });

  let escalated = 0;
  for (const lead of candidates) {
    // Re-checked against the pure rule, so the query and the rule cannot drift.
    const due = isEscalationDue(
      { state: lead.state, nextActionAt: lead.nextActionAt?.getTime() ?? null, escalatedAt: null },
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
