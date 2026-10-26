import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_MAX_SPAN_DAYS, attendanceTotals, parseAttendanceRange, summarizeAttendance,
} from "@/lib/hr/attendance-report";
import { checkStatusChange } from "@/lib/hr/employee-status";
import { editableEmployee, maskIdentityChanges } from "@/lib/hr/employee-audit";

const EMP = (id: string, status = "ACTIVE") => ({
  id, code: `EMP-${id}`, name: `Person ${id}`, employmentType: "Contract", designation: null, status,
});

describe("attendance summary", () => {
  const range = { from: "2026-09-01", to: "2026-09-07" };

  it("counts present, half and absent days; half days count half towards payable", () => {
    const [row] = summarizeAttendance([EMP("a")], [
      { employeeId: "a", attendanceOn: "2026-09-02", status: "PRESENT", overtimeHours: 2 },
      { employeeId: "a", attendanceOn: "2026-09-03", status: "PRESENT", overtimeHours: 0 },
      { employeeId: "a", attendanceOn: "2026-09-04", status: "HALF_DAY", overtimeHours: 0.5 },
      { employeeId: "a", attendanceOn: "2026-09-05", status: "HALF_DAY", overtimeHours: 0 },
      { employeeId: "a", attendanceOn: "2026-09-06", status: "HALF_DAY", overtimeHours: 0 },
      { employeeId: "a", attendanceOn: "2026-09-06", status: "ABSENT", overtimeHours: 0 },
    ], range);
    expect(row).toMatchObject({ present: 2, half: 3, absent: 1, payable: 3.5, overtime: 2.5 });
  });

  it("gives absent entries no overtime, whatever was stored", () => {
    const [row] = summarizeAttendance([EMP("a")], [
      { employeeId: "a", attendanceOn: "2026-09-02", status: "ABSENT", overtimeHours: 4 },
    ], range);
    expect(row).toMatchObject({ absent: 1, overtime: 0, payable: 0 });
  });

  it("includes both ends of the range and nothing outside it", () => {
    const [row] = summarizeAttendance([EMP("a")], [
      { employeeId: "a", attendanceOn: "2026-08-31", status: "PRESENT", overtimeHours: 1 },
      { employeeId: "a", attendanceOn: "2026-09-01", status: "PRESENT", overtimeHours: 0 },
      { employeeId: "a", attendanceOn: "2026-09-07", status: "PRESENT", overtimeHours: 0 },
      { employeeId: "a", attendanceOn: "2026-09-08", status: "PRESENT", overtimeHours: 1 },
    ], range);
    expect(row).toMatchObject({ present: 2, overtime: 0 });
  });

  it("keeps the employee order, zero-fills people with no entries, and totals", () => {
    const rows = summarizeAttendance([EMP("b"), EMP("a", "INACTIVE")], [
      { employeeId: "a", attendanceOn: "2026-09-03", status: "PRESENT", overtimeHours: 1.25 },
      { employeeId: "zz", attendanceOn: "2026-09-03", status: "PRESENT", overtimeHours: 9 },
    ], range);
    expect(rows.map((r) => [r.id, r.status, r.present])).toEqual([["b", "ACTIVE", 0], ["a", "INACTIVE", 1]]);
    expect(attendanceTotals(rows)).toEqual({ present: 1, half: 0, absent: 0, payable: 1, overtime: 1.25 });
  });
});

describe("attendance range", () => {
  const today = "2026-09-14";

  it("defaults to the last seven days ending today", () => {
    expect(parseAttendanceRange({}, today)).toEqual({ ok: true, from: "2026-09-08", to: today, days: 7 });
    expect(parseAttendanceRange({ from: "", to: "2026-03-01" }, today))
      .toEqual({ ok: true, from: "2026-02-23", to: "2026-03-01", days: 7 });
  });

  it("accepts a single day and an exactly maximum span", () => {
    expect(parseAttendanceRange({ from: "2026-09-01", to: "2026-09-01" }, today)).toMatchObject({ ok: true, days: 1 });
    // 1 Jul – 30 Sep is 92 days inclusive.
    expect(parseAttendanceRange({ from: "2026-07-01", to: "2026-09-30" }, today))
      .toMatchObject({ ok: true, days: ATTENDANCE_MAX_SPAN_DAYS });
  });

  it("refuses a span longer than the maximum", () => {
    const r = parseAttendanceRange({ from: "2026-06-30", to: "2026-09-30" }, today);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at most 92/);
  });

  it("refuses a backwards range", () => {
    const r = parseAttendanceRange({ from: "2026-09-10", to: "2026-09-01" }, today);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/on or before/);
  });

  it("refuses malformed and impossible dates", () => {
    for (const bad of ["2026-9-1", "01-09-2026", "2026-02-31", "x' OR 1", "2026-09-01T00:00"]) {
      expect(parseAttendanceRange({ from: bad, to: "2026-09-07" }, today).ok).toBe(false);
      expect(parseAttendanceRange({ from: "2026-09-01", to: bad }, today).ok).toBe(false);
    }
  });
});

describe("employee status change", () => {
  it("requires a reason to deactivate but not to activate", () => {
    expect(checkStatusChange("ACTIVE", "INACTIVE", "  ")).toEqual({ ok: false, error: expect.stringMatching(/reason/) });
    expect(checkStatusChange("ACTIVE", "INACTIVE", " Left site ")).toEqual({ ok: true, next: "INACTIVE", reason: "Left site" });
    expect(checkStatusChange("INACTIVE", "ACTIVE", "")).toEqual({ ok: true, next: "ACTIVE", reason: null });
  });

  it("refuses unknown statuses and no-op moves", () => {
    expect(checkStatusChange("ACTIVE", "SUSPENDED", "why").ok).toBe(false);
    expect(checkStatusChange("ACTIVE", "ACTIVE", "").ok).toBe(false);
    expect(checkStatusChange("INACTIVE", "INACTIVE", "again").ok).toBe(false);
  });
});

describe("employee edit audit", () => {
  it("masks Aadhaar and PAN to their last four, leaving other fields as they are", () => {
    const changes = maskIdentityChanges({
      aadhaar: { from: "482177349012", to: "482177345555" },
      pan: { from: null, to: "ABCDE1234F" },
      name: { from: "Ram", to: "Ramesh" },
    });
    expect(changes).toEqual({
      aadhaar: { from: "•••••••• 9012", to: "•••••••• 5555" },
      pan: { from: null, to: "•••••• 234F" },
      name: { from: "Ram", to: "Ramesh" },
    });
    expect(maskIdentityChanges(null)).toBeNull();
  });

  it("compares only the fields the form edits", () => {
    const row = {
      id: "x", status: "ACTIVE", createdAt: new Date(), name: "A", mobile: "1", aadhaar: "1", pan: null,
      address: null, altContact: null, employmentTypeId: "t", designationId: null,
    };
    expect(Object.keys(editableEmployee(row)).sort()).toEqual(
      [
        "aadhaar", "address", "altContact", "bankAccountNo", "bankHolderName", "bankIfsc", "bankName",
        "companyIds", "designationId", "drivingLicence", "emergencyMobileFamily", "emergencyMobileFriend",
        "employmentTypeId", "insuranceNumber", "joinedOn", "mobile", "monthlySalary", "name", "pan", "pfNumber",
      ],
    );
  });
});
