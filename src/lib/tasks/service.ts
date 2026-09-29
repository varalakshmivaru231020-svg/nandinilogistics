import type { Prisma, PrismaClient, TaskStatus } from "@prisma/client";

import { effectiveDueAt } from "./performance";
import { STATUS_LABEL, type TaskShape } from "./lifecycle";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * The writes behind a task's lifecycle.
 *
 * Takes its transaction client, so the arithmetic that matters — what an
 * extension does to the date performance is measured against, which level acts
 * next — is testable without a request, and an action stays a permission check
 * and a state check.
 */

/** The task as the lifecycle rules need to see it. */
export async function shapeOf(tx: Tx, taskId: string): Promise<TaskShape & { id: string }> {
  const t = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      id: true, kind: true, status: true, round: true, assigneeId: true, createdById: true,
      levels: { select: { kind: true, level: true, userId: true } },
    },
  });
  return t;
}

/** Which levels have already acted in the round now running. */
export async function actedThisRound(
  tx: Tx,
  taskId: string,
  round: number,
): Promise<Array<{ kind: "REVIEW" | "APPROVAL"; level: number }>> {
  const rows = await tx.taskLevelAction.findMany({
    where: { round, level: { taskId } },
    select: { level: { select: { kind: true, level: true } } },
  });
  return rows.map((r) => ({ kind: r.level.kind, level: r.level.level }));
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

/**
 * Applies an Assigner's decision on an extension.
 *
 * The revised date moves what the Assignee works to; the effective date moves
 * only when the delay was outside their control, and is recomputed from every
 * approved extension rather than adjusted, so it cannot drift.
 */
export async function applyExtensionDecision(
  tx: Tx,
  input: {
    extensionId: string;
    actorId: string;
    approve: boolean;
    remark: string;
    control?: "CONTROLLABLE" | "UNCONTROLLABLE";
    revisedDueAt?: Date;
  },
): Promise<{ taskId: string; status: TaskStatus }> {
  const ext = await tx.taskExtension.findUniqueOrThrow({
    where: { id: input.extensionId },
    select: {
      id: true, taskId: true, status: true, isHoldRequest: true, proposedDueAt: true,
      task: { select: { status: true, originalDueAt: true, dueAt: true } },
    },
  });
  if (ext.status !== "REQUESTED") throw new Error("This request has already been decided.");

  if (!input.approve) {
    await tx.taskExtension.update({
      where: { id: ext.id },
      data: {
        status: "REJECTED",
        decidedById: input.actorId,
        decidedAt: new Date(),
        decisionRemark: input.remark,
      },
    });
    await logTaskEvent(tx, {
      taskId: ext.taskId, actorId: input.actorId, kind: "EXTENSION",
      summary: "Extension rejected", remark: input.remark,
    });
    // A rejected request changes nothing: the task keeps its status and date.
    return { taskId: ext.taskId, status: ext.task.status };
  }

  if (!input.control) throw new Error("Classify the delay as controllable or uncontrollable.");
  const revised = input.revisedDueAt ?? ext.proposedDueAt;

  await tx.taskExtension.update({
    where: { id: ext.id },
    data: {
      status: "APPROVED",
      decidedById: input.actorId,
      decidedAt: new Date(),
      decisionRemark: input.remark,
      control: input.control,
      revisedDueAt: revised,
    },
  });

  const approved = await tx.taskExtension.findMany({
    where: { taskId: ext.taskId, status: "APPROVED" },
    select: { control: true, previousDueAt: true, revisedDueAt: true },
    orderBy: { decidedAt: "asc" },
  });
  const effective = effectiveDueAt(ext.task.originalDueAt, approved);

  // An approved hold request is what actually pauses the task; a plain
  // extension leaves the status where it was.
  const status: TaskStatus = ext.isHoldRequest ? "HOLD" : ext.task.status;

  await tx.task.update({
    where: { id: ext.taskId },
    data: { dueAt: revised, effectiveDueAt: effective, status },
  });

  await logTaskEvent(tx, {
    taskId: ext.taskId,
    actorId: input.actorId,
    kind: "EXTENSION",
    summary:
      `Extension approved — due ${revised.toISOString().slice(0, 10)}, ` +
      `${input.control === "CONTROLLABLE" ? "controllable" : "uncontrollable"}`,
    remark: input.remark,
    fromStatus: ext.task.status,
    toStatus: status,
  });

  return { taskId: ext.taskId, status };
}

/** Whether every mandatory checklist item on a task has been answered. */
export async function checklistComplete(tx: Tx, taskId: string): Promise<boolean> {
  const items = await tx.taskChecklistItem.findMany({
    where: { taskChecklist: { taskId } },
    select: {
      answeredAt: true,
      checkpoint: { select: { isMandatory: true, needsFile: true } },
      attachments: { select: { id: true } },
    },
  });
  return items.every((i) => {
    if (!i.checkpoint.isMandatory) return true;
    if (!i.answeredAt) return false;
    if (i.checkpoint.needsFile && i.attachments.length === 0) return false;
    return true;
  });
}
