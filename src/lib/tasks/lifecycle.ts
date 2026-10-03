import type { TaskKind, TaskStatus } from "@prisma/client";

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
  | "resubmit"
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
 * The level waiting to act, or null when nothing is.
 *
 * Levels act strictly in order and only in the current round, so the active one
 * is the lowest level of the active kind that has not acted this round.
 */
export function activeLevel(
  task: TaskShape,
  actedThisRound: Array<{ kind: "REVIEW" | "APPROVAL"; level: number }>,
): TaskLevelShape | null {
  const kind = task.status === "UNDER_REVIEW" ? "REVIEW" : task.status === "UNDER_APPROVAL" ? "APPROVAL" : null;
  if (!kind) return null;
  const done = new Set(actedThisRound.filter((a) => a.kind === kind).map((a) => a.level));
  return task.levels
    .filter((l) => l.kind === kind && !done.has(l.level))
    .sort((a, b) => a.level - b.level)[0] ?? null;
}

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
  actedThisRound: Array<{ kind: "REVIEW" | "APPROVAL"; level: number }> = [],
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

  if (roles.has("ADMIN")) return adminMayAtStatus(action, task, actedThisRound);

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
      return task.kind === "CHECKLIST" ? task.status === "APPROVED" : task.status === "STARTED";

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

    case "review": {
      if (task.status !== "UNDER_REVIEW") return false;
      const next = activeLevel(task, actedThisRound);
      return !!next && next.userId === viewer.userId;
    }

    case "approve": {
      if (task.status !== "UNDER_APPROVAL") return false;
      const next = activeLevel(task, actedThisRound);
      return !!next && next.userId === viewer.userId;
    }

    // After a Fail or a Reject the task is the Assignee's again.
    case "resubmit":
      return roles.has("ASSIGNEE") && task.status === "REWORK";
  }
}

/** Admin may do anything the task's own status still allows. */
function adminMayAtStatus(
  action: TaskAction,
  task: TaskShape,
  actedThisRound: Array<{ kind: "REVIEW" | "APPROVAL"; level: number }>,
): boolean {
  switch (action) {
    case "edit": return true;
    case "accept": return task.status === "PENDING";
    case "start": return task.status === "ACCEPTED" || task.status === "HOLD";
    case "complete":
      return task.kind === "CHECKLIST" ? task.status === "APPROVED" : task.status === "STARTED";
    case "requestExtension": return ["ACCEPTED", "STARTED", "HOLD", "REWORK"].includes(task.status);
    case "decideExtension": return true;
    case "close":
    case "sendBack": return task.kind === "STANDALONE" && task.status === "COMPLETED";
    case "review": return task.status === "UNDER_REVIEW" && !!activeLevel(task, actedThisRound);
    case "approve": return task.status === "UNDER_APPROVAL" && !!activeLevel(task, actedThisRound);
    case "resubmit": return task.status === "REWORK";
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

/**
 * Where the assignee finishing their own pass sends the task.
 *
 * They judge every line, and it goes straight to the first level that has to
 * check it — nobody presses anything. With no levels named at all there is
 * nothing to check, and the task waits to be completed as a plain one does.
 */
export function statusAfterAssigneePass(task: TaskShape): TaskStatus {
  const hasReview = task.levels.some((l) => l.kind === "REVIEW");
  const hasApproval = task.levels.some((l) => l.kind === "APPROVAL");
  if (hasReview) return "UNDER_REVIEW";
  if (hasApproval) return "UNDER_APPROVAL";
  return "APPROVED";
}

/**
 * Where a level's decision sends the task.
 *
 * A Fail or a Reject at any level is a Rework, whichever level it came from;
 * the last Approver's approval closes the task with no further step.
 */
export function statusAfterLevel(
  task: TaskShape,
  decision: "PASS" | "FAIL" | "APPROVE" | "REJECT",
  actedThisRound: Array<{ kind: "REVIEW" | "APPROVAL"; level: number }>,
): TaskStatus {
  if (decision === "FAIL" || decision === "REJECT") return "REWORK";

  const acted = [...actedThisRound];
  const current = activeLevel(task, acted);
  if (current) acted.push({ kind: current.kind, level: current.level });

  const stillToReview = activeLevel({ ...task, status: "UNDER_REVIEW" }, acted);
  if (stillToReview) return "UNDER_REVIEW";

  const stillToApprove = activeLevel({ ...task, status: "UNDER_APPROVAL" }, acted);
  if (stillToApprove) return "UNDER_APPROVAL";

  // Everyone has signed off. The task goes back to whoever did the work, to
  // close — which is the last thing that happens to it.
  return "APPROVED";
}

/** A task is overdue once its due date passes with the work not yet done. */
export function isOverdue(
  task: { status: TaskStatus; dueAt: Date | string },
  nowMs: number,
): boolean {
  if (["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL", "APPROVED"].includes(task.status)) return false;
  return new Date(task.dueAt).getTime() < nowMs;
}
