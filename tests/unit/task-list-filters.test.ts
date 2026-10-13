import { describe, expect, it } from "vitest";

import { describeTaskFilters, readTaskListParams, taskListWhere } from "@/lib/tasks/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

/** A context with exactly the codes a test needs. */
function ctxWith(codes: string[], over: Partial<AuthContext> = {}): AuthContext {
  const held = new Set(codes);
  const has = (c: string) => held.has(c);
  return {
    id: "u1", employeeCode: "E1", name: "Vikas", email: "pm@x",
    isSuperAdmin: false, roles: [], permissions: held,
    projectIds: ["p1", "p2"], canAccessAllProjects: false,
    workspaceProjectId: null, approvalLimits: {},
    has,
    hasAny: (...c) => c.some(has),
    hasAll: (...c) => c.every(has),
    approvalLimitFor: () => 0,
    ...over,
  } as AuthContext;
}

const empty = readTaskListParams({});

describe("who sees which tasks", () => {
  /*
   * The rule that matters most in this file. Without viewAll a person sees the
   * tasks they raised, the tasks they were given and any they were named on —
   * and nothing else. A filter bug here is a privacy bug.
   */
  it("narrows to a person's own three ways in, without viewAll", () => {
    const where = taskListWhere(ctxWith([PERM.task.task.view]), empty);
    expect(where.OR).toEqual([
      { assigneeId: "u1" },
      { createdById: "u1" },
      { levels: { some: { userId: "u1" } } },
    ]);
    // And it does not also apply a project scope, which would narrow it twice.
    expect(where).not.toHaveProperty("projectId");
  });

  it("scopes by project instead, for somebody who sees everything", () => {
    const where = taskListWhere(
      ctxWith([PERM.task.task.view, PERM.task.task.viewAll]),
      empty,
    );
    expect(where.OR).toEqual([{ projectId: { in: ["p1", "p2"] } }, { projectId: null }]);
  });

  /*
   * A task with no project belongs to everybody who can see tasks — it is not
   * hidden from the people who are meant to act on it.
   */
  it("keeps an unprojected task visible", () => {
    const where = taskListWhere(
      ctxWith([PERM.task.task.view, PERM.task.task.viewAll]),
      empty,
    );
    expect(where.OR).toContainEqual({ projectId: null });
  });

  it("stops scoping at all for somebody who may reach every project", () => {
    const where = taskListWhere(
      ctxWith([PERM.task.task.view, PERM.task.task.viewAll], { canAccessAllProjects: true }),
      empty,
    );
    expect(where.OR).toBeUndefined();
  });
});

describe("the filters", () => {
  const ctx = ctxWith([PERM.task.task.view, PERM.task.task.viewAll]);

  it("reads them off a query string the way the web reads its URL", () => {
    const params = readTaskListParams(
      new URLSearchParams("mine=to&priority=HIGH&has=checklist&q=slab&from=2026-10-01"),
    );
    expect(params).toMatchObject({
      mine: "to", priority: "HIGH", has: "checklist", q: "slab", from: "2026-10-01",
    });
  });

  it("picks out the tasks given to you, and the ones you raised", () => {
    expect(taskListWhere(ctx, { ...empty, mine: "to" })).toMatchObject({ assigneeId: "u1" });
    expect(taskListWhere(ctx, { ...empty, mine: "by" })).toMatchObject({ createdById: "u1" });
  });

  /* A priority that is not one is ignored, not passed to Prisma as an enum. */
  it("ignores a priority that is not a priority", () => {
    expect(taskListWhere(ctx, { ...empty, priority: "URGENT" })).not.toHaveProperty("priority");
    expect(taskListWhere(ctx, { ...empty, priority: "HIGH" })).toMatchObject({ priority: "HIGH" });
  });

  it("separates checklist tasks from plain ones", () => {
    expect(taskListWhere(ctx, { ...empty, has: "checklist" })).toMatchObject({ kind: "CHECKLIST" });
    expect(taskListWhere(ctx, { ...empty, has: "plain" })).toMatchObject({ kind: "STANDALONE" });
  });

  it("searches the number, the title and the two people on it", () => {
    const where = taskListWhere(ctx, { ...empty, q: "  slab  " }) as {
      AND?: unknown;
      OR: Array<Record<string, unknown>>;
    };
    // The search OR replaces the scope OR, so the keys are what to check.
    const search = JSON.stringify(where);
    expect(search).toContain("taskNo");
    expect(search).toContain("title");
    expect(search).toContain("assignee");
    expect(search).toContain("createdBy");
    // Trimmed, so a stray space does not return nothing.
    expect(search).toContain('"slab"');
  });

  it("takes a due range from either end, or both", () => {
    const both = taskListWhere(ctx, { ...empty, from: "2026-10-01", to: "2026-10-31" }) as {
      dueAt: { gte?: Date; lte?: Date };
    };
    expect(both.dueAt.gte?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    // Inclusive of the last day, not midnight at its start.
    expect(both.dueAt.lte?.toISOString()).toBe("2026-10-31T23:59:59.999Z");

    const openEnded = taskListWhere(ctx, { ...empty, from: "2026-10-01" }) as {
      dueAt: { gte?: Date; lte?: Date };
    };
    expect(openEnded.dueAt.lte).toBeUndefined();
  });

  it("applies nothing when nothing was asked for", () => {
    const where = taskListWhere(ctx, empty);
    expect(Object.keys(where)).toEqual(["OR"]);
  });
});

describe("what the filters amount to, in words", () => {
  /*
   * This is the line an export header carries and the phone shows above the
   * list. "All tasks in view" is honest; a blank line looks like a bug.
   */
  it("says so when nothing is filtered", () => {
    expect(describeTaskFilters(empty, true)).toBe("All tasks in view");
  });

  it("names the ownership restriction, since it is not a chip anybody set", () => {
    expect(describeTaskFilters(empty, false)).toBe("Yours only");
  });

  it("reads back every filter that is on", () => {
    const words = describeTaskFilters(
      { ...empty, q: "slab", mine: "to", priority: "HIGH", has: "checklist", from: "2026-10-01" },
      true,
    );
    expect(words).toBe(
      "Matching “slab” · Given to you · HIGH priority · Checklist tasks · Due 2026-10-01 to any",
    );
  });
});
