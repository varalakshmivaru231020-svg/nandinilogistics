import type { TaskStatus } from "@prisma/client";

/**
 * Who may do what to a task, and where it can go next.
 *
 * The SOW's task is simple: Admin raises it and assigns it to one or more
 * Team Leaders, who move it Open → In Progress → Done with remarks along the
 * way. Both the statuses and the matrix live here, as data rather than as
 * conditions scattered through actions, so the rules can be read in one place
 * and tested without a request.
 */

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/** Everything someone can try to do to a task. */
export type TaskAction = "edit" | "start" | "complete" | "reopen" | "comment" | "delete";

export type TaskRole = "ADMIN" | "ASSIGNER" | "ASSIGNEE";

export interface TaskShape {
  status: TaskStatus;
  /** Every Team Leader the task was given to. */
  assigneeIds: string[];
  /** Whoever raised it — Admin. */
  createdById: string;
}

export interface TaskViewer {
  userId: string;
  /** Admin has full control: any action on any task. */
  isAdmin: boolean;
}

/** Every role this viewer holds on this task. */
export function rolesOf(task: TaskShape, viewer: TaskViewer): Set<TaskRole> {
  const roles = new Set<TaskRole>();
  if (viewer.isAdmin) roles.add("ADMIN");
  if (task.createdById === viewer.userId) roles.add("ASSIGNER");
  if (task.assigneeIds.includes(viewer.userId)) roles.add("ASSIGNEE");
  return roles;
}

/**
 * Whether this viewer may take this action on this task right now.
 *
 * Admin and the Assigner are answered together: the SOW gives Admin every
 * action on every task, and whoever raised it is Admin by definition.
 */
export function canDo(action: TaskAction, task: TaskShape, viewer: TaskViewer): boolean {
  const roles = rolesOf(task, viewer);
  if (roles.size === 0) return false;
  const admin = roles.has("ADMIN") || roles.has("ASSIGNER");

  switch (action) {
    // Everyone who can see the task can remark on it.
    case "comment":
      return true;
    // Reopening a finished task is Admin's alone, and is the only thing that
    // acts on one.
    case "reopen":
      return admin && task.status === "DONE";
    case "edit":
    case "delete":
      return admin && task.status !== "DONE";
    case "start":
      return task.status === "OPEN";
    case "complete":
      return task.status === "OPEN" || task.status === "IN_PROGRESS";
  }
}

/** A task is overdue once its due date passes with the work not yet done. */
export function isOverdue(
  task: { status: TaskStatus; dueAt: Date | string },
  nowMs: number,
): boolean {
  if (task.status === "DONE") return false;
  return new Date(task.dueAt).getTime() < nowMs;
}
