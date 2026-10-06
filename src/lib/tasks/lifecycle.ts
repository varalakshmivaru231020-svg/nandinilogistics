import type { TaskKind, TaskStatus } from "@prisma/client";

import { isWaitingOn, waitingLevel, type FlowItem } from "./checklist-flow";

/**
 * Who may do what to a task, and where it can go next.
 *
 * The scope document states the lifecycle as a table of statuses and a matrix
 * of roles. Both live here, as data rather than as conditions scattered through
 * actions, so the rules can be read in one place and tested without a request.
 *
 * A role is not a job title: the same person is the Assigner on tasks they
 * create and the Assignee on tasks given to them, and may also sit on a review
 * level. So a role is worked out per task, per viewer, every time.
 */

export const TASK_STATUSES = [
  "PENDING", "ACCEPTED", "STARTED", "HOLD", "COMPLETED",
  "UNDER_REVIEW", "REWORK", "UNDER_APPROVAL", "APPROVED", "CLOSED",
] as const;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  STARTED: "Started",
  HOLD: "Hold",
  COMPLETED: "Completed",
  UNDER_REVIEW: "Under Review",
  REWORK: "Rework",
  UNDER_APPROVAL: "Under Approval",
  APPROVED: "Approved",
  CLOSED: "Closed",
};

/** Everything someone can try to do to a task. */
export type TaskAction =
  | "edit"
  | "accept"
  | "start"
  | "complete"
  | "requestExtension"
  | "decideExtension"
  | "close"
  | "sendBack"
  | "comment"
  | "review"
  | "approve"
  | "reopen"
  | "reassign";

export type TaskRole = "ADMIN" | "ASSIGNER" | "ASSIGNEE" | "REVIEWER" | "APPROVER";

export interface TaskLevelShape {
  kind: "REVIEW" | "APPROVAL";
  level: number;
  userId: string;
}

export interface TaskShape {
  kind: TaskKind;
  status: TaskStatus;
  /** Which pass through the levels this is; a Rework starts the next one. */
  round: number;
  assigneeId: string;
  /** The Assigner — whoever created it. */
  createdById: string;
  levels: TaskLevelShape[];
  /**
   * The checklist points and where each one stands. Empty on a standalone task,
   * which has no points and no levels to put them in front of.
   */
  items: FlowItem[];
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
  if (task.assigneeId === viewer.userId) roles.add("ASSIGNEE");
  for (const l of task.levels) {
    if (l.userId !== viewer.userId) continue;
    roles.add(l.kind === "REVIEW" ? "REVIEWER" : "APPROVER");
  }
  return roles;
}

/**
 * The level this viewer could act on right now, by kind — the one holding at
 * least one checklist point that is theirs to judge.
 *
 * Levels no longer act on the task as a whole, so there is no single "active
 * level": two of them can be working at once on different points.
 */
function levelWithWork(
  task: TaskShape,
  userId: string,
  kind: "REVIEW" | "APPROVAL",
): TaskLevelShape | null {
  const mine = task.levels.filter((l) => l.kind === kind && l.userId === userId);
  for (const l of mine) {
    if (task.items.some((i) => isWaitingOn(i, task.levels, l))) return l;
  }
  return null;
}

/** Whether any point at all is standing in front of a level of this kind. */
function anyWorkOfKind(task: TaskShape, kind: "REVIEW" | "APPROVAL"): boolean {
  return task.items.some((i) => waitingLevel(i, task.levels)?.kind === kind);
}

/** The statuses in which points are being judged. */
const JUDGING: TaskStatus[] = ["UNDER_REVIEW", "UNDER_APPROVAL"];

/** Statuses from which nothing may be changed except by an Admin reopening. */
const LOCKED: TaskStatus[] = ["CLOSED"];

/**
 * Whether this viewer may take this action on this task right now.
 *
 * Admin is answered first and separately: the scope gives Admin every action on
 * every task, including each of the Assignee's, so an Admin check buried among
 * the per-role conditions would be missed somewhere.
 */
export function canDo(
  action: TaskAction,
  task: TaskShape,
  viewer: TaskViewer,
): boolean {
  const roles = rolesOf(task, viewer);
  const closed = LOCKED.includes(task.status);

  // Reopening a closed task is Admin's alone, and is the only thing that acts
  // on one.
  if (action === "reopen") return roles.has("ADMIN") && closed;
  if (closed) return false;
  // Reassigning the Assignee or any level is Admin's alone — for when someone
  // is on leave.
  if (action === "reassign") return roles.has("ADMIN");

  // Everyone who can see the task can talk on it, at any status until it closes.
  if (action === "comment") return roles.size > 0;

  if (roles.has("ADMIN")) return adminMayAtStatus(action, task);

  switch (action) {
    // The Assigner may correct the task until work starts on it.
    case "edit":
      return roles.has("ASSIGNER") && (task.status === "PENDING" || task.status === "ACCEPTED");

    case "accept":
      return roles.has("ASSIGNEE") && task.status === "PENDING";

    case "start":
      return roles.has("ASSIGNEE") && (task.status === "ACCEPTED" || task.status === "HOLD");

    // A plain task is completed when the work is done. A checklist task is
    // completed when every level has signed it off — the sign-off comes first,
    // and completing it is what closes it.
    case "complete":
      if (!roles.has("ASSIGNEE")) return false;
      // A checklist task is completed only once every point has been through
      // every level; a standalone one when the work is done, including after
      // the Assigner has sent it back.
      return task.kind === "CHECKLIST"
        ? task.status === "APPROVED"
        : task.status === "STARTED" || task.status === "REWORK";

    // A Hold is an extension too, so the Assignee asks from Accepted or Started.
    case "requestExtension":
      return roles.has("ASSIGNEE") && ["ACCEPTED", "STARTED", "HOLD", "REWORK"].includes(task.status);

    case "decideExtension":
      return roles.has("ASSIGNER");

    // A standalone task is closed by its Assigner; a checklist task closes
    // itself when the last Approver approves.
    case "close":
    case "sendBack":
      return roles.has("ASSIGNER") && task.kind === "STANDALONE" && task.status === "COMPLETED";

    /*
     * Judging is per point, not per task. A reviewer may act the moment any
     * point is standing in front of them — which can be while an approver is
     * working on a different point of the same checklist.
     */
    case "review":
      return JUDGING.includes(task.status) && levelWithWork(task, viewer.userId, "REVIEW") !== null;

    case "approve":
      return JUDGING.includes(task.status) && levelWithWork(task, viewer.userId, "APPROVAL") !== null;

  }
}

/** Admin may do anything the task's own status still allows. */
function adminMayAtStatus(
  action: TaskAction,
  task: TaskShape,
): boolean {
  switch (action) {
    case "edit": return true;
    case "accept": return task.status === "PENDING";
    case "start": return task.status === "ACCEPTED" || task.status === "HOLD";
    case "complete":
      return task.kind === "CHECKLIST"
        ? task.status === "APPROVED"
        : task.status === "STARTED" || task.status === "REWORK";
    case "requestExtension": return ["ACCEPTED", "STARTED", "HOLD", "REWORK"].includes(task.status);
    case "decideExtension": return true;
    case "close":
    case "sendBack": return task.kind === "STANDALONE" && task.status === "COMPLETED";
    case "review": return JUDGING.includes(task.status) && anyWorkOfKind(task, "REVIEW");
    case "approve": return JUDGING.includes(task.status) && anyWorkOfKind(task, "APPROVAL");
    default: return true;
  }
}

/**
 * Where completing the work sends a task.
 *
 * A standalone task waits for its Assigner to close it. A checklist task has
 * already been through every level by the time it can be completed, so
 * completing it is what closes it.
 */
export function statusAfterComplete(task: TaskShape): TaskStatus {
  return task.kind === "CHECKLIST" ? "CLOSED" : "COMPLETED";
}

/** A task is overdue once its due date passes with the work not yet done. */
export function isOverdue(
  task: { status: TaskStatus; dueAt: Date | string },
  nowMs: number,
): boolean {
  if (["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL", "APPROVED"].includes(task.status)) return false;
  return new Date(task.dueAt).getTime() < nowMs;
}
