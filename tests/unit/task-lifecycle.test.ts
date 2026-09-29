import { describe, expect, it } from "vitest";

import {
  activeLevel, canDo, isOverdue, rolesOf, statusAfterComplete, statusAfterLevel,
  type TaskShape,
} from "@/lib/tasks/lifecycle";

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
    ...over,
  };
}

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

describe("levels act in order, one at a time", () => {
  it("makes Reviewer 1 active first", () => {
    const t = checklistTask({ status: "UNDER_REVIEW" });
    expect(activeLevel(t, [])?.userId).toBe(R1);
    expect(canDo("review", t, as(R1))).toBe(true);
    expect(canDo("review", t, as(R2))).toBe(false);
  });

  it("moves to Reviewer 2 once Reviewer 1 has acted", () => {
    const t = checklistTask({ status: "UNDER_REVIEW" });
    const acted = [{ kind: "REVIEW" as const, level: 1 }];
    expect(activeLevel(t, acted)?.userId).toBe(R2);
    expect(canDo("review", t, as(R2), acted)).toBe(true);
    expect(canDo("review", t, as(R1), acted)).toBe(false);
  });

  it("keeps an Approver out until the reviews are through", () => {
    const t = checklistTask({ status: "UNDER_REVIEW" });
    expect(canDo("approve", t, as(A1))).toBe(false);
  });

  it("lets the Approver act once the task is under approval", () => {
    const t = checklistTask({ status: "UNDER_APPROVAL" });
    expect(canDo("approve", t, as(A1))).toBe(true);
  });
});

describe("where each decision sends the task", () => {
  it("sends a completed standalone task to its Assigner", () => {
    expect(statusAfterComplete(task())).toBe("COMPLETED");
  });

  it("sends a completed checklist task to the first review level", () => {
    expect(statusAfterComplete(checklistTask())).toBe("UNDER_REVIEW");
  });

  it("skips review when nobody was named to review it", () => {
    const t = checklistTask({ levels: [{ kind: "APPROVAL", level: 1, userId: A1 }] });
    expect(statusAfterComplete(t)).toBe("UNDER_APPROVAL");
  });

  it("behaves like a standalone task when no levels were named at all", () => {
    expect(statusAfterComplete(checklistTask({ levels: [] }))).toBe("COMPLETED");
  });

  it("keeps it under review while a reviewer remains", () => {
    const t = checklistTask({ status: "UNDER_REVIEW" });
    expect(statusAfterLevel(t, "PASS", [])).toBe("UNDER_REVIEW");
  });

  it("moves to approval when the last reviewer passes", () => {
    const t = checklistTask({ status: "UNDER_REVIEW" });
    expect(statusAfterLevel(t, "PASS", [{ kind: "REVIEW", level: 1 }])).toBe("UNDER_APPROVAL");
  });

  it("closes on the last approval, with no separate close", () => {
    const t = checklistTask({ status: "UNDER_APPROVAL" });
    expect(statusAfterLevel(t, "APPROVE", [
      { kind: "REVIEW", level: 1 }, { kind: "REVIEW", level: 2 },
    ])).toBe("CLOSED");
  });

  it("sends a fail at any level to Rework", () => {
    expect(statusAfterLevel(checklistTask({ status: "UNDER_REVIEW" }), "FAIL", [])).toBe("REWORK");
    expect(statusAfterLevel(checklistTask({ status: "UNDER_APPROVAL" }), "REJECT", [
      { kind: "REVIEW", level: 1 }, { kind: "REVIEW", level: 2 },
    ])).toBe("REWORK");
  });

  it("puts a reworked task back in the Assignee's hands", () => {
    const t = checklistTask({ status: "REWORK" });
    expect(canDo("resubmit", t, as(ASSIGNEE))).toBe(true);
    expect(canDo("review", t, as(R1))).toBe(false);
  });

  it("restarts at Reviewer 1 in the next round", () => {
    // A new round has nobody acted in it, so level 1 is active again.
    const t = checklistTask({ status: "UNDER_REVIEW", round: 2 });
    expect(activeLevel(t, [])?.userId).toBe(R1);
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

  it("can act at whichever level is active", () => {
    expect(canDo("review", checklistTask({ status: "UNDER_REVIEW" }), admin)).toBe(true);
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
