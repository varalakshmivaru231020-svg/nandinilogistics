import type { Prisma } from "@prisma/client";

import { demandStatusFor, isClearableMode } from "./receipt-status";

/**
 * Clearing and bouncing a cheque or DD.
 *
 * The action does the permission and project checks; this owns the state rules
 * and the arithmetic, so no other caller can bounce a receipt twice or reverse
 * money a cleared instrument brought in. Every function must be called inside a
 * transaction.
 */

/** Marks a pending cheque or DD as realised. Refuses anything else. */
export async function clearReceipt(
  tx: Prisma.TransactionClient,
  input: { receiptId: string; clearedAt: Date; userId: string | null },
): Promise<void> {
  const receipt = await tx.receipt.findUnique({
    where: { id: input.receiptId },
    select: { mode: true, clearedAt: true, bouncedAt: true },
  });
  if (!receipt) throw new Error("Receipt not found.");
  if (!isClearableMode(receipt.mode)) throw new Error(`A ${receipt.mode} receipt clears on entry.`);
  if (receipt.bouncedAt) throw new Error("This instrument has bounced; it cannot be cleared.");
  if (receipt.clearedAt) throw new Error("This receipt has already been cleared.");

  // Claimed against the state it was checked in: a concurrent clear or bounce
  // leaves nothing to update, and this one is refused.
  const claimed = await tx.receipt.updateMany({
    where: { id: input.receiptId, clearedAt: null, bouncedAt: null },
    data: { clearedAt: input.clearedAt, clearedById: input.userId },
  });
  if (claimed.count === 0) throw new Error("This receipt was cleared or bounced meanwhile.");
}

export interface BounceResult {
  amount: number;
  bookingReceived: number;
  demand: { id: string; receivedAmount: number; status: string } | null;
}

/**
 * Records a returned cheque or DD. The receipt stays for the record; its amount
 * comes off the booking and its demand is recomputed from the receipts that
 * still stand.
 */
export async function bounceReceipt(
  tx: Prisma.TransactionClient,
  input: { receiptId: string; reason: string; userId: string | null; at: Date },
): Promise<BounceResult> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give the reason the bank returned the instrument.");

  const receipt = await tx.receipt.findUnique({
    where: { id: input.receiptId },
    select: { mode: true, amount: true, bookingId: true, demandId: true, clearedAt: true, bouncedAt: true },
  });
  if (!receipt) throw new Error("Receipt not found.");
  if (!isClearableMode(receipt.mode)) throw new Error(`A ${receipt.mode} receipt cannot bounce.`);
  if (receipt.bouncedAt) throw new Error("This receipt has already been recorded as bounced.");
  if (receipt.clearedAt) throw new Error("This instrument has already cleared; it cannot bounce.");

  const claimed = await tx.receipt.updateMany({
    where: { id: input.receiptId, bouncedAt: null, clearedAt: null },
    data: { bouncedAt: input.at, bouncedById: input.userId, bounceReason: reason },
  });
  if (claimed.count === 0) throw new Error("This receipt was cleared or bounced meanwhile.");

  const amount = Number(receipt.amount);

  // Take the amount back off the booking atomically, never below zero.
  const decremented = await tx.booking.updateMany({
    where: { id: receipt.bookingId, receivedAmount: { gte: amount } },
    data: { receivedAmount: { decrement: amount } },
  });
  if (decremented.count === 0) {
    await tx.booking.update({ where: { id: receipt.bookingId }, data: { receivedAmount: 0 } });
  }
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: receipt.bookingId },
    select: { receivedAmount: true },
  });

  let demand: BounceResult["demand"] = null;
  if (receipt.demandId) {
    const current = await tx.paymentDemand.findUnique({
      where: { id: receipt.demandId },
      select: { id: true, totalAmount: true, raisedAt: true },
    });
    if (current) {
      // Recomputed from the receipts that still stand, not decremented, so the
      // demand also heals from any earlier drift.
      const standing = await tx.receipt.aggregate({
        where: { demandId: current.id, bouncedAt: null },
        _sum: { amount: true },
      });
      const receivedAmount = Number(standing._sum.amount ?? 0);
      const status = demandStatusFor({
        totalAmount: Number(current.totalAmount),
        receivedAmount,
        raisedAt: current.raisedAt,
      });
      await tx.paymentDemand.update({ where: { id: current.id }, data: { receivedAmount, status } });
      demand = { id: current.id, receivedAmount, status };
    }
  }

  return { amount, bookingReceived: Number(booking.receivedAmount), demand };
}
