"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering";
import { onHand, postStockMovement } from "@/lib/inventory";
import { PERM } from "@/lib/permissions/codes";

const TransferSchema = z.object({
  fromStoreId: z.string().min(1, "Source store is required"),
  toStoreId: z.string().min(1, "Destination store is required"),
  remarks: z.string().trim().optional(),
  items: z
    .array(z.object({ itemId: z.string().min(1), quantity: z.coerce.number().positive() }))
    .min(1, "Add at least one item"),
});

export async function createTransferAction(
  input: z.infer<typeof TransferSchema>,
): Promise<ActionResult<{ id: string; transferNo: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.transfer.create);
    const parsed = TransferSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    if (v.fromStoreId === v.toStoreId) {
      throw new Error("The source and destination stores must be different.");
    }

    const created = await prisma.$transaction(async (tx) => {
      // Availability is checked at creation; stock only moves on approval.
      for (const line of v.items) {
        const { quantity, avgRate } = await onHand(tx, line.itemId, v.fromStoreId);
        if (line.quantity > quantity + 0.0001) {
          const item = await tx.item.findUnique({ where: { id: line.itemId }, select: { name: true } });
          throw new Error(
            `Only ${quantity} of ${item?.name ?? "this item"} is in the source store.`,
          );
        }
        line.quantity = Number(line.quantity);
        void avgRate;
      }

      const transferNo = await nextDocumentNumber(tx, "TRANSFER", null);
      return tx.stockTransfer.create({
        data: {
          transferNo,
          fromStoreId: v.fromStoreId,
          toStoreId: v.toStoreId,
          remarks: v.remarks || null,
          status: "DRAFT",
          items: { create: v.items.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) },
        },
      });
    });

    await recordAudit({
      action: "CREATE", entity: "StockTransfer", entityId: created.id, userId: ctx.id,
      summary: `Raised stock transfer ${created.transferNo} with ${v.items.length} line(s)`,
    });

    revalidatePath("/material/transfers");
    return { id: created.id, transferNo: created.transferNo };
  });
}

/** Approval is what actually moves stock out of the source store. */
export async function approveTransferAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.transfer.approve);

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true, fromStore: { select: { name: true, projectId: true } }, toStore: { select: { name: true } } },
    });
    if (!transfer) throw new Error("Transfer not found.");
    if (transfer.status !== "DRAFT") throw new Error("Only a draft transfer can be approved.");

    await prisma.$transaction(async (tx) => {
      for (const line of transfer.items) {
        const movement = await postStockMovement(tx, {
          itemId: line.itemId,
          storeId: transfer.fromStoreId,
          projectId: transfer.fromStore.projectId,
          txnType: "TRANSFER_OUT",
          quantity: Number(line.quantity),
          refType: "TRANSFER",
          refId: transfer.id,
          refNo: transfer.transferNo,
          createdById: ctx.id,
          remarks: `To ${transfer.toStore.name}`,
        });
        // Carry the source valuation with the goods.
        await tx.stockTransferItem.update({
          where: { id: line.id },
          data: { rate: movement.rate },
        });
      }

      await tx.stockTransfer.update({
        where: { id },
        data: { status: "IN_TRANSIT", approvedById: ctx.id, approvedAt: new Date() },
      });
    });

    await recordAudit({
      action: "APPROVE", entity: "StockTransfer", entityId: id, userId: ctx.id,
      summary: `Approved transfer ${transfer.transferNo} — stock left ${transfer.fromStore.name} for ${transfer.toStore.name}`,
    });

    revalidatePath("/material/transfers");
    revalidatePath("/material/stock");
    return null;
  });
}

/** Receipt at the destination is a separate step, so nothing goes missing in transit. */
export async function receiveTransferAction(
  id: string,
  received: Array<{ lineId: string; receivedQty: number }>,
): Promise<ActionResult<{ shortfall: number }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.material.transfer.receive);

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true, toStore: { select: { name: true, projectId: true } }, fromStore: { select: { name: true } } },
    });
    if (!transfer) throw new Error("Transfer not found.");
    if (transfer.status !== "IN_TRANSIT") {
      throw new Error("Only a transfer that is in transit can be received.");
    }

    const byId = new Map(transfer.items.map((i) => [i.id, i]));
    let shortfall = 0;

    await prisma.$transaction(async (tx) => {
      for (const r of received) {
        const line = byId.get(r.lineId);
        if (!line) throw new Error("A line does not belong to this transfer.");
        const sent = Number(line.quantity);
        if (r.receivedQty > sent + 0.0001) {
          throw new Error(`Cannot receive more than the ${sent} that was sent.`);
        }
        shortfall += sent - r.receivedQty;

        if (r.receivedQty > 0) {
          await postStockMovement(tx, {
            itemId: line.itemId,
            storeId: transfer.toStoreId,
            projectId: transfer.toStore.projectId,
            txnType: "TRANSFER_IN",
            quantity: r.receivedQty,
            rate: Number(line.rate),
            refType: "TRANSFER",
            refId: transfer.id,
            refNo: transfer.transferNo,
            createdById: ctx.id,
            remarks: `From ${transfer.fromStore.name}`,
          });
        }

        await tx.stockTransferItem.update({
          where: { id: line.id },
          data: { receivedQty: r.receivedQty },
        });
      }

      await tx.stockTransfer.update({ where: { id }, data: { status: "RECEIVED" } });
    });

    await recordAudit({
      action: "APPROVE", entity: "StockTransfer", entityId: id, userId: ctx.id,
      summary:
        `Received transfer ${transfer.transferNo} at ${transfer.toStore.name}` +
        (shortfall > 0.0001 ? ` — ${shortfall} unit(s) short of what was sent` : " in full"),
    });

    revalidatePath("/material/transfers");
    revalidatePath("/material/stock");
    return { shortfall };
  });
}
