/**
 * Lead assignment, response time and follow-up escalation — the rules.
 *
 * Pure, so every one of them is testable on its own. The database side is in
 * ./lead-service.ts.
 */

/**
 * Who may own a lead at creation, per SOW §3.1:
 *
 *   - Admin or a Team Leader (anyone holding `sales.lead.assign`) must name a
 *     tele-caller when they create one.
 *   - A tele-caller (anyone holding `sales.lead.receiveAssignment`) owns what
 *     they capture.
 *   - A rider (neither) refers a lead and it is handed round-robin to the
 *     tele-callers.
 */
export type AssignmentMode = "MANUAL" | "ROUND_ROBIN";

export interface AssignmentCandidate {
  userId: string;
  /** When this person was last given a lead, epoch ms, or null if never. */
  lastAssignedAt: number | null;
}

export interface AssignmentActor {
  /** sales.lead.assign — must choose the owner. */
  canAssign: boolean;
  /** sales.lead.receiveAssignment — a tele-caller, who keeps what they capture. */
  receivesLeads: boolean;
}

export type AssignmentRule =
  | { kind: "must-choose" }
  | { kind: "self" }
  | { kind: "round-robin" };

/** Which of the three rules applies to the person capturing the lead. */
export function assignmentRuleFor(actor: AssignmentActor): AssignmentRule {
  if (actor.canAssign) return { kind: "must-choose" };
  if (actor.receivesLeads) return { kind: "self" };
  return { kind: "round-robin" };
}

/**
 * Who should receive a new lead, or null to leave it with whoever captured it.
 *
 * Round-robin is stateless on purpose: the next person is whoever was assigned
 * least recently, and anyone never assigned goes first. There is no pointer to
 * go stale when someone joins, leaves or goes on leave, and two leads arriving
 * at the same moment cannot corrupt a counter.
 */
export function pickAssignee(
  mode: AssignmentMode,
  candidates: AssignmentCandidate[],
): string | null {
  if (mode === "MANUAL" || candidates.length === 0) return null;

  const ordered = [...candidates].sort((a, b) => {
    const at = a.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
    const bt = b.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
    if (at !== bt) return at < bt ? -1 : 1;
    // Deterministic between equals, so the same state always picks the same person.
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
  return ordered[0].userId;
}

/* ------------------------------ Response time ----------------------------- */

/** Whole minutes from assignment to first response. Never negative. */
export function responseMinutes(assignedAt: number, respondedAt: number): number {
  return Math.max(0, Math.round((respondedAt - assignedAt) / 60_000));
}

/** A response time the way a team leader reads one. */
export function formatResponse(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * The median, not the mean: response times are skewed by the odd lead that
 * sat over a weekend, and a mean would let one of those misrepresent a team
 * that usually answers within the hour.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* -------------------------------- Escalation ------------------------------ */

/**
 * A lead is open while its stage still means something is to be done. The
 * stage itself is whatever Admin named it; its `kind` is what the system reads.
 */
export const OPEN_STAGE_KINDS = ["NEW", "OPEN", "ONBOARDING"] as const;

export function isOpenStageKind(kind: string): boolean {
  return (OPEN_STAGE_KINDS as readonly string[]).includes(kind);
}

export const DEFAULT_ESCALATION_HOURS = 24;

/**
 * Whether a lead's follow-up should be escalated now: it is still open, its
 * next action has been overdue for longer than the grace period, and this
 * lapse has not already been escalated. Logging a follow-up clears
 * escalatedAt, so a later lapse escalates again — but one lapse only once.
 */
export function isEscalationDue(
  lead: { stageKind: string; nextActionAt: number | null; escalatedAt: number | null },
  now: number,
  afterHours: number,
): boolean {
  if (lead.nextActionAt === null || lead.escalatedAt !== null) return false;
  if (!isOpenStageKind(lead.stageKind)) return false;
  return now - lead.nextActionAt > afterHours * 3_600_000;
}
