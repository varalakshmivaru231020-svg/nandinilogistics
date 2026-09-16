"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { postStockMovement } from "@/lib/inventory";
import { PERM } from "@/lib/permissions/codes";

const ItemSchema = z.object({
  name: z.string().trim().min(2, "Item name is required"),
  uomId: z.string().min(1, "Choose the unit of measure"),
  reorderLevel: z.coerce.number().min(0).default(0),
  specification: z.string().trim().optional(),
  /** Opening stock, only offered when the item is created. */
  openingStock: z.coerce.number().min(0).default(0),
});

type ItemInput = z.infer<typeof ItemSchema>;

/** ITM-001, ITM-002 … — the design generates the code from the name. */
async function nextItemCode(): Promise<string> {
  const last = await prisma.item.findFirst({
    where: { code: { startsWith: "ITM-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? Number(last.code.slice(4)) + 1 : 1;
  return `ITM-${String(Number.isFinite(n) ? n : 1).padStart(3, "0")}`;
}

/**
 * The category the design does not ask for. Items still belong to one, so an
 * uncategorised item lands in "General" until someone files it.
 */
async function defaultCategoryId(): Promise<string> {
  const existing = await prisma.itemCategory.findFirst({
    where: { name: { equals: "General", mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.itemCategory.create({
    data: { code: "GENERAL", name: "General" },
    select: { id: true },
  });
  return created.id;
}

export async function createItemAction(input: ItemInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.item.create);
    const parsed = ItemSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const item = await prisma.item.create({
      data: {
        code: await nextItemCode(),
        name: v.name,
        uomId: v.uomId,
        categoryId: await defaultCategoryId(),
        reorderLevel: v.reorderLevel,
        description: v.specification || null,
      },
    });

    // Opening stock goes in through the ledger like every other movement.
    if (v.openingStock > 0) {
      const store = await prisma.store.findFirst({
        where: { status: "ACTIVE" },
        orderBy: [{ projectId: "asc" }, { name: "asc" }],
        select: { id: true },
      });
      if (store) {
        await prisma.$transaction((tx) =>
          postStockMovement(tx, {
            itemId: item.id,
            storeId: store.id,
            txnType: "ADJUSTMENT",
            quantity: v.openingStock,
            rate: 0,
            refType: "OPENING",
            refId: item.id,
            refNo: item.code,
            createdById: ctx.id,
            remarks: "Opening stock recorded with the item",
          }),
        );
      }
    }

    await recordAudit({
      action: "CREATE", entity: "Item", entityId: item.id, userId: ctx.id,
      summary: `Added item ${item.code} — ${item.name}`,
    });
    revalidatePath("/material/stock");
    return { id: item.id };
  });
}

export async function updateItemAction(id: string, input: ItemInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.item.update);
    const parsed = ItemSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const before = await prisma.item.findUnique({ where: { id }, select: { code: true } });
    if (!before) throw new Error("Item not found.");

    await prisma.item.update({
      where: { id },
      data: {
        name: v.name,
        uomId: v.uomId,
        reorderLevel: v.reorderLevel,
        description: v.specification || null,
      },
    });

    await recordAudit({
      action: "UPDATE", entity: "Item", entityId: id, userId: ctx.id,
      summary: `Updated item ${before.code} — ${v.name}`,
    });
    revalidatePath("/material/stock");
    revalidatePath(`/material/stock/${id}`);
    return null;
  });
}

/** A unit of measure the design lets a storekeeper add without leaving the form. */
export async function addUomAction(name: string): Promise<ActionResult<{ id: string; code: string; name: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.item.create);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the unit a name.");

    const existing = await prisma.uom.findFirst({
      where: { OR: [{ name: { equals: trimmed, mode: "insensitive" } }, { code: { equals: trimmed, mode: "insensitive" } }] },
      select: { id: true, code: true, name: true },
    });
    if (existing) return existing;

    const created = await prisma.uom.create({
      data: { code: trimmed.toUpperCase().slice(0, 12), name: trimmed },
      select: { id: true, code: true, name: true },
    });
    await recordAudit({
      action: "CREATE", entity: "Uom", entityId: created.id, userId: ctx.id,
      summary: `Added unit of measure ${trimmed}`,
    });
    return created;
  });
}
