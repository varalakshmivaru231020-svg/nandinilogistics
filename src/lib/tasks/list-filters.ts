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
 * The rule that matters more than the filters: without `task.task.viewAll`, a
 * person sees the tasks they were given and the tasks they raised. Not the
 * organisation's.
 */

export interface TaskListParams {
  status: string;
  priority: string;
  assignee: string;
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
    status: read("status"),
    priority: read("priority"),
    assignee: read("assignee"),
    from: read("from"),
    to: read("to"),
    q: read("q"),
  };
}

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const STATUSES = ["OPEN", "IN_PROGRESS", "DONE"];

export function taskListWhere(
  ctx: AuthContext,
  params: TaskListParams,
): Record<string, unknown> {
  const seesEverything = ctx.has(PERM.task.task.viewAll);

  const ownScope = {
    OR: [
      { assignees: { some: { userId: ctx.id } } },
      { createdById: ctx.id },
    ],
  };

  const { status, priority, assignee, from, to, q } = params;

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
    ...(seesEverything ? {} : ownScope),
    ...(status && STATUSES.includes(status)
      ? { status: status as "OPEN" | "IN_PROGRESS" | "DONE" }
      : {}),
    ...(priority && PRIORITIES.includes(priority)
      ? { priority: priority as "HIGH" | "MEDIUM" | "LOW" }
      : {}),
    ...(assignee ? { assignees: { some: { userId: assignee } } } : {}),
    // Searched by the number on it, its title, or whoever it is for.
    ...(search
      ? {
          AND: [
            {
              OR: [
                { taskNo: { contains: search, mode: "insensitive" as const } },
                { title: { contains: search, mode: "insensitive" as const } },
                { assignees: { some: { user: { name: { contains: search, mode: "insensitive" as const } } } } },
                { createdBy: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            },
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
    STATUSES.includes(params.status) ? params.status.replace("_", " ").toLowerCase() : null,
    PRIORITIES.includes(params.priority) ? `${params.priority} priority` : null,
    params.from || params.to
      ? `Due ${params.from || "any"} to ${params.to || "any"}`
      : null,
    seesEverything ? null : "Yours only",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All tasks in view";
}
