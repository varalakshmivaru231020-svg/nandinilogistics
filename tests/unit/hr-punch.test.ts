import { describe, expect, it } from "vitest";

import {
  attendanceDay, checkCoordinates, monthRange, planPunchIn, planPunchOut, punchState,
} from "@/lib/hr/punch";
import { profileEditChanges } from "@/lib/hr/profile-edit";

const at = (iso: string) => new Date(iso);
const here = { lat: 12.97, lng: 77.59 };

describe("punch in / out", () => {
  it("files a punch under the Indian calendar day", () => {
    // 20:00 UTC on the 1st is 01:30 IST on the 2nd.
    expect(attendanceDay(at("2026-10-01T20:00:00Z")).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(attendanceDay(at("2026-10-01T10:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("checks the coordinates", () => {
    expect(checkCoordinates(12.9716, 77.5946)).toEqual({ ok: true, lat: 12.9716, lng: 77.5946 });
    expect(checkCoordinates(91, 0).ok).toBe(false);
    expect(checkCoordinates(0, -181).ok).toBe(false);
    expect(checkCoordinates(Number.NaN, 0).ok).toBe(false);
    expect(checkCoordinates(undefined, 0).ok).toBe(false);
  });

  it("punches in once a day, over a row a Team Leader may have marked", () => {
    const first = planPunchIn(null, at("2026-10-01T03:30:00Z"), here);
    expect(first.ok && first.data.status).toBe("PRESENT");
    const marked = planPunchIn({ status: "ABSENT", punchInAt: null, punchOutAt: null }, at("2026-10-01T03:30:00Z"), here);
    expect(marked.ok).toBe(true);
    const again = planPunchIn({ status: "PRESENT", punchInAt: at("2026-10-01T03:30:00Z"), punchOutAt: null }, at("2026-10-01T04:00:00Z"), here);
    expect(again).toEqual({ ok: false, error: "You have already punched in today." });
  });

  it("needs a punch-in before a punch-out, and only one punch-out", () => {
    expect(planPunchOut(null, at("2026-10-01T10:00:00Z"), here)).toEqual({ ok: false, error: "Punch in first." });
    const done = { status: "PRESENT", punchInAt: at("2026-10-01T03:00:00Z"), punchOutAt: at("2026-10-01T12:00:00Z") };
    expect(planPunchOut(done, at("2026-10-01T13:00:00Z"), here).ok).toBe(false);
  });

  it("marks under four hours a half day, and four or more stays present", () => {
    const row = { status: "PRESENT", punchInAt: at("2026-10-01T03:00:00Z"), punchOutAt: null };
    const short = planPunchOut(row, at("2026-10-01T06:59:00Z"), here);
    expect(short.ok && short.data.status).toBe("HALF_DAY");
    const full = planPunchOut(row, at("2026-10-01T07:00:00Z"), here);
    expect(full.ok && full.data.status).toBe("PRESENT");
    expect(full.ok && full.data.hours).toBe(4);
  });

  it("says where today stands", () => {
    expect(punchState(null)).toBe("NOT_PUNCHED");
    expect(punchState({ status: "PRESENT", punchInAt: new Date(), punchOutAt: null })).toBe("PUNCHED_IN");
    expect(punchState({ status: "PRESENT", punchInAt: new Date(), punchOutAt: new Date() })).toBe("PUNCHED_OUT");
  });

  it("reads a month", () => {
    const r = monthRange("2026-12");
    expect(r?.from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("26-1")).toBeNull();
  });
});

describe("profile edit requests", () => {
  const current = { mobile: "9876543210", address: "Old address", bankIfsc: "HDFC0001234" };

  it("keeps only the editable fields that change, and leaves blanks alone", () => {
    const r = profileEditChanges({ mobile: "9876543210", address: "New address", bankName: "", aadhaar: "999", name: "X" }, current);
    expect(r).toEqual({ ok: true, changes: { address: "New address" } });
  });

  it("refuses a request that changes nothing, a short number or a bad IFSC", () => {
    expect(profileEditChanges({ mobile: "9876543210" }, current).ok).toBe(false);
    expect(profileEditChanges({ altContact: "12345" }, current).ok).toBe(false);
    expect(profileEditChanges({ bankIfsc: "hdfc1234" }, current).ok).toBe(false);
    expect(profileEditChanges({ bankIfsc: "sbin0001234" }, current)).toEqual({ ok: true, changes: { bankIfsc: "SBIN0001234" } });
  });
});
