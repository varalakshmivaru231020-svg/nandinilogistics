import type { Prisma } from "@prisma/client";

import { postStockMovement } from "@/lib/inventory";

/**
 * The heart of posting a goods receipt: accepted quantity enters the stock
 * ledger, the purchase order line advances, and the PO status is recomputed
 * from its lines.
 *
 * Extracted from the server action so it can be exercised directly by
 * `pnpm verify:chain` without a request context. The action keeps the
 * permission and state checks; this keeps the arithmetic.
 *
 * Must be called inside a transaction.
 */
export async function postGrnToStock(
  tx: Prisma.TransactionClient,
  grnId: string,
  userId: string | null,
): Promise<{ postedLines: number; totalAccepted: number; poStatus: string }> {
  const grn = await tx.grn.findUnique({
    where: { id: grnId },
    include: {
      items: true,
      purchaseOrder: { select: { id: true, poNo: true, projectId: true } },
    },
  });
  if (!grn) throw new Error("Goods receipt not found.");

  // The invariant belongs here, not only in the action: posting twice would
  // silently double the stock and corrupt the weighted average.
  if (grn.status === "POSTED") {
    throw new Error(`Goods receipt ${grn.grnNo} is already posted to stock.`);
  }
  if (grn.status === "CANCELLED") {
    throw new Error(`Goods receipt ${grn.grnNo} is cancelled and cannot be posted.`);
  }

  const acceptedLines = grn.items.filter((l) => Number(l.acceptedQty) > 0);
  if (acceptedLines.length === 0) {
    throw new Error("Nothing on this receipt was accepted, so there is nothing to post to stock.");
  }

  let totalAccepted = 0;

  for (const line of acceptedLines) {
    const accepted = Number(line.acceptedQty);
    totalAccepted += accepted;

    await postStockMovement(tx, {
      itemId: line.itemId,
      storeId: grn.storeId,
      projectId: grn.purchaseOrder.projectId,
      txnType: "GRN_IN",
      quantity: accepted,
      rate: Number(line.rate),
      refType: "GRN",
      refId: grn.id,
      refNo: grn.grnNo,
      grnId: grn.id,
      createdById: userId,
      txnDate: grn.grnDate,
      remarks: `Received against ${grn.purchaseOrder.poNo}`,
    });

    await tx.purchaseOrderItem.update({
      where: { id: line.poItemId },
      data: { receivedQty: { increment: accepted } },
    });
  }

  await tx.grn.update({ where: { id: grnId }, data: { status: "POSTED" } });

  // Recompute the PO status from what its lines now say.
  const poItems = await tx.purchaseOrderItem.findMany({
    where: { poId: grn.purchaseOrder.id },
    select: { orderedQty: true, receivedQty: true },
  });
  const fullyReceived = poItems.every(
    (i) => Number(i.receivedQty) >= Number(i.orderedQty) - 0.0001,
  );
  const anyReceived = poItems.some((i) => Number(i.receivedQty) > 0);
  const poStatus = fullyReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "APPROVED";

  await tx.purchaseOrder.update({
    where: { id: grn.purchaseOrder.id },
    data: { status: poStatus as never },
  });

  return { postedLines: acceptedLines.length, totalAccepted, poStatus };
}
