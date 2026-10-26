import { describe, expect, it } from "vitest";

import { employeeFigures, followUpFigures, leadFigures, pct } from "@/lib/metrics/figures";

/** The value shown under a label, so a test reads like the strip does. */
const read = (figures: Array<{ label: string; value: string }>, label: string) =>
  figures.find((f) => f.label === label)?.value;
const toneOf = (figures: Array<{ label: string; tone?: string }>, label: string) =>
  figures.find((f) => f.label === label)?.tone;

const NOW = Date.parse("2026-10-06T10:00:00.000Z");
const DAY = 86_400_000;

describe("pct", () => {
  it("rounds to whole percent", () => {
    expect(pct(1, 3)).toBe("33%");
  });

  it("says nothing rather than zero when there is nothing to divide", () => {
    expect(pct(0, 0)).toBe("—");
  });
});

describe("leads", () => {
  const rows = [
    { stageKind: "NEW", createdAt: new Date(NOW - 2 * DAY) },
    { stageKind: "OPEN", createdAt: new Date(NOW - 20 * DAY) },
    { stageKind: "ONBOARDING", createdAt: new Date(NOW - 30 * DAY) },
    { stageKind: "LOST", createdAt: new Date(NOW - 40 * DAY) },
  ];

  it("counts the pipeline, what onboarded and what was lost", () => {
    const f = leadFigures(rows, NOW);
    expect(read(f, "Leads")).toBe("4");
    expect(read(f, "In the pipeline")).toBe("2");
    expect(read(f, "Onboarding")).toBe("1");
    expect(read(f, "Lost")).toBe("1");
  });

  it("calls a lead new only within the last seven days", () => {
    expect(read(leadFigures(rows, NOW), "New this week")).toBe("1");
    expect(toneOf(leadFigures(rows, NOW), "New this week")).toBe("brand");
  });

  it("measures conversion over the leads that have been decided", () => {
    expect(read(leadFigures(rows, NOW), "Conversion")).toBe("50%");
  });
});

describe("follow-ups", () => {
  const endOfToday = NOW + 10 * 3_600_000;
  const open = [
    { dueAt: new Date(NOW - DAY) },
    { dueAt: new Date(NOW + 3_600_000) },
    { dueAt: new Date(NOW + 3 * DAY) },
  ];

  it("separates overdue from due today", () => {
    const f = followUpFigures(open, 4, NOW, endOfToday);
    expect(read(f, "Open follow-ups")).toBe("3");
    expect(read(f, "Overdue")).toBe("1");
    expect(toneOf(f, "Overdue")).toBe("bad");
    expect(read(f, "Due today")).toBe("1");
  });

  it("reads the share already followed up", () => {
    expect(read(followUpFigures(open, 4, NOW, endOfToday), "Followed up")).toBe("57%");
  });
});

describe("riders and staff", () => {
  const rows = [
    { status: "ACTIVE", attendance: [{ status: "PRESENT", overtimeHours: 1.5 }] },
    { status: "ACTIVE", attendance: [{ status: "HALF_DAY", overtimeHours: 0 }] },
    { status: "ACTIVE", attendance: [{ status: "ABSENT", overtimeHours: 0 }] },
    { status: "INACTIVE", attendance: [] },
  ];

  it("counts who is on record and who is active", () => {
    const f = employeeFigures(rows);
    expect(read(f, "On record")).toBe("4");
    expect(read(f, "Active")).toBe("3");
  });

  it("reads the day's marks, with a half day counted as present", () => {
    const f = employeeFigures(rows);
    expect(read(f, "Marked present today")).toBe("2");
    expect(read(f, "Absent today")).toBe("1");
    expect(read(f, "Not marked today")).toBe("1");
    expect(read(f, "Overtime today")).toBe("1.5 h");
  });
});
