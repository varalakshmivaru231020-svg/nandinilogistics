/**
 * The task list's own words: the tone of its status and priority pills, and
 * the lines the table writes when it is empty.
 *
 * Client-safe, because `tasks-screen.tsx` runs in the browser while the row the
 * phone is sent is built on the server.
 */

/** The status pill, in the tones the phone draws. */
export const TASK_STATUS_TONE: Record<string, "good" | "warn" | "bad" | "plum" | "info" | "draft"> = {
  OPEN: "draft",
  IN_PROGRESS: "info",
  DONE: "good",
};

export const TASK_PRIORITY_TONE: Record<string, "bad" | "warn" | "draft"> = {
  HIGH: "bad", MEDIUM: "warn", LOW: "draft",
};

/** The table's two empty lines — nothing at all, or nothing matching. */
export const TASK_EMPTY_NONE = {
  title: "No tasks yet — assign one to a Team Leader, with a due date and a priority.",
};
export const TASK_EMPTY_FILTERED = { title: "No task matches that filter." };

/* ------------------------------------------------------------------ band */

export interface TaskSummary {
  open: number;
  inProgress: number;
  done: number;
  overdue: number;
  dueToday: number;
}

/**
 * The band the task screen opens with — the SOW's open, overdue and completed
 * counts. Pure, so the phone is sent the same figures.
 */
export function taskBandFigures(
  summary: TaskSummary,
): Array<{ value: string; label: string; hint?: string; tone?: "bad" | "warn" | "good" | "brand" }> {
  return [
    { value: String(summary.open), label: "Open" },
    { value: String(summary.inProgress), label: "In progress", ...(summary.inProgress > 0 ? { tone: "brand" as const } : {}) },
    { value: String(summary.overdue), label: "Overdue", ...(summary.overdue > 0 ? { tone: "bad" as const } : {}) },
    { value: String(summary.dueToday), label: "Due today", ...(summary.dueToday > 0 ? { tone: "warn" as const } : {}) },
    { value: String(summary.done), label: "Done", ...(summary.done > 0 ? { tone: "good" as const } : {}) },
  ];
}

/** The five figures, from the rows a list already holds. */
export function taskSummaryOf(
  rows: Array<{ status: string; dueAt: Date | string }>,
  nowMs: number,
): TaskSummary {
  const endOfToday = new Date(nowMs);
  endOfToday.setHours(23, 59, 59, 999);
  const open = rows.filter((t) => t.status === "OPEN").length;
  const inProgress = rows.filter((t) => t.status === "IN_PROGRESS").length;
  const done = rows.filter((t) => t.status === "DONE").length;
  const notDone = rows.filter((t) => t.status !== "DONE");
  const overdue = notDone.filter((t) => new Date(t.dueAt).getTime() < nowMs).length;
  const dueToday = notDone.filter((t) => {
    const due = new Date(t.dueAt).getTime();
    return due >= nowMs && due <= endOfToday.getTime();
  }).length;
  return { open, inProgress, done, overdue, dueToday };
}
