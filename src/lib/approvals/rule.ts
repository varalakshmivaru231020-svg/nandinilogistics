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

export const APPROVAL_KINDS = ["LEAD", "ONBOARDING", "REFERRAL", "ADVANCE", "PROFILE"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  LEAD: "Lead",
  ONBOARDING: "Onboarding",
  REFERRAL: "Referral",
  ADVANCE: "Advance",
  PROFILE: "Profile change",
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
