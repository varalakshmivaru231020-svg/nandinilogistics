/**
 * Lead auto-assignment, response time and follow-up escalation — the rules.
 *
 * Pure, so every one of them is testable on its own. The database side is in
 * ./lead-service.ts.
 */

export const ASSIGNMENT_MODES = ["MANUAL", "ROUND_ROBIN", "PROJECT"] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export const ASSIGNMENT_MODE_LABEL: Record<AssignmentMode, string> = {
  MANUAL: "Manual — whoever captures a lead owns it",
  ROUND_ROBIN: "Round-robin — to whoever was given a lead least recently",
  PROJECT: "Project-wise — round-robin among those mapped to the lead's project",
};

export function isAssignmentMode(value: unknown): value is AssignmentMode {
  return typeof value === "string" && (ASSIGNMENT_MODES as readonly string[]).includes(value);
}

export interface AssignmentCandidate {
  userId: string;
  /** When this person was last given a lead, epoch ms, or null if never. */
  lastAssignedAt: number | null;
}

/**
 * Who should receive a new lead, or null to leave it with whoever captured it.
 *
 * Round-robin is stateless on purpose: the next person is whoever was assigned
 * least recently, and anyone never assigned goes first. There is no pointer to
 * go stale when someone joins, leaves or goes on leave, and two leads arriving
 * at the same moment cannot corrupt a counter.
 *
 * Project-wise narrows that pool to people mapped to the lead's project, and
 * falls back to the whole pool when the lead has no project or nobody mapped
 * to it can take leads — a lead is never left unowned for want of a mapping.
 */
export function pickAssignee(
  mode: AssignmentMode,
  candidates: AssignmentCandidate[],
  projectMemberIds: ReadonlySet<string> | null,
): string | null {
  if (mode === "MANUAL" || candidates.length === 0) return null;

  let pool = candidates;
  if (mode === "PROJECT" && projectMemberIds) {
    const mapped = candidates.filter((c) => projectMemberIds.has(c.userId));
    if (mapped.length > 0) pool = mapped;
  }

  const ordered = [...pool].sort((a, b) => {
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

/** A response time the way a sales head reads one. */
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

export const OPEN_LEAD_STATES = [
  "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION",
] as const;

export const DEFAULT_ESCALATION_HOURS = 24;

/**
 * Whether a lead's follow-up should be escalated now: it is still open, its
 * next action has been overdue for longer than the grace period, and this
 * lapse has not already been escalated. Logging a follow-up clears
 * escalatedAt, so a later lapse escalates again — but one lapse only once.
 */
export function isEscalationDue(
  lead: { state: string; nextActionAt: number | null; escalatedAt: number | null },
  now: number,
  afterHours: number,
): boolean {
  if (lead.nextActionAt === null || lead.escalatedAt !== null) return false;
  if (!(OPEN_LEAD_STATES as readonly string[]).includes(lead.state)) return false;
  return now - lead.nextActionAt > afterHours * 3_600_000;
}
