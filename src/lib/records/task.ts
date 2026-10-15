import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { canDo, STATUS_LABEL, type TaskShape } from "@/lib/tasks/lifecycle";
import { earliestWaitingLevel, levelOrder, waitingLevel } from "@/lib/tasks/checklist-flow";
import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One task, with its checklist.
 *
 * The checklist is the point. A task's status says "Under Review"; it does not
 * say which point is standing in front of whom, and that is the only thing a
 * reviewer needs. The web screen shows every point with its verdicts; the app
 * showed none of it, because it only ever had the list row.
 *
 * Every action comes from `canDo` — the same function the web screen asks — so
 * the phone offers exactly what the desk offers, and a status the lifecycle
 * forbids cannot produce a button here.
 */
export async function taskRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      levels: {
        orderBy: [{ kind: "asc" }, { level: "asc" }],
        include: {
          user: { select: { name: true } },
          actions: { orderBy: { round: "asc" }, include: { actor: { select: { name: true } } } },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
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
        select: { id: true, fileName: true, fileSize: true },
      },
      checklists: {
        orderBy: { sortOrder: "asc" },
        include: {
          checklist: { select: { name: true } },
          items: {
            orderBy: { id: "asc" },
            include: {
              checkpoint: { select: { text: true, sortOrder: true } },
              reviews: {
                orderBy: { actedAt: "asc" },
                include: {
                  level: { select: { kind: true, level: true, user: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!task) return null;

  const isAdmin = ctx.has(PERM.task.task.reopen);
  const onIt =
    task.assigneeId === ctx.id ||
    task.createdById === ctx.id ||
    task.levels.some((l) => l.userId === ctx.id);
  // The web answers 404 rather than 403 here: confirming that a task exists to
  // somebody who may not see it is itself the leak.
  if (!isAdmin && !ctx.has(PERM.task.task.viewAll) && !onIt) return null;

  const items = task.checklists.flatMap((c) =>
    c.items.map((i) => ({
      id: i.id,
      round: i.round,
      verdicts: i.reviews.map((r) => ({
        round: r.round,
        kind: r.level.kind as "REVIEW" | "APPROVAL",
        level: r.level.level,
        verdict: r.verdict as "PASS" | "FAIL",
      })),
    })),
  );

  const shape: TaskShape = {
    kind: task.kind,
    status: task.status,
    round: task.round,
    assigneeId: task.assigneeId,
    createdById: task.createdById,
    levels: task.levels.map((l) => ({
      kind: l.kind as "REVIEW" | "APPROVAL",
      level: l.level,
      userId: l.userId,
    })),
    items,
  };
  const viewer = { userId: ctx.id, isAdmin };
  const may = (a: Parameters<typeof canDo>[0]) => canDo(a, shape, viewer);

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];
  if (may("accept")) {
    actions.push({
      key: "accept", label: "Accept", emphasis: "approve",
      action: "tasks/acceptTask", args: [id], remark: "none",
      confirm: "It becomes yours, and whoever raised it is told.",
    });
  }
  if (may("start")) {
    actions.push({
      key: "start", label: "Start", emphasis: "primary",
      action: "tasks/startTask", args: [id], remark: "none",
      confirm: "The clock on it starts from now.",
    });
  }
  if (may("complete")) {
    actions.push({
      key: "complete", label: "Mark complete", emphasis: "approve",
      action: "tasks/completeTask", args: [id], remark: "required",
      remarkLabel: "What was done",
      confirm: task.kind === "CHECKLIST"
        ? "Every point has been approved, so this finishes the task."
        : "It goes to whoever raised it, to close or send back.",
    });
  }
  if (may("close")) {
    actions.push({
      key: "close", label: "Close", emphasis: "approve",
      action: "tasks/closeTask", args: [id], remark: "required",
      remarkLabel: "Remark",
      confirm: "Closing is final — only an Admin can reopen it.",
    });
  }
  if (may("sendBack")) {
    actions.push({
      key: "sendBack", label: "Send back", emphasis: "reject",
      action: "tasks/sendBackTask", args: [id], remark: "required",
      remarkLabel: "What needs doing",
      confirm: "It goes back to the assignee as rework. Say what is wrong.",
    });
  }
  if (may("requestExtension")) {
    actions.push({
      key: "requestExtension", label: "Ask for more time", emphasis: "outline",
      action: "tasks/requestExtension", args: [id], remark: "required",
      remarkLabel: "Why, and how long",
      confirm: "Whoever raised the task decides. The due date does not move until they do.",
    });
  }
  if (may("reopen")) {
    actions.push({
      key: "reopen", label: "Reopen", emphasis: "outline",
      action: "tasks/reopenTask", args: [id], remark: "required",
      remarkLabel: "Why",
      confirm: "It comes back to the assignee. Only an Admin can do this.",
    });
  }
  if (may("edit")) {
    actions.push({
      key: "edit",
      label: "Edit task",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "tasks:edit",
      confirm: "The Assigner may correct a task until work starts on it.",
    });
  }

  /*
   * Priority, reassigning and deleting are bulk controls on the web's task
   * list — it takes the selected rows. A phone works on the task in front of
   * it, so each is offered here for this one task, with the same action and
   * the same permission.
   */
  // The action authorizes with `task.update`, the same as editing.
  if (may("edit") && ctx.has(PERM.task.task.update)) {
    actions.push({
      key: "priority",
      label: "Change priority",
      emphasis: "outline",
      action: "tasks/setPriority",
      args: [[id], "$priority"],
      remark: "none",
      fields: [
        {
          name: "priority",
          label: "Priority",
          kind: "select",
          required: true,
          initial: task.priority,
          options: [
            { value: "HIGH", label: "High" },
            { value: "MEDIUM", label: "Medium" },
            { value: "LOW", label: "Low" },
          ],
        },
      ],
      confirm: "It changes where the task sits in everybody's list.",
    });
  }

  if (may("reassign") && ctx.has(PERM.task.task.reassign)) {
    const people = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: { select: { name: true } } },
    });
    actions.push({
      key: "reassign",
      label: "Hand it to somebody else",
      emphasis: "outline",
      action: "tasks/reassignTasks",
      args: [[id], "$assigneeId"],
      remark: "none",
      fields: [
        {
          name: "assigneeId",
          label: "Assign to",
          kind: "lookup",
          required: true,
          placeholder: "Search people…",
          options: people
            .filter((p) => p.id !== task.assignee?.id)
            .map((p) => ({ value: p.id, label: p.name, hint: p.designation?.name ?? undefined })),
        },
      ],
      confirm: "Reassigning is an Admin's call — for when somebody is on leave.",
    });
  }

  if (ctx.has(PERM.task.task.delete)) {
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

  if (may("comment")) {
    actions.push({
      key: "comment", label: "Comment", emphasis: "outline",
      action: "tasks/addComment", args: [id], remark: "required",
      remarkLabel: "Comment",
      confirm: "Everybody on the task sees it.",
    });
  }

  /* --------------------------------------------------- the checklist itself */

  const flowLevels = shape.levels;
  const collections = [];

  for (const c of task.checklists) {
    const rows = c.items
      .slice()
      .sort((a, b) => (a.checkpoint?.sortOrder ?? 0) - (b.checkpoint?.sortOrder ?? 0))
      .map((i, n) => {
        const flow = items.find((x) => x.id === i.id)!;
        const waiting = waitingLevel(flow, flowLevels);
        const mine = waiting?.userId === ctx.id;

        const last = i.reviews[i.reviews.length - 1];
        const pills = [] as Array<{ label: string; tone: ReturnType<typeof toneOf> }>;
        if (waiting) {
          pills.push({
            label: `${waiting.kind === "REVIEW" ? "Review" : "Approval"} L${waiting.level} · ${
              task.levels.find((l) => l.kind === waiting.kind && l.level === waiting.level)?.user.name ?? "—"
            }`,
            tone: waiting.kind === "REVIEW" ? "warn" : "plum",
          });
        } else {
          pills.push({ label: "Approved", tone: "good" });
        }
        if (flow.round > 1) {
          pills.push({ label: `Round ${flow.round}`, tone: "bad" });
        }

        /*
         * Approve and Deny, and nothing else. A point is settled by the level
         * holding it — there is no third state and no overall verdict. Denying
         * one point sends that point alone back to reviewer 1.
         */
        const rowActions: RecordAction[] = [];
        /*
         * The web shows Approve and Deny whenever the point is standing in
         * front of **this viewer** — `mineToJudge` in `task-detail.tsx` — and
         * `reviewChecklistItemAction` allows exactly that: the permission for
         * the level's kind, and the point waiting on you or you being an
         * Admin. It deliberately does not ask the task's status, because a
         * point travels on its own: a denied point goes back to reviewer 1
         * while the task reads REWORK, and somebody still has to judge it.
         *
         * This used to ask `canDo`, which does read the status — so the phone
         * hid a button the web offered and the server would have accepted.
         */
        if (waiting && (mine || isAdmin)) {
          const reviewing = waiting.kind === "REVIEW";
          if (ctx.has(reviewing ? PERM.task.level.review : PERM.task.level.approve)) {
            rowActions.push({
              key: "pass", label: "Approve", emphasis: "approve",
              action: "tasks/reviewChecklistItem", args: [i.id, "PASS"],
              remark: "optional", remarkLabel: "Remark",
              confirm: "This point moves to the next level.",
            });
            rowActions.push({
              key: "fail", label: "Deny", emphasis: "reject",
              action: "tasks/reviewChecklistItem", args: [i.id, "FAIL"],
              remark: "required", remarkLabel: "What is wrong",
              confirm: "This point alone goes back to reviewer 1. The others do not move.",
            });
          }
        }

        /*
         * The square the web draws at the head of the line: a tick once the
         * point is through, a cross while it stands denied this round, and the
         * point's number until then.
         */
        const deniedNow = i.reviews.some((r) => r.round === flow.round && r.verdict === "FAIL");
        const badge = !waiting
          ? { text: "✓", tone: "good" as const }
          : deniedNow
            ? { text: "✕", tone: "bad" as const }
            : { text: String(n + 1).padStart(2, "0"), tone: "draft" as const };

        return {
          id: i.id,
          title: i.checkpoint?.text ?? `Point ${n + 1}`,
          badge,
          subtitle: last
            ? `${last.verdict === "PASS" ? "Approved" : "Denied"} by ${last.level.user.name}` +
              (last.remark ? ` — ${last.remark}` : "")
            : null,
          trailing: String(n + 1).padStart(2, "0"),
          pills,
          actions: rowActions,
          mine: Boolean(waiting && mine),
        };
      });

    const settled = rows.filter((r) => r.pills[0]?.label === "Approved").length;
    // What is waiting on this viewer, which the web's own chip counts.
    const mineCount = rows.filter((r) => r.mine).length;
    collections.push({
      key: `checklist:${c.id}`,
      label: `${c.checklist.name} · ${settled} of ${rows.length} approved`,
      rows: rows.map(({ mine: _mine, ...row }) => row),
      emptyMessage: "This checklist has no points.",
      tab: "checklist",
      progress: {
        done: settled,
        total: rows.length,
        ...(mineCount > 0
          ? {
              note:
                `${ctx.has(PERM.task.level.review) ? "Yours to review" : "Yours to approve"} · ` +
                `${mineCount}`,
            }
          : {}),
      },
    });
  }

  /*
   * "Review and approval", as the web's own tab draws it: one line a level, in
   * order, each saying what it is holding — a level is not done or pending any
   * more, it holds some points and has passed others, and that count is what
   * tells somebody whether there is anything for them to do.
   */
  if (task.levels.length > 0) {
    const all = items;
    collections.push({
      tab: "levels",
      key: "levels",
      label: "One person a level, in order. Each point is judged on its own: a denial sends that " +
        "point back to reviewer level 1 and leaves the rest where they are.",
      rows: task.levels.map((l) => {
        const here = all.filter((item) => {
          const at = waitingLevel(item, flowLevels);
          return at !== null && at.kind === l.kind && at.level === l.level;
        });
        const past = all.filter((item) =>
          item.verdicts.some(
            (v) => v.round === item.round && v.kind === l.kind && v.level === l.level && v.verdict === "PASS",
          ),
        );
        const holding = here.length > 0;
        const through = !holding && all.length > 0 && past.length === all.length;
        return {
          id: l.id,
          badge: through
            ? { text: "✓", tone: "good" as const }
            : { text: String(l.level), tone: holding ? ("info" as const) : ("draft" as const) },
          title: l.user.name + (l.userId === ctx.id ? " (you)" : ""),
          subtitle: `${l.kind === "REVIEW" ? "Reviewer" : "Approver"} L${l.level}`,
          pills: [
            holding
              ? { label: `${here.length} point${here.length === 1 ? "" : "s"} with them`, tone: "info" as const }
              : through
                ? { label: "Passed every point", tone: "good" as const }
                : { label: `${past.length} of ${all.length} passed`, tone: "draft" as const },
          ],
        };
      }),
    });
  }

  if (task.comments.length > 0) {
    collections.push({
      tab: "history",
      key: "comments",
      label: `${task.comments.length} comment${task.comments.length === 1 ? "" : "s"}`,
      rows: task.comments.map((c) => ({
        id: c.id,
        title: c.author?.name ?? "—",
        subtitle: c.createdAt.toISOString(),
        body: c.body,
        // Your own words are yours to correct or withdraw, as on the web.
        actions:
          c.authorId === ctx.id
            ? [
                {
                  key: `edit:${c.id}`,
                  label: "Edit",
                  emphasis: "outline" as const,
                  action: "tasks/editComment",
                  args: [c.id, "$body"],
                  remark: "none" as const,
                  fields: [
                    {
                      name: "body",
                      label: "Comment",
                      kind: "textarea" as const,
                      required: true,
                      initial: c.body,
                      wide: true,
                    },
                  ],
                  confirm: "Everybody on the task sees the correction.",
                },
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

  if (task.extensions.length > 0) {
    collections.push({
      tab: "history",
      key: "extensions",
      label: `${task.extensions.length} extension request${task.extensions.length === 1 ? "" : "s"}`,
      rows: task.extensions.map((e) => ({
        id: e.id,
        title: e.revisedDueAt
            ? `Until ${e.revisedDueAt.toISOString().slice(0, 10)}`
            : "More time",
        subtitle: `Asked by ${e.requestedBy?.name ?? "—"}`,
        body: e.reason,
        pills: [{ label: words(e.status), tone: toneOf(e.status) }],
        actions:
          e.status === "REQUESTED" && may("decideExtension")
            ? [
                {
                  key: "grant", label: "Grant", emphasis: "approve" as const,
                  action: "tasks/decideExtension", args: [e.id, true],
                  remark: "required" as const, remarkLabel: "Remark",
                  confirm: "The due date moves, and the task keeps its original one on record.",
                },
                {
                  key: "refuse", label: "Refuse", emphasis: "reject" as const,
                  action: "tasks/decideExtension", args: [e.id, false],
                  remark: "required" as const, remarkLabel: "Why",
                  confirm: "The due date does not move. Say why.",
                },
              ]
            : [],
      })),
    });
  }

  if (task.attachments.length > 0) {
    collections.push({
      tab: "history",
      key: "attachments",
      label: `${task.attachments.length} file${task.attachments.length === 1 ? "" : "s"}`,
      rows: task.attachments.map((a) => ({
        id: a.id,
        title: a.fileName,
        trailing: `${Math.round(Number(a.fileSize) / 1024)} KB`,
      })),
    });
  }

  if (task.events.length > 0) {
    collections.push({
      tab: "history",
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

  const stage = task.levels.length > 0
    ? (() => {
        const judging = task.status === "UNDER_REVIEW" || task.status === "UNDER_APPROVAL";
        const w = judging ? earliestWaitingLevel(items, flowLevels) : null;
        return w ? `${w.kind === "REVIEW" ? "Under review" : "Under approval"} L${w.level}` : null;
      })()
    : null;

  /*
   * Who it reaches after the level holding it now — the line the web prints
   * beside its tabs, worked out the way its page works it out: only once the
   * work has started is a point actually in front of anyone, so a task in
   * Rework has no "next" even though a point is waiting on somebody.
   */
  const nextUp = (() => {
    const judging = task.status === "UNDER_REVIEW" || task.status === "UNDER_APPROVAL";
    const at = judging ? earliestWaitingLevel(items, flowLevels) : null;
    if (!at) return null;
    const order = levelOrder(flowLevels);
    const after = order[order.findIndex((l) => l.kind === at.kind && l.level === at.level) + 1] ?? null;
    if (!after) return null;
    const who = task.levels.find((l) => l.kind === after.kind && l.level === after.level)?.user.name ?? "—";
    return `${after.kind === "REVIEW" ? "Reviewer" : "Approver"} level ${after.level} · ${who}`;
  })();

  /*
   * The web's own three tabs, in its own order: a checklist tab where there is
   * a checklist, a levels tab where somebody judges it, and history always.
   * `task-detail.tsx` builds the same list the same way.
   */
  const tabs = [
    ...(task.checklists.length > 0 ? [{ key: "checklist", label: "Checklist" }] : []),
    ...(task.levels.length > 0 ? [{ key: "levels", label: "Review and approval" }] : []),
    { key: "history", label: "History" },
  ];

  return {
    key: "tasks",
    id: task.id,
    title: task.title,
    tabs,
    ...(nextUp ? { tabNote: `Next: ${nextUp}` } : {}),
    subtitle: `${task.taskNo}${task.project ? ` · ${task.project.code}` : ""}`,
    pills: [
      { label: stage ?? STATUS_LABEL[task.status], tone: toneOf(task.status) },
      { label: task.priority, tone: task.priority === "HIGH" ? "bad" : "draft" },
      { label: task.kind === "CHECKLIST" ? "Checklist" : "Plain", tone: "info" },
    ],
    sections: [
      {
        label: "The task",
        fields: [
          { label: "Task no.", value: task.taskNo },
          { label: "Given to", value: task.assignee?.name ?? null },
          { label: "Raised by", value: task.createdBy?.name ?? null },
          { label: "Project", value: task.project ? `${task.project.code} — ${task.project.name}` : null },
          { label: "Priority", value: task.priority },
          { label: "Due", value: task.dueAt?.toISOString() ?? null, format: "datetime" },
          { label: "Originally due", value: task.originalDueAt?.toISOString() ?? null, format: "datetime" },
          { label: "Completed", value: task.completedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Closed", value: task.closedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Location", value: task.location, wide: true },
          { label: "What is wanted", value: task.description, wide: true },
        ],
      },
      {
        label: "Who judges it",
        fields: task.levels.map((l) => ({
          label: `${l.kind === "REVIEW" ? "Review" : "Approval"} L${l.level}`,
          value: l.user.name,
        })),
      },
    ],
    collections,
    actions,
    serverTime: new Date().toISOString(),
  };
}

export { money };
