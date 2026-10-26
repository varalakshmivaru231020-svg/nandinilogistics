import { describe, expect, it } from "vitest";

import { canDo, isOverdue, rolesOf, type TaskShape } from "@/lib/tasks/lifecycle";
import { summariseByAssignee } from "@/lib/tasks/service";

const ADMIN = "u-admin";
const TL1 = "u-tl-1";
const TL2 = "u-tl-2";

function task(over: Partial<TaskShape> = {}): TaskShape {
  return {
    status: "OPEN",
    assigneeIds: [TL1, TL2],
    createdById: ADMIN,
    ...over,
  };
}

const as = (userId: string) => ({ userId, isAdmin: false });
const admin = { userId: "u-other-admin", isAdmin: true };

describe("who holds which role", () => {
  it("names the Assigner and every Assignee", () => {
    expect([...rolesOf(task(), as(ADMIN))]).toEqual(["ASSIGNER"]);
    expect([...rolesOf(task(), as(TL1))]).toEqual(["ASSIGNEE"]);
    expect([...rolesOf(task(), as(TL2))]).toEqual(["ASSIGNEE"]);
  });

  it("gives a stranger no role at all", () => {
    expect(rolesOf(task(), as("someone-else")).size).toBe(0);
  });

  it("names an Admin whoever they are to the task", () => {
    expect(rolesOf(task(), admin)).toEqual(new Set(["ADMIN"]));
  });
});

describe("the Team Leader's side of the lifecycle", () => {
  it("starts an open task", () => {
    expect(canDo("start", task(), as(TL1))).toBe(true);
    expect(canDo("start", task({ status: "IN_PROGRESS" }), as(TL1))).toBe(false);
    expect(canDo("start", task({ status: "DONE" }), as(TL1))).toBe(false);
  });

  it("marks it done from open or in progress", () => {
    expect(canDo("complete", task(), as(TL2))).toBe(true);
    expect(canDo("complete", task({ status: "IN_PROGRESS" }), as(TL2))).toBe(true);
    expect(canDo("complete", task({ status: "DONE" }), as(TL2))).toBe(false);
  });

  it("can remark at any status", () => {
    for (const status of ["OPEN", "IN_PROGRESS", "DONE"] as const) {
      expect(canDo("comment", task({ status }), as(TL1))).toBe(true);
    }
  });

  it("cannot edit, delete or reopen", () => {
    expect(canDo("edit", task(), as(TL1))).toBe(false);
    expect(canDo("delete", task(), as(TL1))).toBe(false);
    expect(canDo("reopen", task({ status: "DONE" }), as(TL1))).toBe(false);
  });
});

describe("Admin's side", () => {
  it("edits and deletes until it is done", () => {
    expect(canDo("edit", task(), as(ADMIN))).toBe(true);
    expect(canDo("edit", task({ status: "IN_PROGRESS" }), as(ADMIN))).toBe(true);
    expect(canDo("edit", task({ status: "DONE" }), as(ADMIN))).toBe(false);
    expect(canDo("delete", task({ status: "DONE" }), as(ADMIN))).toBe(false);
  });

  it("reopens a finished task, and only a finished one", () => {
    expect(canDo("reopen", task({ status: "DONE" }), as(ADMIN))).toBe(true);
    expect(canDo("reopen", task({ status: "DONE" }), admin)).toBe(true);
    expect(canDo("reopen", task(), as(ADMIN))).toBe(false);
  });

  it("may also move it along, as the SOW gives Admin every action", () => {
    expect(canDo("start", task(), admin)).toBe(true);
    expect(canDo("complete", task({ status: "IN_PROGRESS" }), admin)).toBe(true);
  });
});

describe("a stranger", () => {
  it("can do nothing, not even remark", () => {
    for (const action of ["edit", "start", "complete", "reopen", "comment", "delete"] as const) {
      expect(canDo(action, task({ status: "DONE" }), as("nobody")), action).toBe(false);
      expect(canDo(action, task(), as("nobody")), action).toBe(false);
    }
  });
});

describe("overdue", () => {
  const NOW = Date.parse("2026-10-26T10:00:00.000Z");

  it("is past the due date and not done", () => {
    expect(isOverdue({ status: "OPEN", dueAt: "2026-10-25T10:00:00.000Z" }, NOW)).toBe(true);
    expect(isOverdue({ status: "IN_PROGRESS", dueAt: "2026-10-25T10:00:00.000Z" }, NOW)).toBe(true);
  });

  it("never applies to a finished task", () => {
    expect(isOverdue({ status: "DONE", dueAt: "2026-10-25T10:00:00.000Z" }, NOW)).toBe(false);
  });

  it("is not yet overdue before the due time", () => {
    expect(isOverdue({ status: "OPEN", dueAt: "2026-10-27T10:00:00.000Z" }, NOW)).toBe(false);
  });
});

describe("the summary per Team Leader", () => {
  const NOW = Date.parse("2026-10-26T10:00:00.000Z");
  const past = "2026-10-20T10:00:00.000Z";
  const future = "2026-11-01T10:00:00.000Z";
  const a = { userId: "a", name: "Asha" };
  const b = { userId: "b", name: "Bala" };

  it("counts each task once per Team Leader on it", () => {
    const rows = summariseByAssignee(
      [
        { status: "OPEN", dueAt: future, assignees: [a, b] },
        { status: "IN_PROGRESS", dueAt: past, assignees: [a] },
        { status: "DONE", dueAt: past, assignees: [b] },
      ],
      NOW,
    );
    expect(rows).toEqual([
      { userId: "a", name: "Asha", open: 1, inProgress: 1, overdue: 1, done: 0 },
      { userId: "b", name: "Bala", open: 1, inProgress: 0, overdue: 0, done: 1 },
    ]);
  });

  it("is empty when nothing is assigned", () => {
    expect(summariseByAssignee([], NOW)).toEqual([]);
  });
});
