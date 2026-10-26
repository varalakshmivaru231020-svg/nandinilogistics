import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The SOW's task notifications, as one function per event: on assignment, on
 * a status change or a remark, and on the due date.
 *
 * Every one goes in-app, which is what this application has. Push is the
 * other channel the SOW asks for; when a sender is added it belongs behind
 * this same call, so the events do not have to be found again.
 *
 * Nobody is told about their own action: being notified of a thing you just did
 * is noise, and it is how a notification list stops being read.
 */
export type TaskEventKind =
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "COMMENTED"
  | "DUE_SOON"
  | "OVERDUE";

export interface TaskNotice {
  kind: TaskEventKind;
  taskId: string;
  taskNo: string;
  title: string;
  body?: string;
  /** Who should hear about it. The actor is dropped from this list. */
  to: string[];
  actorId?: string;
}

/** Writes one notice to everyone who should get it, except whoever caused it. */
export async function notifyTask(tx: Tx, notice: TaskNotice): Promise<number> {
  const recipients = [...new Set(notice.to)].filter((id) => id && id !== notice.actorId);
  if (recipients.length === 0) return 0;

  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      kind: `TASK_${notice.kind}`,
      title: notice.title,
      body: notice.body ?? null,
      href: `/tasks/${notice.taskId}`,
      entity: "Task",
      entityId: notice.taskId,
    })),
  });
  return recipients.length;
}

/**
 * Who hears about a change on a task.
 *
 * The Team Leaders hear they were given it; everybody on it hears about a
 * status change, a remark, or a due date — minus the actor, which
 * `notifyTask` removes.
 */
export function audienceFor(
  kind: TaskEventKind,
  task: { assigneeIds: string[]; createdById: string },
): string[] {
  switch (kind) {
    case "ASSIGNED":
      return [...task.assigneeIds];
    case "STATUS_CHANGED":
    case "COMMENTED":
    case "DUE_SOON":
    case "OVERDUE":
      return [...task.assigneeIds, task.createdById];
  }
}
