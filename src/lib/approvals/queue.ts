/**
 * Everything waiting for a decision, in one list.
 *
 * Approvals were scattered: an indent was decided from a dashboard widget, a
 * purchase order from its own screen, an extension from the schedule, and a
 * return, transfer or invoice from theirs. Nobody could see what was waiting on
 * them without walking the app.
 *
 * This is the shape of that list and the rules for filtering it. It is pure —
 * the page does the reading, this decides what counts and what a person is
 * allowed to see — so the rules are tested directly.
 */

/** The kinds of thing that wait for a decision. */
export const APPROVAL_KINDS = [
  "INDENT",
  "PO",
  "EXTENSION",
  "INVOICE",
  "RETURN",
  "TRANSFER",
  // Task Management puts four more kinds of decision in front of people, and
  // they belong in the same queue: a queue that holds most of what is waiting
  // is one nobody trusts to be the whole list.
  "TASK_CLOSURE",
  "TASK_EXTENSION",
  "TASK_REVIEW",
  "TASK_APPROVAL",
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const KIND_LABEL: Record<ApprovalKind, string> = {
  INDENT: "Indent",
  PO: "Purchase order",
  EXTENSION: "Schedule extension",
  INVOICE: "Vendor invoice",
  RETURN: "Material return",
  TRANSFER: "Stock transfer",
  TASK_CLOSURE: "Task closure",
  TASK_EXTENSION: "Task extension",
  TASK_REVIEW: "Checklist review",
  TASK_APPROVAL: "Checklist approval",
};

/**
 * A task extension cannot be approved with a yes alone: the Assigner also says
 * whether the delay was in the assignee's control, and that choice is what the
 * performance score turns on. The queue asks for it rather than guessing.
 */
export function needsDelayClassification(kind: ApprovalKind): boolean {
  return kind === "TASK_EXTENSION";
}

/** Which kinds a rejection is a real option on, as opposed to an Open. */
export function canRejectHere(kind: ApprovalKind): boolean {
  return kind !== "PO" && kind !== "TRANSFER" && kind !== "INVOICE";
}

export interface ApprovalRow {
  id: string;
  kind: ApprovalKind;
  /** The document number — what a person says out loud.  */
  reference: string;
  title: string;
  /** Who raised it. */
  raisedBy: string;
  raisedAt: string;
  projectName: string | null;
  /** Rupees, where the decision is about money. */
  value: number | null;
  /** The step this is waiting at, in words. */
  waitingOn: string;
  /** Where the full record lives. */
  href: string;
  /** Whether this viewer may decide it, as opposed to merely see it waiting. */
  canDecide: boolean;
}

/** How long something has been waiting, as the design writes ageing. */
export function waitingFor(raisedAt: string, nowMs: number): string {
  const days = Math.floor((nowMs - new Date(raisedAt).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/**
 * The rows a search box and a kind filter leave behind.
 *
 * Searching matches the reference, the title, who raised it and the project,
 * so the number on a piece of paper and the name of the person asking both
 * find it.
 */
export function filterApprovals(
  rows: ApprovalRow[],
  { kind, q }: { kind: ApprovalKind | "all"; q: string },
): ApprovalRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (!needle) return true;
    return `${r.reference} ${r.title} ${r.raisedBy} ${r.projectName ?? ""}`
      .toLowerCase()
      .includes(needle);
  });
}

/** Oldest first — what has waited longest is what is holding someone up. */
export function byOldestFirst(rows: ApprovalRow[]): ApprovalRow[] {
  return [...rows].sort((a, b) => new Date(a.raisedAt).getTime() - new Date(b.raisedAt).getTime());
}

/** How many of each kind are waiting, for the filter chips to count. */
export function countByKind(rows: ApprovalRow[]): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length };
  for (const kind of APPROVAL_KINDS) counts[kind] = 0;
  for (const r of rows) counts[r.kind] += 1;
  return counts;
}
