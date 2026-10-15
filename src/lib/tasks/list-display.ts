/**
 * The task list's own words: which stage a task is waiting at, the tone of its
 * status and priority pills, and the lines the table writes when it is empty.
 *
 * Client-safe, because `tasks-screen.tsx` runs in the browser while the row the
 * phone is sent is built on the server. `stageOf` was in the page; it is here so
 * the phone says "Under review L2 · with Anil" exactly where the web does.
 */

export function stageOf(t: {
  status: string;
  round: number;
  levels: Array<{ kind: string; level: number; user: { name: string }; actions: Array<{ round: number }> }>;
}): { label: string; who: string } | null {
  const kind = t.status === "UNDER_REVIEW" ? "REVIEW" : t.status === "UNDER_APPROVAL" ? "APPROVAL" : null;
  if (!kind) return null;
  const done = new Set(
    t.levels.filter((l) => l.kind === kind && l.actions.some((a) => a.round === t.round)).map((l) => l.level),
  );
  const next = t.levels
    .filter((l) => l.kind === kind && !done.has(l.level))
    .sort((a, b) => a.level - b.level)[0];
  if (!next) return null;
  return {
    label: `Under ${kind === "REVIEW" ? "review" : "approval"} L${next.level}`,
    who: next.user.name,
  };
}

/** The status pill, in the tones the phone draws. */
export const TASK_STATUS_TONE: Record<string, "good" | "warn" | "bad" | "plum" | "info" | "draft"> = {
  PENDING: "draft",
  ACCEPTED: "info",
  STARTED: "info",
  HOLD: "warn",
  COMPLETED: "good",
  UNDER_REVIEW: "plum",
  REWORK: "bad",
  UNDER_APPROVAL: "plum",
  APPROVED: "good",
  CLOSED: "draft",
};

export const TASK_PRIORITY_TONE: Record<string, "bad" | "warn" | "draft"> = {
  HIGH: "bad", MEDIUM: "warn", LOW: "draft",
};

/** The table's two empty lines — nothing at all, or nothing matching. */
export const TASK_EMPTY_NONE = {
  title: "No tasks yet — raise one against a person, with a due date and a priority.",
};
export const TASK_EMPTY_FILTERED = { title: "No task matches that filter." };

/* ------------------------------------------------------------------ band */

export interface TaskSummary {
  dueToday: number;
  dueThisWeek: number;
  pendingApprovals: number;
  high: number;
  medium: number;
  low: number;
}

export interface TaskScore {
  score: number | null;
  onTime: number;
  late: number;
}

/**
 * The band the task screen opens with — §4.1's widgets, which the screen used
 * to assemble inline. Pure, so the phone is sent the same six figures.
 */
export function taskBandFigures(
  overdue: number,
  summary: TaskSummary,
  myScore: TaskScore | null,
): Array<{ value: string; label: string; hint?: string; tone?: "bad" | "warn" | "good" | "brand" }> {
  return [
    { value: String(overdue), label: "Overdue", ...(overdue > 0 ? { tone: "bad" as const } : {}) },
    { value: String(summary.dueToday), label: "Due today" },
    { value: String(summary.dueThisWeek), label: "Due this week" },
    {
      value: String(summary.pendingApprovals),
      label: "Waiting on you",
      ...(summary.pendingApprovals > 0 ? { tone: "warn" as const } : {}),
    },
    { value: `${summary.high}/${summary.medium}/${summary.low}`, label: "High / Med / Low" },
    ...(myScore
      ? [
          {
            value: myScore.score === null ? "—" : `${myScore.score}%`,
            label: "Your score",
            hint: `${myScore.onTime} on time · ${myScore.late} late`,
            tone: (myScore.score !== null && myScore.score < 70 ? "bad" : "good") as "bad" | "good",
          },
        ]
      : []),
  ];
}
