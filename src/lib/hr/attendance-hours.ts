/**
 * Working hours from punches — pure, so the rider's month, the admin report
 * and the exports all add the same way.
 *
 * One attendance row is one session (a day has one punch in and one punch
 * out). A session counts only when both ends are recorded; a punch in with
 * no punch out is *incomplete* and contributes nothing to the hours, and is
 * never turned into an absence. Minutes are kept as integers so nothing is
 * lost to rounding until the figure is formatted.
 */

export interface PunchedDay {
  date: string;
  status: string;
  punchInAt: Date | string | null;
  punchOutAt: Date | string | null;
}

/** Minutes between the two punches, or null when either is missing or out of order. */
export function sessionMinutes(punchInAt: Date | string | null, punchOutAt: Date | string | null): number | null {
  if (!punchInAt || !punchOutAt) return null;
  const a = new Date(punchInAt).getTime();
  const b = new Date(punchOutAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60_000);
}

/** "8h 30m"; "0m" for nothing; never negative. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export interface MonthHours {
  /** Days with any attendance record. */
  workingDays: number;
  present: number;
  halfDay: number;
  absent: number;
  /** Punched in, never out. */
  incomplete: number;
  /** Days with a completed session. */
  completedDays: number;
  totalMinutes: number;
  /** Over the completed days only, or null when there are none. */
  averageMinutes: number | null;
}

export function summarizeHours(days: ReadonlyArray<PunchedDay>): MonthHours {
  const s: MonthHours = {
    workingDays: days.length, present: 0, halfDay: 0, absent: 0,
    incomplete: 0, completedDays: 0, totalMinutes: 0, averageMinutes: null,
  };
  for (const d of days) {
    if (d.status === "PRESENT") s.present += 1;
    else if (d.status === "HALF_DAY") s.halfDay += 1;
    else if (d.status === "ABSENT") s.absent += 1;
    const mins = sessionMinutes(d.punchInAt, d.punchOutAt);
    if (mins !== null) {
      s.completedDays += 1;
      s.totalMinutes += mins;
    } else if (d.punchInAt && !d.punchOutAt) {
      s.incomplete += 1;
    }
  }
  s.averageMinutes = s.completedDays ? Math.round(s.totalMinutes / s.completedDays) : null;
  return s;
}
