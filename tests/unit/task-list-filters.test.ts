import { describe, expect, it } from "vitest";

import { describeTaskFilters, readTaskListParams, taskListWhere } from "@/lib/tasks/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

/** A context with exactly the codes a test needs. */
function ctxWith(codes: string[]): AuthContext {
  const held = new Set(codes);
  const has = (c: string) => held.has(c);
  return {
    id: "u1", employeeCode: "E1", name: "Vikas", email: "tl@x",
    isSuperAdmin: false, roles: [], permissions: held,
    has,
    hasAny: (...c) => c.some(has),
    hasAll: (...c) => c.every(has),
  };
}

const empty = readTaskListParams({});

describe("who sees which tasks", () => {
  /*
   * The rule that matters most in this file. Without viewAll a person sees the
   * tasks they were given and the tasks they raised — and nothing else. A
   * filter bug here is a privacy bug.
   */
  it("narrows to a person's own two ways in, without viewAll", () => {
    const where = taskListWhere(ctxWith([PERM.task.task.view]), empty);
    expect(where.OR).toEqual([
      { assignees: { some: { userId: "u1" } } },
      { createdById: "u1" },
    ]);
  });

  it("does not narrow at all for somebody who sees everything", () => {
    const where = taskListWhere(ctxWith([PERM.task.task.view, PERM.task.task.viewAll]), empty);
    expect(where.OR).toBeUndefined();
    expect(where).toEqual({});
  });
});

describe("the filters", () => {
  const ctx = ctxWith([PERM.task.task.view, PERM.task.task.viewAll]);

  it("reads them off a query string the way the web reads its URL", () => {
    const params = readTaskListParams(
      new URLSearchParams("status=OPEN&priority=HIGH&assignee=u9&q=kyc&from=2026-10-01&to=2026-10-31"),
    );
    expect(params).toEqual({
      status: "OPEN", priority: "HIGH", assignee: "u9", q: "kyc", from: "2026-10-01", to: "2026-10-31",
    });
  });

  it("reads the same off a page's searchParams", () => {
    expect(readTaskListParams({ status: ["DONE"], q: " kyc " })).toMatchObject({ status: "DONE", q: "kyc" });
  });

  it("filters by status, priority and Team Leader", () => {
    const where = taskListWhere(ctx, readTaskListParams({ status: "IN_PROGRESS", priority: "LOW", assignee: "u9" }));
    expect(where).toMatchObject({
      status: "IN_PROGRESS",
      priority: "LOW",
      assignees: { some: { userId: "u9" } },
    });
  });

  it("ignores a status or priority that is not one of ours", () => {
    const where = taskListWhere(ctx, readTaskListParams({ status: "CLOSED", priority: "URGENT" }));
    expect(where).not.toHaveProperty("status");
    expect(where).not.toHaveProperty("priority");
  });

  it("bounds the due date to the whole of each day", () => {
    const where = taskListWhere(ctx, readTaskListParams({ from: "2026-10-01", to: "2026-10-31" }));
    expect(where.dueAt).toEqual({
      gte: new Date("2026-10-01T00:00:00.000Z"),
      lte: new Date("2026-10-31T23:59:59.999Z"),
    });
  });

  it("searches the number, the title and the people", () => {
    const where = taskListWhere(ctx, readTaskListParams({ q: "kyc" })) as { AND: Array<{ OR: unknown[] }> };
    expect(where.AND[0].OR).toHaveLength(4);
  });

  it("keeps the search apart from the ownership rule", () => {
    // Both are ORs; a search must not replace the scope, or a Team Leader
    // could search their way into everybody's tasks.
    const where = taskListWhere(ctxWith([PERM.task.task.view]), readTaskListParams({ q: "kyc" }));
    expect(where.OR).toEqual([
      { assignees: { some: { userId: "u1" } } },
      { createdById: "u1" },
    ]);
    expect(where).toHaveProperty("AND");
  });
});

describe("the filters in words", () => {
  it("says what was applied", () => {
    const words = describeTaskFilters(
      readTaskListParams({ q: "kyc", status: "IN_PROGRESS", priority: "HIGH", from: "2026-10-01" }),
      true,
    );
    expect(words).toBe("Matching “kyc” · in progress · HIGH priority · Due 2026-10-01 to any");
  });

  it("says when the view is only your own", () => {
    expect(describeTaskFilters(empty, false)).toBe("Yours only");
    expect(describeTaskFilters(empty, true)).toBe("All tasks in view");
  });
});
