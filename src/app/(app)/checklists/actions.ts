"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const CategorySchema = z.object({
  name: z.string().trim().min(2, "A category name is required"),
  code: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export async function saveCategoryAction(id: string | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(id ? PERM.checklist.category.update : PERM.checklist.category.create);
    const parsed = CategorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;
    const code = (v.code || v.name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (id) {
      await prisma.checklistCategory.update({
        where: { id },
        data: { name: v.name, code, description: v.description || null },
      });
    } else {
      await prisma.checklistCategory.create({
        data: { name: v.name, code, description: v.description || null },
      });
    }

    await recordAudit({
      action: id ? "UPDATE" : "CREATE", entity: "ChecklistCategory", entityId: id ?? undefined, userId: ctx.id,
      summary: `${id ? "Updated" : "Added"} checklist category ${v.name}`,
    });
    revalidatePath("/checklists");
    return null;
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.category.delete);
    const category = await prisma.checklistCategory.findUniqueOrThrow({
      where: { id },
      select: { name: true, _count: { select: { checklists: true } } },
    });
    if (category._count.checklists > 0) {
      throw new Error("This category still holds checklists. Move or delete them first.");
    }
    await prisma.checklistCategory.delete({ where: { id } });

    await recordAudit({
      action: "DELETE", entity: "ChecklistCategory", entityId: id, userId: ctx.id,
      summary: `Deleted checklist category ${category.name}`,
    });
    revalidatePath("/checklists");
    return null;
  });
}

const ChecklistSchema = z.object({
  name: z.string().trim().min(2, "A checklist name is required"),
  version: z.string().trim().optional(),
});

export async function saveChecklistAction(
  id: string | null, categoryId: string, formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(id ? PERM.checklist.checklist.update : PERM.checklist.checklist.create);
    const parsed = ChecklistSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const data = { name: parsed.data.name, version: parsed.data.version || "v1.0" };

    const row = id
      ? await prisma.checklist.update({ where: { id }, data })
      : await prisma.checklist.create({ data: { ...data, categoryId } });

    await recordAudit({
      action: id ? "UPDATE" : "CREATE", entity: "Checklist", entityId: row.id, userId: ctx.id,
      summary: `${id ? "Updated" : "Added"} checklist ${row.name}`,
    });
    revalidatePath("/checklists");
    return { id: row.id };
  });
}

export async function duplicateChecklistAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.checklist.create);
    const source = await prisma.checklist.findUniqueOrThrow({
      where: { id },
      include: { checkpoints: { orderBy: { sortOrder: "asc" } } },
    });

    const copy = await prisma.$transaction(async (tx) => {
      const made = await tx.checklist.create({
        data: { categoryId: source.categoryId, name: `${source.name} (copy)`, version: source.version },
      });
      await tx.checklistCheckpoint.createMany({
        data: source.checkpoints.map((p) => ({
          checklistId: made.id, text: p.text, isMandatory: true, sortOrder: p.sortOrder,
        })),
      });
      return made;
    });

    await recordAudit({
      action: "CREATE", entity: "Checklist", entityId: copy.id, userId: ctx.id,
      summary: `Duplicated checklist ${source.name}`,
    });
    revalidatePath("/checklists");
    return { id: copy.id };
  });
}

export async function deleteChecklistAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.checklist.delete);
    const list = await prisma.checklist.findUniqueOrThrow({
      where: { id }, select: { name: true, _count: { select: { runs: true } } },
    });
    if (list._count.runs > 0) throw new Error("This checklist has been used on site and cannot be deleted.");
    await prisma.checklist.delete({ where: { id } });

    await recordAudit({
      action: "DELETE", entity: "Checklist", entityId: id, userId: ctx.id,
      summary: `Deleted checklist ${list.name}`,
    });
    revalidatePath("/checklists");
    return null;
  });
}

/** Every checkpoint on a list is required; there is no optional one. */
export async function addCheckpointAction(
  checklistId: string,
  text: string,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.checklist.update);
    if (!text.trim()) throw new Error("Write the checkpoint first.");
    const last = await prisma.checklistCheckpoint.findFirst({
      where: { checklistId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
    });
    await prisma.checklistCheckpoint.create({
      data: { checklistId, text: text.trim(), isMandatory: true, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });

    await recordAudit({
      action: "CREATE", entity: "ChecklistCheckpoint", userId: ctx.id,
      summary: `Added checkpoint "${text.trim()}"`,
    });
    revalidatePath("/checklists");
    return null;
  });
}

export async function updateCheckpointAction(
  id: string,
  patch: { text?: string },
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.checklist.update);
    if (patch.text !== undefined && !patch.text.trim()) throw new Error("A checkpoint cannot be empty.");
    const row = await prisma.checklistCheckpoint.update({
      where: { id },
      data: {
        ...(patch.text === undefined ? {} : { text: patch.text.trim() }),
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "ChecklistCheckpoint", entityId: id, userId: ctx.id,
      summary: `Updated checkpoint "${row.text}"`,
    });
    revalidatePath("/checklists");
    return null;
  });
}

/** The design's ↑ and ↓: swap this checkpoint with the one beside it. */
export async function moveCheckpointAction(id: string, direction: "up" | "down"): Promise<ActionResult<null>> {
  return runAction(async () => {
    await authorize(PERM.checklist.checklist.update);
    const row = await prisma.checklistCheckpoint.findUniqueOrThrow({ where: { id } });
    const neighbour = await prisma.checklistCheckpoint.findFirst({
      where: {
        checklistId: row.checklistId,
        sortOrder: direction === "up" ? { lt: row.sortOrder } : { gt: row.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return null;

    await prisma.$transaction([
      prisma.checklistCheckpoint.update({ where: { id: row.id }, data: { sortOrder: neighbour.sortOrder } }),
      prisma.checklistCheckpoint.update({ where: { id: neighbour.id }, data: { sortOrder: row.sortOrder } }),
    ]);
    revalidatePath("/checklists");
    return null;
  });
}

export async function deleteCheckpointAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.checklist.update);
    const row = await prisma.checklistCheckpoint.delete({ where: { id } });

    await recordAudit({
      action: "DELETE", entity: "ChecklistCheckpoint", entityId: id, userId: ctx.id,
      summary: `Removed checkpoint "${row.text}"`,
    });
    revalidatePath("/checklists");
    return null;
  });
}

/**
 * Taking a checklist out of use, or putting it back.
 *
 * Only an active checklist is offered when a task is raised. Tasks already
 * created from it keep their copy of the items and are untouched, which is
 * what makes retiring one safe.
 */
export async function setChecklistActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.checklist.checklist.update);
    const row = await prisma.checklist.update({ where: { id }, data: { isActive } });
    await recordAudit({
      action: "UPDATE", entity: "Checklist", entityId: id, userId: ctx.id,
      summary: `${isActive ? "Reactivated" : "Retired"} checklist ${row.name}`,
    });
    revalidatePath("/checklists");
    revalidatePath("/tasks");
    return null;
  });
}
