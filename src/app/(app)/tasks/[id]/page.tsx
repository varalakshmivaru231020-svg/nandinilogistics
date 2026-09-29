import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { canDo } from "@/lib/tasks/lifecycle";
import { actedThisRound } from "@/lib/tasks/service";
import { TaskDetail } from "./task-detail";

export const metadata = { title: "Task" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission(PERM.task.task.view);
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { code: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      levels: {
        orderBy: [{ kind: "asc" }, { level: "asc" }],
        include: {
          user: { select: { name: true } },
          actions: { orderBy: { round: "asc" }, include: { actor: { select: { name: true } } } },
        },
      },
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
      extensions: {
        orderBy: { requestedAt: "desc" },
        include: {
          requestedBy: { select: { name: true } },
          decidedBy: { select: { name: true } },
        },
      },
      attachments: {
        where: { commentId: null, extensionId: null },
        select: { id: true, fileName: true, fileSize: true, uploadedAt: true,
                  uploadedBy: { select: { name: true } } },
      },
      checklists: {
        orderBy: { sortOrder: "asc" },
        include: {
          checklist: { select: { name: true } },
          items: {
            include: {
              checkpoint: true,
              attachments: { select: { id: true, fileName: true } },
              reviews: { include: { level: { select: { kind: true, level: true } } } },
            },
          },
        },
      },
    },
  });
  if (!task) notFound();

  const isAdmin = ctx.has(PERM.task.task.reopen);
  const onIt =
    task.assigneeId === ctx.id ||
    task.createdById === ctx.id ||
    task.levels.some((l) => l.userId === ctx.id);
  // Without the org-wide view, a task you have no part in is not yours to read.
  if (!isAdmin && !ctx.has(PERM.task.task.viewAll) && !onIt) notFound();

  const acted = await actedThisRound(prisma, task.id, task.round);
  const shape = {
    kind: task.kind, status: task.status, round: task.round,
    assigneeId: task.assigneeId, createdById: task.createdById,
    levels: task.levels.map((l) => ({ kind: l.kind, level: l.level, userId: l.userId })),
  };
  const viewer = { userId: ctx.id, isAdmin };
  const may = (a: Parameters<typeof canDo>[0]) => canDo(a, shape, viewer, acted);

  return (
    <TaskDetail
      viewerId={ctx.id}
      nowMs={new Date().getTime()}
      task={{
        id: task.id,
        taskNo: task.taskNo,
        title: task.title,
        description: task.description,
        kind: task.kind,
        status: task.status,
        priority: task.priority,
        round: task.round,
        projectCode: task.project?.code ?? null,
        location: task.location,
        assignee: task.assignee.name,
        assigner: task.createdBy.name,
        dueAt: task.dueAt.toISOString(),
        originalDueAt: task.originalDueAt.toISOString(),
        effectiveDueAt: task.effectiveDueAt.toISOString(),
        completionRemark: task.completionRemark,
        closureRemark: task.closureRemark,
      }}
      levels={task.levels.map((l) => ({
        id: l.id, kind: l.kind, level: l.level, person: l.user.name,
        isViewer: l.userId === ctx.id,
        actions: l.actions.map((a) => ({
          round: a.round, decision: a.decision, remark: a.remark,
          actor: a.actor.name, actedAt: a.actedAt.toISOString(),
        })),
      }))}
      checklists={task.checklists.map((tc) => ({
        id: tc.id,
        name: tc.checklist.name,
        items: tc.items.map((i) => ({
          id: i.id,
          text: i.checkpoint.text,
          responseType: i.checkpoint.responseType,
          isMandatory: i.checkpoint.isMandatory,
          needsFile: i.checkpoint.needsFile,
          answerChoice: i.answerChoice,
          answerText: i.answerText,
          answerNumber: i.answerNumber === null ? null : Number(i.answerNumber),
          answerDate: i.answerDate ? i.answerDate.toISOString() : null,
          answered: i.answeredAt !== null,
          files: i.attachments.map((a) => ({ id: a.id, fileName: a.fileName })),
          reviews: i.reviews.map((r) => ({
            round: r.round, verdict: r.verdict, remark: r.remark,
            kind: r.level.kind, level: r.level.level,
          })),
        })),
      }))}
      comments={task.comments.map((c) => ({
        id: c.id, body: c.body, author: c.author.name, mine: c.author.id === ctx.id,
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt ? c.editedAt.toISOString() : null,
        edits: c.edits.length,
        files: c.attachments.map((a) => ({ id: a.id, fileName: a.fileName, fileSize: a.fileSize })),
      }))}
      extensions={task.extensions.map((e) => ({
        id: e.id,
        proposedDueAt: e.proposedDueAt.toISOString(),
        reason: e.reason,
        isHoldRequest: e.isHoldRequest,
        status: e.status,
        control: e.control,
        revisedDueAt: e.revisedDueAt ? e.revisedDueAt.toISOString() : null,
        decisionRemark: e.decisionRemark,
        requestedBy: e.requestedBy.name,
        decidedBy: e.decidedBy?.name ?? null,
        requestedAt: e.requestedAt.toISOString(),
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
        accept: may("accept"),
        start: may("start"),
        complete: may("complete"),
        resubmit: may("resubmit"),
        close: may("close"),
        sendBack: may("sendBack"),
        reopen: may("reopen"),
        comment: may("comment"),
        requestExtension: may("requestExtension"),
        decideExtension: may("decideExtension"),
        review: may("review"),
        approve: may("approve"),
        answer: (task.status === "STARTED" || task.status === "REWORK") &&
                (task.assigneeId === ctx.id || isAdmin),
        deleteComment: isAdmin,
      }}
    />
  );
}
