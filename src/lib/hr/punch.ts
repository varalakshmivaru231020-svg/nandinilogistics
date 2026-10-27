/**
 * Punching in and out from the app — SOW §3.6 item 7. Pure: the action loads
 * today's row and writes what this returns, so the rules live with the
 * arithmetic and can be asserted directly.
 */

/** Riders work in India: "today" is the Indian calendar day. */
const IST_OFFSET_MS = 330 * 60_000;
const HOUR = 3_600_000;

/** Fewer hours than this between punch in and out is a half day. */
export const HALF_DAY_BELOW_HOURS = 4;

/** The attendance day (UTC midnight of the Indian date) a moment falls on. */
export function attendanceDay(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(`${ist.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function checkCoordinates(
  latitude: unknown,
  longitude: unknown,
): { ok: true; lat: number; lng: number } | { ok: false; error: string } {
  if (latitude === null || latitude === undefined || latitude === "" || longitude === null || longitude === undefined || longitude === "") {
    return { ok: false, error: "The phone's location is required to punch." };
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: "Latitude must be between -90 and 90." };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: "Longitude must be between -180 and 180." };
  return { ok: true, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

export interface DayRow {
  status: string;
  punchInAt: Date | null;
  punchOutAt: Date | null;
}

export type PunchPlan<T> = { ok: true; data: T } | { ok: false; error: string };

export function planPunchIn(
  today: DayRow | null,
  at: Date,
  where: { lat: number; lng: number },
): PunchPlan<{ status: "PRESENT"; punchInAt: Date; punchInLat: number; punchInLng: number }> {
  if (today?.punchInAt) return { ok: false, error: "You have already punched in today." };
  return { ok: true, data: { status: "PRESENT", punchInAt: at, punchInLat: where.lat, punchInLng: where.lng } };
}

export function hoursWorked(inAt: Date, outAt: Date): number {
  return Math.max(0, (outAt.getTime() - inAt.getTime()) / HOUR);
}

export function planPunchOut(
  today: DayRow | null,
  at: Date,
  where: { lat: number; lng: number },
): PunchPlan<{ status: string; punchOutAt: Date; punchOutLat: number; punchOutLng: number; hours: number }> {
  if (!today?.punchInAt) return { ok: false, error: "Punch in first." };
  if (today.punchOutAt) return { ok: false, error: "You have already punched out today." };
  if (at.getTime() < today.punchInAt.getTime()) return { ok: false, error: "Punch out cannot be before punch in." };
  const hours = hoursWorked(today.punchInAt, at);
  return {
    ok: true,
    data: {
      status: hours < HALF_DAY_BELOW_HOURS ? "HALF_DAY" : today.status,
      punchOutAt: at,
      punchOutLat: where.lat,
      punchOutLng: where.lng,
      hours,
    },
  };
}

/** What the app shows on its punch button. */
export function punchState(today: DayRow | null): "NOT_PUNCHED" | "PUNCHED_IN" | "PUNCHED_OUT" {
  if (!today?.punchInAt) return "NOT_PUNCHED";
  return today.punchOutAt ? "PUNCHED_OUT" : "PUNCHED_IN";
}

/** The first of a `yyyy-mm` month and the first of the next, or null. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { from: new Date(Date.UTC(y, mo - 1, 1)), to: new Date(Date.UTC(y, mo, 1)) };
}
