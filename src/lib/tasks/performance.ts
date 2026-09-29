import type { DelayControl } from "@prisma/client";

/**
 * Scoring an employee on the delays they could have prevented.
 *
 * The scope document's rule: a task's effective due date is the original due
 * date plus only the time added by uncontrollable extensions. Time granted for
 * a delay the Assignee could control still moves the date they work to — so
 * they are not chased for it — but not the date they are judged against.
 *
 * Pure, and given its clock, so a report and the screen agree about what is
 * late.
 */

export interface ApprovedExtension {
  control: DelayControl | null;
  /** What the due date was when this extension was decided. */
  previousDueAt: Date | string;
  /** What the Assigner set it to. */
  revisedDueAt: Date | string | null;
}

const ms = (d: Date | string) => new Date(d).getTime();

/** How much time one extension added. Never negative: pulling a date in is not credit. */
export function timeAdded(e: ApprovedExtension): number {
  if (!e.revisedDueAt) return 0;
  return Math.max(0, ms(e.revisedDueAt) - ms(e.previousDueAt));
}

/**
 * The date performance is measured against.
 *
 * Only uncontrollable extensions move it. Controllable ones are counted as
 * time the employee owed and did not deliver.
 */
export function effectiveDueAt(
  originalDueAt: Date | string,
  extensions: ApprovedExtension[],
): Date {
  const granted = extensions
    .filter((e) => e.control === "UNCONTROLLABLE")
    .reduce((sum, e) => sum + timeAdded(e), 0);
  return new Date(ms(originalDueAt) + granted);
}

export interface ScoredTask {
  status: string;
  completedAt: Date | string | null;
  effectiveDueAt: Date | string;
  extensions: ApprovedExtension[];
}

export interface Performance {
  total: number;
  onTime: number;
  late: number;
  /** Open tasks already past their date — not yet late, not yet on time. */
  stillOverdue: number;
  /** Average days late across the late ones, counting controllable time only. */
  averageDelayDays: number;
  controllableExtensions: number;
  uncontrollableExtensions: number;
  /** On time ÷ finished, as a percentage; null when nothing has finished. */
  score: number | null;
}

const DAY = 86_400_000;
const FINISHED = ["COMPLETED", "UNDER_REVIEW", "UNDER_APPROVAL", "REWORK", "CLOSED"];

/**
 * An employee's figures for a period.
 *
 * A task counts once it has been completed; one still open and past its date is
 * reported separately rather than scored, because the delay is not yet final.
 * Every task weighs the same whatever its priority, and a failed checklist
 * review does not count against the Assignee — both are decisions recorded in
 * the scope document.
 */
export function scoreTasks(tasks: ScoredTask[], nowMs: number): Performance {
  let onTime = 0;
  let late = 0;
  let stillOverdue = 0;
  let lateDaysTotal = 0;
  let controllable = 0;
  let uncontrollable = 0;

  for (const t of tasks) {
    for (const e of t.extensions) {
      if (e.control === "CONTROLLABLE") controllable += 1;
      if (e.control === "UNCONTROLLABLE") uncontrollable += 1;
    }

    const finished = FINISHED.includes(t.status) && t.completedAt !== null;
    if (!finished) {
      if (ms(t.effectiveDueAt) < nowMs) stillOverdue += 1;
      continue;
    }

    const over = ms(t.completedAt!) - ms(t.effectiveDueAt);
    if (over <= 0) {
      onTime += 1;
    } else {
      late += 1;
      lateDaysTotal += over / DAY;
    }
  }

  const finishedCount = onTime + late;
  return {
    total: tasks.length,
    onTime,
    late,
    stillOverdue,
    averageDelayDays: late === 0 ? 0 : Math.round((lateDaysTotal / late) * 10) / 10,
    controllableExtensions: controllable,
    uncontrollableExtensions: uncontrollable,
    score: finishedCount === 0 ? null : Math.round((onTime / finishedCount) * 100),
  };
}
