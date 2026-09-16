"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { diff, recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { nextStatus, STATUS_LABEL } from "@/lib/tasks/flow";

const TaskSchema = z.object({
  title: z.string().trim().min(3, "A task title is required"),
  projectId: z.string().trim().optional(),
  location: z.string().trim().optional(),
  assigneeId: z.string().min(1, "An assignee is required"),
  dueDate: z.string().trim().optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

function values(formData: FormData) {
  const parsed = TaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const v = parsed.data;
  return {
    title: v.title,
    projectId: v.projectId || null,
    location: v.location || null,
    assigneeId: v.assigneeId,
    dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00.000Z`) : null,
    priority: v.priority as TaskPriority,
  };
}

export async function createTaskAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.create);
    const data = values(formData);

    const task = await prisma.$transaction(async (tx) => {
      const count = await tx.task.count();
      return tx.task.create({
        data: { ...data, taskNo: `T-${String(1000 + count + 1)}`, createdById: ctx.id },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "Task", entityId: task.id, userId: ctx.id,
      summary: `Raised task ${task.taskNo} — ${task.title}`,
    });
    revalidatePath("/tasks");
    return { id: task.id };
  });
}

export async function updateTaskAction(id: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.update);
    const before = await prisma.task.findUniqueOrThrow({ where: { id } });
    const data = values(formData);
    const after = await prisma.task.update({ where: { id }, data });

    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: id, userId: ctx.id,
      summary: `Updated task ${after.taskNo}`,
      changes: diff(before, after, ["title", "location", "assigneeId", "dueDate", "priority", "projectId"]),
    });
    revalidatePath("/tasks");
    return null;
  });
}

/** The design's one button: each status has exactly one move out of it. */
export async function advanceTaskAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const current = await prisma.task.findUniqueOrThrow({ where: { id } });
    const next = nextStatus(current.status);

    const permission =
      next === "SUBMITTED" ? PERM.task.task.submit
      : next === "APPROVED" ? PERM.task.task.approve
      : next === "REOPENED" ? PERM.task.task.reopen
      : PERM.task.task.update;
    const ctx = await authorize(permission);

    // Claimed against the status it was read at, so two reviewers cannot both move it.
    const claimed = await prisma.task.updateMany({
      where: { id, status: current.status },
      data: { status: next },
    });
    if (claimed.count === 0) throw new Error("This task changed after you opened it. Reload and try again.");

    await recordAudit({
      action: "UPDATE", entity: "Task", entityId: id, userId: ctx.id,
      summary: `${current.taskNo} moved to ${STATUS_LABEL[next]}`,
    });
    revalidatePath("/tasks");
    return null;
  });
}

export async function assignTaskAction(ids: string[], assigneeId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.assign);
    if (ids.length === 0) throw new Error("Nothing selected.");
    if (!assigneeId) throw new Error("Choose who to reassign to.");

    const assignee = await prisma.user.findUniqueOrThrow({ where: { id: assigneeId }, select: { name: true } });
    await prisma.task.updateMany({ where: { id: { in: ids } }, data: { assigneeId } });

    await recordAudit({
      action: "UPDATE", entity: "Task", userId: ctx.id,
      summary: `Reassigned ${ids.length} task${ids.length === 1 ? "" : "s"} to ${assignee.name}`,
    });
    revalidatePath("/tasks");
    return null;
  });
}

export async function setTaskPriorityAction(ids: string[], priority: TaskPriority): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.update);
    if (ids.length === 0) throw new Error("Nothing selected.");
    await prisma.task.updateMany({ where: { id: { in: ids } }, data: { priority } });

    await recordAudit({
      action: "UPDATE", entity: "Task", userId: ctx.id,
      summary: `Set ${ids.length} task${ids.length === 1 ? "" : "s"} to ${priority.toLowerCase()} priority`,
    });
    revalidatePath("/tasks");
    return null;
  });
}

export async function advanceTasksAction(ids: string[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.update);
    if (ids.length === 0) throw new Error("Nothing selected.");
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });

    // Each task moves from the status it is actually in.
    const byNext = new Map<TaskStatus, string[]>();
    for (const t of tasks) {
      const next = nextStatus(t.status);
      byNext.set(next, [...(byNext.get(next) ?? []), t.id]);
    }
    for (const [status, group] of byNext) {
      await prisma.task.updateMany({ where: { id: { in: group } }, data: { status } });
    }

    await recordAudit({
      action: "UPDATE", entity: "Task", userId: ctx.id,
      summary: `Advanced ${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
    });
    revalidatePath("/tasks");
    return null;
  });
}

export async function deleteTasksAction(ids: string[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.task.task.delete);
    if (ids.length === 0) throw new Error("Nothing selected.");
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } }, select: { taskNo: true } });
    await prisma.task.deleteMany({ where: { id: { in: ids } } });

    await recordAudit({
      action: "DELETE", entity: "Task", userId: ctx.id,
      summary: `Deleted ${tasks.map((t) => t.taskNo).join(", ")}`,
    });
    revalidatePath("/tasks");
    return null;
  });
}
