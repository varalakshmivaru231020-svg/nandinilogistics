import type { AuthContext } from "@/lib/rbac/context";
import { PERM } from "@/lib/permissions/codes";

/**
 * What narrows the task list, as a `where` nothing has to restate.
 *
 * Pure, and apart from both the page and the export route, because the two have
 * to agree exactly: a filter that means one thing on screen and another in the
 * file — or on the phone — is worse than a filter that does not work, since
 * only one of the three is ever checked.
 *
 * Two rules live in here and matter more than the filters:
 *
 *   - Without `task.task.viewAll`, a person sees the tasks they raised, the
 *     tasks they were given, and any they were named to review or approve.
 *     Not the organisation's.
 *   - A project they are not mapped to is not theirs to see — but a task with
 *     no project at all belongs to everybody who can see tasks.
 */

export interface TaskListParams {
  mine: string;
  priority: string;
  assignee: string;
  assigner: string;
  has: string;
  from: string;
  to: string;
  q: string;
}

const one = (v: string | string[] | undefined | null) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function readTaskListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): TaskListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  return {
    mine: read("mine"),
    priority: read("priority"),
    assignee: read("assignee"),
    assigner: read("assigner"),
    has: read("has"),
    from: read("from"),
    to: read("to"),
    q: read("q"),
  };
}

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

export function taskListWhere(
  ctx: AuthContext,
  params: TaskListParams,
): Record<string, unknown> {
  const seesEverything = ctx.has(PERM.task.task.viewAll);

  // A task with no project is everybody's; one in a project they are not
  // mapped to is not theirs.
  const projectScope = ctx.canAccessAllProjects
    ? {}
    : { OR: [{ projectId: { in: ctx.projectIds } }, { projectId: null }] };

  const ownScope = {
    OR: [
      { assigneeId: ctx.id },
      { createdById: ctx.id },
      { levels: { some: { userId: ctx.id } } },
    ],
  };

  const { mine, priority, assignee, assigner, has, from, to, q } = params;

  const dueRange =
    from || to
      ? {
          dueAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {};

  const search = q.trim();

  return {
    ...(seesEverything ? projectScope : {}),
    ...(seesEverything ? {} : ownScope),
    ...(mine === "to" ? { assigneeId: ctx.id } : {}),
    ...(mine === "by" ? { createdById: ctx.id } : {}),
    ...(priority && PRIORITIES.includes(priority)
      ? { priority: priority as "HIGH" | "MEDIUM" | "LOW" }
      : {}),
    ...(assignee ? { assigneeId: assignee } : {}),
    ...(assigner ? { createdById: assigner } : {}),
    ...(has === "checklist" ? { kind: "CHECKLIST" as const } : {}),
    ...(has === "plain" ? { kind: "STANDALONE" as const } : {}),
    // Searched by the number on it, its title, or whoever it is for.
    ...(search
      ? {
          OR: [
            { taskNo: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
            { assignee: { name: { contains: search, mode: "insensitive" as const } } },
            { createdBy: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...dueRange,
  };
}

/** What the filters amount to, in words, for an export's header. */
export function describeTaskFilters(params: TaskListParams, seesEverything: boolean): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    params.mine === "to" ? "Given to you" : params.mine === "by" ? "Raised by you" : null,
    PRIORITIES.includes(params.priority) ? `${params.priority} priority` : null,
    params.has === "checklist" ? "Checklist tasks" : params.has === "plain" ? "Plain tasks" : null,
    params.from || params.to
      ? `Due ${params.from || "any"} to ${params.to || "any"}`
      : null,
    seesEverything ? null : "Yours only",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All tasks in view";
}
