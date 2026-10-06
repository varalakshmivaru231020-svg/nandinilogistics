import { describe, expect, it } from "vitest";

import {
  canDo, isOverdue, rolesOf, statusAfterComplete, type TaskShape,
} from "@/lib/tasks/lifecycle";
import type { FlowItem } from "@/lib/tasks/checklist-flow";

const ASSIGNER = "u-assigner";
const ASSIGNEE = "u-assignee";
const R1 = "u-reviewer-1";
const R2 = "u-reviewer-2";
const A1 = "u-approver-1";
const ADMIN = "u-admin";

function task(over: Partial<TaskShape> = {}): TaskShape {
  return {
    kind: "STANDALONE",
    status: "PENDING",
    round: 1,
    assigneeId: ASSIGNEE,
    createdById: ASSIGNER,
    levels: [],
    items: [],
    ...over,
  };
}

/* A checklist point and the verdicts on it, in the shape the rules read. */
const point = (round: number, verdicts: FlowItem["verdicts"] = []): FlowItem =>
  ({ id: `p${round}-${verdicts.length}`, round, verdicts });
const passed = (kind: "REVIEW" | "APPROVAL", level: number, round = 1) =>
  ({ kind, level, round, verdict: "PASS" as const });

function checklistTask(over: Partial<TaskShape> = {}): TaskShape {
  return task({
    kind: "CHECKLIST",
    levels: [
      { kind: "REVIEW", level: 1, userId: R1 },
      { kind: "REVIEW", level: 2, userId: R2 },
      { kind: "APPROVAL", level: 1, userId: A1 },
    ],
    ...over,
  });
}

const as = (userId: string) => ({ userId, isAdmin: false });
const admin = { userId: ADMIN, isAdmin: true };

describe("who holds which role", () => {
  it("names the Assigner and the Assignee", () => {
    expect([...rolesOf(task(), as(ASSIGNER))]).toEqual(["ASSIGNER"]);
    expect([...rolesOf(task(), as(ASSIGNEE))]).toEqual(["ASSIGNEE"]);
  });

  it("lets one person be both, as a manager assigning to themselves", () => {
    const t = task({ assigneeId: ASSIGNER });
    expect(rolesOf(t, as(ASSIGNER))).toEqual(new Set(["ASSIGNER", "ASSIGNEE"]));
  });

  it("names reviewers and approvers from the levels", () => {
    expect(rolesOf(checklistTask(), as(R2))).toEqual(new Set(["REVIEWER"]));
    expect(rolesOf(checklistTask(), as(A1))).toEqual(new Set(["APPROVER"]));
  });

  it("gives a stranger no role at all", () => {
    expect(rolesOf(task(), as("someone-else")).size).toBe(0);
  });
});

describe("the Assignee's side of the lifecycle", () => {
  it("can accept a pending task, and has no way to reject it", () => {
    expect(canDo("accept", task(), as(ASSIGNEE))).toBe(true);
  });

  it("cannot start before accepting", () => {
    expect(canDo("start", task({ status: "PENDING" }), as(ASSIGNEE))).toBe(false);
    expect(canDo("start", task({ status: "ACCEPTED" }), as(ASSIGNEE))).toBe(true);
  });

  it("completes only from Started", () => {
    expect(canDo("complete", task({ status: "ACCEPTED" }), as(ASSIGNEE))).toBe(false);
    expect(canDo("complete", task({ status: "STARTED" }), as(ASSIGNEE))).toBe(true);
  });

  it("resumes a held task by starting it again", () => {
    expect(canDo("start", task({ status: "HOLD" }), as(ASSIGNEE))).toBe(true);
  });

  it("cannot close its own task", () => {
    expect(canDo("close", task({ status: "COMPLETED" }), as(ASSIGNEE))).toBe(false);
  });

  it("cannot decide its own extension", () => {
    expect(canDo("decideExtension", task({ status: "STARTED" }), as(ASSIGNEE))).toBe(false);
  });
});

describe("the Assigner's side", () => {
  it("edits only before work starts", () => {
    expect(canDo("edit", task({ status: "PENDING" }), as(ASSIGNER))).toBe(true);
    expect(canDo("edit", task({ status: "ACCEPTED" }), as(ASSIGNER))).toBe(true);
    expect(canDo("edit", task({ status: "STARTED" }), as(ASSIGNER))).toBe(false);
  });

  it("closes or sends back a completed standalone task", () => {
    const t = task({ status: "COMPLETED" });
    expect(canDo("close", t, as(ASSIGNER))).toBe(true);
    expect(canDo("sendBack", t, as(ASSIGNER))).toBe(true);
  });

  it("does not close a checklist task — the last Approver does", () => {
    expect(canDo("close", checklistTask({ status: "COMPLETED" }), as(ASSIGNER))).toBe(false);
  });

  it("decides extensions", () => {
    expect(canDo("decideExtension", task({ status: "STARTED" }), as(ASSIGNER))).toBe(true);
  });
});

describe("a point stands in front of one level at a time", () => {
  /* The checklist task's levels are Reviewer 1, Reviewer 2, then Approver 1. */

  it("puts a fresh point in front of Reviewer 1", () => {
    const t = checklistTask({ status: "UNDER_REVIEW", items: [point(1)] });
    expect(canDo("review", t, as(R1))).toBe(true);
    expect(canDo("review", t, as(R2))).toBe(false);
    expect(canDo("approve", t, as(A1))).toBe(false);
  });

  it("hands it to Reviewer 2 once Reviewer 1 has passed it", () => {
    const t = checklistTask({
      status: "UNDER_REVIEW",
      items: [point(1, [passed("REVIEW", 1)])],
    });
    expect(canDo("review", t, as(R2))).toBe(true);
    expect(canDo("review", t, as(R1))).toBe(false);
  });

  it("keeps the Approver out until every reviewer has passed it", () => {
    const t = checklistTask({
      status: "UNDER_REVIEW",
      items: [point(1, [passed("REVIEW", 1)])],
    });
    expect(canDo("approve", t, as(A1))).toBe(false);
  });

  it("lets the Approver act once the reviews are through", () => {
    const t = checklistTask({
      status: "UNDER_APPROVAL",
      items: [point(1, [passed("REVIEW", 1), passed("REVIEW", 2)])],
    });
    expect(canDo("approve", t, as(A1))).toBe(true);
  });

  /*
   * The behaviour the whole-task round made impossible: one point back with
   * review while another waits on approval, and both people can work.
   */
  it("lets a reviewer and an approver work at the same time on different points", () => {
    const t = checklistTask({
      status: "UNDER_REVIEW",
      items: [
        point(2),                                                   // denied, back at R1
        point(1, [passed("REVIEW", 1), passed("REVIEW", 2)]),       // with A1
      ],
    });
    expect(canDo("review", t, as(R1))).toBe(true);
    expect(canDo("approve", t, as(A1))).toBe(true);
  });

  it("gives nobody anything to judge before the task is started", () => {
    const t = checklistTask({ status: "ACCEPTED", items: [point(1)] });
    expect(canDo("review", t, as(R1))).toBe(false);
  });

  it("gives nobody anything to judge once every point is through", () => {
    const t = checklistTask({
      status: "APPROVED",
      items: [point(1, [passed("REVIEW", 1), passed("REVIEW", 2), passed("APPROVAL", 1)])],
    });
    expect(canDo("review", t, as(R1))).toBe(false);
    expect(canDo("approve", t, as(A1))).toBe(false);
  });
});

describe("where each decision sends the task", () => {
  it("sends a completed standalone task to its Assigner", () => {
    expect(statusAfterComplete(task())).toBe("COMPLETED");
  });

  it("closes a checklist task when it is completed, because the levels are already through", () => {
    expect(statusAfterComplete(checklistTask())).toBe("CLOSED");
  });

  it("lets the Assignee close a checklist task only once every point is approved", () => {
    expect(canDo("complete", checklistTask({ status: "APPROVED" }), as(ASSIGNEE))).toBe(true);
    expect(canDo("complete", checklistTask({ status: "UNDER_REVIEW" }), as(ASSIGNEE))).toBe(false);
    expect(canDo("complete", checklistTask({ status: "UNDER_APPROVAL" }), as(ASSIGNEE))).toBe(false);
  });

  /*
   * A standalone task has no levels and no points. Its Assigner can send it
   * back, and the Assignee completes it again — there is nothing to resubmit.
   */
  it("lets the Assignee complete a standalone task again after it is sent back", () => {
    expect(canDo("complete", task({ status: "REWORK" }), as(ASSIGNEE))).toBe(true);
  });
});

describe("a closed task", () => {
  const closed = task({ status: "CLOSED" });

  it("takes no action from anybody", () => {
    for (const action of ["edit", "complete", "comment", "close", "requestExtension"] as const) {
      expect(canDo(action, closed, as(ASSIGNER)), action).toBe(false);
      expect(canDo(action, closed, as(ASSIGNEE)), action).toBe(false);
    }
  });

  it("is reopened only by Admin", () => {
    expect(canDo("reopen", closed, admin)).toBe(true);
    expect(canDo("reopen", closed, as(ASSIGNER))).toBe(false);
  });

  it("cannot be reopened when it is not closed", () => {
    expect(canDo("reopen", task({ status: "STARTED" }), admin)).toBe(false);
  });
});

describe("Admin has full control", () => {
  it("can take the Assignee's actions", () => {
    expect(canDo("accept", task(), admin)).toBe(true);
    expect(canDo("complete", task({ status: "STARTED" }), admin)).toBe(true);
  });

  it("can take the Assigner's actions", () => {
    expect(canDo("close", task({ status: "COMPLETED" }), admin)).toBe(true);
  });

  it("can judge a point at whichever level is holding it", () => {
    const atReview = checklistTask({ status: "UNDER_REVIEW", items: [point(1)] });
    expect(canDo("review", atReview, admin)).toBe(true);

    const atApproval = checklistTask({
      status: "UNDER_APPROVAL",
      items: [point(1, [passed("REVIEW", 1), passed("REVIEW", 2)])],
    });
    expect(canDo("approve", atApproval, admin)).toBe(true);
  });

  it("has nothing to judge when no point is waiting", () => {
    expect(canDo("review", checklistTask({ status: "UNDER_REVIEW", items: [] }), admin)).toBe(false);
  });

  it("reassigns an Assignee or a level, and nobody else may", () => {
    expect(canDo("reassign", task(), admin)).toBe(true);
    expect(canDo("reassign", task(), as(ASSIGNER))).toBe(false);
  });

  it("is still bound by the task's own status", () => {
    expect(canDo("complete", task({ status: "PENDING" }), admin)).toBe(false);
  });
});

describe("commenting", () => {
  it("is open to everyone on the task until it closes", () => {
    const t = checklistTask({ status: "STARTED" });
    for (const u of [ASSIGNER, ASSIGNEE, R1, R2, A1]) {
      expect(canDo("comment", t, as(u)), u).toBe(true);
    }
  });

  it("is closed to someone with no part in the task", () => {
    expect(canDo("comment", task(), as("stranger"))).toBe(false);
  });
});

describe("overdue", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");

  it("is true once the date passes with the work not done", () => {
    expect(isOverdue({ status: "STARTED", dueAt: "2026-09-19T18:00:00.000Z" }, now)).toBe(true);
  });

  it("is false before the date", () => {
    expect(isOverdue({ status: "STARTED", dueAt: "2026-09-21T18:00:00.000Z" }, now)).toBe(false);
  });

  it("is false once the work is done, whatever the date", () => {
    for (const status of ["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL"]) {
      expect(isOverdue({ status: status as never, dueAt: "2026-09-01T18:00:00.000Z" }, now), status).toBe(false);
    }
  });

  it("is true for a task sent back for rework and now past its date", () => {
    expect(isOverdue({ status: "REWORK", dueAt: "2026-09-19T18:00:00.000Z" }, now)).toBe(true);
  });
});

describe("the run is one way: start, judge every point, then close", () => {
  const checklist = (status: TaskShape["status"], items: FlowItem[] = [point(1)]): TaskShape => ({
    kind: "CHECKLIST", status, round: 1,
    assigneeId: ASSIGNEE, createdById: ASSIGNER,
    levels: [
      { kind: "REVIEW", level: 1, userId: R1 },
      { kind: "REVIEW", level: 2, userId: R2 },
      { kind: "APPROVAL", level: 1, userId: A1 },
    ],
    items,
  });

  it("refuses Complete at every status until every level has signed off", () => {
    for (const status of ["UNDER_REVIEW", "REWORK", "UNDER_APPROVAL", "CLOSED"] as const) {
      expect(canDo("complete", checklist(status), as(ASSIGNEE)), status).toBe(false);
      expect(canDo("complete", checklist(status), admin), `${status} as admin`).toBe(false);
    }
  });

  /*
   * There is nothing for the Assignee to submit. Starting the task is what puts
   * the points in front of the first reviewer, so no status gives them a hand-off
   * of their own.
   */
  it("gives the Assignee nothing to send onwards at any status", () => {
    for (const status of ["STARTED", "UNDER_REVIEW", "UNDER_APPROVAL", "APPROVED", "CLOSED"] as const) {
      expect(canDo("review", checklist(status), as(ASSIGNEE)), status).toBe(false);
      expect(canDo("approve", checklist(status), as(ASSIGNEE)), status).toBe(false);
    }
  });

  it("gives the assignee no verdict of their own on the checklist", () => {
    // They are usually review level 1. Judging the list as assignee and again
    // as that reviewer is judging it twice, which is what this removes.
    const judging = checklist("UNDER_REVIEW");
    expect(canDo("review", judging, as(ASSIGNEE))).toBe(false);
    expect(canDo("approve", judging, as(ASSIGNEE))).toBe(false);
  });

  it("lets nobody judge a closed task, Admin included", () => {
    const closed = checklist("CLOSED");
    for (const who of [as(R1), as(R2), as(A1), admin]) {
      expect(canDo("review", closed, who)).toBe(false);
      expect(canDo("approve", closed, who)).toBe(false);
    }
  });

  it("sends a closed task nowhere — reopening is the only way back", () => {
    const closed = checklist("CLOSED");
    for (const action of ["complete", "review", "approve", "comment", "close"] as const) {
      expect(canDo(action, closed, admin), action).toBe(false);
    }
    expect(canDo("reopen", closed, admin)).toBe(true);
  });

  it("closes a checklist task when the Assignee completes it", () => {
    expect(statusAfterComplete(checklist("APPROVED"))).toBe("CLOSED");
  });

  it("only lets the assignee complete a checklist task once every level has signed off", () => {
    for (const status of ["STARTED", "UNDER_REVIEW", "UNDER_APPROVAL", "REWORK"] as const) {
      expect(canDo("complete", checklist(status), as(ASSIGNEE)), status).toBe(false);
    }
    expect(canDo("complete", checklist("APPROVED"), as(ASSIGNEE))).toBe(true);
    // A plain task is unaffected: it is completed when the work is done.
    expect(canDo("complete", task({ status: "STARTED" }), as(ASSIGNEE))).toBe(true);
  });
});
