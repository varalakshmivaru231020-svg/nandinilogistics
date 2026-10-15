import "server-only";

import type { TaskStatus } from "@prisma/client";

import type { RecordAction } from "@/lib/records/types";
import { isOverdue, STATUS_LABEL } from "@/lib/tasks/lifecycle";
import { TASK_PRIORITY_TONE, TASK_STATUS_TONE } from "@/lib/tasks/list-display";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDateTime } from "@/lib/utils";

/**
 * The task row, as the table in `tasks-screen.tsx` draws one: the title with a
 * Checklist tag where it came from one, the task number, where it is, who has
 * it, when it is due — in the overdue tone once it is late — its priority, how
 * many files are attached, and the stage it is waiting at with who holds it.
 */

export interface TaskRowInput {
  id: string;
  taskNo: string;
  title: string;
  kind: string;
  location: string | null;
  assignee: string;
  dueAt: Date | string;
  status: TaskStatus;
  priority: string;
  attachments: number;
  stage: string | null;
  stageWho: string | null;
  extensionWaiting: boolean;
}

/**
 * The one button the web's task row carries.
 *
 * `RowAction` in `tasks-screen.tsx` reads two facts and nothing else: the task
 * is yours, and it is Pending (Accept) or Accepted/on hold (Start). It does not
 * ask `canDo` — and it does not have to, because `acceptTaskAction` and
 * `startTaskAction` ask it again inside the action.
 */
export function taskRowActions(t: {
  id: string;
  status: TaskStatus;
  mine: boolean;
}): RecordAction[] {
  if (t.mine && t.status === "PENDING") {
    return [{
      key: "accept",
      label: "Accept",
      emphasis: "approve",
      action: "tasks/acceptTask",
      args: [t.id],
      remark: "none",
      confirm: "It becomes yours, and whoever raised it is told.",
    }];
  }
  if (t.mine && (t.status === "ACCEPTED" || t.status === "HOLD")) {
    return [{
      key: "start",
      label: "Start",
      emphasis: "primary",
      action: "tasks/startTask",
      args: [t.id],
      remark: "none",
      confirm: "The clock on it starts from now.",
    }];
  }
  return [];
}

export function taskScreenRow(t: TaskRowInput, nowMs: number, mine = false): ScreenRow {
  const over = isOverdue({ status: t.status, dueAt: new Date(t.dueAt) }, nowMs);

  return {
    id: t.id,
    title: t.title,
    chips: [
      ...(t.kind === "CHECKLIST" ? [{ text: "Checklist", tone: "plum" as const }] : []),
      { text: t.priority[0] + t.priority.slice(1).toLowerCase(), tone: TASK_PRIORITY_TONE[t.priority] ?? "draft" },
    ],
    meta: t.taskNo,
    lines: [
      { label: "Location", value: t.location ?? "—" },
      { label: "Assignee", value: t.assignee },
      { label: "Due", value: formatDateTime(t.dueAt) + (over ? " · overdue" : "") },
      { label: "Evidence", value: t.attachments > 0 ? `${t.attachments} file(s)` : "—" },
      ...(t.stageWho ? [{ value: `with ${t.stageWho}` }] : []),
      ...(t.extensionWaiting ? [{ value: "extension waiting" }] : []),
    ],
    status: {
      label: t.stage ?? STATUS_LABEL[t.status] ?? t.status,
      tone: TASK_STATUS_TONE[t.status] ?? "draft",
    },
    actions: taskRowActions({ id: t.id, status: t.status, mine }),
  };
}
