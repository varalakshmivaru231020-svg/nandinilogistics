/**
 * The fixed approval rule — decided by the business, not configurable:
 * anything a Tele-caller raises waits as Pending approval until a Team Leader
 * or Super Admin approves or rejects it, and a reason is mandatory on reject.
 *
 * Pure, so the rule is asserted directly. "A tele-caller" is whoever is handed
 * leads (`sales.lead.receiveAssignment`) and cannot decide approvals
 * (`approvals.queue.decide`). The role matrix gives tele-callers
 * `sales.lead.assign` too, so that code cannot tell them apart from a Team
 * Leader; holding the decide permission can.
 */

export type ApprovalState = "APPROVED" | "PENDING" | "REJECTED";
export type ApprovalDecision = "APPROVED" | "REJECTED";

export const APPROVAL_KINDS = ["LEAD", "ONBOARDING", "REFERRAL", "ADVANCE", "PROFILE", "RIDER", "CHANGE"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  LEAD: "Lead",
  ONBOARDING: "Onboarding",
  REFERRAL: "Referral",
  ADVANCE: "Advance",
  PROFILE: "Profile change",
  RIDER: "New rider / staff",
  CHANGE: "Edit / delete",
};

export function isApprovalKind(v: string): v is ApprovalKind {
  return (APPROVAL_KINDS as readonly string[]).includes(v);
}

export interface ApprovalActor {
  /** sales.lead.receiveAssignment */
  receivesLeads: boolean;
  /** approvals.queue.decide */
  canDecide: boolean;
}

/** The state something this person creates starts in. */
export function initialApproval(actor: ApprovalActor): ApprovalState {
  return actor.receivesLeads && !actor.canDecide ? "PENDING" : "APPROVED";
}

/** Whether a decision may be taken on an item in this state, and the note it carries. */
export function checkDecision(
  state: ApprovalState,
  decision: string,
  note: string | null | undefined,
): { ok: true; decision: ApprovalDecision; note: string | null } | { ok: false; error: string } {
  if (decision !== "APPROVED" && decision !== "REJECTED") return { ok: false, error: "Approve or reject." };
  if (state !== "PENDING") return { ok: false, error: "This has already been decided." };
  const why = (note ?? "").trim();
  if (decision === "REJECTED" && why.length < 3) return { ok: false, error: "Give a reason for rejecting it." };
  return { ok: true, decision, note: why || null };
}

/** Why a lead may not be worked yet, or null when it may. */
export function leadWorkBlock(approval: ApprovalState | string): string | null {
  if (approval === "PENDING") return "This lead is waiting for approval by a Team Leader.";
  if (approval === "REJECTED") return "This lead was rejected and is read-only.";
  return null;
}

/** Hours an item has been waiting, rounded down, from a fixed "now". */
export function waitingHours(raisedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - raisedAtMs) / 3_600_000));
}

export function waitingLabel(raisedAtMs: number, nowMs: number): string {
  const h = waitingHours(raisedAtMs, nowMs);
  if (h < 1) return "under an hour";
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

/* ------------------------- who approves whom ----------------------------- */

/**
 * The approval chain for riders, advances, edits and deletions: anything a
 * Tele-caller does waits for a Team Leader or Super Admin — whichever decides
 * first; anything a Team Leader does waits for Super Admin. Super Admin's own
 * work goes through at once. Nobody decides their own request.
 *
 * "Super Admin" is the super-admin flag, or an approver who sees every rider
 * (the Admin role). "Team Leader" is any other approver.
 */
export interface ApprovalPerson {
  id: string;
  isSuperAdmin: boolean;
  /** approvals.queue.decide */
  canDecide: boolean;
  /** hr.employee.viewAll */
  seesAll: boolean;
}

export type ApprovalTier = "SUPER_ADMIN" | "TEAM_LEADER" | "MEMBER";

export function approvalTier(p: Omit<ApprovalPerson, "id">): ApprovalTier {
  if (p.isSuperAdmin || (p.canDecide && p.seesAll)) return "SUPER_ADMIN";
  return p.canDecide ? "TEAM_LEADER" : "MEMBER";
}

export const TIER_LABEL: Record<ApprovalTier, string> = {
  SUPER_ADMIN: "Super Admin",
  TEAM_LEADER: "Team Leader",
  MEMBER: "Tele-caller / staff",
};

/** Whether this person's own creates, edits and deletes wait for approval. */
export function needsApproval(actor: Omit<ApprovalPerson, "id">): boolean {
  return approvalTier(actor) !== "SUPER_ADMIN";
}

/**
 * Whether `viewer` may decide something `raiser` asked for. A Team Leader's
 * request goes to Super Admin only; a tele-caller's (or a rider's) to either.
 * A raiser that is unknown (older records) counts as a tele-caller.
 */
export function mayDecideFor(
  viewer: ApprovalPerson,
  raiser: { id: string | null; tier: ApprovalTier },
): boolean {
  const tier = approvalTier(viewer);
  if (tier === "MEMBER") return false;
  if (tier === "SUPER_ADMIN") return true;
  if (raiser.id && raiser.id === viewer.id) return false;
  return raiser.tier === "MEMBER";
}

/** "Approved by Priya (Team Leader)", for the history and the notifications. */
export function decidedByLabel(decision: ApprovalDecision, name: string, tier: ApprovalTier): string {
  return `${decision === "APPROVED" ? "Approved" : "Rejected"} by ${name} (${TIER_LABEL[tier]})`;
}
