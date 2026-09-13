import { describe, expect, it } from "vitest";

import {
  cascade, criticalPath, DAY_MS, findCycle, wouldCreateCycle,
  type EngineActivity, type EngineLink,
} from "@/lib/schedule/engine";

/** An activity planned from day `from` for `days`, not started. */
const act = (id: string, from: number, days: number, extra: Partial<EngineActivity> = {}): EngineActivity => ({
  id, start: from * DAY_MS, end: (from + days) * DAY_MS, actualStart: null, actualEnd: null, ...extra,
});
const link = (predecessorId: string, successorId: string, type: EngineLink["type"] = "FS", lagDays = 0): EngineLink =>
  ({ predecessorId, successorId, type, lagDays });
const day = (ms: number) => ms / DAY_MS;

describe("cycle detection", () => {
  it("finds no cycle in a straight chain", () => {
    expect(findCycle(["a", "b", "c"], [link("a", "b"), link("b", "c")])).toBeNull();
  });

  it("reports the loop itself", () => {
    const loop = findCycle(["a", "b", "c"], [link("a", "b"), link("b", "c"), link("c", "a")]);
    expect(loop).not.toBeNull();
    expect(new Set(loop)).toEqual(new Set(["a", "b", "c"]));
  });

  it("refuses a link from an activity to itself", () => {
    expect(wouldCreateCycle(["a"], [], link("a", "a"))).toBe(true);
  });

  it("refuses the link that would close a loop, before it is saved", () => {
    expect(wouldCreateCycle(["a", "b"], [link("a", "b")], link("b", "a"))).toBe(true);
    expect(wouldCreateCycle(["a", "b", "c"], [link("a", "b")], link("b", "c"))).toBe(false);
  });

  it("survives a chain long enough to overflow a recursive search", () => {
    const ids = Array.from({ length: 20_000 }, (_, i) => `n${i}`);
    const chain = ids.slice(1).map((id, i) => link(ids[i], id));
    expect(findCycle(ids, chain)).toBeNull();
  });
});

describe("cascade — a slip drags its successors", () => {
  it("pushes a finish-to-start successor when its predecessor slips", () => {
    // A was 0–5, now 0–8. B was planned to start day 5.
    const shifts = cascade([act("A", 0, 8), act("B", 5, 3)], [link("A", "B")]);
    expect(shifts).toHaveLength(1);
    expect(day(shifts[0].start)).toBe(8);
    expect(day(shifts[0].end)).toBe(11);
  });

  it("keeps the successor's duration — it moves, it does not shrink", () => {
    const [s] = cascade([act("A", 0, 10), act("B", 4, 6)], [link("A", "B")]);
    expect(day(s.end) - day(s.start)).toBe(6);
  });

  it("honours lag", () => {
    const [s] = cascade([act("A", 0, 5), act("B", 5, 2)], [link("A", "B", "FS", 3)]);
    expect(day(s.start)).toBe(8);
  });

  it("carries the slip through a chain", () => {
    const shifts = cascade(
      [act("A", 0, 7), act("B", 5, 2), act("C", 7, 4)],
      [link("A", "B"), link("B", "C")],
    );
    const byId = new Map(shifts.map((s) => [s.id, s]));
    expect(day(byId.get("B")!.start)).toBe(7);
    expect(day(byId.get("C")!.start)).toBe(9);
  });

  it("waits for the latest of several predecessors", () => {
    const [s] = cascade(
      [act("A", 0, 4), act("B", 0, 9), act("C", 4, 2)],
      [link("A", "C"), link("B", "C")],
    );
    expect(day(s.start)).toBe(9);
  });

  it("never pulls work earlier when a predecessor finishes early", () => {
    expect(cascade([act("A", 0, 2), act("B", 10, 3)], [link("A", "B")])).toEqual([]);
  });

  it("uses the actual finish once a predecessor is done late", () => {
    const shifts = cascade(
      [act("A", 0, 5, { actualStart: 0, actualEnd: 9 * DAY_MS }), act("B", 5, 2)],
      [link("A", "B")],
    );
    expect(day(shifts[0].start)).toBe(9);
  });

  it("leaves an activity alone once it has started — its variance is the point", () => {
    expect(
      cascade([act("A", 0, 9), act("B", 5, 2, { actualStart: 5 * DAY_MS })], [link("A", "B")]),
    ).toEqual([]);
  });

  describe("the other link types", () => {
    it("start-to-start: the successor may begin once the predecessor begins", () => {
      const [s] = cascade([act("A", 6, 10), act("B", 2, 3)], [link("A", "B", "SS")]);
      expect(day(s.start)).toBe(6);
    });

    it("finish-to-finish: the successor may not finish before the predecessor", () => {
      // A finishes day 12; B is 4 days long, so it must start by day 8.
      const [s] = cascade([act("A", 0, 12), act("B", 2, 4)], [link("A", "B", "FF")]);
      expect(day(s.end)).toBe(12);
      expect(day(s.start)).toBe(8);
    });

    it("start-to-finish: the successor may not finish before the predecessor starts", () => {
      const [s] = cascade([act("A", 10, 5), act("B", 0, 3)], [link("A", "B", "SF")]);
      expect(day(s.end)).toBe(10);
    });
  });

  it("refuses a schedule whose dependencies loop", () => {
    expect(() =>
      cascade([act("A", 0, 1), act("B", 1, 1)], [link("A", "B"), link("B", "A")]),
    ).toThrow(/loop/);
  });
});

describe("critical path", () => {
  // The textbook network:  A(3) → B(2) → D(1)
  //                        A(3) → C(4) → D(1)
  // Longest path A–C–D is 8 days; B has 2 days of float.
  const network = () => ({
    activities: [act("A", 0, 3), act("B", 3, 2), act("C", 3, 4), act("D", 7, 1)],
    links: [link("A", "B"), link("A", "C"), link("B", "D"), link("C", "D")],
  });

  it("marks the longest path critical", () => {
    const { activities, links } = network();
    const { critical } = criticalPath(activities, links);
    expect([...critical].sort()).toEqual(["A", "C", "D"]);
  });

  it("reports float on the activities that have it", () => {
    const { activities, links } = network();
    const { floatDays } = criticalPath(activities, links);
    expect(floatDays.get("B")).toBe(2);
    expect(floatDays.get("C")).toBe(0);
  });

  it("moves the critical path when a non-critical activity grows past it", () => {
    const { activities, links } = network();
    activities[1] = act("B", 3, 6); // B now outlasts C
    const { critical } = criticalPath(activities, links);
    expect(critical.has("B")).toBe(true);
    expect(critical.has("C")).toBe(false);
  });

  it("treats an activity with no links as critical only if it sets the finish", () => {
    const { critical } = criticalPath([act("A", 0, 10), act("B", 0, 2)], []);
    expect(critical.has("A")).toBe(true);
    expect(critical.has("B")).toBe(false);
  });

  it("accounts for lag on the path", () => {
    // A(2) —3d lag→ B(2): the lag is part of the critical duration.
    const { critical } = criticalPath(
      [act("A", 0, 2), act("B", 5, 2), act("C", 0, 6)],
      [link("A", "B", "FS", 3)],
    );
    expect(critical.has("A")).toBe(true);
    expect(critical.has("B")).toBe(true);
    expect(critical.has("C")).toBe(false);
  });
});
