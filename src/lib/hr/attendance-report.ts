/**
 * The attendance report — its date range and its per-employee summary.
 *
 * Pure and Prisma-free: the Workforce page and the attendance export route both
 * go through here, so the file downloaded is the table on screen.
 */

/** The longest range the report (and its export) will cover, inclusive. */
export const ATTENDANCE_MAX_SPAN_DAYS = 92;

/** Days shown when no range is given: today and the six before it. */
const DEFAULT_SPAN_DAYS = 7;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function isDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  // Rejects 2026-02-31, which Date would otherwise roll into March.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function dayMs(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function addDays(value: string, days: number): string {
  return new Date(dayMs(value) + days * DAY_MS).toISOString().slice(0, 10);
}

export type AttendanceRange =
  | { ok: true; from: string; to: string; days: number }
  | { ok: false; from: string; to: string; error: string };

/**
 * Reads from/to (yyyy-mm-dd, inclusive). A missing `to` is today; a missing
 * `from` is six days before `to`. Unlike the general report filters, a bad
 * range is refused with a message rather than quietly dropped — it decides
 * payable days, so a silent correction would be worse than an error.
 *
 * @param today yyyy-mm-dd, read once by the caller — never the clock here.
 */
export function parseAttendanceRange(
  input: { from?: string | null; to?: string | null },
  today: string,
): AttendanceRange {
  const to = input.to?.trim() || today;
  const from = input.from?.trim() || (isDay(to) ? addDays(to, -(DEFAULT_SPAN_DAYS - 1)) : "");

  if (!isDay(from) || !isDay(to)) {
    return { ok: false, from, to, error: "Dates must be valid days in yyyy-mm-dd form." };
  }
  if (from > to) {
    return { ok: false, from, to, error: "The From date must be on or before the To date." };
  }
  const days = Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1;
  if (days > ATTENDANCE_MAX_SPAN_DAYS) {
    return {
      ok: false, from, to,
      error: `The range covers ${days} days; the report covers at most ${ATTENDANCE_MAX_SPAN_DAYS}. Narrow it.`,
    };
  }
  return { ok: true, from, to, days };
}

export interface AttendanceReportEmployee {
  id: string;
  code: string;
  name: string;
  employmentType: string;
  designation: string | null;
  status: string;
}

export interface AttendanceReportEntry {
  employeeId: string;
  /** yyyy-mm-dd. */
  attendanceOn: string;
  status: string;
  overtimeHours: number;
  /** Check in / out on the Indian clock, "09:12", when punched. */
  checkIn?: string | null;
  checkOut?: string | null;
}

export interface AttendanceSummaryRow extends AttendanceReportEmployee {
  present: number;
  half: number;
  absent: number;
  /** Present days plus half of the half days. */
  payable: number;
  overtime: number;
  /** The average check-in and check-out time over the days punched, "09:12", or null. */
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  /** Days checked in and never out. */
  noCheckOut: number;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
function averageClock(times: string[]): string | null {
  if (!times.length) return null;
  const avg = Math.round(times.reduce((s, t) => s + toMinutes(t), 0) / times.length);
  return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
}

/**
 * One row per employee, in the order given. Entries outside the inclusive
 * range are ignored; an absent day carries no overtime whatever was stored.
 */
export function summarizeAttendance(
  employees: AttendanceReportEmployee[],
  entries: AttendanceReportEntry[],
  range: { from: string; to: string },
): AttendanceSummaryRow[] {
  const tally = new Map<string, { present: number; half: number; absent: number; overtime: number }>();
  const clocks = new Map<string, { ins: string[]; outs: string[]; missing: number }>();
  for (const e of entries) {
    if (e.attendanceOn < range.from || e.attendanceOn > range.to) continue;
    if (e.checkIn) {
      const c = clocks.get(e.employeeId) ?? { ins: [], outs: [], missing: 0 };
      c.ins.push(e.checkIn);
      if (e.checkOut) c.outs.push(e.checkOut); else c.missing += 1;
      clocks.set(e.employeeId, c);
    }
    const t = tally.get(e.employeeId) ?? { present: 0, half: 0, absent: 0, overtime: 0 };
    if (e.status === "PRESENT") t.present += 1;
    else if (e.status === "HALF_DAY") t.half += 1;
    else if (e.status === "ABSENT") t.absent += 1;
    else continue;
    if (e.status !== "ABSENT") t.overtime += Number(e.overtimeHours) || 0;
    tally.set(e.employeeId, t);
  }

  return employees.map((emp) => {
    const t = tally.get(emp.id) ?? { present: 0, half: 0, absent: 0, overtime: 0 };
    const c = clocks.get(emp.id);
    return {
      firstCheckIn: c ? averageClock(c.ins) : null,
      lastCheckOut: c ? averageClock(c.outs) : null,
      noCheckOut: c?.missing ?? 0,
      ...emp,
      present: t.present,
      half: t.half,
      absent: t.absent,
      payable: t.present + t.half * 0.5,
      overtime: Math.round(t.overtime * 100) / 100,
    };
  });
}

export function attendanceTotals(rows: AttendanceSummaryRow[]) {
  return rows.reduce(
    (s, r) => ({
      present: s.present + r.present,
      half: s.half + r.half,
      absent: s.absent + r.absent,
      payable: s.payable + r.payable,
      overtime: Math.round((s.overtime + r.overtime) * 100) / 100,
    }),
    { present: 0, half: 0, absent: 0, payable: 0, overtime: 0 },
  );
}
