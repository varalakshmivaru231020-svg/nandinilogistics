import { describe, expect, it } from "vitest";

import {
  checklistStage, earliestWaitingLevel, isWaitingOn, itemsFor, levelOrder,
  passedCount, roundAfter, waitingLevel, type FlowItem, type FlowLevel, type FlowVerdict,
} from "@/lib/tasks/checklist-flow";

const R1: FlowLevel = { kind: "REVIEW", level: 1, userId: "rev1" };
const R2: FlowLevel = { kind: "REVIEW", level: 2, userId: "rev2" };
const A1: FlowLevel = { kind: "APPROVAL", level: 1, userId: "app1" };
const A2: FlowLevel = { kind: "APPROVAL", level: 2, userId: "app2" };
const LEVELS = [A2, R2, A1, R1];

const pass = (l: FlowLevel, round = 1): FlowVerdict =>
  ({ kind: l.kind, level: l.level, round, verdict: "PASS" });
const fail = (l: FlowLevel, round = 1): FlowVerdict =>
  ({ kind: l.kind, level: l.level, round, verdict: "FAIL" });
const item = (id: string, round: number, verdicts: FlowVerdict[]): FlowItem => ({ id, round, verdicts });

describe("levelOrder", () => {
  it("puts every reviewer before every approver, each by number", () => {
    expect(levelOrder(LEVELS).map((l) => `${l.kind}${l.level}`))
      .toEqual(["REVIEW1", "REVIEW2", "APPROVAL1", "APPROVAL2"]);
  });
});

describe("where a point is waiting", () => {
  it("starts at the first reviewer", () => {
    expect(waitingLevel(item("a", 1, []), LEVELS)).toEqual(R1);
  });

  it("moves to the next reviewer once the first passes it", () => {
    expect(waitingLevel(item("a", 1, [pass(R1)]), LEVELS)).toEqual(R2);
  });

  it("reaches the approvers only after every reviewer has passed it", () => {
    expect(waitingLevel(item("a", 1, [pass(R1), pass(R2)]), LEVELS)).toEqual(A1);
  });

  it("is waiting on nobody once every level has passed it", () => {
    const done = item("a", 1, [pass(R1), pass(R2), pass(A1), pass(A2)]);
    expect(waitingLevel(done, LEVELS)).toBeNull();
  });

  /*
   * The point of the whole module: a denial sends one point back, not the task.
   */
  it("goes back to the first reviewer when an approver denies it", () => {
    const denied = item("a", 2, [pass(R1), pass(R2), fail(A1)]);
    expect(waitingLevel(denied, LEVELS)).toEqual(R1);
  });

  it("does not count a pass from an earlier round", () => {
    const again = item("a", 2, [pass(R1, 1), pass(R2, 1)]);
    expect(waitingLevel(again, LEVELS)).toEqual(R1);
  });

  it("walks the chain again on the new round", () => {
    const again = item("a", 2, [pass(R1, 1), pass(R2, 1), fail(A1, 1), pass(R1, 2)]);
    expect(waitingLevel(again, LEVELS)).toEqual(R2);
  });

  it("is waiting on nobody when there are no levels at all", () => {
    expect(waitingLevel(item("a", 1, []), [])).toBeNull();
  });
});

describe("roundAfter", () => {
  it("leaves a passed point on its round", () => {
    expect(roundAfter(item("a", 3, []), "PASS")).toBe(3);
  });

  it("starts the next round on a denial", () => {
    expect(roundAfter(item("a", 3, []), "FAIL")).toBe(4);
  });
});

describe("what one person can judge", () => {
  const items = [
    item("fresh", 1, []),                                  // with reviewer 1
    item("seen", 1, [pass(R1)]),                           // with reviewer 2
    item("late", 1, [pass(R1), pass(R2)]),                 // with approver 1
    item("done", 1, [pass(R1), pass(R2), pass(A1), pass(A2)]),
  ];

  it("gives each level only the points standing in front of it", () => {
    expect(itemsFor("rev1", items, LEVELS).map((i) => i.id)).toEqual(["fresh"]);
    expect(itemsFor("rev2", items, LEVELS).map((i) => i.id)).toEqual(["seen"]);
    expect(itemsFor("app1", items, LEVELS).map((i) => i.id)).toEqual(["late"]);
    expect(itemsFor("app2", items, LEVELS)).toEqual([]);
  });

  it("gives somebody who sits on no level nothing", () => {
    expect(itemsFor("nobody", items, LEVELS)).toEqual([]);
  });

  /*
   * Points move independently, so two levels can be working at the same time.
   * That is the behaviour the old whole-task round made impossible.
   */
  it("lets an approver work on one point while another is back with review", () => {
    const mixed = [
      item("back", 2, [pass(R1, 1), pass(R2, 1), fail(A1, 1)]),
      item("on", 1, [pass(R1), pass(R2)]),
    ];
    expect(itemsFor("rev1", mixed, LEVELS).map((i) => i.id)).toEqual(["back"]);
    expect(itemsFor("app1", mixed, LEVELS).map((i) => i.id)).toEqual(["on"]);
  });

  it("answers the same question for one level directly", () => {
    expect(isWaitingOn(item("a", 1, []), LEVELS, R1)).toBe(true);
    expect(isWaitingOn(item("a", 1, []), LEVELS, R2)).toBe(false);
  });
});

describe("where the task stands", () => {
  const through = [pass(R1), pass(R2), pass(A1), pass(A2)];

  it("is approved once every point is through every level", () => {
    expect(checklistStage([item("a", 1, through), item("b", 1, through)], LEVELS)).toBe("APPROVED");
  });

  it("is under review while any point is with a reviewer", () => {
    expect(checklistStage([item("a", 1, []), item("b", 1, through)], LEVELS)).toBe("UNDER_REVIEW");
  });

  it("is under approval once every point has cleared review", () => {
    const atApproval = item("a", 1, [pass(R1), pass(R2)]);
    expect(checklistStage([atApproval, item("b", 1, through)], LEVELS)).toBe("UNDER_APPROVAL");
  });

  /*
   * One point sent back outranks the rest: the task is under review again, even
   * though its other points are sitting with an approver.
   */
  it("is under review again when a single point is sent back", () => {
    const back = item("a", 2, [pass(R1, 1), pass(R2, 1), fail(A1, 1)]);
    const on = item("b", 1, [pass(R1), pass(R2)]);
    expect(checklistStage([back, on], LEVELS)).toBe("UNDER_REVIEW");
  });

  it("is approved straight away when nobody was named to judge it", () => {
    expect(checklistStage([item("a", 1, [])], [])).toBe("APPROVED");
  });

  it("is approved when the checklist has no points", () => {
    expect(checklistStage([], LEVELS)).toBe("APPROVED");
  });

  it("names the earliest level still holding something", () => {
    const back = item("a", 2, [fail(A1, 1)]);
    const on = item("b", 1, [pass(R1), pass(R2)]);
    expect(earliestWaitingLevel([on, back], LEVELS)).toEqual(R1);
  });

  it("names nobody once everything is through", () => {
    expect(earliestWaitingLevel([item("a", 1, through)], LEVELS)).toBeNull();
  });

  it("counts the points that are through", () => {
    expect(passedCount([item("a", 1, through), item("b", 1, [])], LEVELS)).toBe(1);
  });
});
