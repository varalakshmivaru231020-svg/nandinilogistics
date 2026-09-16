import type { TaskStatus } from "@prisma/client";

/**
 * The design's status flow:
 *   Open → In Progress → Submitted → Approved, and Approved → Reopened.
 * A reopened task rejoins the flow at In Progress.
 */
const FLOW: Record<TaskStatus, TaskStatus> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "SUBMITTED",
  SUBMITTED: "APPROVED",
  APPROVED: "REOPENED",
  REOPENED: "IN_PROGRESS",
};

export function nextStatus(status: TaskStatus): TaskStatus {
  return FLOW[status];
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REOPENED: "Reopened",
};

/** What the design writes on the row's first button. */
export function advanceLabel(status: TaskStatus): string {
  return status === "APPROVED" ? "Reopen" : `→ ${STATUS_LABEL[nextStatus(status)]}`;
}
