/**
 * The schedule screen's own words: the state it reads off an activity's facts,
 * and the line it writes when a project has no schedule yet.
 *
 * Client-safe — `schedule-screen.tsx` runs in the browser.
 */

/**
 * The design reads an activity's state off the facts — started, finished — and
 * leaves lateness to the flag and the verdicts beside it.
 */
export function activityState(a: { status: string; actualStart: string | Date | null }): string {
  if (a.status === "COMPLETED") return "Completed";
  return a.actualStart ? "In progress" : "Not started";
}

export const ACTIVITY_STATE_TONE: Record<string, "good" | "info" | "draft"> = {
  Completed: "good", "In progress": "info", "Not started": "draft",
};

export const SCHEDULE_EMPTY = { title: "No activities on this schedule yet." };
