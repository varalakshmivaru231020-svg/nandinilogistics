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

/** Where a punch was made, or nulls when the device would not say. */
export interface PunchWhere { lat: number | null; lng: number | null }

const absent = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Location is optional: the web's Check in works when the browser refuses to
 * share it, and the views then say "no location". Half a pair is refused.
 */
export function checkCoordinates(
  latitude: unknown,
  longitude: unknown,
): { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string } {
  if (absent(latitude) && absent(longitude)) return { ok: true, lat: null, lng: null };
  if (absent(latitude) || absent(longitude)) {
    return { ok: false, error: "Send both latitude and longitude, or neither." };
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
  where: PunchWhere,
): PunchPlan<{ status: "PRESENT"; punchInAt: Date; punchInLat: number | null; punchInLng: number | null }> {
  if (today?.punchInAt) return { ok: false, error: "You have already punched in today." };
  return { ok: true, data: { status: "PRESENT", punchInAt: at, punchInLat: where.lat, punchInLng: where.lng } };
}

export function hoursWorked(inAt: Date, outAt: Date): number {
  return Math.max(0, (outAt.getTime() - inAt.getTime()) / HOUR);
}

export function planPunchOut(
  today: DayRow | null,
  at: Date,
  where: PunchWhere,
): PunchPlan<{ status: string; punchOutAt: Date; punchOutLat: number | null; punchOutLng: number | null; hours: number }> {
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

/** "09:12" — a moment as the Indian clock reads it. */
export function istClock(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** A Google Maps link for a punch location, or null when there was none. */
export function mapsHref(lat: number | null, lng: number | null): string | null {
  return lat === null || lng === null ? null : `https://www.google.com/maps?q=${lat},${lng}`;
}

/** What the web's Check in button shows, computed once on the server. */
export interface CheckInCard {
  state: "NOT_PUNCHED" | "PUNCHED_IN" | "PUNCHED_OUT";
  /** "09:12", IST. */
  inAt: string | null;
  outAt: string | null;
}

export function checkInCard(today: DayRow | null): CheckInCard {
  return {
    state: punchState(today),
    inAt: today?.punchInAt ? istClock(today.punchInAt) : null,
    outAt: today?.punchOutAt ? istClock(today.punchOutAt) : null,
  };
}

/** A day that was punched in and never out — the views flag it. */
export function missingCheckOut(row: DayRow, today: Date): boolean {
  return Boolean(row.punchInAt && !row.punchOutAt && attendanceDay(row.punchInAt).getTime() < attendanceDay(today).getTime());
}
