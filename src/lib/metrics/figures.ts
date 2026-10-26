/**
 * The figures each module opens with.
 *
 * Every screen in the system is a list of something, and the first question of
 * any list is not what is in it but how it is doing: how much is late, how much
 * is waiting on somebody. These compute that, per module, from plain rows.
 *
 * Pure and Prisma-free, so the arithmetic behind a number somebody will act on
 * can be asserted directly rather than read off a screenshot. Each takes the
 * rows the page already fetched and, where a figure depends on the clock, the
 * moment to measure against — never `Date.now()`, which would make the server
 * and the client disagree about what is overdue.
 */

export interface StatFigure {
  value: string;
  label: string;
  hint?: string;
  tone?: "bad" | "warn" | "good" | "brand";
}

const num = (n: number) => n.toLocaleString("en-IN");

/** A percentage, or a dash when there is nothing to take one of. */
export function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

const at = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/* ----------------------------------- Leads --------------------------------- */

export interface LeadRow {
  /** What the lead's stage means — NEW, OPEN, ONBOARDING or LOST. */
  stageKind: string;
  createdAt: Date | string;
}

export function leadFigures(rows: LeadRow[], nowMs: number): StatFigure[] {
  const weekAgo = nowMs - 7 * 86_400_000;
  const fresh = rows.filter((l) => (at(l.createdAt) ?? 0) >= weekAgo).length;
  const onboarding = rows.filter((l) => l.stageKind === "ONBOARDING").length;
  const lost = rows.filter((l) => l.stageKind === "LOST").length;
  const live = rows.filter((l) => l.stageKind !== "ONBOARDING" && l.stageKind !== "LOST").length;

  return [
    { value: num(rows.length), label: "Leads" },
    { value: num(fresh), label: "New this week", tone: fresh > 0 ? "brand" : undefined },
    { value: num(live), label: "In the pipeline" },
    { value: num(onboarding), label: "Onboarding", tone: onboarding > 0 ? "good" : undefined },
    { value: num(lost), label: "Lost", tone: lost > 0 ? "bad" : undefined },
    {
      value: pct(onboarding, onboarding + lost),
      label: "Conversion",
      hint: `${num(onboarding)} onboarding · ${num(lost)} lost`,
    },
  ];
}

/* --------------------------------- Follow-ups ------------------------------ */

export interface FollowUpRow {
  /** When the next action on this lead is due. */
  dueAt: Date | string;
}

/**
 * Follow-ups are not a list of their own: they are the leads carrying a next
 * action, plus however many contacts have already been logged. The figures take
 * both rather than pretending there is one table.
 */
export function followUpFigures(
  open: FollowUpRow[],
  completed: number,
  nowMs: number,
  endOfTodayMs: number,
): StatFigure[] {
  const overdue = open.filter((f) => (at(f.dueAt) ?? 0) < nowMs).length;
  const today = open.filter((f) => {
    const d = at(f.dueAt) ?? 0;
    return d >= nowMs && d <= endOfTodayMs;
  }).length;

  return [
    { value: num(open.length), label: "Open follow-ups" },
    { value: num(overdue), label: "Overdue", tone: overdue > 0 ? "bad" : undefined },
    { value: num(today), label: "Due today", tone: today > 0 ? "warn" : undefined },
    { value: num(completed), label: "Contacts logged" },
    { value: pct(completed, completed + open.length), label: "Followed up" },
  ];
}

/* ------------------------------- Riders & staff ---------------------------- */

export interface EmployeeRow {
  status: string;
  attendance: Array<{ status: string; overtimeHours: unknown }>;
}

export function employeeFigures(rows: EmployeeRow[]): StatFigure[] {
  const active = rows.filter((e) => e.status === "ACTIVE").length;
  const today = rows.flatMap((e) => e.attendance);
  const present = today.filter((a) => a.status === "PRESENT").length;
  const half = today.filter((a) => a.status === "HALF_DAY").length;
  const absent = today.filter((a) => a.status === "ABSENT").length;
  const ot = today.reduce((n, a) => n + Number(a.overtimeHours ?? 0), 0);

  return [
    { value: num(rows.length), label: "On record" },
    { value: num(active), label: "Active" },
    { value: num(present + half), label: "Marked present today", tone: present + half > 0 ? "good" : undefined },
    { value: num(absent), label: "Absent today", tone: absent > 0 ? "bad" : undefined },
    { value: num(rows.length - today.length), label: "Not marked today", tone: rows.length - today.length > 0 ? "warn" : undefined },
    { value: `${Math.round(ot * 10) / 10} h`, label: "Overtime today" },
  ];
}
