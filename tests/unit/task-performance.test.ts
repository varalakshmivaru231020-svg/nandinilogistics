import { describe, expect, it } from "vitest";

import { effectiveDueAt, scoreTasks, timeAdded, type ScoredTask } from "@/lib/tasks/performance";

const DAY = 86_400_000;
const due = "2026-09-10T18:00:00.000Z";

function ext(control: "CONTROLLABLE" | "UNCONTROLLABLE" | null, days: number, from = due) {
  return {
    control,
    previousDueAt: from,
    revisedDueAt: new Date(new Date(from).getTime() + days * DAY).toISOString(),
  };
}

describe("the date performance is measured against", () => {
  it("is the original date when nothing was extended", () => {
    expect(effectiveDueAt(due, []).toISOString()).toBe(due);
  });

  it("moves for an uncontrollable delay", () => {
    expect(effectiveDueAt(due, [ext("UNCONTROLLABLE", 3)]).toISOString())
      .toBe("2026-09-13T18:00:00.000Z");
  });

  it("does not move for a controllable one, however long", () => {
    expect(effectiveDueAt(due, [ext("CONTROLLABLE", 30)]).toISOString()).toBe(due);
  });

  it("adds up several uncontrollable delays and ignores the controllable ones", () => {
    const e = effectiveDueAt(due, [
      ext("UNCONTROLLABLE", 2),
      ext("CONTROLLABLE", 5, "2026-09-12T18:00:00.000Z"),
      ext("UNCONTROLLABLE", 1, "2026-09-17T18:00:00.000Z"),
    ]);
    expect(e.toISOString()).toBe("2026-09-13T18:00:00.000Z");
  });

  it("ignores an extension that was never given a revised date", () => {
    expect(effectiveDueAt(due, [{ control: "UNCONTROLLABLE", previousDueAt: due, revisedDueAt: null }])
      .toISOString()).toBe(due);
  });

  it("gives no credit for pulling a date forward", () => {
    expect(timeAdded({ control: "UNCONTROLLABLE", previousDueAt: due, revisedDueAt: "2026-09-01T18:00:00.000Z" }))
      .toBe(0);
  });
});

describe("the scope document's worked example", () => {
  // Ten tasks in September: 6 done by the original date, 2 extended
  // uncontrollably and done by the revised date, 2 extended controllably and
  // done by the revised date. The document says 80%, and 60% without the rule.
  const onTimeTask: ScoredTask = {
    status: "CLOSED", completedAt: "2026-09-09T10:00:00.000Z", effectiveDueAt: due, extensions: [],
  };
  const uncontrollable: ScoredTask = {
    status: "CLOSED",
    completedAt: "2026-09-13T10:00:00.000Z",
    effectiveDueAt: effectiveDueAt(due, [ext("UNCONTROLLABLE", 4)]).toISOString(),
    extensions: [ext("UNCONTROLLABLE", 4)],
  };
  const controllable: ScoredTask = {
    status: "CLOSED",
    completedAt: "2026-09-13T10:00:00.000Z",
    effectiveDueAt: effectiveDueAt(due, [ext("CONTROLLABLE", 4)]).toISOString(),
    extensions: [ext("CONTROLLABLE", 4)],
  };

  const tasks = [
    ...Array(6).fill(onTimeTask),
    ...Array(2).fill(uncontrollable),
    ...Array(2).fill(controllable),
  ];

  it("scores 80%", () => {
    expect(scoreTasks(tasks, Date.parse("2026-10-01T00:00:00.000Z")).score).toBe(80);
  });

  it("counts 8 on time and 2 late", () => {
    const p = scoreTasks(tasks, Date.parse("2026-10-01T00:00:00.000Z"));
    expect(p.onTime).toBe(8);
    expect(p.late).toBe(2);
  });

  it("would have scored 60% if every extension moved the date", () => {
    const naive = tasks.map((t) => ({
      ...t,
      effectiveDueAt: effectiveDueAt(due, t.extensions.map((e: { previousDueAt: string; revisedDueAt: string | null }) => ({ ...e, control: "UNCONTROLLABLE" as const }))),
    }));
    expect(scoreTasks(naive, Date.parse("2026-10-01T00:00:00.000Z")).score).toBe(100);
    // …and with no extensions honoured at all, the six plain ones alone:
    const strict = tasks.map((t) => ({ ...t, effectiveDueAt: due }));
    expect(scoreTasks(strict, Date.parse("2026-10-01T00:00:00.000Z")).score).toBe(60);
  });

  it("counts the extensions by kind", () => {
    const p = scoreTasks(tasks, Date.parse("2026-10-01T00:00:00.000Z"));
    expect(p.uncontrollableExtensions).toBe(2);
    expect(p.controllableExtensions).toBe(2);
  });
});

describe("tasks that have not finished", () => {
  const now = Date.parse("2026-09-20T00:00:00.000Z");

  it("are reported as still overdue rather than scored late", () => {
    const p = scoreTasks([{ status: "STARTED", completedAt: null, effectiveDueAt: due, extensions: [] }], now);
    expect(p.stillOverdue).toBe(1);
    expect(p.late).toBe(0);
    expect(p.score).toBeNull();
  });

  it("are not counted at all when they are not yet due", () => {
    const p = scoreTasks(
      [{ status: "STARTED", completedAt: null, effectiveDueAt: "2026-09-30T18:00:00.000Z", extensions: [] }],
      now,
    );
    expect(p.stillOverdue).toBe(0);
    expect(p.total).toBe(1);
  });

  it("leave the score null when nothing has finished", () => {
    expect(scoreTasks([], now).score).toBeNull();
  });

  it("count a completed-but-not-closed task, since the work is done", () => {
    const p = scoreTasks(
      [{ status: "UNDER_REVIEW", completedAt: "2026-09-09T10:00:00.000Z", effectiveDueAt: due, extensions: [] }],
      now,
    );
    expect(p.onTime).toBe(1);
    expect(p.score).toBe(100);
  });
});

describe("average delay", () => {
  it("averages only the late ones, in days", () => {
    const p = scoreTasks([
      { status: "CLOSED", completedAt: "2026-09-12T18:00:00.000Z", effectiveDueAt: due, extensions: [] },
      { status: "CLOSED", completedAt: "2026-09-14T18:00:00.000Z", effectiveDueAt: due, extensions: [] },
      { status: "CLOSED", completedAt: "2026-09-01T18:00:00.000Z", effectiveDueAt: due, extensions: [] },
    ], Date.parse("2026-10-01T00:00:00.000Z"));
    expect(p.late).toBe(2);
    expect(p.averageDelayDays).toBe(3);
  });

  it("is zero when nothing was late", () => {
    expect(scoreTasks([], 0).averageDelayDays).toBe(0);
  });
});
