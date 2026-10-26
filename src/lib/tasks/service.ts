import type { Prisma, PrismaClient, TaskStatus } from "@prisma/client";

import { isOverdue, STATUS_LABEL, type TaskShape } from "./lifecycle";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The writes behind a task's lifecycle.
 *
 * Takes its transaction client, so the arithmetic — who may act, what the
 * summary per Team Leader comes to — is testable without a request, and an
 * action stays a permission check and a state check.
 */

/** The task as the lifecycle rules need to see it. */
export async function shapeOf(tx: Tx, taskId: string): Promise<TaskShape & { id: string }> {
  const t = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true, status: true, createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  return {
    id: t.id,
    status: t.status,
    createdById: t.createdById,
    assigneeIds: t.assignees.map((a) => a.userId),
  };
}

/** Writes one line of the task's history. Every change goes through here. */
export async function logTaskEvent(
  tx: Tx,
  input: {
    taskId: string;
    actorId: string;
    kind: string;
    summary: string;
    remark?: string | null;
    fromStatus?: TaskStatus | null;
    toStatus?: TaskStatus | null;
  },
): Promise<void> {
  await tx.taskEvent.create({
    data: {
      taskId: input.taskId,
      actorId: input.actorId,
      kind: input.kind,
      summary: input.summary,
      remark: input.remark ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
    },
  });
}

/**
 * Moves a task to a new status and records it.
 *
 * The status and its history are written together so a task can never show a
 * state nobody is recorded as having set.
 */
export async function moveStatus(
  tx: Tx,
  input: {
    taskId: string;
    actorId: string;
    from: TaskStatus;
    to: TaskStatus;
    remark?: string | null;
    extra?: Prisma.TaskUpdateInput;
  },
): Promise<void> {
  await tx.task.update({
    where: { id: input.taskId },
    data: { status: input.to, ...(input.extra ?? {}) },
  });
  await logTaskEvent(tx, {
    taskId: input.taskId,
    actorId: input.actorId,
    kind: "STATUS",
    summary: `${STATUS_LABEL[input.from]} → ${STATUS_LABEL[input.to]}`,
    remark: input.remark,
    fromStatus: input.from,
    toStatus: input.to,
  });
}

export interface TeamLeaderTaskSummary {
  userId: string;
  name: string;
  open: number;
  inProgress: number;
  overdue: number;
  done: number;
}

/**
 * The counts per Team Leader behind the Admin dashboard's task card —
 * open, in progress, overdue and done, with overdue counted on top of
 * whichever open status the task is in.
 */
export function summariseByAssignee(
  rows: Array<{
    status: TaskStatus;
    dueAt: Date | string;
    assignees: Array<{ userId: string; name: string }>;
  }>,
  nowMs: number,
): TeamLeaderTaskSummary[] {
  const by = new Map<string, TeamLeaderTaskSummary>();
  for (const t of rows) {
    for (const a of t.assignees) {
      const s = by.get(a.userId) ?? {
        userId: a.userId, name: a.name, open: 0, inProgress: 0, overdue: 0, done: 0,
      };
      if (t.status === "DONE") s.done += 1;
      else if (t.status === "IN_PROGRESS") s.inProgress += 1;
      else s.open += 1;
      if (isOverdue(t, nowMs)) s.overdue += 1;
      by.set(a.userId, s);
    }
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Reads every task and sums it per Team Leader, for the Admin dashboard. */
export async function taskSummaryByTeamLeader(
  db: Tx,
  nowMs: number,
): Promise<TeamLeaderTaskSummary[]> {
  const rows = await db.task.findMany({
    select: {
      status: true, dueAt: true,
      assignees: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  return summariseByAssignee(
    rows.map((t) => ({
      status: t.status,
      dueAt: t.dueAt,
      assignees: t.assignees.map((a) => ({ userId: a.userId, name: a.user.name })),
    })),
    nowMs,
  );
}
