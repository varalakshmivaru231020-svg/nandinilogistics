import type { Prisma, PrismaClient } from "@prisma/client";

import { PERM } from "@/lib/permissions/codes";
import { employeeScope } from "@/lib/hr/list-filters";
import { usersHolding } from "@/lib/rbac/holders";

import {
  APPROVAL_KIND_LABEL, checkDecision, isApprovalKind,
  type ApprovalDecision, type ApprovalKind,
} from "./rule";

/**
 * The Approvals inbox — one list of everything waiting on a Team Leader or
 * Super Admin. The pure half (params, filtering, scope fragments) sits beside
 * the database half so the page, the export and the badge cannot disagree.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** What the inbox needs from the signed-in person — an AuthContext fits. */
export interface InboxViewer {
  id: string;
  isSuperAdmin?: boolean;
  has: (code: string) => boolean;
}

export const INBOX_HREF = "/approvals";

/* ------------------------------- pure half -------------------------------- */

export interface InboxRow {
  kind: ApprovalKind;
  id: string;
  /** The thing waiting, in a line: "Lead LD0012 — Ravi Kumar". */
  what: string;
  detail: string | null;
  raisedBy: string;
  raisedAtMs: number;
  href: string;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

export interface InboxParams {
  q: string;
  type: ApprovalKind | "";
  /** Matched against the raiser's name. */
  raisedBy: string;
}

export function readInboxParams(source: ParamSource): InboxParams {
  const type = read(source, "type").toUpperCase();
  return { q: read(source, "q"), type: isApprovalKind(type) ? type : "", raisedBy: read(source, "raisedBy") };
}

export function filterInbox(rows: InboxRow[], p: InboxParams): InboxRow[] {
  const q = p.q.toLowerCase();
  const by = p.raisedBy.toLowerCase();
  return rows
    .filter((r) => !p.type || r.kind === p.type)
    .filter((r) => !by || r.raisedBy.toLowerCase().includes(by))
    .filter((r) => !q || `${r.what} ${r.detail ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.raisedAtMs - b.raisedAtMs);
}

export function describeInboxFilters(p: InboxParams): string {
  const parts = [
    p.type ? APPROVAL_KIND_LABEL[p.type] : null,
    p.raisedBy ? `Raised by "${p.raisedBy}"` : null,
    p.q ? `Search "${p.q}"` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Everything waiting";
}

/** Super Admin, or anyone who sees every rider, sees every item. */
export function seesAllApprovals(viewer: InboxViewer): boolean {
  return Boolean(viewer.isSuperAdmin) || viewer.has(PERM.hr.employee.viewAll);
}

/**
 * The leads a viewer may decide: everything for Super Admin; for a Team
 * Leader, leads tagged with one of their companies, or with no company at all.
 */
export function leadApprovalScope(viewer: InboxViewer): Prisma.LeadWhereInput {
  if (seesAllApprovals(viewer)) return {};
  return {
    OR: [
      { companies: { some: { company: { teamLeaders: { some: { userId: viewer.id } } } } } },
      { companies: { none: {} } },
    ],
  };
}

/* ----------------------------- database half ------------------------------ */

async function namesOf(db: Db, ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Everything waiting that this viewer may decide, unfiltered. */
export async function loadInbox(db: Db, viewer: InboxViewer): Promise<InboxRow[]> {
  if (!viewer.has(PERM.approvals.queue.view)) return [];
  const scope = employeeScope(viewer as Parameters<typeof employeeScope>[0]);

  const [leads, onboarding, referrals, advances, edits] = await Promise.all([
    db.lead.findMany({
      where: { AND: [{ approval: "PENDING" }, leadApprovalScope(viewer)] },
      select: { id: true, leadNo: true, name: true, location: true, createdAt: true, createdById: true, ownerId: true },
    }),
    viewer.has(PERM.hr.employee.acceptOnboarding)
      ? db.employee.findMany({
          where: { AND: [{ onboardingStatus: "SUBMITTED" }, scope] },
          select: {
            id: true, name: true, employeeCode: true, submittedAt: true, updatedAt: true,
            lead: { select: { ownerId: true } },
          },
        })
      : [],
    db.employee.findMany({
      where: { AND: [{ referralApproval: "PENDING", referredById: { not: null } }, scope] },
      select: {
        id: true, name: true, employeeCode: true, updatedAt: true, referralSetById: true,
        referredBy: { select: { name: true, employeeCode: true } },
      },
    }),
    viewer.has(PERM.advance.advance.approve)
      ? db.advance.findMany({
          where: { status: "PENDING", employee: scope },
          select: { id: true, amount: true, createdAt: true, remarks: true, employee: { select: { name: true, employeeCode: true } } },
        })
      : [],
    viewer.has(PERM.hr.employee.update)
      ? db.profileEditRequest.findMany({
          where: { status: "PENDING", employee: scope },
          select: { id: true, createdAt: true, reason: true, employee: { select: { id: true, name: true, employeeCode: true } } },
        })
      : [],
  ]);

  const names = await namesOf(db, [
    ...leads.map((l) => l.createdById ?? l.ownerId),
    ...onboarding.map((e) => e.lead?.ownerId ?? null),
    ...referrals.map((r) => r.referralSetById),
  ]);

  const rows: InboxRow[] = [
    ...leads.map((l) => ({
      kind: "LEAD" as const,
      id: l.id,
      what: `Lead ${l.leadNo} — ${l.name}`,
      detail: l.location,
      raisedBy: names.get(l.createdById ?? l.ownerId ?? "") ?? "—",
      raisedAtMs: l.createdAt.getTime(),
      href: `/sales/leads/${l.id}`,
    })),
    ...onboarding.map((e) => ({
      kind: "ONBOARDING" as const,
      id: e.id,
      what: `Onboarding form — ${e.name} (${e.employeeCode})`,
      detail: null,
      raisedBy: names.get(e.lead?.ownerId ?? "") ?? "—",
      raisedAtMs: (e.submittedAt ?? e.updatedAt).getTime(),
      href: `/hr/${e.id}`,
    })),
    ...referrals.map((r) => ({
      kind: "REFERRAL" as const,
      id: r.id,
      what: `${r.name} (${r.employeeCode}) referred by ${r.referredBy?.name ?? "—"} (${r.referredBy?.employeeCode ?? "—"})`,
      detail: null,
      raisedBy: names.get(r.referralSetById ?? "") ?? "—",
      raisedAtMs: r.updatedAt.getTime(),
      href: `/hr/${r.id}`,
    })),
    ...advances.map((a) => ({
      kind: "ADVANCE" as const,
      id: a.id,
      what: `Advance ₹${Number(a.amount).toLocaleString("en-IN")} — ${a.employee.name} (${a.employee.employeeCode})`,
      detail: a.remarks,
      raisedBy: a.employee.name,
      raisedAtMs: a.createdAt.getTime(),
      href: "/advances",
    })),
    ...edits.map((p) => ({
      kind: "PROFILE" as const,
      id: p.id,
      what: `Profile change — ${p.employee.name} (${p.employee.employeeCode})`,
      detail: p.reason,
      raisedBy: p.employee.name,
      raisedAtMs: p.createdAt.getTime(),
      href: `/hr/${p.employee.id}`,
    })),
  ];
  return rows.sort((a, b) => a.raisedAtMs - b.raisedAtMs);
}

/** The badge and the dashboard tile: how many items wait on this viewer. */
export async function inboxCount(db: Db, viewer: InboxViewer): Promise<number> {
  return (await loadInbox(db, viewer)).length;
}

/* ------------------------------ notifications ----------------------------- */

/**
 * Who is asked to decide: every super admin, every approver who sees all,
 * and the Team Leaders of the companies involved — or every Team Leader when
 * the item is tagged with no company.
 */
export async function approversFor(db: Db, companyIds: string[]): Promise<string[]> {
  const [deciders, viewAll, supers, leaders] = await Promise.all([
    usersHolding(db, PERM.approvals.queue.decide),
    usersHolding(db, PERM.hr.employee.viewAll),
    db.user.findMany({ where: { isSuperAdmin: true, status: "ACTIVE" }, select: { id: true } }),
    companyIds.length
      ? db.companyTeamLeader.findMany({ where: { companyId: { in: companyIds } }, select: { userId: true } })
      : Promise.resolve(null),
  ]);
  const inCompanies = leaders ? new Set(leaders.map((l) => l.userId)) : null;
  const all = new Set(viewAll);
  const chosen = deciders.filter((id) => all.has(id) || inCompanies === null || inCompanies.has(id));
  return [...new Set([...chosen, ...supers.map((s) => s.id)])];
}

export async function notifyApprovalRequested(
  db: Db,
  input: { companyIds: string[]; actorId: string; title: string; body?: string | null; entity: string; entityId: string },
): Promise<number> {
  const to = (await approversFor(db, input.companyIds)).filter((id) => id !== input.actorId);
  if (!to.length) return 0;
  await db.notification.createMany({
    data: to.map((userId) => ({
      userId,
      kind: "APPROVAL_REQUESTED",
      title: input.title,
      body: input.body ?? null,
      href: INBOX_HREF,
      entity: input.entity,
      entityId: input.entityId,
    })),
  });
  return to.length;
}

export async function notifyApprovalDecided(
  db: Db,
  input: { userId: string | null; actorId: string; title: string; body?: string | null; href: string; entity: string; entityId: string },
): Promise<void> {
  if (!input.userId || input.userId === input.actorId) return;
  await db.notification.create({
    data: {
      userId: input.userId,
      kind: "APPROVAL_DECIDED",
      title: input.title,
      body: input.body ?? null,
      href: input.href,
      entity: input.entity,
      entityId: input.entityId,
    },
  });
}

/* -------------------------------- decisions ------------------------------- */

export class ApprovalError extends Error {}

/** Approves or rejects a pending lead. Claimed against PENDING, so two deciders cannot both win. */
export async function decideLeadApproval(
  tx: Prisma.TransactionClient,
  viewer: InboxViewer,
  leadId: string,
  decision: ApprovalDecision,
  note: string | null | undefined,
  at: Date,
) {
  const lead = await tx.lead.findFirst({
    where: { AND: [{ id: leadId }, leadApprovalScope(viewer)] },
    select: { id: true, leadNo: true, name: true, approval: true, createdById: true, ownerId: true },
  });
  if (!lead) throw new ApprovalError("Lead not found.");
  const check = checkDecision(lead.approval, decision, note);
  if (!check.ok) throw new ApprovalError(check.error);
  const claimed = await tx.lead.updateMany({
    where: { id: leadId, approval: "PENDING" },
    data: { approval: check.decision, approvedById: viewer.id, approvedAt: at, approvalNote: check.note },
  });
  if (claimed.count !== 1) throw new ApprovalError("This has already been decided.");
  await notifyApprovalDecided(tx, {
    userId: lead.createdById ?? lead.ownerId,
    actorId: viewer.id,
    title: `Lead ${lead.leadNo} ${check.decision === "APPROVED" ? "approved" : "rejected"}`,
    body: check.note,
    href: `/sales/leads/${lead.id}`,
    entity: "Lead",
    entityId: lead.id,
  });
  return { ...lead, decision: check.decision, note: check.note };
}

/** Approves or rejects a referral a tele-caller recorded. A rejected referral stays on record, marked rejected. */
export async function decideReferralApproval(
  tx: Prisma.TransactionClient,
  viewer: InboxViewer,
  employeeId: string,
  decision: ApprovalDecision,
  note: string | null | undefined,
  at: Date,
) {
  const e = await tx.employee.findFirst({
    where: { AND: [{ id: employeeId }, employeeScope(viewer as Parameters<typeof employeeScope>[0])] },
    select: { id: true, name: true, employeeCode: true, referralApproval: true, referralSetById: true, referredById: true },
  });
  if (!e || !e.referredById) throw new ApprovalError("Referral not found.");
  const check = checkDecision(e.referralApproval, decision, note);
  if (!check.ok) throw new ApprovalError(check.error);
  const claimed = await tx.employee.updateMany({
    where: { id: employeeId, referralApproval: "PENDING" },
    data: {
      referralApproval: check.decision,
      referralApprovedById: viewer.id,
      referralApprovedAt: at,
      referralApprovalNote: check.note,
    },
  });
  if (claimed.count !== 1) throw new ApprovalError("This has already been decided.");
  await notifyApprovalDecided(tx, {
    userId: e.referralSetById,
    actorId: viewer.id,
    title: `Referral for ${e.name} ${check.decision === "APPROVED" ? "approved" : "rejected"}`,
    body: check.note,
    href: `/hr/referrals`,
    entity: "Employee",
    entityId: e.id,
  });
  return { ...e, decision: check.decision, note: check.note };
}
