import { describe, expect, it } from "vitest";

import {
  clashesWith, countsByKind, dayKey, dayTally, daysTouched, endFromDuration,
  filterKinds, groupByDay, isOverdue, monthGrid, overlaps, sortAgenda,
  spanProblem, startOfDay, weekGrid, type AgendaItem,
} from "@/lib/calendar/agenda";

/** A local instant, so the tests mean the same thing wherever they run. */
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  id: "i1",
  kind: "EVENT",
  title: "Site review",
  subtitle: null,
  at: at(2026, 10, 9, 10, 0),
  endAt: at(2026, 10, 9, 11, 0),
  allDay: false,
  href: "/calendar",
  tone: "brand",
  ...over,
});

describe("which day a thing lands on", () => {
  it("reads the day from local parts, not from the UTC string", () => {
    // 09 Oct 23:30 local is the 10th in UTC east of Greenwich, and the 9th here.
    expect(dayKey(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
  });

  it("starts the day at midnight", () => {
    const d = startOfDay(new Date(2026, 9, 9, 17, 45));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(dayKey(d)).toBe("2026-10-09");
  });

  it("puts a same-day item on one square", () => {
    expect(daysTouched(item())).toEqual(["2026-10-09"]);
  });

  it("puts a span on every square it crosses", () => {
    const span = item({ at: at(2026, 10, 9, 9), endAt: at(2026, 10, 12, 17) });
    expect(daysTouched(span)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  });

  it("treats an item with no end as a single day", () => {
    expect(daysTouched(item({ endAt: null }))).toEqual(["2026-10-09"]);
  });

  it("does not run away when an end is before its start", () => {
    const backwards = item({ at: at(2026, 10, 9), endAt: at(2026, 10, 1) });
    expect(daysTouched(backwards)).toEqual(["2026-10-09"]);
  });

  it("caps a span so one bad row cannot hang the grid", () => {
    const huge = item({ at: at(2026, 1, 1), endAt: at(2030, 1, 1) });
    expect(daysTouched(huge, 10)).toHaveLength(10);
  });
});

describe("the grid", () => {
  it("always draws six weeks, so the month view never changes height", () => {
    for (const m of [0, 1, 5, 11]) expect(monthGrid(2026, m)).toHaveLength(42);
  });

  it("starts the week on Monday", () => {
    // 1 Oct 2026 is a Thursday, so the grid opens on Monday 28 Sep.
    expect(monthGrid(2026, 9)[0]).toBe("2026-09-28");
  });

  it("covers the whole month", () => {
    const grid = monthGrid(2026, 9);
    expect(grid).toContain("2026-10-01");
    expect(grid).toContain("2026-10-31");
  });

  it("handles a month that begins on a Monday without a blank week", () => {
    // 1 Jun 2026 is a Monday.
    expect(monthGrid(2026, 5)[0]).toBe("2026-06-01");
  });

  it("gives a week of seven days, Monday to Sunday", () => {
    const week = weekGrid(new Date(2026, 9, 9)); // a Friday
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-10-05");
    expect(week[6]).toBe("2026-10-11");
  });
});

describe("arranging a day", () => {
  it("puts whole-day items above timed ones", () => {
    const timed = item({ id: "a", at: at(2026, 10, 9, 9) });
    const whole = item({ id: "b", allDay: true, at: at(2026, 10, 9, 0) });
    expect(sortAgenda([timed, whole]).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("orders timed items by when they start", () => {
    const late = item({ id: "late", at: at(2026, 10, 9, 16) });
    const early = item({ id: "early", at: at(2026, 10, 9, 8) });
    expect(sortAgenda([late, early]).map((i) => i.id)).toEqual(["early", "late"]);
  });

  it("breaks a tie on title, so the order never wobbles", () => {
    const b = item({ id: "b", title: "Beta", at: at(2026, 10, 9, 9) });
    const a = item({ id: "a", title: "Alpha", at: at(2026, 10, 9, 9) });
    expect(sortAgenda([b, a]).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("files a span under every day it touches", () => {
    const span = item({ at: at(2026, 10, 9, 9), endAt: at(2026, 10, 10, 17) });
    const byDay = groupByDay([span]);
    expect(byDay.get("2026-10-09")).toHaveLength(1);
    expect(byDay.get("2026-10-10")).toHaveLength(1);
  });

  it("counts each kind for the filter chips", () => {
    const counts = countsByKind([
      item({ kind: "TASK" }), item({ kind: "TASK" }), item({ kind: "APPROVAL" }),
    ]);
    expect(counts.TASK).toBe(2);
    expect(counts.APPROVAL).toBe(1);
    expect(counts.EVENT).toBe(0);
  });

  it("shows everything when no kind is chosen", () => {
    const all = [item({ kind: "TASK" }), item({ kind: "EVENT" })];
    expect(filterKinds(all, [])).toHaveLength(2);
    expect(filterKinds(all, ["TASK"])).toHaveLength(1);
  });
});

describe("what counts as overdue", () => {
  const now = new Date(2026, 9, 9, 12, 0).getTime();

  it("is true for a task whose moment has passed", () => {
    expect(isOverdue(item({ kind: "TASK", at: at(2026, 10, 8), endAt: null }), now)).toBe(true);
  });

  /*
   * A meeting that has finished is not overdue — it happened. Only the things
   * that wait on somebody can be late.
   */
  it("is false for a calendar entry that has simply happened", () => {
    expect(isOverdue(item({ kind: "EVENT", at: at(2026, 10, 8), endAt: null }), now)).toBe(false);
  });

  it("is true for an invitation nobody answered", () => {
    const invite = item({ kind: "INVITE", at: at(2026, 10, 8), endAt: null, needsResponse: true });
    expect(isOverdue(invite, now)).toBe(true);
  });

  it("measures a span from its end, not its start", () => {
    const running = item({ kind: "TASK", at: at(2026, 10, 8), endAt: at(2026, 10, 10) });
    expect(isOverdue(running, now)).toBe(false);
  });

  /*
   * Something finished is never late, whatever its date says. Without this a
   * task marked done last week keeps sitting in the overdue count forever.
   */
  it("is false for anything already done", () => {
    const late = item({ kind: "TASK", at: at(2026, 10, 1), endAt: null });
    expect(isOverdue(late, now)).toBe(true);
    expect(isOverdue({ ...late, done: true }, now)).toBe(false);
  });

  it("keeps a finished item out of the day's overdue tally", () => {
    const tally = dayTally([
      item({ kind: "TASK", at: at(2026, 10, 8), endAt: null }),
      item({ kind: "TASK", at: at(2026, 10, 8), endAt: null, done: true }),
    ], now);
    expect(tally).toEqual({ total: 2, overdue: 1, needsResponse: 0 });
  });

  it("tallies a day into total, overdue and waiting on a reply", () => {
    const tally = dayTally([
      item({ kind: "TASK", at: at(2026, 10, 8), endAt: null }),
      item({ kind: "INVITE", at: at(2026, 10, 10), endAt: null, needsResponse: true }),
      item({ kind: "EVENT" }),
    ], now);
    expect(tally).toEqual({ total: 3, overdue: 1, needsResponse: 1 });
  });
});

describe("the span of a calendar task", () => {
  it("works the end out from a duration", () => {
    const end = endFromDuration(new Date(2026, 9, 9, 10, 0), 90);
    expect(end.getHours()).toBe(11);
    expect(end.getMinutes()).toBe(30);
  });

  it("refuses an end that is not after the start", () => {
    expect(spanProblem(at(2026, 10, 9, 11), at(2026, 10, 9, 10))).toBe("It has to end after it starts.");
    expect(spanProblem(at(2026, 10, 9, 10), at(2026, 10, 9, 10))).toBe("It has to end after it starts.");
  });

  it("refuses a span longer than a year", () => {
    expect(spanProblem(at(2026, 1, 1), at(2028, 1, 1)))
      .toBe("A calendar task cannot run longer than a year.");
  });

  it("accepts an ordinary span", () => {
    expect(spanProblem(at(2026, 10, 9, 10), at(2026, 10, 9, 11))).toBeNull();
  });

  it("says so when a date cannot be read", () => {
    expect(spanProblem("not a date", at(2026, 10, 9))).toBe("Those dates could not be read.");
  });
});

describe("double booking", () => {
  const ten = { at: at(2026, 10, 9, 10), endAt: at(2026, 10, 9, 11) };

  it("sees an overlap", () => {
    expect(overlaps(ten, { at: at(2026, 10, 9, 10, 30), endAt: at(2026, 10, 9, 11, 30) })).toBe(true);
  });

  /* Back to back is normal and not worth warning anybody about. */
  it("does not call touching ends an overlap", () => {
    expect(overlaps(ten, { at: at(2026, 10, 9, 11), endAt: at(2026, 10, 9, 12) })).toBe(false);
  });

  it("sees an event wholly inside another", () => {
    expect(overlaps(ten, { at: at(2026, 10, 9, 10, 15), endAt: at(2026, 10, 9, 10, 45) })).toBe(true);
  });

  it("lists what a new span runs into, ignoring whole-day items", () => {
    const existing = [
      item({ id: "clash", at: at(2026, 10, 9, 10, 30), endAt: at(2026, 10, 9, 11, 30) }),
      item({ id: "allday", allDay: true, at: at(2026, 10, 9, 0), endAt: at(2026, 10, 9, 23) }),
      item({ id: "later", at: at(2026, 10, 9, 15), endAt: at(2026, 10, 9, 16) }),
    ];
    expect(clashesWith(ten, existing).map((i) => i.id)).toEqual(["clash"]);
  });
});
