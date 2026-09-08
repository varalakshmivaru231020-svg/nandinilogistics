"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, assertProjectAccess, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { postGrnToStock } from "@/lib/material/grn-posting";
import { PERM } from "@/lib/permissions/codes";

const GrnLineSchema = z
  .object({
    poItemId: z.string().min(1),
    itemId: z.string().min(1),
    receivedQty: z.coerce.number().min(0),
    acceptedQty: z.coerce.number().min(0),
    rejectedQty: z.coerce.number().min(0).default(0),
    shortQty: z.coerce.number().min(0).default(0),
    rate: z.coerce.number().min(0),
    rejectionReason: z.string().trim().optional(),
  })
  .refine((l) => l.acceptedQty + l.rejectedQty <= l.receivedQty + 0.0001, {
    message: "Accepted plus rejected cannot exceed the quantity received",
  });

const GrnSchema = z.object({
  poId: z.string().min(1, "Purchase order is required"),
  storeId: z.string().min(1, "Receiving store is required"),
  challanNo: z.string().trim().optional(),
  challanDate: z.string().optional(),
  challanPhotoUrl: z.string().trim().optional(),
  vehicleNo: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  items: z.array(GrnLineSchema).min(1, "Record at least one line"),
});

type GrnInput = z.infer<typeof GrnSchema>;

export async function createGrnAction(input: GrnInput): Promise<ActionResult<{ id: string; grnNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.create);
    const parsed = GrnSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: v.poId },
      include: { items: true },
    });
    if (!po) throw new Error("Purchase order not found.");
    assertProjectAccess(ctx, po.projectId);
    if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw new Error("Material can only be received against an approved purchase order.");
    }

    // Never accept more than the PO still has outstanding.
    const poItemById = new Map(po.items.map((i) => [i.id, i]));
    for (const line of v.items) {
      const poItem = poItemById.get(line.poItemId);
      if (!poItem) throw new Error("A line does not belong to this purchase order.");
      const outstanding = Number(poItem.orderedQty) - Number(poItem.receivedQty);
      if (line.receivedQty > outstanding + 0.0001) {
        throw new Error(
          `Receiving ${line.receivedQty} exceeds the ${outstanding} still outstanding on this PO line.`,
        );
      }
    }

    const grn = await prisma.$transaction(async (tx) => {
      const grnNo = await nextDocumentNumber(tx, "GRN", po.projectId);
      return tx.grn.create({
        data: {
          grnNo,
          poId: po.id,
          vendorId: po.vendorId,
          storeId: v.storeId,
          challanNo: v.challanNo || null,
          challanDate: v.challanDate ? new Date(v.challanDate) : null,
          challanPhotoUrl: v.challanPhotoUrl || null,
          vehicleNo: v.vehicleNo || null,
          receivedById: ctx.id,
          remarks: v.remarks || null,
          status: "DRAFT",
          items: {
            create: v.items
              .filter((l) => l.receivedQty > 0)
              .map((l) => ({
                poItemId: l.poItemId,
                itemId: l.itemId,
                receivedQty: l.receivedQty,
                acceptedQty: l.acceptedQty,
                rejectedQty: l.rejectedQty,
                shortQty: l.shortQty,
                rate: l.rate,
                rejectionReason: l.rejectionReason || null,
              })),
          },
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "Grn", entityId: grn.id, userId: ctx.id, projectId: po.projectId,
      summary: `Recorded goods receipt ${grn.grnNo} against ${po.poNo}${v.challanNo ? ` (challan ${v.challanNo})` : ""}`,
    });

    revalidatePath("/material/grn");
    return { id: grn.id, grnNo: grn.grnNo };
  });
}

export async function inspectGrnAction(
  id: string,
  lines: Array<{ lineId: string; acceptedQty: number; rejectedQty: number; rejectionReason?: string }>,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.inspect);

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: { items: true, purchaseOrder: { select: { projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    if (grn.status === "POSTED") throw new Error("This GRN is already posted to stock and cannot be re-inspected.");
    if (grn.status === "CANCELLED") throw new Error("This GRN is cancelled.");

    const byId = new Map(grn.items.map((i) => [i.id, i]));
    for (const l of lines) {
      const line = byId.get(l.lineId);
      if (!line) throw new Error("A line does not belong to this GRN.");
      const received = Number(line.receivedQty);
      if (l.acceptedQty + l.rejectedQty > received + 0.0001) {
        throw new Error(`Accepted plus rejected cannot exceed the ${received} received on a line.`);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        await tx.grnItem.update({
          where: { id: l.lineId },
          data: {
            acceptedQty: l.acceptedQty,
            rejectedQty: l.rejectedQty,
            rejectionReason: l.rejectionReason || null,
          },
        });
      }
      await tx.grn.update({
        where: { id },
        data: { status: "INSPECTED", inspectedById: ctx.id, inspectedAt: new Date() },
      });
    });

    const rejected = lines.reduce((s, l) => s + l.rejectedQty, 0);
    await recordAudit({
      action: "UPDATE", entity: "Grn", entityId: id, userId: ctx.id, projectId: grn.purchaseOrder.projectId,
      summary: `Inspected goods receipt ${grn.grnNo}${rejected > 0 ? ` — ${rejected} rejected` : " — all accepted"}`,
    });

    revalidatePath(`/material/grn/${id}`);
    return null;
  });
}

/**
 * Posts the GRN to stock.
 *
 * Only the accepted quantity enters the ledger. Rejected and short quantities
 * stay visible on the receipt but never become stock. Posting also advances the
 * PO's received quantity and status.
 */
export async function postGrnAction(id: string): Promise<ActionResult<{ postedLines: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.post);

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: {
        items: { include: { item: { select: { name: true } } } },
        purchaseOrder: { select: { id: true, poNo: true, projectId: true } },
      },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    if (grn.status === "POSTED") throw new Error("This GRN is already posted.");
    if (grn.status === "CANCELLED") throw new Error("A cancelled GRN cannot be posted.");

    const acceptedLines = grn.items.filter((l) => Number(l.acceptedQty) > 0);
    if (acceptedLines.length === 0) {
      throw new Error("Nothing on this receipt was accepted, so there is nothing to post to stock.");
    }

    const result = await prisma.$transaction((tx) => postGrnToStock(tx, id, ctx.id));

    await recordAudit({
      action: "APPROVE",
      entity: "Grn",
      entityId: id,
      userId: ctx.id,
      projectId: grn.purchaseOrder.projectId,
      summary: `Posted goods receipt ${grn.grnNo} to stock — ${result.postedLines} line(s), ${result.totalAccepted} unit(s) accepted; ${grn.purchaseOrder.poNo} is now ${result.poStatus.replace(/_/g, " ").toLowerCase()}`,
    });

    revalidatePath("/material/grn");
    revalidatePath("/material/stock");
    revalidatePath(`/material/grn/${id}`);
    return { postedLines: result.postedLines };
  });
}

export async function cancelGrnAction(id: string, remarks: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.grn.cancel);
    if (!remarks.trim()) throw new Error("A reason is required when cancelling a goods receipt.");

    const grn = await prisma.grn.findUnique({
      where: { id },
      include: { purchaseOrder: { select: { projectId: true } } },
    });
    if (!grn) throw new Error("Goods receipt not found.");
    assertProjectAccess(ctx, grn.purchaseOrder.projectId);
    if (grn.status === "POSTED") {
      throw new Error(
        "This GRN is already in the stock ledger. Post a stock adjustment to correct it — the ledger is never rewritten.",
      );
    }

    await prisma.grn.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({
      action: "CANCEL", entity: "Grn", entityId: id, userId: ctx.id, projectId: grn.purchaseOrder.projectId,
      summary: `Cancelled goods receipt ${grn.grnNo}: ${remarks}`,
    });
    revalidatePath("/material/grn");
    revalidatePath(`/material/grn/${id}`);
    return null;
  });
}
