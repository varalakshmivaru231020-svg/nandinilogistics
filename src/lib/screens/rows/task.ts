import "server-only";

import type { TaskStatus } from "@prisma/client";

import type { RecordAction } from "@/lib/records/types";
import { isOverdue, STATUS_LABEL } from "@/lib/tasks/lifecycle";
import { TASK_PRIORITY_TONE, TASK_STATUS_TONE } from "@/lib/tasks/list-display";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDateTime } from "@/lib/utils";

/**
 * The task row, as the table in `tasks-screen.tsx` draws one: the title, the
 * task number, who has it, when it is due — in the overdue tone once it is
 * late — its priority, how many files are attached, and its status.
 */

export interface TaskRowInput {
  id: string;
  taskNo: string;
  title: string;
  assignees: string;
  dueAt: Date | string;
  status: TaskStatus;
  priority: string;
  attachments: number;
}

/**
 * The one button the web's task row carries.
 *
 * `RowAction` in `tasks-screen.tsx` reads two facts and nothing else: the task
 * is yours, and it is Open (Start). It does not ask `canDo` — and it does not
 * have to, because `startTaskAction` asks it again inside the action.
 */
export function taskRowActions(t: {
  id: string;
  status: TaskStatus;
  mine: boolean;
}): RecordAction[] {
  if (t.mine && t.status === "OPEN") {
    return [{
      key: "start",
      label: "Start",
      emphasis: "primary",
      action: "tasks/startTask",
      args: [t.id],
      remark: "none",
      confirm: "It moves to In progress, and Admin is told.",
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
      { text: t.priority[0] + t.priority.slice(1).toLowerCase(), tone: TASK_PRIORITY_TONE[t.priority] ?? "draft" },
    ],
    meta: t.taskNo,
    lines: [
      { label: "Assigned to", value: t.assignees },
      { label: "Due", value: formatDateTime(t.dueAt) + (over ? " · overdue" : "") },
      { label: "Files", value: t.attachments > 0 ? `${t.attachments} file(s)` : "—" },
    ],
    status: {
      label: STATUS_LABEL[t.status] ?? t.status,
      tone: TASK_STATUS_TONE[t.status] ?? "draft",
    },
    actions: taskRowActions({ id: t.id, status: t.status, mine }),
  };
}
