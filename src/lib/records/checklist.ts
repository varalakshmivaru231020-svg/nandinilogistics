import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { type RecordAction, type RecordView } from "./shared";

/**
 * One checklist template, with its points in order.
 *
 * This is what a checklist task is raised from, so what matters is the points
 * and whether each one is mandatory or needs a photo — the two things that
 * decide what the assignee will be asked for. Editing the points is the web's
 * business; taking a checklist out of use is one tap, and an inactive one
 * cannot be picked for a new task.
 */
export async function checklistRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const checklist = await prisma.checklist.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      checkpoints: { orderBy: { sortOrder: "asc" } },
      _count: { select: { taskUses: true } },
    },
  });
  if (!checklist) return null;

  const actions: RecordAction[] = [];
  const mayEdit = ctx.has(PERM.checklist.checklist.update);

  if (ctx.has(PERM.checklist.checklist.delete)) {
    actions.push({
      key: "delete",
      label: "Delete checklist",
      emphasis: "reject",
      action: "checklists/deleteChecklist",
      args: [id],
      remark: "none",
      confirm: "Tasks already raised from it keep their copy of the points.",
    });
  }

  if (mayEdit) {
    actions.push({
      key: "setActive",
      label: checklist.isActive ? "Take out of use" : "Put back in use",
      emphasis: checklist.isActive ? "reject" : "approve",
      action: "checklists/setChecklistActive",
      args: [id, !checklist.isActive],
      remark: "none",
      confirm: checklist.isActive
        ? "It cannot be picked for a new task. Tasks already raised from it are untouched."
        : "It can be picked for a new task again.",
    });
    actions.push({
      key: "addPoint",
      label: "Add a point",
      emphasis: "primary",
      action: "checklists/addCheckpoint",
      args: [id, "$text"],
      remark: "none",
      fields: [
        {
          name: "text",
          label: "Checkpoint",
          kind: "text",
          required: true,
          placeholder: "Add the next checkpoint — it takes the next sequence number",
          wide: true,
        },
      ],
      confirm: "It goes to the end of the list, with the next number.",
    });
    actions.push({
      key: "duplicate",
      label: "Duplicate",
      emphasis: "outline",
      action: "checklists/duplicateChecklist",
      args: [id],
      remark: "none",
      confirm: "A copy, with the same points, to edit as its own checklist.",
    });
  }

  return {
    key: "checklists",
    id: checklist.id,
    title: checklist.name,
    subtitle: `${checklist.category.name} · ${checklist.version}`,
    pills: [
      checklist.isActive
        ? { label: "Active", tone: "good" }
        : { label: "Out of use", tone: "warn" },
      {
        label: `${checklist.checkpoints.length} point${checklist.checkpoints.length === 1 ? "" : "s"}`,
        tone: "info",
      },
    ],
    sections: [
      {
        label: "The checklist",
        fields: [
          { label: "Name", value: checklist.name },
          { label: "Category", value: checklist.category.name },
          { label: "Version", value: checklist.version },
          { label: "In use", value: checklist.isActive, format: "bool" },
          {
            label: "Raised from it",
            value: `${checklist._count.taskUses} ${checklist._count.taskUses === 1 ? "task" : "tasks"}`,
          },
        ],
      },
    ],
    collections: [
      {
        key: `points:${id}`,
        label: `Points · ${checklist.checkpoints.length}`,
        rows: checklist.checkpoints.map((p, i) => ({
          id: p.id,
          title: p.text,
          badge: { text: String(i + 1).padStart(2, "0"), tone: "info" as const },
          actions: mayEdit
            ? [
                {
                  key: `text:${p.id}`,
                  // The web's own link beside the point, not an icon.
                  label: "Edit text",
                  emphasis: "outline" as const,
                  action: "checklists/updateCheckpoint",
                  args: [p.id, { text: "$text" }],
                  remark: "none" as const,
                  fields: [
                    {
                      name: "text",
                      label: "Checkpoint",
                      kind: "text" as const,
                      required: true,
                      initial: p.text,
                      wide: true,
                    },
                  ],
                  confirm: "Tasks already raised from this checklist keep their own copy.",
                },
                ...(i > 0
                  ? [
                      {
                        key: `up:${p.id}`,
                        label: "Move up",
                        glyph: "↑",
                        emphasis: "outline" as const,
                        action: "checklists/moveCheckpoint",
                        args: [p.id, "up"],
                        remark: "none" as const,
                        confirm: "It swaps with the point above it.",
                      },
                    ]
                  : []),
                ...(i < checklist.checkpoints.length - 1
                  ? [
                      {
                        key: `down:${p.id}`,
                        label: "Move down",
                        glyph: "↓",
                        emphasis: "outline" as const,
                        action: "checklists/moveCheckpoint",
                        args: [p.id, "down"],
                        remark: "none" as const,
                        confirm: "It swaps with the point below it.",
                      },
                    ]
                  : []),
                {
                  key: `drop:${p.id}`,
                  label: "Delete checkpoint",
                  glyph: "🗑",
                  emphasis: "reject" as const,
                  action: "checklists/deleteCheckpoint",
                  args: [p.id],
                  remark: "none" as const,
                  confirm: "The remaining points are renumbered.",
                },
              ]
            : [],
        })),
        emptyMessage: "This checklist has no points yet.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
