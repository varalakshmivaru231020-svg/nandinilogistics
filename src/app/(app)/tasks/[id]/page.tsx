import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { canDo } from "@/lib/tasks/lifecycle";
import { TaskDetail } from "./task-detail";

export const metadata = { title: "Task" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      createdBy: { select: { id: true, name: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true } },
          attachments: { select: { id: true, fileName: true, fileSize: true } },
          edits: { select: { id: true } },
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      attachments: {
        where: { commentId: null },
        select: { id: true, fileName: true, fileSize: true, uploadedAt: true,
                  uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!task) notFound();

  const isAdmin = ctx.has(PERM.task.task.viewAll);
  const assigneeIds = task.assignees.map((a) => a.userId);
  const onIt = assigneeIds.includes(ctx.id) || task.createdById === ctx.id;
  // Without the org-wide view, a task you have no part in is not yours to read.
  if (!isAdmin && !onIt) notFound();

  const shape = { status: task.status, assigneeIds, createdById: task.createdById };
  const viewer = { userId: ctx.id, isAdmin };
  const may = (a: Parameters<typeof canDo>[0]) => canDo(a, shape, viewer);

  return (
    <TaskDetail
      nowMs={new Date().getTime()}
      task={{
        id: task.id,
        taskNo: task.taskNo,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignees: task.assignees.map((a) => a.user.name),
        assigner: task.createdBy.name,
        dueAt: task.dueAt.toISOString(),
        startedAt: task.startedAt ? task.startedAt.toISOString() : null,
        completedAt: task.completedAt ? task.completedAt.toISOString() : null,
        completionRemark: task.completionRemark,
      }}
      comments={task.comments.map((c) => ({
        id: c.id, body: c.body, author: c.author.name, mine: c.author.id === ctx.id,
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt ? c.editedAt.toISOString() : null,
        edits: c.edits.length,
        files: c.attachments.map((a) => ({ id: a.id, fileName: a.fileName, fileSize: a.fileSize })),
      }))}
      files={task.attachments.map((a) => ({
        id: a.id, fileName: a.fileName, fileSize: a.fileSize,
        by: a.uploadedBy.name, at: a.uploadedAt.toISOString(),
      }))}
      history={task.events.map((e) => ({
        id: e.id, summary: e.summary, remark: e.remark,
        actor: e.actor.name, at: e.createdAt.toISOString(),
      }))}
      can={{
        start: may("start") && ctx.has(PERM.task.task.start),
        complete: may("complete") && ctx.has(PERM.task.task.complete),
        reopen: may("reopen") && ctx.has(PERM.task.task.reopen),
        comment: may("comment") && ctx.has(PERM.task.task.comment),
        deleteComment: isAdmin,
      }}
    />
  );
}
