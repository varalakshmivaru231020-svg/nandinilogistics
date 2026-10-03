"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { canDo, statusAfterComplete, statusAfterLevel, type TaskAction } from "@/lib/tasks/lifecycle";
import {
  actedThisRound, applyExtensionDecision, checklistAllMarked, checklistProgress,
  logTaskEvent, moveStatus, shapeOf,
} from "@/lib/tasks/service";
import { assertStorable, filesFrom } from "@/lib/material/grn-attachments";
import { audienceFor, notifyTask, type TaskEventKind } from "@/lib/tasks/notify";
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

/** Tells whoever the scope says should hear about a change. */
async function tell(
  tx: Parameters<typeof notifyTask>[0],
  kind: TaskEventKind,
  taskId: string,
  actorId: string,
  title: string,
  body?: string,
  levelUserIds: string[] = [],
) {
  const t = await tx.task.findUnique({
    where: { id: taskId },
    select: { taskNo: true, assigneeId: true, createdById: true },
  });
  if (!t) return;
  await notifyTask(tx, {
    kind, taskId, taskNo: t.taskNo, title, body, actorId,
    to: audienceFor(kind, t, levelUserIds),
  });
}

/** Tells whichever level is now waiting that the task has reached them. */
async function tellActiveLevel(
  tx: Parameters<typeof notifyTask>[0],
  taskId: string,
  actorId: string,
) {
  const t = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      taskNo: true, title: true, status: true, round: true,
      levels: { select: { id: true, kind: true, level: true, userId: true } },
    },
  });
  if (!t) return;
  const kind = t.status === "UNDER_REVIEW" ? "REVIEW" : t.status === "UNDER_APPROVAL" ? "APPROVAL" : null;
  if (!kind) return;

  const acted = await tx.taskLevelAction.findMany({
    where: { round: t.round, level: { taskId } },
    select: { level: { select: { kind: true, level: true } } },
  });
  const done = new Set(acted.filter((a) => a.level.kind === kind).map((a) => a.level.level));
  const next = t.levels
    .filter((l) => l.kind === kind && !done.has(l.level))
    .sort((a, b) => a.level - b.level)[0];
  if (!next) return;

  await notifyTask(tx, {
    kind: "LEVEL_ACTIVE",
    taskId,
    taskNo: t.taskNo,
    title: `${kind === "REVIEW" ? "Review" : "Approval"} level ${next.level}: ${t.taskNo}`,
    body: t.title,
    to: [next.userId],
    actorId,
  });
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
    // Nobody sits on two levels, reviewing or approving: a second look by the
    // same person is not a second look. The form hides the names already taken;
    // this is what actually holds the rule.
    const everyLevel = [...reviewers, ...approvers];
    if (new Set(everyLevel).size !== everyLevel.length) {
      throw new Error("The same person is on more than one review or approval level.");
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
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "ACCEPTED",
        extra: { acceptedAt: new Date() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, `Task accepted`);
    });
    refresh(id);
    return null;
  });
}

export async function startTaskAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.start);
    const { shape } = await assertMay("start", id, ctx.id, await isAdminOf(ctx));
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "STARTED",
        extra: { startedAt: new Date() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, `Task started`);
    });
    refresh(id);
    return null;
  });
}

export async function completeTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const { shape } = await assertMay("complete", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("A closure remark is required to complete a task.");

    // The list is the work. A checklist task is not complete until every point
    // on it has been marked, which is what the tab is for.
    if (shape.kind === "CHECKLIST" && !(await checklistAllMarked(prisma, id))) {
      const { done, total } = await checklistProgress(prisma, id);
      throw new Error(`${done} of ${total} checklist points are marked. Finish the list first.`);
    }

    const to = statusAfterComplete(shape);
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to, remark,
        extra: { completedAt: new Date(), completionRemark: remark.trim() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, "Task marked complete", remark.trim());
      if (to === "UNDER_REVIEW" || to === "UNDER_APPROVAL") {
        await tellActiveLevel(tx, id, ctx.id);
      }
    });
    refresh(id);
    return null;
  });
}

export async function resubmitTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const { shape } = await assertMay("resubmit", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("Say what was corrected before resubmitting.");
    if (!(await checklistAllMarked(prisma, id))) {
      const { done, total } = await checklistProgress(prisma, id);
      throw new Error(`${done} of ${total} checklist points are marked. Finish the list first.`);
    }

    // A resubmission is a new round, and the flow restarts at Reviewer Level 1.
    const to = statusAfterComplete(shape);
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to, remark,
        extra: { round: { increment: 1 }, completedAt: new Date(), completionRemark: remark.trim() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, "Corrected and resubmitted", remark.trim());
      if (to === "UNDER_REVIEW" || to === "UNDER_APPROVAL") {
        await tellActiveLevel(tx, id, ctx.id);
      }
    });
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
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "CLOSED", remark,
        extra: { closedAt: new Date(), closureRemark: remark.trim() },
      });
      await tell(tx, "CLOSED", id, ctx.id, "Task closed", remark.trim());
    });
    refresh(id);
    return null;
  });
}

export async function sendBackTaskAction(id: string, remark: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.sendBack);
    const { shape } = await assertMay("sendBack", id, ctx.id, await isAdminOf(ctx));
    if (!remark.trim()) throw new Error("Say what needs redoing — the remark is required.");
    await prisma.$transaction(async (tx) => {
      await moveStatus(tx, {
        taskId: id, actorId: ctx.id, from: shape.status, to: "STARTED", remark,
        extra: { completedAt: null, closureRemark: remark.trim() },
      });
      await tell(tx, "STATUS_CHANGED", id, ctx.id, "Sent back for rework", remark.trim());
    });
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
      await tell(tx, "EXTENSION_REQUESTED", id, ctx.id,
        isHold ? "Hold requested" : "Extension requested", reason);
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

    await prisma.$transaction(async (tx) => {
      await applyExtensionDecision(tx, {
        extensionId,
        actorId: ctx.id,
        approve,
        remark: remark.trim(),
        control,
        revisedDueAt: revisedDueAt ? new Date(revisedDueAt) : undefined,
      });
      await tell(tx, "EXTENSION_DECIDED", ext.taskId, ctx.id,
        approve ? "Extension approved" : "Extension rejected", remark.trim());
    });
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

      if (to === "REWORK") {
        // Both parties hear about a failure, and the remarks travel with it.
        await tell(tx, "CHECKLIST_FAILED", taskId, ctx.id,
          `Sent back from ${kind === "REVIEW" ? "review" : "approval"} level ${level.level}`,
          remark.trim());
      } else if (to === "CLOSED") {
        await tell(tx, "CLOSED", taskId, ctx.id, "Task closed by the final approval", remark.trim());
      } else {
        await tellActiveLevel(tx, taskId, ctx.id);
      }
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
      await tell(tx, "COMMENTED", taskId, ctx.id, "New comment", body.slice(0, 140));
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

// --------------------------------------------------------------------------
// The design's bulk bar
// --------------------------------------------------------------------------

/**
 * Setting priority on several tasks at once.
 *
 * Priority is not part of the lifecycle — it changes nothing about who may act
 * or when — so it is the one thing the design's bulk bar can do to a batch
 * without asking a question per task.
 */
export async function setPriorityAction(
  ids: string[],
  priority: "HIGH" | "MEDIUM" | "LOW",
): Promise<ActionResult<{ changed: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.update);
    if (ids.length === 0) throw new Error("Nothing selected.");
    const admin = await isAdminOf(ctx);

    // Only tasks this person could edit anyway, and never a closed one.
    const allowed = await prisma.task.findMany({
      where: {
        id: { in: ids },
        status: { not: "CLOSED" },
        ...(admin ? {} : { createdById: ctx.id }),
      },
      select: { id: true },
    });
    if (allowed.length === 0) throw new Error("None of those are yours to change.");

    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { id: { in: allowed.map((t) => t.id) } }, data: { priority } });
      for (const t of allowed) {
        await logTaskEvent(tx, {
          taskId: t.id, actorId: ctx.id, kind: "STATUS",
          summary: `Priority set to ${priority.toLowerCase()}`,
        });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: allowed[0].id, userId: ctx.id,
      summary: `Set ${allowed.length} task(s) to ${priority.toLowerCase()} priority`,
    });
    refresh();
    return { changed: allowed.length };
  });
}

/**
 * Moving tasks to a different assignee.
 *
 * The scope gives this to Admin — for when someone is on leave — and it is the
 * assignee who changes, not the work: the task keeps its status, its dates and
 * its history, with the handover recorded on it.
 */
export async function reassignTasksAction(
  ids: string[],
  assigneeId: string,
): Promise<ActionResult<{ changed: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.reassign);
    if (ids.length === 0) throw new Error("Nothing selected.");
    if (!assigneeId) throw new Error("Choose who they go to.");

    const to = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
    if (!to) throw new Error("That person no longer exists.");

    const tasks = await prisma.task.findMany({
      where: { id: { in: ids }, status: { not: "CLOSED" } },
      select: { id: true, assignee: { select: { name: true } } },
    });
    if (tasks.length === 0) throw new Error("A closed task cannot be reassigned.");

    await prisma.$transaction(async (tx) => {
      for (const t of tasks) {
        await tx.task.update({ where: { id: t.id }, data: { assigneeId } });
        await logTaskEvent(tx, {
          taskId: t.id, actorId: ctx.id, kind: "REASSIGN",
          summary: `Reassigned from ${t.assignee.name} to ${to.name}`,
        });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: tasks[0].id, userId: ctx.id,
      summary: `Reassigned ${tasks.length} task(s) to ${to.name}`,
    });
    refresh();
    return { changed: tasks.length };
  });
}

/**
 * Deleting tasks.
 *
 * A task that has been worked on is a record of what happened, so only one
 * nobody has picked up yet can be removed; anything further along is closed or
 * left alone.
 */
export async function deleteTasksAction(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.delete);
    if (ids.length === 0) throw new Error("Nothing selected.");

    const tasks = await prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, taskNo: true, status: true },
    });
    const started = tasks.filter((t) => t.status !== "PENDING");
    if (started.length > 0) {
      throw new Error(
        `${started.map((t) => t.taskNo).join(", ")} ${started.length === 1 ? "has" : "have"} been worked on. ` +
        "Close them instead — the history is the record.",
      );
    }

    await prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
    await recordAudit({
      action: "DELETE", entity: "Task", entityId: tasks[0]?.id ?? "-", userId: ctx.id,
      summary: `Deleted ${tasks.length} unstarted task(s): ${tasks.map((t) => t.taskNo).join(", ")}`,
    });
    refresh();
    return { deleted: tasks.length };
  });
}


// --------------------------------------------------------------------------
// Working through the checklist, and judging it
// --------------------------------------------------------------------------

/**
 * The assignee ticking one checklist point off, or putting it back.
 *
 * This is the step marking the list is for: the task cannot be completed until
 * every point is marked, so the checklist is worked through rather than
 * remembered.
 */
export async function markChecklistItemAction(
  itemId: string,
  done: boolean,
): Promise<ActionResult<{ done: number; total: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.complete);
    const item = await prisma.taskChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { taskChecklist: { select: { taskId: true } } },
    });
    const taskId = item.taskChecklist.taskId;

    const shape = await shapeOf(prisma, taskId);
    const admin = await isAdminOf(ctx);
    if (!["STARTED", "REWORK"].includes(shape.status)) {
      throw new Error("The checklist is worked through while the task is open.");
    }
    if (shape.assigneeId !== ctx.id && !admin) {
      throw new Error("Only the person the task is assigned to works through its checklist.");
    }

    await prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: { answeredAt: done ? new Date() : null },
    });
    refresh(taskId);
    return checklistProgress(prisma, taskId);
  });
}

/**
 * A reviewer or an approver judging one point, at the level they hold.
 *
 * It happens on the list itself rather than in a dialog, so the remark sits
 * under the line it is about and every round of them stays there.
 */
export async function reviewChecklistItemAction(
  itemId: string,
  verdict: "PASS" | "FAIL",
  remark: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const item = await prisma.taskChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { taskChecklist: { select: { taskId: true } } },
    });
    const taskId = item.taskChecklist.taskId;

    const shape = await shapeOf(prisma, taskId);
    const reviewing = shape.status === "UNDER_REVIEW";
    const ctx = await authorize(reviewing ? PERM.task.level.review : PERM.task.level.approve);
    const admin = await isAdminOf(ctx);
    const acted = await actedThisRound(prisma, taskId, shape.round);

    if (!canDo(reviewing ? "review" : "approve", shape, { userId: ctx.id, isAdmin: admin }, acted)) {
      throw new Error("This level is not yours to judge, at least not yet.");
    }

    const kind = reviewing ? "REVIEW" : "APPROVAL";
    const done = new Set(acted.filter((a) => a.kind === kind).map((a) => a.level));
    const level = shape.levels
      .filter((l) => l.kind === kind && !done.has(l.level))
      .sort((a, b) => a.level - b.level)[0];
    if (!level) throw new Error("There is no level waiting on a decision.");

    const row = await prisma.taskLevel.findFirstOrThrow({
      where: { taskId, kind, level: level.level },
      select: { id: true },
    });

    await prisma.taskChecklistItemReview.upsert({
      where: { itemId_levelId_round: { itemId, levelId: row.id, round: shape.round } },
      create: { itemId, levelId: row.id, round: shape.round, verdict, remark: remark.trim() || null },
      update: { verdict, remark: remark.trim() || null, actedAt: new Date() },
    });

    // A level has no verdict of its own beyond the lines it judged. Once every
    // line has one, the level is finished and the task moves: approved
    // throughout and it goes on, a single denial and it goes back. There is
    // nothing left for a separate overall decision to add.
    const items = await prisma.taskChecklistItem.findMany({
      where: { taskChecklist: { taskId } },
      select: {
        id: true,
        reviews: {
          where: { levelId: row.id, round: shape.round },
          select: { verdict: true },
        },
      },
    });
    const judged = items.filter((i) => i.reviews.length > 0);
    if (judged.length < items.length) {
      refresh(taskId);
      return null;
    }

    const denied = judged.filter((i) => i.reviews[0].verdict === "FAIL").length;
    const decision = reviewing
      ? denied > 0 ? "FAIL" as const : "PASS" as const
      : denied > 0 ? "REJECT" as const : "APPROVE" as const;
    const summary = denied > 0
      ? `${denied} of ${items.length} point(s) denied`
      : `All ${items.length} point(s) approved`;
    const to = statusAfterLevel(shape, decision, acted);

    await prisma.$transaction(async (tx) => {
      await tx.taskLevelAction.create({
        data: { levelId: row.id, round: shape.round, decision, remark: summary, actorId: ctx.id },
      });
      await moveStatus(tx, {
        taskId, actorId: ctx.id, from: shape.status, to, remark: summary,
        extra: to === "CLOSED" ? { closedAt: new Date() } : {},
      });
      await logTaskEvent(tx, {
        taskId, actorId: ctx.id, kind: "LEVEL",
        summary: `${kind === "REVIEW" ? "Reviewer" : "Approver"} level ${level.level}: ${decision.toLowerCase()}`,
        remark: summary,
      });

      if (to === "REWORK") {
        await tell(tx, "CHECKLIST_FAILED", taskId, ctx.id,
          `Sent back from ${kind === "REVIEW" ? "review" : "approval"} level ${level.level}`, summary);
      } else if (to === "CLOSED") {
        await tell(tx, "CLOSED", taskId, ctx.id, "Task closed by the final approval", summary);
      } else {
        await tellActiveLevel(tx, taskId, ctx.id);
      }
    });

    refresh(taskId);
    return null;
  });
}
