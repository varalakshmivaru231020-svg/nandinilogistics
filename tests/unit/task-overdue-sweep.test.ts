import { describe, expect, it } from "vitest";

import { alertsDue, type SweepTask } from "@/lib/tasks/overdue-sweep";

const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const DAY = 86_400_000;

function task(over: Partial<SweepTask> = {}): SweepTask {
  return {
    id: "t1", taskNo: "TSK0001", title: "Collect KYC", status: "IN_PROGRESS",
    dueAt: new Date(NOW + 2 * DAY).toISOString(),
    assigneeIds: ["tl-1"], createdById: "admin", lastAlertAt: null,
    ...over,
  };
}

describe("which tasks get an alert", () => {
  it("says nothing about one due in two days", () => {
    expect(alertsDue([task()], NOW)).toEqual([]);
  });

  it("reminds about one due within the day", () => {
    const due = alertsDue([task({ dueAt: new Date(NOW + 6 * 3_600_000).toISOString() })], NOW);
    expect(due.map((a) => a.kind)).toEqual(["DUE_SOON"]);
  });

  it("alerts once the due time has passed", () => {
    const due = alertsDue([task({ dueAt: new Date(NOW - 1000).toISOString() })], NOW);
    expect(due[0].kind).toBe("OVERDUE");
    expect(due[0].daysOverdue).toBe(0);
  });

  it("counts the days it has been overdue", () => {
    const due = alertsDue([task({ dueAt: new Date(NOW - 3 * DAY).toISOString() })], NOW);
    expect(due[0].daysOverdue).toBe(3);
  });

  it("keeps quiet about a task already alerted today", () => {
    const t = task({
      dueAt: new Date(NOW - 3 * DAY).toISOString(),
      lastAlertAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    });
    expect(alertsDue([t], NOW)).toEqual([]);
  });

  it("alerts again the next day", () => {
    const t = task({
      dueAt: new Date(NOW - 3 * DAY).toISOString(),
      lastAlertAt: new Date(NOW - 25 * 3_600_000).toISOString(),
    });
    expect(alertsDue([t], NOW)).toHaveLength(1);
  });

  it("says nothing about work that is already done", () => {
    const t = task({ status: "DONE", dueAt: new Date(NOW - 3 * DAY).toISOString() });
    expect(alertsDue([t], NOW)).toEqual([]);
  });

  it("chases an open task as well as one in progress", () => {
    const t = task({ status: "OPEN", dueAt: new Date(NOW - DAY).toISOString() });
    expect(alertsDue([t], NOW)).toHaveLength(1);
  });

  it("honours a reminder window Admin has widened", () => {
    const t = task({ dueAt: new Date(NOW + 40 * 3_600_000).toISOString() });
    expect(alertsDue([t], NOW)).toEqual([]);
    expect(alertsDue([t], NOW, { soonHours: 48 })).toHaveLength(1);
  });
});
