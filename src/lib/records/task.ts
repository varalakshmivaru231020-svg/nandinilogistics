import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { canDo, STATUS_LABEL, type TaskShape } from "@/lib/tasks/lifecycle";
import { TASK_PRIORITY_TONE, TASK_STATUS_TONE } from "@/lib/tasks/list-display";
import { type RecordAction, type RecordView } from "./shared";

/**
 * One task, with its remarks, its files and its history.
 *
 * Every action comes from `canDo` — the same function the web screen asks — so
 * the phone offers exactly what the desk offers, and a status the lifecycle
 * forbids cannot produce a button here.
 */
export async function taskRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      createdBy: { select: { id: true, name: true } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
      attachments: {
        where: { commentId: null },
        select: { id: true, fileName: true, fileSize: true, mimeType: true },
      },
    },
  });
  if (!task) return null;

  const isAdmin = ctx.has(PERM.task.task.viewAll);
  const assigneeIds = task.assignees.map((a) => a.userId);
  const onIt = assigneeIds.includes(ctx.id) || task.createdById === ctx.id;
  // The web answers 404 rather than 403 here: confirming that a task exists to
  // somebody who may not see it is itself the leak.
  if (!isAdmin && !onIt) return null;

  const shape: TaskShape = { status: task.status, assigneeIds, createdById: task.createdById };
  const viewer = { userId: ctx.id, isAdmin };
  const may = (a: Parameters<typeof canDo>[0]) => canDo(a, shape, viewer);

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];
  if (may("start") && ctx.has(PERM.task.task.start)) {
    actions.push({
      key: "start", label: "Start", emphasis: "primary",
      action: "tasks/startTask", args: [id], remark: "none",
      confirm: "It moves to In progress, and Admin is told.",
    });
  }
  if (may("complete") && ctx.has(PERM.task.task.complete)) {
    actions.push({
      key: "complete", label: "Mark done", emphasis: "approve",
      action: "tasks/completeTask", args: [id], remark: "required",
      remarkLabel: "What was done",
      confirm: "It is marked done with your remark. Only an Admin can reopen it.",
    });
  }
  if (may("reopen") && ctx.has(PERM.task.task.reopen)) {
    actions.push({
      key: "reopen", label: "Reopen", emphasis: "outline",
      action: "tasks/reopenTask", args: [id], remark: "required",
      remarkLabel: "Why",
      confirm: "It goes back to Open for the Team Leaders. Only an Admin can do this.",
    });
  }
  if (may("edit") && ctx.has(PERM.task.task.update)) {
    actions.push({
      key: "edit",
      label: "Edit task",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "tasks:edit",
      confirm: "Admin may correct a task until it is done.",
    });
  }
  if (may("delete") && ctx.has(PERM.task.task.delete)) {
    actions.push({
      key: "delete",
      label: "Delete task",
      emphasis: "reject",
      action: "tasks/deleteTasks",
      args: [[id]],
      remark: "none",
      confirm: "The task and everything on it go for good.",
    });
  }
  if (may("comment") && ctx.has(PERM.task.task.comment)) {
    actions.push({
      key: "comment", label: "Add remark", emphasis: "outline",
      action: "tasks/addComment", args: [id, "$values"], remark: "required",
      remarkLabel: "Remark", remarkField: "body",
      fields: [
        {
          name: "files",
          label: "Photographs or files",
          kind: "files",
          note: "Optional.",
        },
      ],
      confirm: "Everybody on the task sees it.",
    });
  }

  /* --------------------------------------------------------- collections */

  const collections = [];

  if (task.comments.length > 0) {
    collections.push({
      key: "comments",
      label: `${task.comments.length} remark${task.comments.length === 1 ? "" : "s"}`,
      rows: task.comments.map((c) => ({
        id: c.id,
        title: c.author?.name ?? "—",
        subtitle: c.createdAt.toISOString(),
        body: c.body,
        // Your own words are yours to correct or withdraw, as on the web.
        actions:
          c.authorId === ctx.id || isAdmin
            ? [
                ...(c.authorId === ctx.id
                  ? [{
                      key: `edit:${c.id}`,
                      label: "Edit",
                      emphasis: "outline" as const,
                      action: "tasks/editComment",
                      args: [c.id, "$body"],
                      remark: "none" as const,
                      fields: [
                        {
                          name: "body",
                          label: "Remark",
                          kind: "textarea" as const,
                          required: true,
                          initial: c.body,
                          wide: true,
                        },
                      ],
                      confirm: "Everybody on the task sees the correction.",
                    }]
                  : []),
                {
                  key: `drop:${c.id}`,
                  label: "Delete",
                  emphasis: "reject" as const,
                  action: "tasks/deleteComment",
                  args: [c.id],
                  remark: "none" as const,
                  confirm: "It comes off the task's record.",
                },
              ]
            : [],
      })),
    });
  }

  if (task.attachments.length > 0) {
    collections.push({
      key: "attachments",
      label: `${task.attachments.length} file${task.attachments.length === 1 ? "" : "s"}`,
      rows: task.attachments.map((a) => ({
        id: a.id,
        title: a.fileName,
        trailing: `${Math.round(Number(a.fileSize) / 1024)} KB`,
        file: { url: `/api/tasks/attachments/${a.id}`, name: a.fileName, mime: a.mimeType },
      })),
    });
  }

  if (task.events.length > 0) {
    collections.push({
      key: "history",
      label: "History",
      rows: task.events.map((e) => ({
        id: e.id,
        title: e.summary,
        subtitle: `${e.actor.name} · ${e.createdAt.toISOString()}`,
        ...(e.remark ? { body: e.remark } : {}),
      })),
    });
  }

  /* --------------------------------------------------------- the record */

  return {
    key: "tasks",
    id: task.id,
    title: task.title,
    subtitle: task.taskNo,
    pills: [
      { label: STATUS_LABEL[task.status], tone: TASK_STATUS_TONE[task.status] ?? "draft" },
      { label: task.priority, tone: TASK_PRIORITY_TONE[task.priority] ?? "draft" },
    ],
    sections: [
      {
        label: "The task",
        fields: [
          { label: "Task no.", value: task.taskNo },
          { label: "Assigned to", value: task.assignees.map((a) => a.user.name).join(", ") || null },
          { label: "Raised by", value: task.createdBy?.name ?? null },
          { label: "Priority", value: task.priority },
          { label: "Due", value: task.dueAt?.toISOString() ?? null, format: "datetime" },
          { label: "Started", value: task.startedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Done", value: task.completedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Description", value: task.description, wide: true },
          { label: "Closing remark", value: task.completionRemark, wide: true },
        ],
      },
    ],
    collections,
    actions,
    serverTime: new Date().toISOString(),
  };
}
