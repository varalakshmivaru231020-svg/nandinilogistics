import { describe, expect, it } from "vitest";

import { formatDuration, sessionMinutes, summarizeHours } from "@/lib/hr/attendance-hours";

describe("working hours from punches", () => {
  it("a normal nine-hour day", () => {
    expect(sessionMinutes("2026-11-04T03:45:00Z", "2026-11-04T13:00:00Z")).toBe(555);
    expect(formatDuration(555)).toBe("9h 15m");
  });
  it("a missing punch-out is incomplete, not hours and not an absence", () => {
    const s = summarizeHours([
      { date: "2026-11-03", status: "PRESENT", punchInAt: "2026-11-03T03:45:00Z", punchOutAt: null },
      { date: "2026-11-04", status: "PRESENT", punchInAt: "2026-11-04T03:45:00Z", punchOutAt: "2026-11-04T12:45:00Z" },
    ]);
    expect(s).toMatchObject({ workingDays: 2, present: 2, absent: 0, incomplete: 1, completedDays: 1, totalMinutes: 540, averageMinutes: 540 });
  });
  it("an overnight shift crosses midnight; a punch-out before punch-in counts nothing", () => {
    expect(sessionMinutes("2026-11-30T16:00:00Z", "2026-12-01T02:00:00Z")).toBe(600);
    expect(sessionMinutes("2026-11-04T10:00:00Z", "2026-11-04T09:00:00Z")).toBeNull();
  });
  it("marked days without punches count as days, not hours", () => {
    const s = summarizeHours([
      { date: "2026-11-01", status: "ABSENT", punchInAt: null, punchOutAt: null },
      { date: "2026-11-02", status: "HALF_DAY", punchInAt: null, punchOutAt: null },
    ]);
    expect(s).toMatchObject({ workingDays: 2, absent: 1, halfDay: 1, totalMinutes: 0, averageMinutes: null, incomplete: 0 });
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(120)).toBe("2h");
  });
});
