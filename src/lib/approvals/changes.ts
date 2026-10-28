import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { claimEmployeeStatus } from "@/lib/hr/employee-status";

import { approversFor, INBOX_HREF } from "./inbox";
import {
  approvalTier, checkDecision, decidedByLabel, mayDecideFor,
  type ApprovalDecision, type ApprovalPerson, type ApprovalTier,
} from "./rule";

/**
 * The approval chain for what Team Leaders and tele-callers do — new riders,
 * advances, edits, deletions and status changes. The rule itself is pure, in
 * rule.ts; this is the database half: who someone is in the chain, who is
 * told, and what an approved change does.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** What the chain needs from the signed-in person — an AuthContext fits. */
export interface ChainViewer {
  id: string;
  name: string;
  isSuperAdmin: boolean;
  has: (code: string) => boolean;
}

export function personOf(ctx: ChainViewer): ApprovalPerson {
  return {
    id: ctx.id,
    isSuperAdmin: ctx.isSuperAdmin,
    canDecide: ctx.has(PERM.approvals.queue.decide),
    seesAll: ctx.has(PERM.hr.employee.viewAll),
  };
}

export function tierOf(ctx: ChainViewer): ApprovalTier {
  return approvalTier(personOf(ctx));
}

/** Each user's place in the chain, for the raisers of a list of items. */
export async function tiersOf(db: Db, ids: Array<string | null | undefined>): Promise<Map<string, ApprovalTier>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const [deciders, seeAll, supers] = await Promise.all([
    usersHolding(db, PERM.approvals.queue.decide),
    usersHolding(db, PERM.hr.employee.viewAll),
    db.user.findMany({ where: { id: { in: unique }, isSuperAdmin: true }, select: { id: true } }),
  ]);
  const decide = new Set(deciders);
  const all = new Set(seeAll);
  const sup = new Set(supers.map((s) => s.id));
  return new Map(unique.map((id) => [
    id,
    approvalTier({ isSuperAdmin: sup.has(id), canDecide: decide.has(id), seesAll: all.has(id) }),
  ]));
}

/** Super Admins: the flag, or an approver who sees every rider. */
async function superAdmins(db: Db): Promise<string[]> {
  const [deciders, seeAll, flagged] = await Promise.all([
    usersHolding(db, PERM.approvals.queue.decide),
    usersHolding(db, PERM.hr.employee.viewAll),
    db.user.findMany({ where: { isSuperAdmin: true, status: "ACTIVE" }, select: { id: true } }),
  ]);
  const all = new Set(seeAll);
  return [...new Set([...flagged.map((u) => u.id), ...deciders.filter((id) => all.has(id))])];
}

/**
 * Tells whoever may decide: for a tele-caller's request, the Team Leaders of
 * the companies involved and Super Admin; for a Team Leader's, Super Admin.
 */
export async function notifyChainRequested(
  db: Db,
  raiser: ChainViewer,
  input: { companyIds: string[]; title: string; body?: string | null; entity: string; entityId: string },
): Promise<number> {
  const tier = tierOf(raiser);
  const to = (tier === "TEAM_LEADER" ? await superAdmins(db) : await approversFor(db, input.companyIds))
    .filter((id) => id !== raiser.id);
  if (!to.length) return 0;
  await db.notification.createMany({
    data: to.map((userId) => ({
      userId,
      kind: "APPROVAL_REQUESTED",
      title: input.title,
      body: input.body ?? `Raised by ${raiser.name} (${tier === "TEAM_LEADER" ? "Team Leader" : "Tele-caller"})`,
      href: INBOX_HREF,
      entity: input.entity,
      entityId: input.entityId,
    })),
  });
  return to.length;
}

/**
 * After a decision: the raiser is told, and when a Team Leader decided,
 * Super Admin is told too — "Approved by Priya (Team Leader)".
 */
export async function notifyChainDecided(
  db: Db,
  decider: ChainViewer,
  input: {
    raisedById: string | null; decision: ApprovalDecision; what: string; note: string | null;
    href: string; entity: string; entityId: string;
  },
): Promise<void> {
  const tier = tierOf(decider);
  const by = decidedByLabel(input.decision, decider.name, tier);
  const body = input.note ? `${by} — ${input.note}` : by;
  const rows: Prisma.NotificationCreateManyInput[] = [];
  if (input.raisedById && input.raisedById !== decider.id) {
    rows.push({
      userId: input.raisedById, kind: "APPROVAL_DECIDED",
      title: `${input.what} — ${input.decision === "APPROVED" ? "approved" : "rejected"}`,
      body, href: input.href, entity: input.entity, entityId: input.entityId,
    });
  }
  if (tier === "TEAM_LEADER") {
    for (const userId of await superAdmins(db)) {
      if (userId === decider.id || userId === input.raisedById) continue;
      rows.push({
        userId, kind: "APPROVAL_DECIDED_BY_TL",
        title: `${input.what} — ${by}`,
        body: input.note, href: input.href, entity: input.entity, entityId: input.entityId,
      });
    }
  }
  if (rows.length) await db.notification.createMany({ data: rows });
}

/* ------------------------------ change requests ----------------------------- */

export type ChangeKind = "UPDATE" | "DELETE" | "STATUS";

/** An approved employee edit: the particulars as stored, dates as yyyy-mm-dd. */
export interface EmployeeUpdatePayload {
  data: Record<string, unknown>;
  companyIds: string[];
  /** Field names, for the request's line. */
  fields: string[];
}

export interface EmployeeStatusPayload {
  from: string;
  to: "ACTIVE" | "INACTIVE";
  reason: string | null;
}

/** Holds a change for approval and tells the approvers. */
export async function requestChange(
  db: Db,
  raiser: ChainViewer,
  input: {
    kind: ChangeKind; entity: string; entityId: string; title: string; detail?: string | null;
    payload: Prisma.InputJsonValue; companyIds: string[];
  },
): Promise<{ id: string }> {
  const waiting = await db.changeRequest.count({
    where: { entity: input.entity, entityId: input.entityId, status: "PENDING" },
  });
  if (waiting > 0) throw new Error("A change to this record is already waiting for approval.");
  const created = await db.changeRequest.create({
    data: {
      kind: input.kind, entity: input.entity, entityId: input.entityId, title: input.title,
      detail: input.detail ?? null, payload: input.payload, companyIds: input.companyIds, raisedById: raiser.id,
    },
    select: { id: true },
  });
  await notifyChainRequested(db, raiser, {
    companyIds: input.companyIds, title: `${input.title} — waiting for approval`,
    body: input.detail ? `${input.detail} · raised by ${raiser.name}` : undefined,
    entity: "ChangeRequest", entityId: created.id,
  });
  return created;
}

export class ChangeError extends Error {}

const dayOrNull = (v: unknown) => (typeof v === "string" && v ? new Date(`${v}T00:00:00.000Z`) : null);

/** Does what an approved request asked. Runs inside the decision's transaction. */
async function applyChange(
  tx: Prisma.TransactionClient,
  r: { kind: string; entity: string; entityId: string; payload: Prisma.JsonValue },
): Promise<void> {
  if (r.entity !== "Employee") throw new ChangeError(`Cannot apply a change to ${r.entity}.`);
  const id = r.entityId;
  const exists = await tx.employee.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!exists) throw new ChangeError("The record no longer exists.");

  switch (r.kind) {
    case "UPDATE": {
      const p = r.payload as unknown as EmployeeUpdatePayload;
      const data = { ...p.data } as Record<string, unknown>;
      if ("joinedOn" in data) data.joinedOn = dayOrNull(data.joinedOn);
      if ("referredById" in data) {
        // The approver approved the referral along with the rest.
        Object.assign(data, { referralApproval: "APPROVED" });
      }
      await tx.employee.update({ where: { id }, data: data as Prisma.EmployeeUncheckedUpdateInput });
      await tx.riderCompany.deleteMany({ where: { employeeId: id, companyId: { notIn: p.companyIds } } });
      await tx.riderCompany.createMany({
        data: p.companyIds.map((companyId) => ({ employeeId: id, companyId })),
        skipDuplicates: true,
      });
      return;
    }
    case "STATUS": {
      const p = r.payload as unknown as EmployeeStatusPayload;
      if (!(await claimEmployeeStatus(tx, id, p.from, p.to))) {
        throw new ChangeError("The status was changed by someone else since this was asked. Reject it and ask again.");
      }
      await tx.employee.update({ where: { id }, data: { leftOn: p.to === "INACTIVE" ? new Date() : null } });
      return;
    }
    case "DELETE": {
      const counts = await tx.employee.findUnique({
        where: { id },
        select: { name: true, _count: { select: { attendance: true, payoutLines: true, advances: true } } },
      });
      if (counts && (counts._count.attendance || counts._count.payoutLines || counts._count.advances)) {
        throw new ChangeError(`${counts.name} now has attendance, payouts or advances on record — mark them Left instead.`);
      }
      await tx.changeRequest.updateMany({ where: { entity: "Employee", entityId: id, status: "PENDING", kind: { not: "DELETE" } }, data: { status: "REJECTED", note: "The record was deleted." } });
      await tx.employee.delete({ where: { id } });
      return;
    }
    default:
      throw new ChangeError(`Unknown change "${r.kind}".`);
  }
}

/** Decides a held change; approval applies it. Claimed against PENDING, so two deciders cannot both win. */
export async function decideChange(
  tx: Prisma.TransactionClient,
  viewer: ChainViewer,
  id: string,
  decision: ApprovalDecision,
  note: string | null | undefined,
  at: Date,
) {
  const r = await tx.changeRequest.findUnique({ where: { id } });
  if (!r) throw new ChangeError("Request not found.");
  const check = checkDecision(r.status, decision, note);
  if (!check.ok) throw new ChangeError(check.error);
  const raiserTier = (await tiersOf(tx, [r.raisedById])).get(r.raisedById) ?? "MEMBER";
  if (!mayDecideFor(personOf(viewer), { id: r.raisedById, tier: raiserTier })) {
    throw new ChangeError(raiserTier === "TEAM_LEADER"
      ? "A Team Leader's request is decided by Super Admin."
      : "You may not decide this request.");
  }
  const claimed = await tx.changeRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: check.decision, decidedById: viewer.id, decidedAt: at, note: check.note },
  });
  if (claimed.count !== 1) throw new ChangeError("This has already been decided.");
  if (check.decision === "APPROVED") await applyChange(tx, r);
  await notifyChainDecided(tx, viewer, {
    raisedById: r.raisedById, decision: check.decision, what: r.title, note: check.note,
    href: r.kind === "DELETE" && check.decision === "APPROVED" ? "/hr/riders" : `/hr/${r.entityId}`,
    entity: r.entity, entityId: r.entityId,
  });
  return { ...r, decision: check.decision, note: check.note };
}

/** Decides a new rider / staff record a Team Leader or tele-caller added. */
export async function decideNewEmployee(
  tx: Prisma.TransactionClient,
  viewer: ChainViewer,
  id: string,
  decision: ApprovalDecision,
  note: string | null | undefined,
  at: Date,
) {
  const e = await tx.employee.findUnique({
    where: { id },
    select: { id: true, name: true, employeeCode: true, approval: true, createdById: true },
  });
  if (!e) throw new ChangeError("Record not found.");
  const check = checkDecision(e.approval, decision, note);
  if (!check.ok) throw new ChangeError(check.error);
  const raiserTier = e.createdById ? (await tiersOf(tx, [e.createdById])).get(e.createdById) ?? "MEMBER" : "MEMBER";
  if (!mayDecideFor(personOf(viewer), { id: e.createdById, tier: raiserTier })) {
    throw new ChangeError(raiserTier === "TEAM_LEADER"
      ? "A Team Leader's new record is approved by Super Admin."
      : "You may not decide this record.");
  }
  const claimed = await tx.employee.updateMany({
    where: { id, approval: "PENDING" },
    data: { approval: check.decision, approvalById: viewer.id, approvalAt: at, approvalNote: check.note },
  });
  if (claimed.count !== 1) throw new ChangeError("This has already been decided.");
  await notifyChainDecided(tx, viewer, {
    raisedById: e.createdById, decision: check.decision, what: `New record ${e.employeeCode} — ${e.name}`,
    note: check.note, href: `/hr/${e.id}`, entity: "Employee", entityId: e.id,
  });
  return { ...e, decision: check.decision, note: check.note };
}
