import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { canDo } from "@/lib/tasks/lifecycle";
import {
  earliestWaitingLevel, levelOrder, type FlowItem, type FlowLevel,
} from "@/lib/tasks/checklist-flow";
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
              reviews: {
                orderBy: { actedAt: "asc" },
                include: { level: { select: { kind: true, level: true, user: { select: { name: true } } } } },
              },
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

  /*
   * Every checklist point and where it has got to. The task's own position is
   * read off these: a point moves through the levels on its own, so "where the
   * task is" is simply the earliest level still holding something.
   */
  const levels: FlowLevel[] = task.levels.map((l) => ({ kind: l.kind, level: l.level, userId: l.userId }));
  const flowItems: FlowItem[] = task.checklists.flatMap((c) =>
    c.items.map((i) => ({
      id: i.id,
      round: i.round,
      verdicts: i.reviews.map((r) => ({
        kind: r.level.kind, level: r.level.level, round: r.round,
        verdict: r.verdict as "PASS" | "FAIL",
      })),
    })),
  );

  // Only once the work has started is a point actually in front of anyone.
  const judging = task.status === "UNDER_REVIEW" || task.status === "UNDER_APPROVAL";
  const at = judging ? earliestWaitingLevel(flowItems, levels) : null;
  const order = levelOrder(levels);
  const afterThis = at
    ? order[order.findIndex((l) => l.kind === at.kind && l.level === at.level) + 1] ?? null
    : null;
  const nameOf = (l: FlowLevel | null) =>
    l ? task.levels.find((x) => x.kind === l.kind && x.level === l.level)?.user.name ?? null : null;

  const shape = {
    kind: task.kind, status: task.status, round: task.round,
    assigneeId: task.assigneeId, createdById: task.createdById,
    levels,
    items: flowItems,
  };
  const viewer = { userId: ctx.id, isAdmin };
  const may = (a: Parameters<typeof canDo>[0]) => canDo(a, shape, viewer);

  return (
    <TaskDetail
      viewerId={ctx.id}
      isAdmin={isAdmin}
      flowLevels={levels}
      nowMs={new Date().getTime()}
      // The same words the list uses, so one status is one phrase everywhere.
      stage={at ? `Under ${at.kind === "REVIEW" ? "review" : "approval"} L${at.level}` : null}
      stageWho={nameOf(at)}
      nextUp={
        afterThis
          ? `${afterThis.kind === "REVIEW" ? "Reviewer" : "Approver"} level ${afterThis.level} · ${nameOf(afterThis)}`
          : null
      }
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
          // The point's own round. A denial starts the next one for this point
          // alone, and only verdicts from the current round still stand.
          round: i.round,
          text: i.checkpoint.text,
          marked: i.answeredAt !== null,
          markedAt: i.answeredAt ? i.answeredAt.toISOString() : null,
          verdict: i.answerChoice,
          remark: i.answerText,
          markedBy: task.assignee.name,
          files: i.attachments.map((a) => ({ id: a.id, fileName: a.fileName })),
          reviews: i.reviews.map((r) => ({
            round: r.round, verdict: r.verdict, remark: r.remark,
            kind: r.level.kind, level: r.level.level,
            by: r.level.user.name,
            actedAt: r.actedAt.toISOString(),
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
        close: may("close"),
        sendBack: may("sendBack"),
        reopen: may("reopen"),
        comment: may("comment"),
        requestExtension: may("requestExtension"),
        decideExtension: may("decideExtension"),
        review: may("review"),
        approve: may("approve"),
        // A checklist task can only be completed once every level has signed
        // off, which the lifecycle already decides from the status.
        complete: may("complete"),
        deleteComment: isAdmin,
      }}
    />
  );
}
