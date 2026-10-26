import type { Prisma, PrismaClient } from "@prisma/client";

import { notifyTask } from "./notify";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The SOW's due-date notification: a reminder before the due time, an alert at
 * it, and a daily alert while a task stays overdue.
 *
 * Whether a notice is due is decided here and tested; the sweep only reads and
 * writes. A task is told about once per day at most, which is what stops a
 * daily alert becoming an hourly one when the sweep runs often.
 */
export interface SweepTask {
  id: string;
  taskNo: string;
  title: string;
  status: string;
  dueAt: Date | string;
  assigneeIds: string[];
  createdById: string;
  /** When this task was last alerted about, from its notifications. */
  lastAlertAt: Date | string | null;
}

export type Alert = { kind: "DUE_SOON" | "OVERDUE"; task: SweepTask; daysOverdue: number };

const DAY = 86_400_000;
const OPEN = ["OPEN", "IN_PROGRESS"];

/**
 * Which tasks need telling about now.
 *
 * `soonHours` is how long before the due time the reminder goes out; the SOW
 * leaves the timings to Admin, so they are arguments rather than constants.
 */
export function alertsDue(
  tasks: SweepTask[],
  nowMs: number,
  { soonHours = 24 }: { soonHours?: number } = {},
): Alert[] {
  const out: Alert[] = [];

  for (const t of tasks) {
    if (!OPEN.includes(t.status)) continue;
    const due = new Date(t.dueAt).getTime();
    const last = t.lastAlertAt ? new Date(t.lastAlertAt).getTime() : null;

    // At most one notice a day per task, whatever kind it is.
    if (last !== null && nowMs - last < DAY) continue;

    if (due <= nowMs) {
      out.push({ kind: "OVERDUE", task: t, daysOverdue: Math.floor((nowMs - due) / DAY) });
      continue;
    }
    if (due - nowMs <= soonHours * 3_600_000) {
      out.push({ kind: "DUE_SOON", task: t, daysOverdue: 0 });
    }
  }
  return out;
}

/** Runs the sweep: reads what is open, decides, and writes the notices. */
export async function sweepOverdueTasks(
  tx: Tx,
  nowMs: number = Date.now(),
): Promise<{ checked: number; alerted: number }> {
  const tasks = await tx.task.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: {
      id: true, taskNo: true, title: true, status: true, dueAt: true, createdById: true,
      assignees: { select: { userId: true } },
    },
  });

  const shaped: SweepTask[] = [];
  for (const t of tasks) {
    const last = await tx.notification.findFirst({
      where: { entity: "Task", entityId: t.id, kind: { in: ["TASK_DUE_SOON", "TASK_OVERDUE"] } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    shaped.push({
      id: t.id, taskNo: t.taskNo, title: t.title, status: t.status, dueAt: t.dueAt,
      createdById: t.createdById,
      assigneeIds: t.assignees.map((a) => a.userId),
      lastAlertAt: last?.createdAt ?? null,
    });
  }

  const due = alertsDue(shaped, nowMs);
  for (const a of due) {
    await notifyTask(tx, {
      kind: a.kind,
      taskId: a.task.id,
      taskNo: a.task.taskNo,
      title:
        a.kind === "OVERDUE"
          ? `Overdue: ${a.task.taskNo} — ${a.task.title}`
          : `Due soon: ${a.task.taskNo} — ${a.task.title}`,
      body:
        a.kind === "OVERDUE"
          ? `${a.daysOverdue === 0 ? "Due today and not done" : `${a.daysOverdue} day(s) overdue`}.`
          : "Due within the day.",
      to: [...a.task.assigneeIds, a.task.createdById],
    });
  }

  return { checked: tasks.length, alerted: due.length };
}
