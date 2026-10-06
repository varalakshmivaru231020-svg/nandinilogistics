/**
 * How a checklist point travels through the levels that judge it.
 *
 * A checklist task used to move as one piece: the Assignee sent the whole
 * thing for review, every level judged every point, and a single denial threw
 * the entire task back to be resubmitted — including the points that had
 * already passed. Thirty points, one wrong, everybody judges thirty again.
 *
 * Here each point carries its own position in the chain. A point that passes a
 * level moves on to the next one; a point that is denied goes back to the first
 * reviewer on its own, and the points beside it are untouched. The task itself
 * holds no position at all — where it stands is read off its points, which is
 * why there is nothing for the Assignee to submit.
 *
 * Pure, and free of Prisma: the actions, the screen and the tests all read the
 * same rules.
 */

export interface FlowLevel {
  kind: "REVIEW" | "APPROVAL";
  level: number;
  userId: string;
}

export interface FlowVerdict {
  kind: "REVIEW" | "APPROVAL";
  level: number;
  /** The point's round when this was given. */
  round: number;
  verdict: "PASS" | "FAIL";
}

export interface FlowItem {
  id: string;
  /** Which pass through the levels this point is on; a denial starts the next. */
  round: number;
  verdicts: FlowVerdict[];
}

/**
 * The levels in the order a point passes through them: every reviewer by
 * number, then every approver by number.
 */
export function levelOrder(levels: FlowLevel[]): FlowLevel[] {
  return [...levels].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "REVIEW" ? -1 : 1;
    return a.level - b.level;
  });
}

/**
 * The level this point is waiting on, or null once it has passed them all.
 *
 * Only this round counts. A denial raises the point's round, so the rounds
 * before it stop answering and the point is back at the first level with its
 * history intact.
 */
export function waitingLevel(item: FlowItem, levels: FlowLevel[]): FlowLevel | null {
  for (const l of levelOrder(levels)) {
    const passed = item.verdicts.some(
      (v) => v.round === item.round && v.kind === l.kind && v.level === l.level && v.verdict === "PASS",
    );
    if (!passed) return l;
  }
  return null;
}

/** Whether this level is the one holding this point right now. */
export function isWaitingOn(item: FlowItem, levels: FlowLevel[], level: FlowLevel): boolean {
  const at = waitingLevel(item, levels);
  return at !== null && at.kind === level.kind && at.level === level.level;
}

/** The points this person can judge right now, in the order they were given. */
export function itemsFor(userId: string, items: FlowItem[], levels: FlowLevel[]): FlowItem[] {
  const mine = levels.filter((l) => l.userId === userId);
  if (mine.length === 0) return [];
  return items.filter((i) => mine.some((l) => isWaitingOn(i, levels, l)));
}

/** Every point an Admin could judge — whichever level is holding it. */
export function itemsAwaitingAnyone(items: FlowItem[], levels: FlowLevel[]): FlowItem[] {
  return items.filter((i) => waitingLevel(i, levels) !== null);
}

/**
 * The point's round after a verdict.
 *
 * A pass leaves it where it is — the level's PASS is what moves it on. A denial
 * starts a fresh round, which puts it back at the first reviewer.
 */
export function roundAfter(item: FlowItem, verdict: "PASS" | "FAIL"): number {
  return verdict === "FAIL" ? item.round + 1 : item.round;
}

/** How many points have been through every level. */
export function passedCount(items: FlowItem[], levels: FlowLevel[]): number {
  return items.filter((i) => waitingLevel(i, levels) === null).length;
}

/**
 * Where the task stands, read off its points.
 *
 * Approved once nothing is waiting. Otherwise it is named for the earliest
 * level still holding anything, because that is the step the task is really on
 * — one point back with the first reviewer is a task under review, whatever the
 * others have reached.
 */
export function checklistStage(
  items: FlowItem[],
  levels: FlowLevel[],
): "UNDER_REVIEW" | "UNDER_APPROVAL" | "APPROVED" {
  const waiting = items
    .map((i) => waitingLevel(i, levels))
    .filter((l): l is FlowLevel => l !== null);
  if (waiting.length === 0) return "APPROVED";
  return waiting.some((l) => l.kind === "REVIEW") ? "UNDER_REVIEW" : "UNDER_APPROVAL";
}

/**
 * The earliest level holding any point — what the status line names.
 *
 * Null when every point is through, which is when the task is waiting on the
 * Assignee to close it.
 */
export function earliestWaitingLevel(items: FlowItem[], levels: FlowLevel[]): FlowLevel | null {
  const order = levelOrder(levels);
  for (const l of order) {
    if (items.some((i) => isWaitingOn(i, levels, l))) return l;
  }
  return null;
}
