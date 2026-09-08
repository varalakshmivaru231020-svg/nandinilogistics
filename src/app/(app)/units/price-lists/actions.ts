"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const PriceListSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  name: z.string().trim().min(2, "Give the version a name"),
  effectiveFrom: z.string().min(1, "An effective date is required"),
  baseRate: z.coerce.number().positive("Base rate must be greater than zero"),
  floorRise: z.coerce.number().min(0),
  plcAmount: z.coerce.number().min(0),
});

/**
 * Creates a new price-list version.
 *
 * Rate revisions carry an effective date rather than overwriting: a booking
 * made yesterday keeps yesterday's rate, because the cost sheet reads the
 * version that was active on its own date.
 */
export async function createPriceListAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.priceList.create);
    const parsed = PriceListSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    assertProjectAccess(ctx, v.projectId);
    const effectiveFrom = new Date(v.effectiveFrom);

    const created = await prisma.$transaction(async (tx) => {
      const previous = await tx.priceList.findFirst({
        where: { projectId: v.projectId, isActive: true },
        orderBy: { version: "desc" },
      });

      // The outgoing version is closed the day before this one starts.
      if (previous) {
        await tx.priceList.update({
          where: { id: previous.id },
          data: {
            isActive: false,
            effectiveTo: new Date(effectiveFrom.getTime() - 86_400_000),
          },
        });
      }

      return tx.priceList.create({
        data: {
          projectId: v.projectId,
          name: v.name,
          version: (previous?.version ?? 0) + 1,
          effectiveFrom,
          isActive: true,
          items: {
            create: [{ baseRate: v.baseRate, floorRise: v.floorRise, plcAmount: v.plcAmount }],
          },
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "PriceList", entityId: created.id, userId: ctx.id,
      projectId: v.projectId,
      summary: `Published price list v${created.version} "${v.name}" at ₹${v.baseRate.toLocaleString("en-IN")}/sq.ft, effective ${effectiveFrom.toLocaleDateString("en-IN")}`,
    });

    revalidatePath("/units/price-lists");
    return { id: created.id };
  });
}

export async function activatePriceListAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.unit.priceList.activate);

    const list = await prisma.priceList.findUnique({ where: { id } });
    if (!list) throw new Error("Price list not found.");
    assertProjectAccess(ctx, list.projectId);
    if (list.isActive) throw new Error("This version is already active.");

    await prisma.$transaction([
      prisma.priceList.updateMany({
        where: { projectId: list.projectId, isActive: true },
        data: { isActive: false, effectiveTo: new Date() },
      }),
      prisma.priceList.update({
        where: { id },
        data: { isActive: true, effectiveTo: null },
      }),
    ]);

    await recordAudit({
      action: "UPDATE", entity: "PriceList", entityId: id, userId: ctx.id, projectId: list.projectId,
      summary: `Made price list v${list.version} "${list.name}" the active version`,
    });

    revalidatePath("/units/price-lists");
    return null;
  });
}
