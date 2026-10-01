import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The scope document's notification table, as one function per event.
 *
 * Every one goes in-app, which is what this application has. Email is the other
 * channel the scope asks for and there is no mail transport here yet; when one
 * is added it belongs behind this same call, so the events do not have to be
 * found again.
 *
 * Nobody is told about their own action: being notified of a thing you just did
 * is noise, and it is how a notification list stops being read.
 */
export type TaskEventKind =
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "COMMENTED"
  | "EXTENSION_REQUESTED"
  | "EXTENSION_DECIDED"
  | "DUE_SOON"
  | "OVERDUE"
  | "LEVEL_ACTIVE"
  | "CHECKLIST_FAILED"
  | "CLOSED";

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
 * The scope names the other party on most events: the Assigner hears what the
 * Assignee did and the other way round. Levels hear only when it reaches them,
 * except a failure, which both parties are told about.
 */
export function audienceFor(
  kind: TaskEventKind,
  task: { assigneeId: string; createdById: string },
  levelUserIds: string[] = [],
): string[] {
  switch (kind) {
    case "ASSIGNED":
      return [task.assigneeId];
    case "EXTENSION_REQUESTED":
      return [task.createdById];
    case "EXTENSION_DECIDED":
    case "CLOSED":
      return [task.assigneeId];
    case "LEVEL_ACTIVE":
      return levelUserIds;
    case "DUE_SOON":
    case "OVERDUE":
    case "CHECKLIST_FAILED":
      return [task.assigneeId, task.createdById];
    case "STATUS_CHANGED":
    case "COMMENTED":
      // Both sides, minus the actor, which notifyTask removes.
      return [task.assigneeId, task.createdById];
  }
}
