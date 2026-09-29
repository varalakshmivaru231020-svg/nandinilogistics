"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { canDo, statusAfterComplete, statusAfterLevel, type TaskAction } from "@/lib/tasks/lifecycle";
import {
  actedThisRound, applyExtensionDecision, checklistComplete, logTaskEvent, moveStatus, shapeOf,
} from "@/lib/tasks/service";
import { assertStorable, filesFrom } from "@/lib/material/grn-attachments";
import { put } from "@/lib/storage";

/**
 * Task Management, to the scope document.
 *
 * Each action checks two things and then does the work: the permission code,
 * which says whether this person may ever take this action, and the lifecycle,
 * which says whether they may take it on this task, at this status, as whoever
 * they are to it. Both have to pass — a code alone would let any Assignee close
 * anybody's task.
 */

const REFRESH = ["/tasks", "/dashboard"];
function refresh(id?: string) {
  for (const p of REFRESH) revalidatePath(p);
  if (id) revalidatePath(`/tasks/${id}`);
}

/** The lifecycle check, in the shape the actions need. */
async function assertMay(action: TaskAction, taskId: string, userId: string, isAdmin: boolean) {
  const shape = await shapeOf(prisma, taskId);
  const acted = await actedThisRound(prisma, taskId, shape.round);
  if (!canDo(action, shape, { userId, isAdmin }, acted)) {
    throw new Error("That is not yours to do on this task, at least not yet.");
  }
  return { shape, acted };
}

async function isAdminOf(ctx: { has: (code: string) => boolean }) {
  return ctx.has(PERM.task.task.reopen);
}

// --------------------------------------------------------------------------
// Creating and editing
// --------------------------------------------------------------------------

const TaskSchema = z.object({
  title: z.string().trim().min(3, "A task title is required"),
  description: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
  location: z.string().trim().optional(),
  assigneeId: z.string().min(1, "An assignee is required"),
  dueAt: z.string().min(1, "A due date and time is required"),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export async function createTaskAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.create);
    const parsed = TaskSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const due = new Date(v.dueAt);
    if (Number.isNaN(due.getTime())) throw new Error("That due date is not a date.");
    if (due.getTime() <= Date.now()) throw new Error("The due date must be in the future.");

    const checklistIds = formData.getAll("checklistIds").map(String).filter(Boolean);
    const reviewers = formData.getAll("reviewerIds").map(String).filter(Boolean);
    const approvers = formData.getAll("approverIds").map(String).filter(Boolean);
    const isChecklist = checklistIds.length > 0;

    if (isChecklist && reviewers.length === 0 && approvers.length === 0) {
      throw new Error("A checklist task needs at least one reviewer or approver.");
    }
    for (const [label, list] of [["reviewer", reviewers], ["approver", approvers]] as const) {
      if (new Set(list).size !== list.length) {
        throw new Error(`The same person is on two ${label} levels.`);
      }
    }

    const files = filesFrom(formData);
    assertStorable(files);

    const task = await prisma.$transaction(async (tx) => {
      const count = await tx.task.count();
      const created = await tx.task.create({
        data: {
          taskNo: `T-${String(1000 + count + 1)}`,
          title: v.title,
          description: v.description || null,
          kind: isChecklist ? "CHECKLIST" : "STANDALONE",
          projectId: v.projectId || null,
          location: v.location || null,
          assigneeId: v.assigneeId,
          priority: v.priority,
          status: "PENDING",
          dueAt: due,
          originalDueAt: due,
          effectiveDueAt: due,
          createdById: ctx.id,
        },
      });

      for (const [i, checklistId] of checklistIds.entries()) {
        const list = await tx.checklist.findUnique({
          where: { id: checklistId },
          select: { isActive: true, checkpoints: { select: { id: true } } },
        });
        if (!list) throw new Error("That checklist no longer exists.");
        if (!list.isActive) throw new Error("That checklist is no longer active.");
        const mapped = await tx.taskChecklist.create({
          data: { taskId: created.id, checklistId, sortOrder: i },
        });
        // The items are copied onto the task now, so editing the master later
        // never changes a task already created from it.
        for (const cp of list.checkpoints) {
          await tx.taskChecklistItem.create({
            data: { taskChecklistId: mapped.id, checkpointId: cp.id },
          });
        }
      }

      for (const [i, userId] of reviewers.entries()) {
        await tx.taskLevel.create({ data: { taskId: created.id, kind: "REVIEW", level: i + 1, userId } });
      }
      for (const [i, userId] of approvers.entries()) {
        await tx.taskLevel.create({ data: { taskId: created.id, kind: "APPROVAL", level: i + 1, userId } });
      }

      await logTaskEvent(tx, {
        taskId: created.id, actorId: ctx.id, kind: "STATUS",
        summary: `Task raised and assigned`, toStatus: "PENDING",
      });
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
    await assertMay("edit", id, ctx.id, await isAdminOf(ctx));

    const parsed = TaskSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    const due = new Date(v.dueAt);
    if (Number.isNaN(due.getTime())) throw new Error("That due date is not a date.");

    const before = await prisma.task.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          title: v.title,
          description: v.description || null,
          projectId: v.projectId || null,
          location: v.location || null,
          assigneeId: v.assigneeId,
          priority: v.priority,
          // Editing before work starts resets all three dates: nothing has been
          // extended yet, so there is no history to preserve.
          dueAt: due,
          originalDueAt: due,
          effectiveDueAt: due,
        },
      });
      await logTaskEvent(tx, {
        taskId: id, actorId: ctx.id, kind: "STATUS", summary: "Task details edited",
      });
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
// The Assignee's steps
// --------------------------------------------------------------------------

export async function acceptTaskAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.accept);
    const { shape } = await assertMay("accept", id, ctx.id, await isAdminOf(ctx));
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "ACCEPTED",
        extra: { acceptedAt: new Date() },
      }),
    );
    refresh(id);
    return null;
  });
}

export async function startTaskAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.start);
    const { shape } = await assertMay("start", id, ctx.id, await isAdminOf(ctx));
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "STARTED",
        extra: { startedAt: new Date() },
      }),
    );
    refresh(id);
    return null;
  });
}

export async function completeTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const { shape } = await assertMay("complete", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("A closure remark is required to complete a task.");

    if (shape.kind === "CHECKLIST" && !(await checklistComplete(prisma, id))) {
      throw new Error("Answer every mandatory checklist item, with its photo, before completing.");
    }

    const to = statusAfterComplete(shape);
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to, remark,
        extra: { completedAt: new Date(), completionRemark: remark.trim() },
      }),
    );
    refresh(id);
    return null;
  });
}

export async function resubmitTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const { shape } = await assertMay("resubmit", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("Say what was corrected before resubmitting.");
    if (!(await checklistComplete(prisma, id))) {
      throw new Error("Answer every mandatory checklist item, with its photo, before resubmitting.");
    }

    // A resubmission is a new round, and the flow restarts at Reviewer Level 1.
    const to = statusAfterComplete(shape);
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to, remark,
        extra: { round: { increment: 1 }, completedAt: new Date(), completionRemark: remark.trim() },
      }),
    );
    refresh(id);
    return null;
  });
}

// --------------------------------------------------------------------------
// The Assigner's decisions
// --------------------------------------------------------------------------

export async function closeTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.close);
    const { shape } = await assertMay("close", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("A remark is required when closing a task.");
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "CLOSED", remark,
        extra: { closedAt: new Date(), closureRemark: remark.trim() },
      }),
    );
    refresh(id);
    return null;
  });
}

export async function sendBackTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.sendBack);
    const { shape } = await assertMay("sendBack", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("Say what needs redoing — the remark is required.");
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "STARTED", remark,
        extra: { completedAt: null, closureRemark: remark.trim() },
      }),
    );
    refresh(id);
    return null;
  });
}

export async function reopenTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.reopen);
    const { shape } = await assertMay("reopen", id, ctx.id, true);
    if (!remark.trim()) throw new Error("Say why it is being reopened.");
    await prisma.$transaction((tx) =>
      moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "STARTED", remark,
        extra: { closedAt: null },
      }),
    );
    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: id, userId: ctx.id,
      summary: `Reopened a closed task: ${remark.trim()}`,
    });
    refresh(id);
    return null;
  });
}

// --------------------------------------------------------------------------
// Extensions, and the Hold that goes through one
// --------------------------------------------------------------------------

export async function requestExtensionAction(
  id: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.requestExtension);
    await assertMay("requestExtension", id, ctx.id, await isAdminOf(ctx));

    const proposed = new Date(String(formData.get("proposedDueAt") ?? ""));
    const reason = String(formData.get("reason") ?? "").trim();
    const isHold = String(formData.get("isHoldRequest") ?? "") === "on";
    const resumeRaw = String(formData.get("expectedResumeAt") ?? "").trim();

    if (Number.isNaN(proposed.getTime())) throw new Error("Give the date you are proposing.");
    if (!reason) throw new Error("A reason is required.");

    const open = await prisma.taskExtension.count({ where: { taskId: id, status: "REQUESTED" } });
    if (open > 0) throw new Error("There is already a request waiting on this task.");

    const task = await prisma.task.findUniqueOrThrow({ where: { id }, select: { dueAt: true } });
    const files = filesFrom(formData);
    assertStorable(files);

    const ext = await prisma.$transaction(async (tx) => {
      const created = await tx.taskExtension.create({
        data: {
          taskId: id,
          requestedById: ctx.id,
          proposedDueAt: proposed,
          reason,
          isHoldRequest: isHold,
          expectedResumeAt: resumeRaw ? new Date(resumeRaw) : null,
          previousDueAt: task.dueAt,
        },
      });
      await logTaskEvent(tx, {
        taskId: id, actorId: ctx.id, kind: "EXTENSION",
        summary: isHold ? "Hold requested" : "Extension requested", remark: reason,
      });
      return created;
    });

    for (const file of files) {
      const stored = await put(`task-${id}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
      await prisma.taskAttachment.create({
        data: {
          taskId: id, extensionId: ext.id, storageKey: stored.key, fileName: file.name,
          fileSize: file.size, mimeType: file.type || null, uploadedById: ctx.id,
        },
      });
    }

    refresh(id);
    return null;
  });
}

export async function decideExtensionAction(
  extensionId: string,
  approve: boolean,
  remark: string,
  control?: "CONTROLLABLE" | "UNCONTROLLABLE",
  revisedDueAt?: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.approveExtension);
    const ext = await prisma.taskExtension.findUniqueOrThrow({
      where: { id: extensionId }, select: { taskId: true },
    });
    await assertMay("decideExtension", ext.taskId, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("A remark is required on the decision.");
    if (approve && !control) throw new Error("Classify the delay as controllable or uncontrollable.");

    await prisma.$transaction((tx) =>
      applyExtensionDecision(tx, {
        extensionId,
        actorId: ctx.id,
        approve,
        remark: remark.trim(),
        control,
        revisedDueAt: revisedDueAt ? new Date(revisedDueAt) : undefined,
      }),
    );
    refresh(ext.taskId);
    return null;
  });
}

// --------------------------------------------------------------------------
// Review and approval levels
// --------------------------------------------------------------------------

export async function decideLevelAction(
  taskId: string,
  decision: "PASS" | "FAIL" | "APPROVE" | "REJECT",
  remark: string,
  itemVerdicts: Array<{ itemId: string; verdict: "PASS" | "FAIL"; remark?: string }> = [],
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const review = decision === "PASS" || decision === "FAIL";
    const ctx = await authorize(review ? PERM.task.level.review : PERM.task.level.approve);
    const admin = await isAdminOf(ctx);
    const { shape, acted } = await assertMay(review ? "review" : "approve", taskId, ctx.id, admin);
    if (!remark.trim()) throw new Error("A remark is required on every decision.");

    const kind = review ? "REVIEW" : "APPROVAL";
    const done = new Set(acted.filter((a) => a.kind === kind).map((a) => a.level));
    const level = shape.levels
      .filter((l) => l.kind === kind && !done.has(l.level))
      .sort((a, b) => a.level - b.level)[0];
    if (!level) throw new Error("There is no level waiting on a decision.");

    const row = await prisma.taskLevel.findFirstOrThrow({
      where: { taskId, kind, level: level.level }, select: { id: true },
    });

    const to = statusAfterLevel(shape, decision, acted);

    await prisma.$transaction(async (tx) => {
      await tx.taskLevelAction.create({
        data: {
          levelId: row.id, round: shape.round, decision, remark: remark.trim(), actorId: ctx.id,
        },
      });
      for (const v of itemVerdicts) {
        await tx.taskChecklistItemReview.create({
          data: {
            itemId: v.itemId, levelId: row.id, round: shape.round,
            verdict: v.verdict, remark: v.remark?.trim() || null,
          },
        });
      }
      await moveStatus(tx, {
        taskId, actorId: ctx.id, from: shape.status, to, remark: remark.trim(),
        extra: to === "CLOSED" ? { closedAt: new Date() } : {},
      });
      await logTaskEvent(tx, {
        taskId, actorId: ctx.id, kind: "LEVEL",
        summary: `${kind === "REVIEW" ? "Reviewer" : "Approver"} level ${level.level}: ${decision.toLowerCase()}`,
        remark: remark.trim(),
      });
    });

    refresh(taskId);
    return null;
  });
}

// --------------------------------------------------------------------------
// Comments
// --------------------------------------------------------------------------

export async function addCommentAction(taskId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.comment);
    await assertMay("comment", taskId, ctx.id, await isAdminOf(ctx));
    const body = String(formData.get("body") ?? "").trim();
    if (!body) throw new Error("Write something first.");

    const files = filesFrom(formData);
    assertStorable(files);

    const comment = await prisma.$transaction(async (tx) => {
      const c = await tx.taskComment.create({ data: { taskId, authorId: ctx.id, body } });
      await logTaskEvent(tx, {
        taskId, actorId: ctx.id, kind: "COMMENT", summary: "Comment added",
      });
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
    if (before.authorId !== ctx.id) throw new Error("Only whoever wrote a comment can edit it.");
    if (!body.trim()) throw new Error("A comment cannot be emptied — delete it instead.");

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
    // Deleting a comment is Admin's alone, which the scope states outright.
    const ctx = await authorize(PERM.task.task.reopen);
    const before = await prisma.taskComment.findUniqueOrThrow({
      where: { id: commentId }, select: { taskId: true },
    });
    await prisma.taskComment.delete({ where: { id: commentId } });
    await recordAudit({
      action: "DELETE", entity: "TaskComment", entityId: commentId, userId: ctx.id,
      summary: "Deleted a task comment",
    });
    refresh(before.taskId);
    return null;
  });
}

// --------------------------------------------------------------------------
// Answering a checklist
// --------------------------------------------------------------------------

export async function answerChecklistItemAction(
  itemId: string,
  answer: { choice?: string; text?: string; number?: number; date?: string },
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const item = await prisma.taskChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { taskChecklist: { select: { taskId: true } } },
    });
    const taskId = item.taskChecklist.taskId;
    // Answering is work on the task, so it follows the same rule as completing.
    const shape = await shapeOf(prisma, taskId);
    const admin = await isAdminOf(ctx);
    const working = ["STARTED", "REWORK"].includes(shape.status);
    const mine = shape.assigneeId === ctx.id || admin;
    if (!working || !mine) throw new Error("Only the assignee can answer, and only while the task is open.");

    await prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: {
        answerChoice: answer.choice ?? null,
        answerText: answer.text ?? null,
        answerNumber: answer.number ?? null,
        answerDate: answer.date ? new Date(answer.date) : null,
        answeredAt: new Date(),
      },
    });
    refresh(taskId);
    return null;
  });
}
