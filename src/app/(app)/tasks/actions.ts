"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";
import { canDo, type TaskAction } from "@/lib/tasks/lifecycle";
import { logTaskEvent, moveStatus, shapeOf } from "@/lib/tasks/service";
import { assertStorable, filesFrom } from "@/lib/tasks/attachments";
import { audienceFor, notifyTask, type TaskEventKind } from "@/lib/tasks/notify";
import { put } from "@/lib/storage";

/**
 * Task Management, to the SOW's §3.9.
 *
 * Each action checks two things and then does the work: the permission code,
 * which says whether this person may ever take this action, and the lifecycle,
 * which says whether they may take it on this task, at this status, as whoever
 * they are to it. Both have to pass — a code alone would let any Team Leader
 * finish anybody's task.
 */

const REFRESH = ["/tasks", "/dashboard"];
function refresh(id?: string) {
  for (const p of REFRESH) revalidatePath(p);
  if (id) revalidatePath(`/tasks/${id}`);
}

/** Tells whoever the SOW says should hear about a change. */
async function tell(
  tx: Parameters<typeof notifyTask>[0],
  kind: TaskEventKind,
  taskId: string,
  actorId: string,
  title: string,
  body?: string,
) {
  const t = await tx.task.findUnique({
    where: { id: taskId },
    select: { taskNo: true, createdById: true, assignees: { select: { userId: true } } },
  });
  if (!t) return;
  await notifyTask(tx, {
    kind, taskId, taskNo: t.taskNo, title, body, actorId,
    to: audienceFor(kind, {
      createdById: t.createdById,
      assigneeIds: t.assignees.map((a) => a.userId),
    }),
  });
}

/** The lifecycle check, in the shape the actions need. */
async function assertMay(action: TaskAction, taskId: string, userId: string, isAdmin: boolean) {
  const shape = await shapeOf(prisma, taskId);
  if (!canDo(action, shape, { userId, isAdmin })) {
    throw new Error("That is not yours to do on this task, at least not yet.");
  }
  return { shape };
}

/** Admin is whoever may see every task — the SOW's one role with full control. */
function isAdminOf(ctx: { has: (code: string) => boolean }) {
  return ctx.has(PERM.task.task.viewAll);
}

// --------------------------------------------------------------------------
// Creating and editing — Admin's
// --------------------------------------------------------------------------

const TaskSchema = z.object({
  title: z.string().trim().min(3, "A task title is required"),
  description: z.string().trim().optional(),
  dueAt: z.string().min(1, "A due date and time is required"),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

function assigneesFrom(formData: FormData): string[] {
  const ids = [...new Set(formData.getAll("assigneeIds").map(String).map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error("Assign the task to at least one Team Leader.");
  return ids;
}

async function assertTeamLeaders(ids: string[]) {
  const found = await prisma.user.count({ where: { id: { in: ids }, status: "ACTIVE" } });
  if (found !== ids.length) throw new Error("One of those people is not an active user.");
}

export async function createTaskAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.create);
    const parsed = TaskSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const due = new Date(v.dueAt);
    if (Number.isNaN(due.getTime())) throw new Error("That due date is not a date.");
    if (due.getTime() <= Date.now()) throw new Error("The due date must be in the future.");

    const assigneeIds = assigneesFrom(formData);
    await assertTeamLeaders(assigneeIds);

    const files = filesFrom(formData);
    assertStorable(files);

    const task = await prisma.$transaction(async (tx) => {
      const taskNo = await nextDocumentNumber(tx, "TASK");
      const created = await tx.task.create({
        data: {
          taskNo,
          title: v.title,
          description: v.description || null,
          priority: v.priority,
          status: "OPEN",
          dueAt: due,
          createdById: ctx.id,
          assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        },
      });
      await logTaskEvent(tx, {
        taskId: created.id, actorId: ctx.id, kind: "STATUS",
        summary: "Task raised and assigned", toStatus: "OPEN",
      });
      await tell(tx, "ASSIGNED", created.id, ctx.id,
        `New task ${created.taskNo}: ${created.title}`,
        `Due ${due.toLocaleString("en-IN")}.`);
      return created;
    });

    for (const file of files) {
      const stored = await put(`task-${task.id}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
      await prisma.taskAttachment.create({
        data: {
          taskId: task.id, storageKey: stored.key, fileName: file.name,
          fileSize: file.size, mimeType: file.type || null, uploadedById: ctx.id,
        },
      });
    }

    await recordAudit({
      action: "CREATE", entity: "Task", entityId: task.id, userId: ctx.id,
      summary: `Raised task ${task.taskNo} — ${task.title}`,
    });
    refresh();
    return { id: task.id };
  });
}

export async function updateTaskAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.update);
    const { shape } = await assertMay("edit", id, ctx.id, isAdminOf(ctx));

    const parsed = TaskSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    const due = new Date(v.dueAt);
    if (Number.isNaN(due.getTime())) throw new Error("That due date is not a date.");

    const assigneeIds = assigneesFrom(formData);
    await assertTeamLeaders(assigneeIds);
    const added = assigneeIds.filter((a) => !shape.assigneeIds.includes(a));

    const before = await prisma.task.findUniqueOrThrow({ where: { id }, select: { taskNo: true } });
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          title: v.title,
          description: v.description || null,
          priority: v.priority,
          dueAt: due,
          assignees: {
            deleteMany: { userId: { notIn: assigneeIds } },
            createMany: { data: added.map((userId) => ({ userId })), skipDuplicates: true },
          },
        },
      });
      await logTaskEvent(tx, {
        taskId: id, actorId: ctx.id, kind: "STATUS", summary: "Task details edited",
      });
      if (added.length > 0) {
        const t = await tx.task.findUniqueOrThrow({ where: { id }, select: { taskNo: true, title: true } });
        await notifyTask(tx, {
          kind: "ASSIGNED", taskId: id, taskNo: t.taskNo, actorId: ctx.id,
          title: `New task ${t.taskNo}: ${t.title}`, to: added,
        });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: id, userId: ctx.id,
      summary: `Edited task ${before.taskNo}`,
    });
    refresh(id);
    return null;
  });
}

// --------------------------------------------------------------------------
// The Team Leader's steps
// --------------------------------------------------------------------------

export async function startTaskAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.start);
    const { shape } = await assertMay("start", id, ctx.id, isAdminOf(ctx));
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "IN_PROGRESS",
        extra: { startedAt: new Date() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, "Task started");
    });
    refresh(id);
    return null;
  });
}

export async function completeTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const { shape } = await assertMay("complete", id, ctx.id, isAdminOf(ctx));
    if (!remark.trim()) throw new Error("A remark is required to mark a task done.");

    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "DONE", remark,
        extra: { completedAt: new Date(), completionRemark: remark.trim() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, "Task marked done", remark.trim());
    });
    refresh(id);
    return null;
  });
}

// --------------------------------------------------------------------------
// Admin's second look
// --------------------------------------------------------------------------

export async function reopenTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.reopen);
    const { shape } = await assertMay("reopen", id, ctx.id, isAdminOf(ctx));
    if (!remark.trim()) throw new Error("Say why it is being reopened.");
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "OPEN", remark,
        extra: { completedAt: null, completionRemark: null },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, "Task reopened", remark.trim());
    });
    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: id, userId: ctx.id,
      summary: `Reopened a finished task: ${remark.trim()}`,
    });
    refresh(id);
    return null;
  });
}

// --------------------------------------------------------------------------
// Remarks
// --------------------------------------------------------------------------

export async function addCommentAction(taskId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.comment);
    await assertMay("comment", taskId, ctx.id, isAdminOf(ctx));
    const body = String(formData.get("body") ?? formData.get("remark") ?? "").trim();
    if (!body) throw new Error("Write something first.");

    const files = filesFrom(formData);
    assertStorable(files);

    const comment = await prisma.$transaction(async (tx) => {
      const c = await tx.taskComment.create({ data: { taskId, authorId: ctx.id, body } });
      await logTaskEvent(tx, {
        taskId, actorId: ctx.id, kind: "COMMENT", summary: "Remark added",
      });
      await tell(tx, "COMMENTED", taskId, ctx.id, "New remark", body.slice(0, 140));
      return c;
    });

    for (const file of files) {
      const stored = await put(`task-${taskId}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
      await prisma.taskAttachment.create({
        data: {
          taskId, commentId: comment.id, storageKey: stored.key, fileName: file.name,
          fileSize: file.size, mimeType: file.type || null, uploadedById: ctx.id,
        },
      });
    }

    refresh(taskId);
    return null;
  });
}

export async function editCommentAction(commentId: string, body: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.comment);
    const before = await prisma.taskComment.findUniqueOrThrow({
      where: { id: commentId }, select: { authorId: true, body: true, taskId: true },
    });
    if (before.authorId !== ctx.id) throw new Error("Only whoever wrote a remark can edit it.");
    if (!body.trim()) throw new Error("A remark cannot be emptied — delete it instead.");

    await prisma.$transaction(async (tx) => {
      // What it said before is kept, so an edit cannot rewrite the record.
      await tx.taskCommentEdit.create({ data: { commentId, body: before.body } });
      await tx.taskComment.update({
        where: { id: commentId }, data: { body: body.trim(), editedAt: new Date() },
      });
    });
    refresh(before.taskId);
    return null;
  });
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.comment);
    const before = await prisma.taskComment.findUniqueOrThrow({
      where: { id: commentId }, select: { taskId: true, authorId: true },
    });
    // Your own words, or Admin's call.
    if (before.authorId !== ctx.id && !isAdminOf(ctx)) {
      throw new Error("Only whoever wrote a remark, or an Admin, can delete it.");
    }
    await prisma.taskComment.delete({ where: { id: commentId } });
    await recordAudit({
      action: "DELETE", entity: "TaskComment", entityId: commentId, userId: ctx.id,
      summary: "Deleted a task remark",
    });
    refresh(before.taskId);
    return null;
  });
}

// --------------------------------------------------------------------------
// Deleting
// --------------------------------------------------------------------------

/**
 * Deleting tasks.
 *
 * A task that has been finished is a record of what happened, so only an open
 * one can be removed.
 */
export async function deleteTasksAction(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.delete);
    if (ids.length === 0) throw new Error("Nothing selected.");

    const tasks = await prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, taskNo: true, status: true },
    });
    const done = tasks.filter((t) => t.status === "DONE");
    if (done.length > 0) {
      throw new Error(
        `${done.map((t) => t.taskNo).join(", ")} ${done.length === 1 ? "is" : "are"} already done. ` +
        "A finished task is the record — reopen it instead if it is wrong.",
      );
    }

    await prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
    await recordAudit({
      action: "DELETE", entity: "Task", entityId: tasks[0]?.id ?? "-", userId: ctx.id,
      summary: `Deleted ${tasks.length} task(s): ${tasks.map((t) => t.taskNo).join(", ")}`,
    });
    refresh();
    return { deleted: tasks.length };
  });
}
